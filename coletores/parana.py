"""Acervo de decretos estaduais do Paraná — coleta e extração.

Fonte: ``legislacao.pr.gov.br``, o sistema de legislação da Casa Civil do
Paraná. Um Struts antigo, mas honesto: HTML servido pelo servidor, sem
JavaScript no caminho do dado, com **texto compilado** — a última redação
publicada de cada ato.

**Este coletor não é da vigília, e por isso não entra em ``coletores/__main__``.**
A vigília responde uma pergunta só — *a fotografia de 28/02/2025 envelheceu?* —
e nada aqui altera o corpus federal. Isto é ingestão de um acervo novo, com o
mesmo papel de ``scripts/vademecum.ts``: buscar de uma fonte externa, gravar em
``data/`` versionado, e parar. Ele roda sozinho::

    python -m coletores.parana --seco --ano 2025 --mes 1
    python -m coletores.parana --ano 2025
    python -m coletores.parana                       # 2022 a 2026, a janela do YAML

**O recorte não mora aqui.** Ele está em ``data/curadoria/decretos_pr.yaml``,
que é curadoria versionada, e a razão está no cabeçalho de lá: são 17.778
decretos na janela pedida, dos quais a esmagadora maioria é ato de pessoal com
nome completo de pessoa física. O recorte é aplicado à **súmula**, que a
listagem já traz — o texto integral só é buscado para o que passa.

--- As armadilhas, todas medidas em 21/08/2026 ------------------------------

1. **A listagem só responde a POST.** Ano e mês vão na query string; os nove
   campos ocultos do formulário têm de ir no corpo. Sem eles a resposta volta
   200, com 38 KB, e **sem tabela nenhuma** — o modo de falha mais caro que
   existe aqui: nenhum erro, lista vazia, e o acervo parecendo simplesmente
   pequeno.

2. **``<strike>`` guarda texto revogado.** A folha de estilo da página de
   impressão traz ``strike .tbato { text-decoration: line-through; }``: o que
   foi revogado continua no HTML, riscado. É a mesma armadilha do Planalto, e o
   mesmo conserto — derrubar antes de qualquer leitura, senão duas redações se
   emendam numa frase só.

3. **A súmula às vezes vem com HTML dentro.** Três das 326 de janeiro/2025
   trazem ``<br />`` ou ``<div style="text-align: justify;">`` no meio. Sem
   limpar, o recorte não casa: ``^altera`` não encontra nada numa string que
   começa por ``<div``.

4. **``<br />`` cola palavra em palavra.** Ele separa frases dentro do bloco;
   trocá-lo por nada gruda "Agência" em "Reguladora".

5. **O rótulo vazio é o preâmbulo.** Todo bloco é
   ``<p><b class="labelAto">RÓTULO</b>…<a>TEXTO</a></p>``, e o "O GOVERNADOR DO
   ESTADO… DECRETA:" vem com o rótulo em branco. Tratá-lo como dispositivo
   poria a fórmula de promulgação no meio dos artigos.

A página declara UTF-8 e cumpre — ao contrário do Planalto, que exige cp1252.
Mesmo assim a decodificação tenta as duas: uma exportação de Word no meio do
acervo não pode derrubar a coleta inteira.
"""

from __future__ import annotations

import argparse
import html as _html
import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

import yaml

from coletores.rede import FalhaDeRede, Sessao

RAIZ = Path(__file__).resolve().parent.parent
CURADORIA = RAIZ / "data" / "curadoria" / "decretos_pr.yaml"
ACERVO = RAIZ / "data" / "decretos_pr"


class Bloqueado(FalhaDeRede):
    """A fonte fechou a porta para este IP.

    Não é falha de uma requisição: é o servidor dizendo, com todas as letras,
    *"Erro 403 — Acesso temporariamente bloqueado"*. Tem exceção própria porque
    o tratamento é o oposto do de uma falha comum — não se tenta a próxima
    página, não se tenta o próximo mês, **para-se a execução**. Insistir depois
    do bloqueio é o que transforma "temporariamente" em permanente.
    """


def _e_bloqueio(e: Exception) -> bool:
    return "403" in str(e)


# --- curadoria ---------------------------------------------------------------


@dataclass(frozen=True)
class Recorte:
    """Os dois padrões do YAML, compilados. `sai` vence `entra`."""

    entra: re.Pattern[str]
    sai: re.Pattern[str]


@dataclass(frozen=True)
class Config:
    base: str
    tipo_ato: int
    orgao_unidade: int
    visualizacao: str
    ano_de: int
    ano_ate: int
    recorte: Recorte
    amostra: dict


@lru_cache(maxsize=1)
def carrega(caminho: Path | None = None) -> Config:
    """Lê a curadoria do recorte. Falha alto e cedo se o arquivo sumir.

    Mesma escolha de ``coletores/config.py``: um coletor que seguisse com
    recorte vazio baixaria 17.778 atos e gravaria todos — o pior resultado
    possível, e o mais difícil de perceber, porque nada quebra.
    """
    arq = caminho or CURADORIA
    if not arq.exists():
        raise FileNotFoundError(
            f"curadoria dos decretos não encontrada em {arq}.\n"
            "É ela que define o que entra no acervo; sem ela não há coleta."
        )

    d = yaml.safe_load(arq.read_text(encoding="utf-8")) or {}
    fonte, anos, rec = d.get("fonte") or {}, d.get("anos") or {}, d.get("recorte") or {}
    if not rec.get("entra") or not rec.get("sai"):
        raise ValueError(f"{arq}: `recorte.entra` e `recorte.sai` são obrigatórios.")

    return Config(
        base=fonte["base"].rstrip("/"),
        tipo_ato=int(fonte.get("tipo_ato", 11)),
        orgao_unidade=int(fonte.get("orgao_unidade", 1100)),
        visualizacao=fonte.get("visualizacao", "compilado"),
        ano_de=int(anos.get("de", 2022)),
        ano_ate=int(anos.get("ate", date.today().year)),
        recorte=Recorte(
            entra=re.compile(rec["entra"]),
            sai=re.compile(rec["sai"]),
        ),
        amostra=d.get("amostra") or {},
    )


# --- texto -------------------------------------------------------------------


def sem_acento(s: str) -> str:
    """Mesmo contrato de ``public.norm()`` no banco e de ``semAcento`` em TS."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    ).lower()


_SCRIPT = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
_STRIKE = re.compile(r"<strike\b.*?</strike>", re.S | re.I)
_QUEBRA = re.compile(r"<br\s*/?>", re.I)
_TAG = re.compile(r"<[^>]+>")


def texto_de(bruto: str) -> str:
    """HTML de um bloco → texto legal.

    A ordem importa e é a armadilha 4: ``<br />`` vira quebra ANTES de as tags
    caírem. Trocá-lo por nada, junto com o resto, gruda a última palavra de uma
    linha na primeira da seguinte, e o texto sai com "Agência​Reguladora".
    """
    s = _QUEBRA.sub("\n", bruto)
    s = _TAG.sub(" ", s)
    s = _html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def no_recorte(sumula: str, cfg: Config | None = None) -> bool:
    """Este decreto entra no acervo?

    Puro e offline — é a peça que pode errar em silêncio, e por isso tem teste
    contra as 326 súmulas reais de janeiro/2025.

    A limpeza de HTML acontece aqui dentro, e não é zelo: é a armadilha 3. Uma
    súmula que começa por ``<div style="text-align: justify;">Altera a
    Resolução…`` não casa ``^altera`` e sairia do acervo por defeito de
    marcação, não por decisão de recorte.
    """
    cfg = cfg or carrega()
    t = sem_acento(texto_de(sumula))
    if cfg.recorte.sai.search(t):
        return False
    return bool(cfg.recorte.entra.search(t))


# --- o que se colhe ----------------------------------------------------------


@dataclass
class Resumo:
    """Uma linha da listagem. É o que basta para decidir o recorte."""

    cod_ato: str
    epigrafe: str
    sumula: str
    publicado_em: str
    """``dd/mm/aaaa``, como a fonte imprime."""


@dataclass
class Bloco:
    """Um dispositivo do decreto: caput, parágrafo, inciso ou fecho."""

    id: str
    ordem: int
    rotulo: str
    """``Art. 1º``, ``§ 2º``, ``I``… Vazio no fecho e na assinatura."""
    texto: str


@dataclass
class Decreto:
    id: str
    """``decpr:2025:8812``. Espaço próprio de id: nunca casa o padrão do corpus
    (`dl_2848_1940_art59`), que é o que impede um decreto estadual de virar
    fundamento de peça por descuido de modelagem."""

    numero: str
    ano: int
    epigrafe: str
    sumula: str
    preambulo: str
    publicado_em: str
    """ISO, ``2025-01-31``."""

    diario: str | None
    cod_ato: str
    url: str
    versao: str
    """Qual das três visualizações foi lida. Sempre `compilado`, e o campo
    existe para o dia em que isso deixar de ser verdade não haver um acervo em
    que a versão simplesmente não estava escrita."""

    conferido_em: str
    """Quando o coletor leu esta página. É o análogo de `artigos.conferido_em`,
    e é a única coisa que o acervo pode afirmar sobre atualidade — **não** é
    afirmação de que o decreto está em vigor. Ver docs/decretos-pr-levantamento.md."""

    blocos: list[Bloco] = field(default_factory=list)


# --- extração ----------------------------------------------------------------

_LINHA = re.compile(
    r'id="(\d+)_epigrafeAto">(.*?)</div>.*?'
    r'id="\d+_descricaoItemAto">(.*?)</div>.*?'
    r'id="\d+_dataPublicacao">(.*?)</div>',
    re.S,
)
_TOTAL = re.compile(r"(\d+)\s+registro\(s\) listado\(s\)")
_H3 = re.compile(r"<h3>(.*?)</h3>", re.S | re.I)
_BLOCO = re.compile(r'<p>\s*<b class="labelAto">(.*?)</b>(.*?)</p>', re.S | re.I)
_DIARIO = re.compile(r"Di&aacute;rio Oficial n&ordm;\.?\s*(\d+)|Diário Oficial nº\.?\s*(\d+)")
_EPIGRAFE = re.compile(r"decreto\s+n?[º°o]?\.?\s*([\d.]+)", re.I)

#: A fórmula de promulgação, que abre todo decreto estadual.
#:
#: Existe porque o rótulo não basta. A regra normal é "bloco de rótulo vazio
#: antes do primeiro Art. é o preâmbulo" — e ela cobria 1.988 dos 1.989 atos na
#: medição de 22/08/2026, antes de o recorte apertar.
#: O que sobra é o Decreto 12.438/2022, em que **a própria fonte rotulou o
#: preâmbulo como `Art. 1º`** e o artigo verdadeiro veio logo abaixo com o mesmo
#: rótulo. Não é falha da extração: é a marcação de origem errada.
#:
#: A fórmula é reconhecível sem ambiguidade e nenhum dispositivo começa por ela,
#: então casá-la é seguro — e o custo de não casar é a fórmula de promulgação
#: virar vetor, respondendo a qualquer pergunta sobre o Governador.
_PROMULGA = re.compile(r"^O\s+GOVERNADOR\s+DO\s+ESTADO", re.I)

#: O ano na epígrafe: "Decreto 4895 - 21 de Fevereiro de 2024".
_ANO_EPIGRAFE = re.compile(r"(\d{4})\s*$")


def decodifica(bruto: bytes) -> str:
    """UTF-8 primeiro, cp1252 como rede. Ver o cabeçalho deste arquivo."""
    for enc in ("utf-8", "cp1252"):
        try:
            return bruto.decode(enc)
        except UnicodeDecodeError:
            continue
    return bruto.decode("utf-8", errors="replace")


def resumos(pagina: str) -> list[Resumo]:
    """As linhas de uma página de listagem."""
    return [
        Resumo(
            cod_ato=cod,
            epigrafe=texto_de(ep),
            sumula=texto_de(su),
            publicado_em=texto_de(dt),
        )
        for cod, ep, su, dt in _LINHA.findall(pagina)
    ]


def total_de(pagina: str) -> int:
    m = _TOTAL.search(pagina)
    return int(m.group(1)) if m else 0


def _iso(ddmmaaaa: str) -> str:
    p = ddmmaaaa.strip().split("/")
    return f"{p[2]}-{p[1].zfill(2)}-{p[0].zfill(2)}" if len(p) == 3 else ddmmaaaa


def extrai(pagina: str, resumo: Resumo, cfg: Config, hoje: str) -> Decreto:
    """A página de impressão de um ato → um `Decreto` com seus blocos.

    ``<strike>`` cai antes de qualquer leitura (armadilha 2) e o primeiro bloco
    de rótulo vazio, antes do primeiro ``Art.``, é o preâmbulo (armadilha 5).
    """
    limpo = _STRIKE.sub(" ", _SCRIPT.sub(" ", pagina))

    m = _H3.search(limpo)
    epigrafe = texto_de(m.group(1)) if m else resumo.epigrafe

    n = _EPIGRAFE.search(epigrafe) or _EPIGRAFE.search(resumo.epigrafe)
    numero = n.group(1).replace(".", "") if n else resumo.cod_ato

    d = _DIARIO.search(limpo)
    diario = (d.group(1) or d.group(2)) if d else None

    publicado = _iso(resumo.publicado_em)

    # **O ano vem da EPÍGRAFE, não da data de publicação da listagem.**
    #
    # Nas duas a fonte escreve o ano, e uma vez em 1.989 elas discordam: o
    # Decreto 4.895 aparece na listagem de 2024, com epígrafe "21 de Fevereiro
    # de 2024", e a coluna de data de publicação diz 21/02/2021. Dois sinais
    # contra um — e o id sai do ano, então a discordância criava um
    # `decpr:2021:4895` sozinho numa faceta de ano fora da janela coletada.
    #
    # A data de publicação continua sendo gravada como a fonte a deu: corrigi-la
    # por dedução seria inventar o dado que se está justamente desconfiando.
    m_ano = _ANO_EPIGRAFE.search(epigrafe)
    ano = int(m_ano.group(1)) if m_ano else int(publicado[:4])
    ato_id = f"decpr:{ano}:{numero}"

    sumula, preambulo, blocos = resumo.sumula, [], []
    viu_artigo = False

    for rotulo_bruto, corpo in _BLOCO.findall(limpo):
        rotulo, texto = texto_de(rotulo_bruto), texto_de(corpo)
        if not texto:
            continue

        if rotulo.rstrip(":").strip().lower() == "súmula":
            sumula = texto
            continue

        # Duas portas para o preâmbulo: o rótulo vazio (o caso geral) e a
        # fórmula de promulgação (o caso em que a fonte rotulou errado).
        if not viu_artigo and (not rotulo or _PROMULGA.match(texto)):
            preambulo.append(texto)
            continue

        if rotulo.lower().startswith("art"):
            viu_artigo = True

        blocos.append(
            Bloco(id=f"{ato_id}:{len(blocos) + 1}", ordem=len(blocos) + 1, rotulo=rotulo, texto=texto)
        )

    return Decreto(
        id=ato_id,
        numero=numero,
        ano=ano,
        epigrafe=epigrafe,
        sumula=sumula,
        preambulo="\n".join(preambulo),
        publicado_em=publicado,
        diario=diario,
        cod_ato=resumo.cod_ato,
        url=f"{cfg.base}/listarAtosAno.do?action=exibir&codAto={resumo.cod_ato}",
        versao=cfg.visualizacao,
        conferido_em=hoje,
        blocos=blocos,
    )


def deduplica(decretos: list[Decreto]) -> tuple[list[Decreto], list[str]]:
    """Uma linha por decreto, ficando com a REPUBLICAÇÃO quando ela existe.

    **O número do decreto não é chave única, e isso não estava previsto.** A
    fonte republica um ato quando a primeira publicação saiu com erro, e a
    republicação entra como registro NOVO — `codAto` diferente, data de
    publicação posterior, a mesma epígrafe (às vezes com " - Republicado"
    grudado no fim). Medido em 2023: seis pares, entre eles o Decreto 2.914, que
    regulamenta o Sistema Estadual de Unidades de Conservação.

    Descoberto por `tests/decretos.test.ts`, que exige id único — sem ele o seed
    faria upsert de um sobre o outro e **a ordem do arquivo decidiria** qual
    texto fica. Metade das vezes ficaria a publicação superada, sem erro nenhum
    e sem nada na tela dizendo que houve republicação.

    Fica a de publicação mais recente, e é a mesma escolha de ler
    `tipoVisualizacao=compilado` em vez de `original`: o que vale é a última
    redação publicada. O que se descarta vai no relatório do ano — descartar em
    silêncio é o que esta função existe para impedir.
    """
    por_id: dict[str, Decreto] = {}
    trocados: list[str] = []

    for d in sorted(decretos, key=lambda x: (x.publicado_em, int(x.cod_ato))):
        anterior = por_id.get(d.id)
        if anterior is not None:
            trocados.append(
                f"{d.id}: republicado em {d.publicado_em} "
                f"(codAto {d.cod_ato}) sobre a publicação de {anterior.publicado_em}"
            )
        por_id[d.id] = d

    # De volta à ordem do documento: mais recente primeiro, como a fonte lista.
    ordenados = sorted(por_id.values(), key=lambda x: (x.publicado_em, int(x.cod_ato)), reverse=True)
    return ordenados, trocados


# --- rede --------------------------------------------------------------------


def _campos(cfg: Config) -> dict:
    """Os nove campos ocultos do formulário. Sem eles a listagem volta vazia —
    armadilha 1."""
    return {
        "codTipoAto": cfg.tipo_ato,
        "codTipoAtoSelecionado": cfg.tipo_ato,
        "codOrgaoUnidade": cfg.orgao_unidade,
        "codOrgaoUnidadeSelecionado": cfg.orgao_unidade,
        "pesquisou": "",
        "anoAtoPesquisado": 0,
        "paginaAtual": "",
        "isPaginado": "true",
        "site": 1,
    }


def lista_mes(s: Sessao, cfg: Config, ano: int, mes: int) -> list[Resumo]:
    """Todas as páginas da listagem de um mês."""
    url = (
        f"{cfg.base}/listarAtosAno.do?action=listarAtos"
        f"&anoAto={ano}&mesAto={mes}&isPaginado=true"
    )
    primeira = decodifica(s.post_bytes(url, _campos(cfg)))
    total = total_de(primeira)
    linhas = resumos(primeira)
    if not linhas:
        return []

    por_pagina = len(linhas)
    paginas = -(-total // por_pagina) if por_pagina else 1
    for indice in range(2, paginas + 1):
        pagina = decodifica(
            s.post_bytes(f"{url}&indice={indice}&totalRegistros={total}", _campos(cfg))
        )
        linhas += resumos(pagina)

    return linhas


def busca_ato(s: Sessao, cfg: Config, cod_ato: str) -> str:
    """A página de impressão de um ato. Mais limpa que a de exibição e com o
    mesmo texto — 21 KB contra 31 KB, sem a moldura do site."""
    url = (
        f"{cfg.base}/listarAtosAno.do?action=exibirImpressao"
        f"&codAto={cod_ato}&tipoVisualizacao={cfg.visualizacao}"
    )
    return decodifica(s.bytes(url))


# --- colheita ----------------------------------------------------------------


def colhe(
    s: Sessao,
    ano: int,
    cfg: Config | None = None,
    meses: list[int] | None = None,
    limite: int | None = None,
    relata=print,
) -> tuple[list[Decreto], dict]:
    """Um ano inteiro: lista, recorta, e só então abre o que passou.

    **Falha de listagem interrompe o ano, e isso é a lição que custou caro.**
    A primeira versão engolia o erro de um mês e seguia para o seguinte, o que
    produziu quatro arquivos de ano gravados com o número errado — inclusive
    dois dizendo ``"no_recorte": 0`` para anos inteiros que ninguém tinha
    conseguido ler. Nada quebrou, nada avisou, e o acervo teria sido semeado
    com a afirmação de que 2023 e 2024 não tiveram decreto normativo nenhum.

    É o mesmo princípio de `montarPeca`: sem modo degradado. Ano lido pela
    metade não é ano; quem chama recebe `completo: False` e não grava.
    """
    cfg = cfg or carrega()
    hoje = date.today().isoformat()
    decretos: list[Decreto] = []
    vistos = 0
    falhas: list[str] = []
    completo = True

    for mes in meses or range(1, 13):
        try:
            linhas = lista_mes(s, cfg, ano, mes)
        except FalhaDeRede as e:
            if _e_bloqueio(e):
                raise Bloqueado(f"{ano}-{mes:02d}: {e}") from e
            falhas.append(f"listagem {ano}-{mes:02d}: {e}")
            completo = False
            relata(f"  {ano}-{mes:02d}  listagem falhou: {e}")
            continue

        vistos += len(linhas)
        passam = [r for r in linhas if no_recorte(r.sumula, cfg)]
        relata(f"  {ano}-{mes:02d}  {len(linhas):4d} atos, {len(passam):3d} no recorte")

        for r in passam:
            if limite is not None and len(decretos) >= limite:
                return decretos, {
                    "vistos": vistos,
                    "falhas": falhas,
                    "completo": False,
                    "truncado": True,
                }
            try:
                decretos.append(extrai(busca_ato(s, cfg, r.cod_ato), r, cfg, hoje))
            except FalhaDeRede as e:
                if _e_bloqueio(e):
                    raise Bloqueado(f"decreto {r.cod_ato}: {e}") from e
                # Ato que não abre é perda de UM decreto, e o ano continua
                # utilizável — ao contrário da listagem, que define o universo.
                falhas.append(f"ato {r.cod_ato}: {e}")
                completo = False

    unicos, republicados = deduplica(decretos)
    if republicados:
        relata(f"  {len(republicados)} republicação(ões), ficando com a mais recente:")
        for r in republicados[:5]:
            relata(f"    - {r}")

    return unicos, {
        "vistos": vistos,
        "falhas": falhas,
        "completo": completo,
        "truncado": False,
        "republicados": republicados,
    }


def grava(ano: int, decretos: list[Decreto], resumo: dict, cfg: Config) -> Path:
    """Um arquivo por ano, em ``data/decretos_pr/``.

    Versionado, como ``data/vademecum/`` e pelo mesmo motivo: a entrada vem de
    um servidor de terceiro: ignorá-lo amarraria o seed a um scraping ao vivo e
    deixaria o acervo irrecuperável no dia em que a fonte saísse do ar.
    """
    ACERVO.mkdir(parents=True, exist_ok=True)
    arq = ACERVO / f"{ano}.json"
    arq.write_text(
        json.dumps(
            {
                "ano": ano,
                "fonte": {
                    "base": cfg.base,
                    "tipo_ato": cfg.tipo_ato,
                    "orgao_unidade": cfg.orgao_unidade,
                    "visualizacao": cfg.visualizacao,
                },
                "colhido_em": date.today().isoformat(),
                "vistos": resumo["vistos"],
                "no_recorte": len(decretos),
                # Fica gravado no arquivo, e não só no console de quem rodou:
                # `scripts/seed-decretos.ts` recusa semear ano incompleto, e um
                # acervo semeado pela metade não tem como se anunciar depois.
                "completo": resumo["completo"],
                # Quantos atos vieram em duas publicações. Zero é o normal; o
                # número existe para a republicação não sumir sem registro.
                "republicados": resumo.get("republicados", []),
                "decretos": [asdict(d) for d in decretos],
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    return arq


def _ja_completo(ano: int) -> bool:
    """Este ano já está em disco e foi lido inteiro?

    É o que torna a coleta retomável — e ela precisa ser: a fonte bloqueia por
    volume, então a ingestão dos cinco anos é uma maratona em várias sessões,
    não uma corrida só.
    """
    arq = ACERVO / f"{ano}.json"
    if not arq.exists():
        return False
    try:
        return bool(json.loads(arq.read_text(encoding="utf-8")).get("completo"))
    except (ValueError, OSError):
        return False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Coleta os decretos estaduais do Paraná.")
    p.add_argument("--ano", type=int, action="append", help="repetível; padrão é a janela do YAML")
    p.add_argument("--mes", type=int, action="append", help="repetível; padrão são os doze")
    p.add_argument("--limite", type=int, help="para a coleta depois de N decretos (para conferir)")
    p.add_argument("--seco", action="store_true", help="roda tudo e não grava nada")
    p.add_argument("--sem-cache", action="store_true")
    p.add_argument(
        "--pular-prontos",
        action="store_true",
        help="não recolhe ano que já tem arquivo completo em data/decretos_pr/",
    )
    a = p.parse_args(argv)

    cfg = carrega()
    anos = a.ano or list(range(cfg.ano_de, cfg.ano_ate + 1))
    s = Sessao(usar_cache=not a.sem_cache, validade_horas=24 * 30)

    total = 0
    for ano in anos:
        if a.pular_prontos and _ja_completo(ano):
            print(f"{ano}: já colhido, pulando")
            continue

        print(f"{ano}:")
        try:
            decretos, resumo = colhe(s, ano, cfg, meses=a.mes, limite=a.limite)
        except Bloqueado as e:
            # O servidor da Casa Civil responde "Erro 403 — Acesso
            # temporariamente bloqueado". Continuar daqui é o que faz o bloqueio
            # durar mais; o ano corrente não é gravado, e o que já estava em
            # disco continua intacto.
            print(f"\n  BLOQUEADO pela fonte: {e}")
            print("  Nada foi gravado para este ano. Espere o bloqueio cair e")
            print("  recomece com --pular-prontos, que retoma de onde parou.")
            return 2

        total += len(decretos)
        if resumo["falhas"]:
            print(f"  {len(resumo['falhas'])} falha(s):")
            for f in resumo["falhas"][:5]:
                print(f"    - {f}")

        if a.seco:
            print(f"  [seco] {len(decretos)} decretos de {resumo['vistos']} vistos")
        elif not resumo["completo"]:
            # Ano lido pela metade não vira arquivo. Ver o docstring de `colhe`.
            print(f"  ano INCOMPLETO — não gravado ({len(decretos)} decretos lidos)")
        else:
            arq = grava(ano, decretos, resumo, cfg)
            print(f"  {len(decretos)} decretos de {resumo['vistos']} vistos → {arq}")

    print(f"\ntotal: {total} decretos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
