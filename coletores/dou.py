"""Diário Oficial da União — extração de texto e confirmação de publicação.

**O que este coletor faz, e o que ele deliberadamente não faz.** O painel do TOGA
v2 desenha "Extração de texto do Diário Oficial (PDF e HTML)" varrendo a Seção 1
a cada 12 minutos. Varredura de edição inteira existe e é gratuita — é o INLABS
(``inlabs.in.gov.br``), que entrega PDF e XML das edições completas desde
01/01/2020 —, mas exige cadastro com login e entrega ZIP diário. Duas coisas que
não cabem numa execução automatizada sem credencial no ambiente.

O caminho aqui é o inverso: as outras quatro fontes já dizem QUAL norma saiu, e
o Senado diz até em que dia (``normaGerada.dataPublicacao``). Sabendo norma e
data, abre-se o ato no ``in.gov.br`` e extrai-se o texto publicado. É confirmação
de publicação, não varredura.

**Duas coisas descobertas ao escrever isto, e as duas mudaram o desenho:**

1. **A busca do ``in.gov.br`` é montada por JavaScript.** Os resultados não estão
   no HTML como links — estão num ``<script type="application/json">`` com
   ``jsonArray``, que o navegador transforma em lista. Ler o JSON é mais robusto
   que raspar o HTML renderizado, e é o que este módulo faz.

2. **O parâmetro ``q`` não filtra de forma confiável.** Medido em 13/08/2026:
   ``q="LEI Nº 15.581"`` devolve 20 portarias sem relação, e a busca por frase
   entre aspas devolve zero. O que funciona é o recorte por data
   (``exactDate=personalizado&publishFrom=DD-MM-AAAA``), que traz a Seção 1
   daquele dia — e aí o filtro por título acontece aqui, sobre o JSON.

**Consequência aceita, e declarada:** sem data de publicação conhecida, este
módulo não confirma nada e devolve ``None``. Não se procura em janela larga
esperando acertar. O Planalto já dá o endereço oficial do ato alterador, e uma
URL de DOU escolhida por aproximação seria o dado plausível e falso que a decisão
nº 3 existe para impedir — o mesmo motivo pelo qual 42 das 75 leis do acervo
Vade Mecum ficam sem link em vez de ganharem um endereço deduzido do número.

**O texto extraído não vira texto legal do projeto.** Serve para confirmar que a
norma existe no Diário e guardar o endereço. A decisão nº 1 diz que o texto legal
do banco vem do parser do Vade Mecum, e raspagem de página web não substitui
isso — nem aqui, nem no Planalto.
"""

from __future__ import annotations

import json
import re

from bs4 import BeautifulSoup

from coletores.config import Config, carrega
from coletores.rede import FalhaDeRede, Sessao

# `Lei 15.164/2025` → ('15.164', '2025'). Aceita a grafia com e sem ponto.
_NORMA = re.compile(r"(?:lei|mp|decreto)[^\d]{0,20}([\d.]+)\s*/\s*(\d{4})", re.IGNORECASE)

# Quantos itens pedir por página da Seção 1. O padrão da tela é 20; 50 é o maior
# valor que a busca aceita sem reclamar, e reduz idas ao servidor.
_POR_PAGINA = 50


def publicacao(
    sessao: Sessao,
    norma: str,
    cfg: Config | None = None,
    data_publicacao: str = "",
) -> dict | None:
    """Procura o ato na Seção 1 do dia e devolve ``{titulo, url, trecho}``.

    ``data_publicacao`` é ISO (``2025-07-15``) e vem de ``senado.publicacao_de``.
    Sem ela, devolve ``None`` de imediato: ver o cabeçalho do módulo — buscar em
    janela larga e ficar com o primeiro resultado plausível é pior que não
    confirmar.
    """
    cfg = cfg or carrega()
    base = cfg.dou.get("base", "https://www.in.gov.br")

    m = _NORMA.search(norma)
    if not m or not data_publicacao:
        return None

    numero = m.group(1)
    dia = _para_ddmmaaaa(data_publicacao)
    if not dia:
        return None

    url = (
        f"{base}/consulta/-/buscar/dou?q=&s=do1"
        f"&exactDate=personalizado&publishFrom={dia}&publishTo={dia}"
        f"&delta={_POR_PAGINA}&sortType=0"
    )

    try:
        itens = resultados(sessao.bytes(url))
    except FalhaDeRede:
        return None

    # O casamento é pelo NÚMERO dentro de um título que começa por "LEI". Sem a
    # âncora no início, "PORTARIA ... altera a Lei nº 15.164" viraria "a lei saiu
    # no Diário", que é uma afirmação forte sustentada por coincidência.
    alvo = re.compile(rf"^\s*LEI\b[^\d]{{0,20}}{re.escape(numero)}\b", re.IGNORECASE)

    for item in itens:
        titulo = _limpa(item.get("title", ""))
        if not alvo.search(titulo):
            continue

        destino = f"{base}/web/dou/-/{item.get('urlTitle', '')}"
        return {
            "titulo": titulo[:300],
            "url": destino,
            "trecho": texto_da_pagina(sessao, destino)[:600],
            "publicado_em": data_publicacao[:10],
            "edicao": item.get("editionNumber", ""),
            "pagina": item.get("numberPage", ""),
        }

    return None


def resultados(html: bytes) -> list[dict]:
    """Os itens da busca, lidos do payload JSON da página.

    A lista de resultados do ``in.gov.br`` é montada por JavaScript a partir de
    ``<script id="..._params" type="application/json">``. Ler o JSON é mais
    robusto que raspar a lista renderizada — que, aliás, não existe no HTML que
    chega ao coletor.

    Separada de ``publicacao`` para poder ser testada contra payload gravado,
    sem rede.
    """
    sopa = BeautifulSoup(html, "html.parser", from_encoding="utf-8")

    for script in sopa.find_all("script", attrs={"type": "application/json"}):
        conteudo = script.string or script.get_text()
        if not conteudo or "jsonArray" not in conteudo:
            continue
        try:
            return list(json.loads(conteudo).get("jsonArray") or [])
        except (ValueError, AttributeError):
            # Payload malformado é fonte quebrada, não erro nosso. Lista vazia
            # significa "não confirmei", que é o estado seguro.
            return []

    return []


def texto_da_pagina(sessao: Sessao, url: str) -> str:
    """Texto corrido de uma página de ato do DOU.

    Existe separado porque é o pedaço reaproveitável: dada uma URL de ato — venha
    da busca, do Senado ou digitada à mão —, devolve o texto publicado. Falha
    vira string vazia; o achado não depende dele.
    """
    try:
        html = sessao.bytes(url)
    except FalhaDeRede:
        return ""

    sopa = BeautifulSoup(html, "html.parser", from_encoding="utf-8")
    for tag in sopa.find_all(["script", "style", "nav", "header", "footer"]):
        tag.decompose()

    # O corpo do ato mora em `.texto-dou` nas páginas atuais; o `article` é a
    # queda para o layout antigo, e o `body` é a última rede. Três seletores em
    # vez de um porque o in.gov.br já trocou de layout e vai trocar de novo.
    alvo = sopa.select_one(".texto-dou") or sopa.select_one("article") or sopa.body
    if alvo is None:
        return ""

    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", alvo.get_text("\n"))).strip()


def _limpa(s: str) -> str:
    """O título vem com ``<span class='highlight'>`` no termo buscado."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def _para_ddmmaaaa(iso: str) -> str:
    """``2025-07-15`` → ``15-07-2025``, que é o formato que a busca aceita."""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""
