"""Precedentes qualificados do STJ — dados abertos, CC-BY.

Baixa `Temas.csv` do Portal de Dados Abertos do STJ e guarda os temas que tocam
o recorte do projeto. É a única fonte de jurisprudência do sistema, e entrou por
uma razão específica: **ela sabe dizer o que deixou de valer.**

**Por que temas e não ementas.** As ementas do STJ também são abertas, e há
muito mais delas — 718 sobre a Lei 11.343 num único mês, só na Quinta Turma.
Mas o dump de ementas não tem campo de vigência: medido em 14/08/2026, `tema` e
`termosAuxiliares` vêm vazios em 3.326 de 3.326 registros. Uma ementa de junho
pode ter sido superada em agosto e o arquivo não diz.

Indexá-las seria construir, ao lado de um corpus auditado e datado, uma base
que não sabe se o que mostra ainda vale — exatamente o que a decisão nº 3 do
projeto existe para impedir, só que com acórdão em vez de lei.

O dataset de temas tem `situacao`, `entendimentoAnterior` e o histórico de
mudança. Dos 61 temas que tocam o recorte, **oito estão cancelados** — e é
justamente isso que um advogado precisa saber ao topar com a tese num texto
antigo. Por isso tema cancelado é guardado, não descartado.

**Nada aqui vira fundamento de peça.** Ver o cabeçalho da migration 0014.
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from typing import Any

import yaml

from coletores.config import carrega as carrega_vigilia
from coletores.filtro import artigos_de
from coletores.rede import FalhaDeRede, Sessao
from coletores.tipos import Achado, Colheita, Precedente

RAIZ = Path(__file__).resolve().parent.parent
CURADORIA = RAIZ / "data" / "curadoria" / "precedentes.yaml"

# `art. 65`, `arts. 61 e 65`, `artigo 68`. Só o número interessa aqui — a
# atribuição fina ao corpus é feita por `artigos_de`, que é mais cuidadosa.
_ART = re.compile(r"\bart(?:s|igos?)?\.?\s*(\d{1,3})", re.IGNORECASE)

# Os campos de texto em que se procura. `anotacoesNUGEPNAC` e `delimitacaoJulgado`
# entram porque é neles que o STJ costuma dizer a que crime o tema se aplica.
_CAMPOS = (
    "teseFirmada",
    "questaoSubmetidaAJulgamento",
    "referenciaLegislativa",
    "anotacoesNUGEPNAC",
    "delimitacaoJulgado",
)


def curadoria() -> dict[str, Any]:
    if not CURADORIA.exists():
        raise FileNotFoundError(
            f"curadoria dos precedentes não encontrada em {CURADORIA}.\n"
            "É ela que define o recorte; sem ela o coletor traria 2.391 temas de todos os ramos."
        )
    return yaml.safe_load(CURADORIA.read_text(encoding="utf-8"))


def colhe(sessao: Sessao, cfg: dict[str, Any] | None = None) -> Colheita:
    cfg = cfg or curadoria()
    colheita = Colheita(fonte="stj")

    try:
        linhas = baixa_temas(sessao, cfg)
    except FalhaDeRede as e:
        colheita.erro = str(e)
        return colheita

    colheita.vistos = len(linhas)
    alvos_corpus = carrega_vigilia().alvos

    drogas = re.compile(cfg["drogas"], re.IGNORECASE)
    codigo_penal = re.compile(cfg["codigo_penal"], re.IGNORECASE)
    parte_geral = {int(n) for n in cfg["parte_geral_cp"]}

    for t in linhas:
        texto = " ".join(str(t.get(c) or "") for c in _CAMPOS)

        if drogas.search(texto):
            escopo = "drogas"
        elif codigo_penal.search(texto) and any(
            int(n) in parte_geral for n in _ART.findall(texto)
        ):
            escopo = "parte_geral"
        else:
            continue

        colheita.precedentes.append(_para_precedente(t, escopo, texto, alvos_corpus, cfg))

    return colheita


def baixa_temas(sessao: Sessao, cfg: dict[str, Any]) -> list[dict[str, str]]:
    """Acha o recurso pelo NOME e baixa.

    Não se guarda o id do recurso: o STJ republica o arquivo periodicamente e o
    id muda a cada versão. Um id fixo na curadoria daria 404 no primeiro
    republish, e o sintoma seria a tela parar de atualizar sem ninguém notar.
    """
    fonte = cfg["fonte"]
    pacote = sessao.json(f"{fonte['ckan']}?id={fonte['dataset']}")

    recursos = (pacote.get("result") or {}).get("resources") or []
    alvo = next((r for r in recursos if r.get("name") == fonte["recurso"]), None)
    if not alvo:
        nomes = ", ".join(str(r.get("name")) for r in recursos[:6])
        raise FalhaDeRede(
            f"recurso '{fonte['recurso']}' não está no dataset do STJ. Disponíveis: {nomes}"
        )

    bruto = sessao.bytes(alvo["url"])

    # O CSV vem em UTF-8 com BOM. `utf-8-sig` come o BOM; sem isso o nome da
    # primeira coluna nasce com `﻿` grudado e o DictReader nunca a encontra.
    return list(csv.DictReader(io.StringIO(bruto.decode("utf-8-sig", errors="replace"))))


def _para_precedente(
    t: dict[str, str], escopo: str, texto: str, alvos, cfg: dict[str, Any]
) -> Precedente:
    # A extração de artigo é a mesma da vigília; a DETERMINAÇÃO DA LEI, não.
    #
    # `toca_o_corpus` exige verbo de alteração, porque a vigília pergunta "quem
    # mexeu na lei?". Um precedente não mexe em nada — ele diz como a lei se lê,
    # e frases como "vedado usar inquéritos para afastar o art. 33 da Lei
    # 11.343" não têm verbo nenhum de alteração. Passar por ali devolvia lista
    # vazia sempre, e o vínculo com as teses nunca aconteceria.
    #
    # Aqui a lei já foi decidida pelo recorte, alguns passos acima: `drogas` é a
    # Lei 11.343 e `parte_geral` é o Código Penal. Sobra extrair o artigo — e
    # `artigos_de` mantém a própria trava: mais de um diploma numerado na frase
    # e nada é atribuído. Isso é frequente aqui, porque um tema costuma citar as
    # duas leis, e ficar sem artigo é o resultado certo: melhor vincular só à lei
    # que apontar para o artigo errado.
    alvo = next(
        (a for a in alvos if a.lei_id == ("lei_11343_2006" if escopo == "drogas" else "dl_2848_1940")),
        None,
    )
    artigos = artigos_de(texto, [alvo]) if alvo else []

    # Vínculo curado, para o tema que o extrator não resolve — e ele vence,
    # quando existe. Não é preferência por curadoria: é que aqui alguém leu a
    # tese inteira, e `artigos_de` leu uma frase. Ver `vinculos` no cabeçalho de
    # `data/curadoria/precedentes.yaml`, onde cada linha diz por que aponta para
    # o que aponta.
    #
    # Sem isto, seis dos dezoito temas citáveis ficavam fora do contexto do chat
    # — entre eles o Tema 1336 (indulto e tráfico privilegiado) e o Tema 585
    # (confissão compensada com reincidência), que são pergunta de plantão.
    curado = (cfg.get("vinculos") or {}).get(_id(t))
    if curado and curado.get("artigos"):
        artigos = list(curado["artigos"])

    return Precedente(
        id=_id(t),
        tipo=(t.get("tipoPrecedente") or "").strip() or "Precedente",
        numero=(t.get("numeroPrecedente") or "").strip(),
        situacao=(t.get("situacao") or "").strip() or "—",
        tese_firmada=_limpa(t.get("teseFirmada")),
        questao=_limpa(t.get("questaoSubmetidaAJulgamento")),
        entendimento_anterior=_limpa(t.get("entendimentoAnterior")),
        historico=_limpa(t.get("informacoesComplementares")),
        ref_legislativa=_limpa(t.get("referenciaLegislativa")),
        ref_sumular=_limpa(t.get("referenciaSumular")),
        sumula_originada=_limpa(t.get("sumulaOriginada")),
        julgado_em=_data(t.get("dataJulgamento")),
        publicado_em=_data(t.get("dataPublicacaoAcordao")),
        afetado_em=_data(t.get("dataPrimeiraAfetacao")),
        escopo=escopo,
        artigos_tocados=artigos,
    )


def _id(t: dict[str, str]) -> str:
    """`stj:4517`. É a chave do banco e a chave dos vínculos curados — uma só,
    para não haver como as duas divergirem."""
    return f"stj:{(t.get('sequencialPrecedente') or '').strip()}"


# --- mudança de situação -----------------------------------------------------

# As situações que tornam um tema citável no chat. Espelha `CITAVEL` em
# `src/lib/vigilia/precedentes.ts` — se as duas divergirem, a vigília avisa
# sobre uma mudança que o chat não sofreu, ou cala sobre uma que sofreu.
CITAVEL = "Trânsito em Julgado"


def mudancas(precedentes: list[Precedente], antes: dict[str, str]) -> list[Achado]:
    """Temas que mudaram de situação desde a última coleta, como achados da vigília.

    **É isto que fecha o ciclo.** A razão de este projeto ter escolhido temas
    qualificados em vez de ementas foi que esta fonte sabe dizer o que deixou de
    valer — e essa garantia vale exatamente até a última coleta. Sem detectar a
    mudança, o upsert sobrescreve `situacao` em silêncio e o sistema fica
    congelado no dia em que alguém rodou o comando: a mesma armadilha da
    fotografia de 28/02/2025, agora com jurisprudência.

    O caso que importa é o tema que **deixa de ser citável**. Enquanto ele está
    em trânsito em julgado, entra no contexto do chat e é afirmado com selo
    verde; no dia em que for cancelado ou revisado, tem de sair — e alguém tem
    de saber que saiu. É exatamente o que aconteceria com o Tema 600 se a coleta
    o tivesse pego antes da revisão.

    Puro: recebe o estado anterior pronto e não toca em banco, para poder ser
    testado offline como o resto do filtro.

    Tema novo não gera achado. Ele não *mudou* de nada, e a linha diria "situação
    alterada de nada para trânsito em julgado", que é ruído.
    """
    saida: list[Achado] = []

    for p in precedentes:
        anterior = antes.get(p.id)
        if not anterior or anterior == p.situacao:
            continue

        era_citavel = anterior == CITAVEL
        virou_citavel = p.situacao == CITAVEL

        # A lei sempre existe: vem do artigo quando dá, e do recorte quando não.
        # `vigilia_alteracoes` exige `leis_tocadas` não vazio, e é a coluna que
        # a tela usa para agrupar.
        lei = "lei_11343_2006" if p.escopo == "drogas" else "dl_2848_1940"

        if era_citavel and not virou_citavel:
            aviso = "SAIU do contexto do chat — deixou de ser citável."
        elif virou_citavel and not era_citavel:
            aviso = "ENTROU no contexto do chat — passou a ser citável."
        else:
            aviso = "Segue fora do contexto do chat nas duas situações."

        saida.append(
            Achado(
                # O id carrega a situação nova: cada transição é um fato próprio
                # e fica no histórico. Sem ela, uma segunda mudança sobrescreveria
                # o registro da primeira.
                id=f"stj-mudanca:{p.id.split(':')[-1]}:{_chave(p.situacao)}",
                fonte="stj",
                identificacao=f"{p.tipo} {p.numero}"[:80],
                ementa=(
                    f"O STJ mudou a situação do {p.tipo} {p.numero} de "
                    f"“{anterior}” para “{p.situacao}”. {aviso}"
                    + (f" Tese firmada: {p.tese_firmada}" if p.tese_firmada else "")
                ),
                leis_tocadas=[lei],
                artigos_tocados=list(p.artigos_tocados),
                apresentado_em=p.julgado_em or "",
                situacao=p.situacao,
                # Precedente não é norma publicada. `virou_norma` marca "a lei
                # mudou", e confundir os dois faria a tela contar mudança de
                # jurisprudência como texto legal alterado.
                virou_norma=False,
                url="",
            )
        )

    return saida


def _chave(s: str) -> str:
    """`Trânsito em Julgado` → `transito-em-julgado`. Para caber num id estável."""
    from coletores.filtro import sem_acento

    return re.sub(r"[^a-z0-9]+", "-", sem_acento(s)).strip("-")


def _limpa(v: str | None) -> str | None:
    """Espaço colapsado; vazio vira `None`.

    O CSV do STJ traz quebra de linha e espaço duplo dentro das células — a tese
    firmada costuma vir com a numeração romana em linhas separadas. Guardar isso
    cru faria a tela decidir como renderizar espaço em branco de arquivo.
    """
    if not v:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def _data(v: str | None) -> str | None:
    """`dd/mm/aaaa` → `aaaa-mm-dd`. Vazio e formato estranho viram `None`.

    Data que não dá para interpretar vira ausência, nunca palpite: a tela mostra
    "—" e ninguém conclui nada errado a partir disso.
    """
    if not v:
        return None
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})", str(v))
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})", str(v))
    return m.group(0).strip() if m else None
