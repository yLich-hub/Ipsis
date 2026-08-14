"""Dados Abertos do Senado Federal.

Usa ``/dadosabertos/processo``, e não ``/dadosabertos/materia``: a família
``materia`` está marcada como depreciada na própria resposta da API
(``Metadados.Descontinuacao``, com ``UrlServicoSubstituto`` apontando para
``/processo``). Escrever contra um endereço que a fonte já anunciou como morto
seria começar devendo manutenção.

**``normaGerada`` é o achado que dispensa varrer o DOU.** No detalhe do
processo, um projeto que virou lei traz o objeto completo — número, data de
assinatura, data de publicação e o veículo ("Diário Oficial da União de
15/07/2025"). O dado que justificaria montar um coletor de edição inteira do
Diário chega aqui de graça, estruturado, por uma API sem chave.

**O parâmetro é ``dataInicioApresentacao``, e a ordem das palavras importa.**
``dataApresentacaoInicio`` — a grafia que a Câmara usa — é aceita sem erro e
silenciosamente ignorada, devolvendo processos desde 1949. Conferido: com a
grafia errada o menor ``dataApresentacao`` da resposta é de 1949; com a certa, é
a data pedida. Parâmetro ignorado em silêncio é o pior tipo de defeito.
"""

from __future__ import annotations

from coletores.config import Config, carrega
from coletores.filtro import artigos_de, depois_do_corte, toca_o_corpus, virou_norma
from coletores.rede import FalhaDeRede, Sessao
from coletores.tipos import Achado, Colheita

BASE = "https://legis.senado.leg.br/dadosabertos"


def colhe(sessao: Sessao, desde: str | None = None, cfg: Config | None = None) -> Colheita:
    """Uma requisição só, sem paginação — a API devolve o intervalo inteiro num
    array. Desde a data de corte são ~5.200 itens e ~4 MB, e é por isso que
    ``desde`` existe: a carga inicial pede a janela inteira, a execução diária
    pede a recente."""
    cfg = cfg or carrega()
    desde = desde or cfg.data_de_corte
    colheita = Colheita(fonte="senado")

    try:
        lista = sessao.json(f"{BASE}/processo?dataInicioApresentacao={desde}") or []
    except FalhaDeRede as e:
        colheita.erro = str(e)
        return colheita

    colheita.vistos = len(lista)

    for p in lista:
        ementa = (p.get("ementa") or "").strip()
        apresentado = (p.get("dataApresentacao") or "")[:10]

        if not depois_do_corte(apresentado, cfg.data_de_corte):
            continue
        alvos = toca_o_corpus(ementa, cfg)
        if not alvos:
            continue

        situacao = (p.get("situacaoAtual") or "").strip()
        codigo = p.get("codigoMateria")

        colheita.achados.append(
            Achado(
                id=f"senado:{p['id']}",
                fonte="senado",
                identificacao=(p.get("identificacao") or f"processo {p['id']}").strip(),
                ementa=ementa,
                leis_tocadas=[a.lei_id for a in alvos],
                artigos_tocados=artigos_de(ementa, alvos),
                apresentado_em=apresentado,
                situacao=situacao,
                virou_norma=virou_norma(situacao),
                url=(
                    f"https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}"
                    if codigo
                    else ""
                ),
            )
        )

    # O número da lei está no detalhe, em `normaGerada`. Pede-se só para quem já
    # virou norma — que são poucos, e são os únicos em que o número importa.
    for a in colheita.achados:
        if a.virou_norma and not a.norma:
            a.norma = norma_de(sessao, a.id)

    return colheita


def norma_de(sessao: Sessao, achado_id: str) -> str | None:
    """Número da lei em que o processo se transformou, ou ``None``.

    Sai de ``normaGerada``, estruturado. Não se monta o número a partir do texto
    da situação: ela diz "TRANSFORMADA EM NORMA JURÍDICA" e nada mais, e derivar
    um número de lei de uma frase que não o contém seria inventá-lo.
    """
    numero = achado_id.split(":")[-1]
    try:
        p = sessao.json(f"{BASE}/processo/{numero}") or {}
    except FalhaDeRede:
        return None

    n = p.get("normaGerada") or {}
    if not n:
        return None

    if n.get("numero") and n.get("anoAssinatura"):
        return f"Lei {_milhar(int(n['numero']))}/{n['anoAssinatura']}"
    # `descricao` chega como 'Lei nº 15.164 de 14/07/2025'. Sem número e ano
    # separados, vale mais repassá-la crua que tentar recortá-la.
    return (n.get("descricao") or "").strip() or None


def publicacao_de(sessao: Sessao, achado_id: str) -> tuple[str, str] | None:
    """``(data de publicação, veículo)`` da norma gerada, quando existe.

    É o que o coletor de DOU usa para confirmar a publicação sem varrer edição
    nenhuma: o Senado já sabe que a Lei 15.164/2025 saiu no DOU de 15/07/2025.
    """
    numero = achado_id.split(":")[-1]
    try:
        p = sessao.json(f"{BASE}/processo/{numero}") or {}
    except FalhaDeRede:
        return None

    n = p.get("normaGerada") or {}
    if not n.get("dataPublicacao"):
        return None
    return str(n["dataPublicacao"])[:10], str(n.get("siglaVeiculoPublicacao") or "DOU")


def _milhar(n: int) -> str:
    """``15164`` → ``15.164``, a grafia com que a lei é citada em peça."""
    return f"{n:,}".replace(",", ".")
