"""Dados Abertos da Câmara dos Deputados.

REST/JSON, sem chave, documentada em Swagger. É a fonte mais completa das duas
de proposição porque o detalhe traz ``statusProposicao.descricaoSituacao`` — onde
aparece "Transformado em Norma Jurídica", que é o que separa "alguém propôs
mexer no Código Penal" de "o Código Penal mudou".

**Por que ``keywords`` e não varredura.** A API não aceita busca livre na ementa
(``?ementa=`` devolve 400, conferido em 13/08/2026). O que existe é ``keywords``,
o índice de assunto curado pela própria Câmara. Varrer todos os PLs desde a data
de corte seria mais de 4 mil itens por ano; e não adiantaria, porque o filtro
real é ``toca_o_corpus`` e ele roda depois, sobre a ementa.
"""

from __future__ import annotations

from urllib.parse import quote

from coletores.config import Config, carrega
from coletores.filtro import artigos_de, depois_do_corte, extrai_norma, toca_o_corpus, virou_norma
from coletores.rede import FalhaDeRede, Sessao
from coletores.tipos import Achado, Colheita

BASE = "https://dadosabertos.camara.leg.br/api/v2"


def colhe(
    sessao: Sessao,
    desde: str | None = None,
    cfg: Config | None = None,
    limite_de_detalhes: int = 80,
) -> Colheita:
    cfg = cfg or carrega()
    desde = desde or cfg.data_de_corte
    termos = cfg.camara.get("termos", [])
    tipos = cfg.camara.get("tipos", [])
    max_paginas = int(cfg.camara.get("paginas", 12))

    colheita = Colheita(fonte="camara")
    por_id: dict[int, dict] = {}
    falhas: list[str] = []

    for termo in termos:
        for pagina in range(1, max_paginas + 1):
            url = (
                f"{BASE}/proposicoes?keywords={quote(termo)}"
                f"&dataApresentacaoInicio={desde}"
                + "".join(f"&siglaTipo={t}" for t in tipos)
                + f"&itens=100&pagina={pagina}&ordem=DESC&ordenarPor=id"
            )
            try:
                dados = sessao.json(url).get("dados") or []
            except FalhaDeRede as e:
                falhas.append(f"{termo}: {e}")
                break

            # O mesmo PL cai em dois termos com frequência; o dict é a dedup.
            for d in dados:
                por_id[d["id"]] = d

            # Página incompleta é a última. Confiar no `rel: last` custaria uma
            # análise a mais para saber o que a contagem já diz.
            if len(dados) < 100:
                break

    if not por_id and len(falhas) == len(termos):
        colheita.erro = falhas[0] if falhas else "a Câmara não respondeu"
        return colheita

    colheita.vistos = len(por_id)

    candidatos: list[tuple[Achado, int]] = []
    for d in por_id.values():
        ementa = (d.get("ementa") or "").strip()
        apresentado = (d.get("dataApresentacao") or "")[:10]

        if not depois_do_corte(apresentado, cfg.data_de_corte):
            continue
        alvos = toca_o_corpus(ementa, cfg)
        if not alvos:
            continue

        achado = Achado(
            id=f"camara:{d['id']}",
            fonte="camara",
            identificacao=f"{d.get('siglaTipo')} {d.get('numero')}/{d.get('ano')}",
            ementa=ementa,
            leis_tocadas=[a.lei_id for a in alvos],
            artigos_tocados=artigos_de(ementa, alvos),
            apresentado_em=apresentado,
            url=f"https://www.camara.leg.br/propostas-legislativas/{d['id']}",
        )
        candidatos.append((achado, d["id"]))

    # A situação custa uma ida por proposição, então só se pergunta pelos que
    # interessam — e mesmo assim com teto. Uma fonte que resolvesse devolver mil
    # itens não pode virar mil requisições dentro de uma execução.
    for achado, numero in candidatos[:limite_de_detalhes]:
        achado.situacao = situacao_de(sessao, numero)
        achado.virou_norma = virou_norma(achado.situacao)
        if achado.virou_norma:
            achado.norma = extrai_norma(achado.situacao)

    colheita.achados = [a for a, _ in candidatos]
    if falhas:
        colheita.erro = f"{len(falhas)} de {len(termos)} termos falharam: {falhas[0]}"

    return colheita


def situacao_de(sessao: Sessao, numero: int | str) -> str:
    """Situação atual de uma proposição, por id.

    ``descricaoSituacao`` e ``despacho`` voltam juntos porque o número da lei
    resultante aparece no segundo — a primeira costuma trazer só o rótulo.
    Falha vira string vazia: a ementa já disse que a proposição mexe no corpus,
    e é isso que a tela precisa mostrar.
    """
    try:
        dados = sessao.json(f"{BASE}/proposicoes/{numero}").get("dados") or {}
    except FalhaDeRede:
        return ""

    s = dados.get("statusProposicao") or {}
    return " — ".join(p for p in (s.get("descricaoSituacao"), s.get("despacho")) if p)
