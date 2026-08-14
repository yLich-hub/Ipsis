"""Scraping do texto compilado no Planalto — o coletor que enxerga o que já é lei.

**Este é o coletor mais importante dos cinco, e a razão é estrutural.** Câmara e
Senado contam o que foi *proposto*; o Planalto mostra o que *está em vigor*. Só o
segundo fura a data de corte do corpus.

E ele achou na primeira execução: a página compilada da Lei 11.343 traz
``(Incluído pela Lei nº 15.581, de 2025)`` e ``(Incluído pela Lei nº 15.358, de
2026)`` — duas leis posteriores a 28/02/2025 que já alteraram o corpus, e que
nenhuma API de proposição teria reportado como alteração consumada.

**Por que scraping, e não API.** O Planalto não tem API: o ``ccivil_03`` serve
HTML. O substituto oficial seria o LexML (SRU/CQL, sem chave), mas o endereço
responde por trás de verificação de segurança com JavaScript — conferido em
13/08/2026, devolve a página de desafio, não o XML. Fonte que só funciona no
navegador não serve para coleta automatizada.

**O que este módulo NÃO faz, e não fará.** Ele não escreve texto de lei em lugar
nenhum. Extrai apenas a *procedência da alteração* — qual lei alterou, qual
artigo, em que ano — e o endereço. O texto compilado do Planalto não passou pelo
parser do projeto nem por conferência humana, e a decisão nº 1 diz que o texto
legal do banco vem de uma fonte só. Deixar este scraper alimentar
``dispositivos`` seria trocar a fonte auditada por uma raspagem.

Duas armadilhas do HTML do Planalto, as duas encontradas na prática:

1. **A anotação vem quebrada por espaço em branco de formatação.** No fonte:
   ``(Incluído pela Lei \\r\\n\\tnº 15.581, de 2025)``. Qualquer regex sobre o HTML
   cru que não colapse espaço primeiro perde a anotação — e perder em silêncio é
   o pior modo de falha desta tela. ``BeautifulSoup.get_text()`` resolve, e é
   por isso que ele está aqui em vez de um regex.
2. **O href pode discordar do texto.** Na anotação da Lei 15.581 o link aponta
   para ``L15281.htm``. Vale o texto, que é o que um advogado lê e cita; o href
   fica guardado como endereço, não como número.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, NavigableString, Tag

# Tags que separam um bloco do seguinte. Tudo que não está aqui é inline e tem o
# texto CONCATENADO sem separador — ver `_por_bloco`.
_BLOCOS = {
    "p", "div", "tr", "td", "li", "br", "table", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
}

# RECORD SEPARATOR. Ver `_por_bloco`: `\n` não pode ser o separador porque o
# próprio texto do Planalto o contém.
_LIMITE = "\x1e"

from coletores.config import Alvo, Config, carrega
from coletores.rede import FalhaDeRede, Sessao
from coletores.tipos import Achado, Colheita

# `Art. 33`, `Art. 33-A`, `Art. 1º`. Âncora no começo da linha: "art. 22 desta
# Lei" no meio de uma frase é remissão, não cabeçalho de artigo.
_CABECALHO = re.compile(r"^Art\.?\s*(\d{1,4})(?:\s*[ºo°])?(\-[A-Za-z])?", re.IGNORECASE)

# A anotação de procedência, já com o texto colapsado.
_ANOTACAO = re.compile(
    r"\(\s*(Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Acrescid[oa]|Revogad[oa]|Vig[êe]ncia)"
    r"[^)]{0,160}?\)",
    re.IGNORECASE,
)

# `Lei nº 15.581, de 2025`, `Lei Complementar nº 214, de 2025`, `Medida
# Provisória nº 1.303, de 2025`.
_NORMA = re.compile(
    r"(Lei(?:\s+Complementar)?|Medida\s+Provis[óo]ria|Decreto(?:-Lei)?)"
    r"\s*n?[ºo°.]*\s*([\d.]+)[^)\d]{0,20}?(\d{4})",
    re.IGNORECASE,
)


def colhe(
    sessao: Sessao,
    cfg: Config | None = None,
    apenas_pos_corte: bool = True,
) -> Colheita:
    """Varre as três páginas compiladas e devolve as alterações posteriores à
    data de corte.

    ``apenas_pos_corte=False`` devolve o histórico inteiro — útil para conferir
    o extrator contra alterações antigas conhecidas (a Lei 13.840/2019 na Lei de
    Drogas, por exemplo), sem gravar nada.
    """
    cfg = cfg or carrega()
    ano_de_corte = int(cfg.data_de_corte[:4])

    colheita = Colheita(fonte="planalto")
    falhas: list[str] = []

    for alvo in cfg.alvos:
        try:
            html = sessao.bytes(alvo.planalto)
        except FalhaDeRede as e:
            falhas.append(f"{alvo.rotulo}: {e}")
            continue

        alteracoes = extrai(html, alvo)
        colheita.vistos += len(alteracoes)

        for a in alteracoes:
            if apenas_pos_corte and a.ano < ano_de_corte:
                continue
            colheita.achados.append(_para_achado(a, alvo))

    # Todas fora do ar é erro de fonte. Uma só fora do ar é degradação: as
    # outras duas continuam valendo, e a tela mostra o recado.
    if falhas:
        colheita.erro = "; ".join(falhas)

    return colheita


# --- extração ----------------------------------------------------------------


class Alteracao:
    """Uma anotação de procedência, já resolvida ao artigo a que pertence."""

    __slots__ = ("artigo", "verbo", "norma", "ano", "texto", "href")

    def __init__(
        self,
        artigo: str,
        verbo: str,
        norma: str,
        ano: int,
        texto: str,
        href: str,
    ) -> None:
        self.artigo = artigo
        self.verbo = verbo
        self.norma = norma
        self.ano = ano
        self.texto = texto
        self.href = href


def extrai(html: bytes, alvo: Alvo) -> list[Alteracao]:
    """Lê a página compilada e devolve as alterações, atribuídas por artigo.

    Separada de ``colhe`` para poder ser testada contra HTML gravado em disco,
    sem rede — mesma divisão de ``lib/peca/resolver.ts``, que existe para o
    teste da minuta rodar offline.
    """
    # As páginas do Planalto são latin-1 e nem sempre declaram. `from_encoding`
    # evita o palpite do BeautifulSoup, que erra em página com poucos acentos e
    # transforma "Redação" em "Redação" — o que faz o regex de anotação
    # deixar de casar sem nenhum erro visível.
    sopa = BeautifulSoup(html, "html.parser", from_encoding="latin-1")

    for tag in sopa.find_all(["script", "style"]):
        tag.decompose()

    # Mapa href → anotação, para o link do ato alterador sobreviver ao
    # get_text(). Montado antes porque get_text() descarta atributo.
    # A chave usa `_por_bloco`, e não `get_text(" ")`: os dois lados desta
    # busca têm de ser normalizados pela MESMA regra, senão a anotação que o
    # extrator vê ("…pela Lei nº 15.358, de 2026") nunca é igual à que o mapa
    # guardou ("…pela Lei nº 15.358 , de 2026", com o espaço que `get_text(" ")`
    # insere ao redor do `<span>`). O sintoma é link sempre vazio.
    hrefs: dict[str, str] = {}
    for a in sopa.find_all("a"):
        if not isinstance(a, Tag):
            continue
        destino = str(a.get("href") or "")
        rotulo = _colapsa(_por_bloco(a))
        if destino and rotulo:
            hrefs.setdefault(rotulo, destino)

    alteracoes: list[Alteracao] = []
    vistos: set[tuple[str, str]] = set()
    artigo = ""

    for bruto in _por_bloco(sopa).split(_LIMITE):
        linha = _colapsa(bruto)
        if not linha:
            continue

        cab = _CABECALHO.match(linha)
        if cab:
            artigo = f"{cab.group(1)}{(cab.group(2) or '').lower()}"

        for m in _ANOTACAO.finditer(linha):
            texto = _colapsa(m.group(0))
            norma = _NORMA.search(texto)
            if not norma:
                # `(Revogado)` e `(Vigência)` sem número são anotação legítima e
                # não identificam ato nenhum. Sem número não há o que reportar.
                continue

            numero = norma.group(2).rstrip(".")
            rotulo = f"{_especie(norma.group(1))} {numero}/{norma.group(3)}"

            # A mesma lei alterando o mesmo artigo aparece várias vezes na
            # página — uma anotação por parágrafo e inciso tocado. Para a
            # vigília isso é UM fato, e repeti-lo seis vezes na tela é o tipo de
            # inflação que faz a lista parecer maior do que a mudança é.
            if (rotulo, artigo) in vistos:
                continue
            vistos.add((rotulo, artigo))

            alteracoes.append(
                Alteracao(
                    artigo=artigo,
                    verbo=_colapsa(m.group(1)).lower(),
                    norma=rotulo,
                    ano=int(norma.group(3)),
                    texto=texto,
                    href=_absoluto(_href_de(texto, hrefs), alvo.planalto),
                )
            )

    return alteracoes


def _por_bloco(sopa: BeautifulSoup) -> str:
    """Texto da página com quebra APENAS entre blocos.

    Duas armadilhas, e cada uma custou uma execução inteira de extração
    silenciosamente vazia:

    1. **``get_text("\\n")`` não serve.** Ele insere quebra entre todo nó de
       texto, inclusive entre tags inline, e a anotação do Planalto vive dentro
       de ``<a>``: ``(Incluído pela Lei <span>nº 15.581</span>, de 2025)`` vira
       três linhas e nenhum regex casa em nenhuma delas. Medido na página da Lei
       11.343: 11 anotações encontradas contra 283 reais.

    2. **O separador não pode ser ``\\n``.** Os nós de texto do Planalto já
       contêm quebra de linha de formatação — no fonte, a anotação é
       ``(Incluído pela Lei \\r\\n\\tnº 15.581, de 2025)``. Separar blocos com
       ``\\n`` e depois dividir por ``\\n`` parte a anotação exatamente no meio,
       de novo. Daí o ``\\x1e`` (RECORD SEPARATOR), que é caractere de controle
       e não aparece em texto de página.

    As duas leis que já alteraram a Lei 11.343 depois da data de corte —
    15.581/2025 e 15.358/2026 — caíam nas duas armadilhas. O modo de falha era
    exatamente o pior possível: a tela dizendo que nada mudou.
    """
    partes: list[str] = []
    for no in sopa.descendants:
        if isinstance(no, NavigableString):
            partes.append(str(no))
        elif isinstance(no, Tag) and no.name in _BLOCOS:
            partes.append(_LIMITE)
    return "".join(partes)


def _para_achado(a: Alteracao, alvo: Alvo) -> Achado:
    """Uma alteração vira um achado por PAR (norma, artigo).

    Uma lei nova costuma alterar dez artigos da mesma lei antiga, e agrupá-los
    numa linha só perderia exatamente o que a tela precisa cruzar com
    ``teses.fundamentos``. O id carrega os dois, então a coleta continua
    idempotente.
    """
    artigo_id = f"{alvo.lei_id}_art{a.artigo}" if a.artigo else ""

    return Achado(
        id=f"planalto:{alvo.lei_id}:{a.norma}:{a.artigo or 'geral'}",
        fonte="planalto",
        identificacao=a.norma,
        ementa=(
            f"{a.norma} alterou o art. {_exibe(a.artigo)} — {alvo.rotulo}. "
            if a.artigo
            else f"{a.norma} alterou a {alvo.rotulo}. "
        )
        + f"Anotação do texto compilado no Planalto: {a.texto}",
        leis_tocadas=[alvo.lei_id],
        artigos_tocados=[artigo_id] if artigo_id else [],
        # O ano é o que a anotação traz; o Planalto não imprime dia e mês na
        # remissão. Uma data inventada a partir do ano seria pior que a ausência.
        apresentado_em="",
        situacao=f"em vigor no texto compilado ({a.ano})",
        # Achado do Planalto nasce como norma: está no texto consolidado, logo
        # já é lei. É a diferença entre este coletor e os dois de proposição.
        virou_norma=True,
        norma=a.norma,
        url=a.href or alvo.planalto,
    )


# --- apoio -------------------------------------------------------------------


def _colapsa(s: str) -> str:
    """Todo espaço em branco vira um espaço só.

    É a linha que faz o extrator funcionar: no fonte do Planalto a anotação vem
    quebrada por ``\\r\\n\\t`` no meio (``(Incluído pela Lei \\r\\n\\tnº 15.581, de
    2025)``), e sem colapsar antes nenhum regex de anotação casa.
    """
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def _href_de(anotacao: str, hrefs: dict[str, str]) -> str:
    """Link do ato alterador, quando a anotação está dentro de um ``<a>``.

    Tenta igualdade primeiro e só então contenção: a anotação costuma ser o
    conteúdo inteiro do link, mas às vezes vem acompanhada de um "(Vigência)" no
    mesmo `<a>`. Vazio é resposta legítima — anotação fora de link existe, e
    inventar um endereço plausível é o erro que `docs/acervo-vademecum.md` já
    documenta para o acervo.
    """
    exato = hrefs.get(anotacao)
    if exato:
        return exato
    return next((h for rotulo, h in hrefs.items() if anotacao in rotulo), "")


def _exibe(artigo: str) -> str:
    """``121-b`` → ``121-B``. O id guarda caixa baixa, porque é assim que o
    corpus grava; a tela mostra maiúscula, porque é assim que se cita."""
    return re.sub(r"-([a-z])$", lambda m: f"-{m.group(1).upper()}", artigo)


def _especie(bruta: str) -> str:
    b = _colapsa(bruta).lower()
    if b.startswith("lei complementar"):
        return "Lei Complementar"
    if b.startswith("medida"):
        return "MP"
    if b.startswith("decreto-lei"):
        return "Decreto-Lei"
    if b.startswith("decreto"):
        return "Decreto"
    return "Lei"


def _absoluto(href: str, base: str) -> str:
    """Resolve o `../../../` dos links internos do Planalto. Vazio continua vazio
    — link ausente é informação, e inventar um endereço plausível é o erro que
    `docs/acervo-vademecum.md` já documenta para o acervo."""
    if not href:
        return ""
    if href.startswith("http"):
        return href
    from urllib.parse import urljoin

    return urljoin(base, href)
