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
from coletores.tipos import Colheita, Precedente

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

        colheita.precedentes.append(_para_precedente(t, escopo, texto, alvos_corpus))

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


def _para_precedente(t: dict[str, str], escopo: str, texto: str, alvos) -> Precedente:
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

    return Precedente(
        id=f"stj:{t.get('sequencialPrecedente') or ''}".strip(),
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
