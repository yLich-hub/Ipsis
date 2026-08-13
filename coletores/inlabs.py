"""INLABS — edições completas do DOU em XML.

Este é o caminho **certo** para o Diário, e ele só entrou depois que o caminho
fácil se mostrou inviável. A busca do ``in.gov.br`` (ver ``dou.py``) é montada
por JavaScript, o parâmetro ``q`` não filtra, e o recorte por data devolve a
Seção 1 do dia em páginas de 50 que não dá para percorrer de forma confiável —
medido em 13/08/2026: nas primeiras 50 entradas de três dias em que sabidamente
saiu uma lei, nenhuma lei aparece.

O INLABS resolve isso na origem: ``inlabs.in.gov.br`` entrega a **edição inteira**
do dia em XML estruturado, gratuitamente desde 01/01/2020. Cada ato vira um
``<article>`` com ``artType``, ``name`` e o texto no corpo — não é raspagem, é
leitura de um formato publicado para ser lido por máquina.

**Por que ele não estava no desenho original desta vigília.** Duas objeções, e
as duas caem em Python:

1. *"Exige cadastro."* Exige, e é gratuito. Fica opcional: sem ``INLABS_EMAIL``
   e ``INLABS_SENHA`` no ambiente, este módulo não roda e a coleta segue com as
   outras quatro fontes. Nenhuma demonstração depende dele.
2. *"Entrega ZIP, e ZIP não cabe numa função serverless sem dependência nova."*
   Verdade no runtime TypeScript da Vercel. Aqui não: ``zipfile`` e
   ``xml.etree`` são biblioteca padrão do Python, e este pacote roda no GitHub
   Actions, que tem disco e tempo. É exatamente o motivo de os coletores
   pesados morarem em Python.

**O texto extraído não vira texto legal do projeto.** Ele confirma a publicação,
guarda o endereço oficial e permite ler o ato — e para aí. A decisão nº 1 diz
que o texto legal do banco vem de ``vade_parser.py`` sobre o Vade Mecum, com
conferência humana no meio. Uma lei publicada ontem entra no corpus quando
alguém rodar o parser, não quando um coletor a baixar.

**Aviso de procedência deste arquivo:** o fluxo abaixo segue os scripts oficiais
da Imprensa Nacional (github.com/Imprensa-Nacional/inlabs) e **não pôde ser
executado ponta a ponta aqui**, porque o cadastro é pessoal e não há credencial
neste ambiente. O que está garantido é a degradação: sem credencial, sem rede ou
com ZIP inesperado, todas as funções devolvem vazio e nada quebra.
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree

import requests

from coletores.rede import AGENTE

BASE = "https://inlabs.in.gov.br"

# As três seções do Diário. A Seção 1 é a dos atos normativos — é onde lei sai.
SECOES = ("DO1", "DO2", "DO3")


@dataclass
class Ato:
    """Um ``<article>`` da edição."""

    tipo: str
    """`artType`: 'Lei', 'Decreto', 'Portaria'…"""
    nome: str
    """`name`: 'LEI Nº 15.272, DE 26 DE NOVEMBRO DE 2025'."""
    texto: str
    url: str
    edicao: str
    pagina: str
    secao: str


def credenciais() -> tuple[str, str] | None:
    """``None`` quando o INLABS não está configurado — que é o caso padrão.

    Ausência de credencial não é erro: é a configuração normal de quem clonou o
    repositório. As outras quatro fontes não dependem desta.
    """
    email = os.environ.get("INLABS_EMAIL", "")
    senha = os.environ.get("INLABS_SENHA", "")
    return (email, senha) if email and senha else None


def sessao_autenticada() -> requests.Session | None:
    """Faz login e devolve a sessão com o cookie, ou ``None``.

    O cookie é ``inlabs_session_cookie``, e é o que autoriza o download. Sem ele
    o servidor devolve a página de login com status 200 — por isso a checagem é
    pelo cookie, e não pelo código de status: um 200 aqui não significa que
    entrou.
    """
    cred = credenciais()
    if not cred:
        return None

    email, senha = cred
    s = requests.Session()
    s.headers.update({"User-Agent": AGENTE})

    try:
        s.post(f"{BASE}/logar.php", data={"email": email, "password": senha}, timeout=60)
    except requests.RequestException:
        return None

    return s if s.cookies.get("inlabs_session_cookie") else None


def edicao(data: str, secao: str = "DO1", s: requests.Session | None = None) -> list[Ato]:
    """Todos os atos de uma seção do Diário, num dia. ``data`` é ISO.

    Devolve lista vazia em qualquer falha — sem credencial, sem rede, dia sem
    edição (fim de semana e feriado não têm), ZIP com formato inesperado. A
    vigília trata ausência de confirmação como "não confirmei", nunca como "não
    publicou".
    """
    s = s or sessao_autenticada()
    if s is None:
        return []

    arquivo = f"{data}-{secao}.zip"
    try:
        r = s.get(f"{BASE}/index.php?p={data}&dl={arquivo}", timeout=180)
        if r.status_code >= 400 or not r.content:
            return []
        pacote = zipfile.ZipFile(io.BytesIO(r.content))
    except (requests.RequestException, zipfile.BadZipFile):
        # Dia sem edição devolve HTML no lugar do ZIP, e `BadZipFile` é
        # exatamente como isso se manifesta. Não é erro a propagar.
        return []

    atos: list[Ato] = []
    for nome in pacote.namelist():
        if not nome.lower().endswith(".xml"):
            continue
        try:
            atos.extend(_le_xml(pacote.read(nome), secao))
        except ElementTree.ParseError:
            # Um XML malformado no meio de mil não pode derrubar a edição
            # inteira. O ato perdido reaparece na próxima execução.
            continue

    return atos


def procura_lei(numero: str, data: str, s: requests.Session | None = None) -> Ato | None:
    """O ato da lei de número ``numero`` publicado em ``data`` (ISO).

    O casamento exige que o ``artType`` seja de lei E que o número apareça no
    ``name``. Sem as duas condições, "PORTARIA … regulamenta a Lei nº 15.272"
    passaria por "a lei saiu no Diário" — uma afirmação forte sustentada por
    coincidência de texto.
    """
    alvo = re.compile(rf"\bn?[ºo°.]*\s*{re.escape(numero)}\b", re.IGNORECASE)

    for ato in edicao(data, "DO1", s):
        if "lei" not in ato.tipo.lower():
            continue
        if alvo.search(ato.nome):
            return ato

    return None


def _le_xml(bruto: bytes, secao: str) -> list[Ato]:
    raiz = ElementTree.fromstring(bruto)
    atos: list[Ato] = []

    for art in raiz.iter("article"):
        corpo = art.find("body")
        texto = " ".join(
            re.sub(r"<[^>]+>", " ", t) for t in corpo.itertext() if t.strip()
        ) if corpo is not None else ""

        atos.append(
            Ato(
                tipo=art.get("artType", ""),
                nome=art.get("name", ""),
                texto=re.sub(r"\s+", " ", texto).strip(),
                url=art.get("pdfPage", ""),
                edicao=art.get("editionNumber", ""),
                pagina=art.get("numberPage", ""),
                secao=secao,
            )
        )

    return atos
