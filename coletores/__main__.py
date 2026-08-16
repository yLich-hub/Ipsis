"""CLI da vigília.

    python -m coletores --seco                    # tudo, sem gravar nada
    python -m coletores --para-disco              # grava em data/vigilia/*.json
    python -m coletores                           # grava no Supabase
    python -m coletores --fonte planalto --seco   # só uma fonte
    python -m coletores --desde 2025-03-01        # janela explícita

O padrão é a execução completa das cinco fontes. ``--seco`` roda tudo — rede,
extração, filtro, contagem — e não escreve em lugar nenhum; é como se confere o
que o filtro está pegando antes de encher uma tabela.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta

import os
import pathlib
import re

from coletores import camara, datajud, dou, inlabs, planalto, senado, stj
from coletores.banco import SemCredencial, grava_achados, grava_metricas, grava_precedentes
from coletores.banco import situacoes_atuais
from coletores.banco import ids_conhecidos
from coletores.banco import para_disco, registra
from coletores.config import carrega
from coletores.rede import Sessao
from coletores.tipos import Colheita

FONTES = ("planalto", "camara", "senado", "dou", "datajud", "stj")

# Quantas normas confirmar no Diário por execução.
#
# O DOU é a única fonte que roda DEPOIS das outras: ele não descobre nada
# sozinho, confirma o que as demais já identificaram. Uma requisição de busca
# mais uma de página por norma — com trinta normas novas num dia, são sessenta
# idas a um servidor que serve páginas pesadas. O teto é o que impede a
# confirmação, que é acabamento, de custar mais que a coleta inteira.
TETO_DOU = 12

# Janela padrão das fontes de proposição, em dias. O Senado devolve o intervalo
# inteiro numa resposta só (~4 MB desde a data de corte), e repetir isso todo dia
# é desperdício dos dois lados. Sessenta dias cobre a distância entre duas
# execuções diárias e ainda absorve uma semana de agendador parado.
#
# **O Planalto ignora a janela**, e tem de ignorar: ele lê o texto compilado, que
# não tem "janela" — o que está lá está em vigor hoje, tenha sido alterado
# ontem ou em 2019.
JANELA_DIAS = 60

#: Segundos que cada fonte tem antes de ser abandonada.
#:
#: Uma execução saudável inteira leva ~40 s, as seis fontes somadas — então 180 s
#: por fonte é folga larga, não aperto. O que ele impede é o caso patológico: com
#: `tentativas=3` e `timeout=60`, uma única URL pendurada custa 183 s, e a Câmara
#: pagina. Sem teto, seis fontes assim passam de meia hora.
#:
#: O número foi escolhido contra o `timeout-minutes: 25` do job no Actions: seis
#: fontes × 180 s = 18 min de pior caso absoluto, e ainda sobra para o `pip
#: install`. Se o teto do job mudar, este número muda junto.
ORCAMENTO_POR_FONTE = 180


def _carrega_env_local() -> None:
    """Lê ``.env.local`` quando ele existe, para a CLI rodar na máquina de quem
    clonou o repositório.

    Este pacote foi escrito para o GitHub Actions, onde os segredos já chegam
    como variável de ambiente — e por isso a primeira versão não lia arquivo
    nenhum. O efeito local era ruim de diagnosticar: ``python -m coletores``
    respondia "SUPABASE_SERVICE_ROLE_KEY é exigida" com a chave ali, preenchida,
    no `.env.local` ao lado. Os scripts em ``scripts/`` já carregam o arquivo
    com dotenv; não havia motivo para o lado Python ser diferente.

    **Variável já definida no ambiente vence o arquivo** (`setdefault`), que é o
    que mantém o Actions intocado: lá o `.env.local` não existe, e se existisse
    não deveria mandar nos segredos do repositório.

    Sem dependência nova de propósito — `python-dotenv` para ler oito linhas de
    `CHAVE=valor` seria pacote a mais no `requirements.txt` de quem só quer
    rodar a vigília.
    """
    arq = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
    if not arq.exists():
        return

    for linha in arq.read_text(encoding="utf-8").splitlines():
        if linha.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", linha)
        if not m:
            continue
        # A aspa é do arquivo, não do valor: uma DATABASE_URL entre aspas é
        # comum, e passá-la adiante com elas quebra a conexão sem dizer por quê.
        os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def principal(argv: list[str] | None = None) -> int:
    _carrega_env_local()

    # O console do Windows nasce em cp1252 e transforma "·" e "ª" em lixo. O
    # relatório desta CLI é o único lugar em que a coleta se explica, e um
    # relatório ilegível é um relatório que ninguém lê.
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8", errors="replace")

    p = argparse.ArgumentParser(prog="python -m coletores", description="Vigília do corpus")
    p.add_argument("--fonte", choices=FONTES, action="append", help="repita para várias")
    p.add_argument("--desde", help="data ISO; padrão é a janela de 60 dias")
    p.add_argument("--tudo", action="store_true", help="janela desde a data de corte")
    p.add_argument("--seco", action="store_true", help="roda sem gravar em lugar nenhum")
    p.add_argument("--para-disco", action="store_true", help="grava em data/vigilia/")
    p.add_argument("--sem-cache", action="store_true", help="ignora o cache de páginas")
    p.add_argument(
        "--orcamento",
        type=int,
        default=ORCAMENTO_POR_FONTE,
        help=f"segundos por fonte antes de desistir dela (padrão {ORCAMENTO_POR_FONTE}; 0 desliga)",
    )
    args = p.parse_args(argv)

    cfg = carrega()
    fontes = args.fonte or list(FONTES)

    if args.desde:
        janela = args.desde
    elif args.tudo:
        janela = cfg.data_de_corte
    else:
        janela = max(
            (date.today() - timedelta(days=JANELA_DIAS)).isoformat(), cfg.data_de_corte
        )

    sessao = Sessao(usar_cache=not args.sem_cache)

    print(f"· vigília do corpus — data de corte {cfg.data_de_corte}")
    print(f"· fontes: {', '.join(fontes)} · janela desde {janela}")
    if args.seco:
        print("· modo seco: nada será gravado")

    colheitas: list[Colheita] = []
    for nome in fontes:
        # O DOU roda depois de todos: ele não descobre nada sozinho, confirma o
        # que as outras já identificaram. Ver `_confirma_no_dou`.
        if nome == "dou":
            continue

        t = time.time()
        # Prazo por fonte, rearmado a cada uma. Ver `Sessao.prazo`: sem isto,
        # uma fonte pendurada consome o job inteiro no retry e as outras cinco
        # nunca rodam — foi o que matou as execuções agendadas do Actions.
        sessao.prazo = time.monotonic() + args.orcamento if args.orcamento else None

        try:
            if nome == "planalto":
                c = planalto.colhe(sessao, cfg)
            elif nome == "camara":
                c = camara.colhe(sessao, janela, cfg)
            elif nome == "senado":
                c = senado.colhe(sessao, janela, cfg)
            elif nome == "stj":
                # Precedente qualificado não tem janela: um tema de 2015 continua
                # valendo (ou continua cancelado) hoje, e as duas coisas importam.
                c = stj.colhe(sessao)
            else:
                c = datajud.colhe(sessao, cfg)
        except Exception as e:  # noqa: BLE001
            # Os coletores já convertem `FalhaDeRede` em `colheita.erro`, que é a
            # regra do pacote: "erro é valor, não exceção". Isto é a rede de
            # segurança para o que escapar — um `KeyError` de HTML mudado não
            # pode custar as outras fontes e a gravação do que já funcionou.
            c = Colheita(fonte=nome, erro=f"{type(e).__name__}: {e}")

        c.ms = int((time.time() - t) * 1000)
        colheitas.append(c)
        _relata(c)

    sessao.prazo = None

    if "dou" in fontes:
        # O DOU também ganha prazo: ele faz uma consulta por norma confirmada, e
        # é o que mais depende de busca web quando falta credencial do INLABS.
        sessao.prazo = time.monotonic() + args.orcamento if args.orcamento else None
        try:
            colheitas.append(_confirma_no_dou(sessao, colheitas, cfg))
        except Exception as e:  # noqa: BLE001
            colheitas.append(Colheita(fonte="dou", erro=f"{type(e).__name__}: {e}"))
        sessao.prazo = None

    if args.seco:
        _detalha(colheitas)
        return 0

    if args.para_disco:
        for c in colheitas:
            print(f"· {c.fonte}: escrito em {para_disco(c).relative_to(_raiz())}")
        return 0

    return _grava(colheitas)


def _confirma_no_dou(sessao, colheitas: list[Colheita], cfg) -> Colheita:
    """Confirma no Diário as normas que as outras fontes já identificaram.

    **O DOU não descobre nada aqui, e isso é o desenho.** Ele roda depois de
    todos e confirma o que as outras fontes já identificaram: acrescenta a um
    achado o endereço oficial e a prova de que a norma existe no Diário — nunca
    o texto legal, que continua vindo do parser do Vade Mecum.

    **Dois caminhos, em ordem de qualidade.** O INLABS baixa a edição inteira em
    XML e casa por ``artType`` e ``name`` estruturados; é o certo, e é opcional
    porque exige cadastro (``INLABS_EMAIL``/``INLABS_SENHA``). Sem ele, cai para
    a busca web do ``in.gov.br`` — que é frágil e, medida em 13/08/2026, não
    alcança as leis do dia: o parâmetro ``q`` não filtra e a Seção 1 vem
    paginada de um jeito que não dá para percorrer. Quando os dois falham, o
    achado fica sem confirmação, e "sem confirmação" nunca vira "não publicou".

    **Só se confirma o que veio do Senado**, e a restrição é da fonte: os dois
    caminhos precisam da data exata de publicação, e quem a sabe é o Senado, em
    ``normaGerada.dataPublicacao``. Achado do Planalto traz o ano da alteração,
    não o dia — procurá-lo numa janela de 365 dias e ficar com o primeiro
    resultado plausível seria pior que não confirmar. E ele já tem endereço
    oficial: a própria página do ato no Planalto.
    """
    colheita = Colheita(fonte="dou")
    t = time.time()

    # Opcional por construção: sem INLABS_EMAIL e INLABS_SENHA, `None`, e a
    # confirmação cai para a busca web. Nenhuma demonstração depende disto.
    sessao_inlabs = inlabs.sessao_autenticada()

    # Só normas do Senado, que são as que têm data de publicação a consultar.
    pendentes = [
        a
        for c in colheitas
        for a in c.achados
        if a.virou_norma and a.norma and a.fonte == "senado" and "in.gov.br" not in a.url
    ]

    # Uma norma altera vários artigos e vira vários achados; o Diário é o mesmo
    # para todos. Confirma-se uma vez por norma e o resultado é distribuído.
    por_norma: dict[str, list] = {}
    for a in pendentes:
        por_norma.setdefault(a.norma or "", []).append(a)

    confirmadas = 0
    for norma in list(por_norma)[:TETO_DOU]:
        grupo = por_norma[norma]
        pub = senado.publicacao_de(sessao, grupo[0].id)
        colheita.vistos += 1
        if not pub:
            continue

        data, _veiculo = pub

        # Primeiro o INLABS, que é o caminho certo: edição inteira em XML, com
        # `artType` e `name` estruturados. Só se ele não estiver configurado é
        # que se tenta a busca web — que é mais frágil e, medida em 13/08/2026,
        # não alcança as leis do dia. Ver o cabeçalho de `inlabs.py`.
        numero = (norma.split()[-1].split("/")[0]) if norma else ""
        ato = inlabs.procura_lei(numero, data, sessao_inlabs) if sessao_inlabs else None

        if ato:
            confirmadas += 1
            for a in grupo:
                a.url = ato.url or a.url
                a.situacao = f"{a.situacao} · DOU {ato.secao}, ed. {ato.edicao}, p. {ato.pagina}".strip(" ·")
            continue

        achado_dou = dou.publicacao(sessao, norma, cfg, data_publicacao=data)
        if not achado_dou:
            continue

        confirmadas += 1
        for a in grupo:
            a.url = achado_dou["url"]
            a.situacao = f"{a.situacao} · DOU de {_br(data)}".strip(" ·")

    colheita.ms = int((time.time() - t) * 1000)
    if len(por_norma) > TETO_DOU:
        # Teto atingido é informação, não silêncio: sem esta linha, "12
        # confirmadas" parece cobertura completa.
        colheita.erro = f"teto de {TETO_DOU} normas por execução; {len(por_norma)} pendentes"

    print(
        f"· {'dou':<9} {'ok    ' if colheita.ok else 'PARCIAL'} "
        f"{colheita.vistos} normas consultadas · {confirmadas} confirmadas no Diário "
        f"· {colheita.ms} ms"
    )
    if colheita.erro:
        print(f"    {colheita.erro}")

    return colheita


# --- saída -------------------------------------------------------------------


def _relata(c: Colheita) -> None:
    if c.fonte == "datajud":
        corpo = f"{len(c.metricas)} contagens"
    elif c.fonte == "stj":
        alerta = sum(1 for p in c.precedentes if p.situacao.lower().startswith(("cancel", "sobrest")))
        corpo = f"{c.vistos} temas · {len(c.precedentes)} no recorte · {alerta} cancelados/sobrestados"
    else:
        corpo = f"{c.vistos} vistos · {len(c.achados)} tocam o corpus"
    marca = "ok    " if c.ok else "FALHOU"
    print(f"· {c.fonte:<9} {marca} {corpo} · {c.ms} ms")
    if c.erro:
        print(f"    {c.erro[:160]}")


def _detalha(colheitas: list[Colheita]) -> None:
    """No modo seco, o que importa é ver o que o filtro pegou — uma contagem não
    diz se ele está pegando a coisa certa."""
    normas = [a for c in colheitas for a in c.achados if a.virou_norma]

    if normas:
        print(f"\n· JÁ SÃO LEI ({len(normas)}) — estes furam a data de corte:")
        for a in normas[:20]:
            leis = ", ".join(a.leis_tocadas)
            print(f"  {a.norma or a.identificacao:<22} {leis}")
            print(f"  {'':22} {a.ementa[:100]}")
        if len(normas) > 20:
            print(f"  … e mais {len(normas) - 20}")
    else:
        print("\n· nenhuma norma publicada altera o corpus na janela consultada")

    for c in colheitas:
        if c.precedentes:
            alerta = [p for p in c.precedentes if p.situacao.lower().startswith(("cancel", "sobrest"))]
            print(f"\n· stj — {len(c.precedentes)} precedentes no recorte:")
            for p in [x for x in c.precedentes if x.tese_firmada][:8]:
                print(f"  [{p.tipo} {p.numero}] {p.situacao} · {p.escopo}")
                print(f"    {p.tese_firmada[:110]}")
            if alerta:
                print(f"\n  ATENÇÃO: {len(alerta)} cancelados ou sobrestados —")
                for p in alerta[:6]:
                    print(f"    [{p.tipo} {p.numero}] {p.situacao}")

        if c.metricas:
            print(f"\n· {c.fonte} — jurimetria (contagem, não fonte de texto):")
            for m in c.metricas:
                print(f"  {m.tribunal.upper():<6} {m.total:>10,} · {m.assunto}".replace(",", "."))


def _grava(colheitas: list[Colheita]) -> int:
    try:
        for c in colheitas:
            if c.precedentes:
                # O "antes" tem de ser lido ANTES do upsert: ele sobrescreve
                # `situacao` em silêncio, e depois a informação já se perdeu.
                antes = situacoes_atuais([p.id for p in c.precedentes])
                novos = sum(1 for p in c.precedentes if p.id not in antes)
                mudou = stj.mudancas(c.precedentes, antes)

                grava_precedentes(c.precedentes)
                # Mudança de situação vira achado da vigília: um tema que deixa
                # de ser citável é o mesmo tipo de evento que uma lei alterada —
                # algo que o usuário confiava e não vale mais.
                if mudou:
                    grava_achados(mudou)
                registra(c, novos)

                print(
                    f"· {c.fonte}: {len(c.precedentes)} precedentes · {novos} inéditos"
                    + (f" · {len(mudou)} MUDARAM de situação" if mudou else "")
                )
                for m in mudou:
                    print(f"    {m.identificacao}: {m.ementa[:96]}")
                continue

            if c.metricas:
                grava_metricas(c.metricas)
                registra(c, len(c.metricas))
                print(f"· {c.fonte}: {len(c.metricas)} contagens gravadas")
                continue

            conhecidos = ids_conhecidos([a.id for a in c.achados])
            novos = sum(1 for a in c.achados if a.id not in conhecidos)
            grava_achados(c.achados)
            registra(c, novos)
            print(f"· {c.fonte}: {len(c.achados)} gravados, {novos} inéditos")
    except SemCredencial as e:
        # `flush` antes de escrever em stderr: os dois fluxos têm buffers
        # separados, e no log do GitHub Actions isso fazia a mensagem de erro
        # aparecer ANTES do relatório da coleta — dando a impressão de que nada
        # tinha rodado, quando na verdade as cinco fontes responderam e só a
        # gravação faltou.
        sys.stdout.flush()
        print(f"\n· {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — ver o porquê abaixo
        # Captura larga de propósito, e só aqui. Este ponto é o fim da linha de
        # uma execução não interativa: o que sair daqui é a última coisa que
        # alguém lê no log do GitHub Actions. Um traceback de `requests` no meio
        # de mil linhas de coleta diz onde estourou, não o que fazer.
        #
        # A coleta já terminou quando se chega aqui, e o que falhou foi a
        # escrita — então nomear a fonte e repetir o recado do PostgREST é o que
        # transforma "exit code 1" em algo acionável.
        sys.stdout.flush()
        print(f"\n· falha ao gravar: {e}", file=sys.stderr)
        print(
            "  A coleta em si funcionou — os números por fonte estão acima.\n"
            "  Confira SUPABASE_SERVICE_ROLE_KEY e se as migrations 0012 e 0013\n"
            "  foram aplicadas neste projeto do Supabase.",
            file=sys.stderr,
        )
        return 1

    normas = sum(1 for c in colheitas for a in c.achados if a.virou_norma)
    if normas:
        print(
            f"\n· ATENÇÃO: {normas} alterações já em vigor tocam o corpus.\n"
            "  A data de corte está furada nesses pontos até o parser rodar de novo."
        )
    return 0


def _br(iso: str) -> str:
    p = iso[:10].split("-")
    return f"{p[2]}/{p[1]}/{p[0]}" if len(p) == 3 else iso


def _raiz():
    from pathlib import Path

    return Path(__file__).resolve().parent.parent


if __name__ == "__main__":
    raise SystemExit(principal())
