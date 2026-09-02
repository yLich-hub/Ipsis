# -*- coding: utf-8 -*-
"""
Gerador do relatório de auditoria de segurança, em PDF.

    <venv>/Scripts/python gerar_relatorio.py [caminho/do/saida.pdf]

Dependências (num venv isolado, nunca global):

    python -m venv .venv-relatorio
    .venv-relatorio/Scripts/pip install reportlab matplotlib

O conteúdo vive em `dados_auditoria.py` e `issues_github.py`. Este arquivo só
desenha: se um achado mudar, muda lá, e o PDF sai igual em qualquer máquina.

As fontes vêm do próprio matplotlib (DejaVu), e não das fontes-padrão do PDF, por
um motivo prático: Helvetica e Courier são WinAnsi, e o relatório tem setas, sinais
matemáticos e aspas tipográficas que não existem nessa codificação. Fonte
incompleta aqui vira quadradinho preto no meio de um trecho de código.
"""

from __future__ import annotations

import os
import sys
import textwrap
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import cm  # noqa: E402
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import dados_auditoria as D  # noqa: E402
from issues_github import ISSUES  # noqa: E402

SAIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else AQUI / "relatorio-auditoria-seguranca.pdf"
GRAFICOS = AQUI / "graficos"

NOME_RELATORIO = f"Relatório de Auditoria de Segurança — {D.PROJETO}"

# --- paleta ------------------------------------------------------------------
C = {k: colors.HexColor(v) for k, v in D.CORES.items()}
TINTA = colors.HexColor("#111827")
CORPO = colors.HexColor("#374151")
FRACO = colors.HexColor("#6B7280")
LINHA = colors.HexColor("#E5E7EB")
FUNDO = colors.HexColor("#F8FAFC")
CODIGO_BG = colors.HexColor("#F1F5F9")


# -----------------------------------------------------------------------------
# Fontes
# -----------------------------------------------------------------------------
def registra_fontes() -> tuple[str, str, str, str]:
    """DejaVu do matplotlib. Devolve (regular, negrito, itálico, mono)."""
    base = Path(matplotlib.get_data_path()) / "fonts" / "ttf"
    pares = [
        ("Rel", base / "DejaVuSans.ttf"),
        ("Rel-B", base / "DejaVuSans-Bold.ttf"),
        ("Rel-I", base / "DejaVuSans-Oblique.ttf"),
        ("Rel-M", base / "DejaVuSansMono.ttf"),
        ("Rel-MB", base / "DejaVuSansMono-Bold.ttf"),
    ]
    for nome, caminho in pares:
        if not caminho.exists():
            raise SystemExit(f"fonte ausente: {caminho}")
        pdfmetrics.registerFont(TTFont(nome, str(caminho)))
    pdfmetrics.registerFontFamily("Rel", normal="Rel", bold="Rel-B", italic="Rel-I", boldItalic="Rel-B")
    return "Rel", "Rel-B", "Rel-I", "Rel-M"


F, FB, FI, FM = registra_fontes()


def esc(t: str) -> str:
    """Escapa para o mini-XML do reportlab. `<b>` intencional é reinserido depois."""
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rico(t: str) -> str:
    """Como `esc`, mas devolve os `<b>`/`</b>` que o texto de origem trouxe de propósito."""
    return esc(t).replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")


# -----------------------------------------------------------------------------
# Estilos
# -----------------------------------------------------------------------------
ss = getSampleStyleSheet()


def estilo(nome, **kw):
    base = dict(fontName=F, fontSize=9.5, leading=13.5, textColor=CORPO, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(nome, parent=ss["Normal"], **base)


E = {
    "capa_titulo": estilo("capa_titulo", fontName=FB, fontSize=27, leading=32, textColor=TINTA),
    "capa_sub": estilo("capa_sub", fontSize=12.5, leading=18, textColor=FRACO),
    "h1": estilo("h1", fontName=FB, fontSize=17, leading=21, textColor=TINTA, spaceAfter=3),
    "h2": estilo("h2", fontName=FB, fontSize=12.5, leading=16, textColor=TINTA, spaceAfter=2),
    "h3": estilo("h3", fontName=FB, fontSize=10, leading=13.5, textColor=TINTA),
    "p": estilo("p", alignment=TA_JUSTIFY),
    "p_c": estilo("p_c", alignment=TA_CENTER),
    "pequeno": estilo("pequeno", fontSize=8.4, leading=11.8, textColor=FRACO),
    "cel": estilo("cel", fontSize=8.6, leading=11.6),
    "cel_p": estilo("cel_p", fontSize=8, leading=10.8, textColor=FRACO),
    "chip": estilo("chip", fontName=FB, fontSize=8.4, leading=11, textColor=colors.white,
                   alignment=TA_CENTER),
    "mono": estilo("mono", fontName=FM, fontSize=7.4, leading=10.2, textColor=colors.HexColor("#0F172A")),
    "mono_p": estilo("mono_p", fontName=FM, fontSize=8, leading=11, textColor=colors.HexColor("#1E293B")),
    "rodape": estilo("rodape", fontSize=7.6, leading=10, textColor=FRACO),
}

LARGURA_UTIL = A4[0] - 4 * cm


# -----------------------------------------------------------------------------
# Blocos reutilizáveis
# -----------------------------------------------------------------------------
def caixa(fluxo, fundo=FUNDO, borda=LINHA, pad=8, largura=LARGURA_UTIL, faixa=None):
    """Um cartão. `faixa` pinta um filete de 3pt na borda esquerda."""
    t = Table([[fluxo]], colWidths=[largura])
    cmds = [
        ("BACKGROUND", (0, 0), (-1, -1), fundo),
        ("BOX", (0, 0), (-1, -1), 0.5, borda),
        ("LEFTPADDING", (0, 0), (-1, -1), pad + (3 if faixa else 0)),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
    ]
    if faixa:
        cmds.append(("LINEBEFORE", (0, 0), (0, -1), 3, faixa))
    t.setStyle(TableStyle(cmds))
    return t


def _linhas_quebradas(texto: str, colunas: int) -> list[str]:
    linhas = []
    for ln in texto.split("\n"):
        if len(ln) <= colunas:
            linhas.append(ln if ln else " ")
        else:
            partes = textwrap.wrap(ln, colunas, break_long_words=True, break_on_hyphens=False,
                                   subsequent_indent="  ")
            linhas.extend(partes or [" "])
    return linhas


def bloco_codigo(texto: str, largura=LARGURA_UTIL, fonte=7.4, colunas=104):
    """
    Painel de código que atravessa a virada de página sem deixar buraco.

    Uma célula de tabela não quebra entre páginas, e o corpo das issues passa de
    mil pontos de altura — um painel de célula única estouraria o quadro. A saída
    é **uma linha de código por linha de tabela**: tabela quebra ENTRE linhas, e o
    fundo, sendo por célula, continua do outro lado sem emenda visível.

    As bordas horizontais ficam de fora de propósito: um filete no alto de cada
    metade anunciaria uma emenda que não existe. O que fecha o painel em cima e
    embaixo são as duas linhas vazias de respiro.
    """
    linhas = _linhas_quebradas(texto, colunas)
    st = ParagraphStyle("codigo_tmp", parent=E["mono"], fontSize=fonte, leading=fonte * 1.38)

    dados = [[Spacer(1, 4)]]
    dados += [[Paragraph(esc(l).replace(" ", "&nbsp;"), st)] for l in linhas]
    dados += [[Spacer(1, 4)]]

    borda = colors.HexColor("#CBD5E1")
    t = Table(dados, colWidths=[largura], repeatRows=0)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODIGO_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 0.6, borda),
        ("LINEAFTER", (-1, 0), (-1, -1), 0.6, borda),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def chip(sev: str):
    """Pílula colorida da severidade."""
    t = Table([[Paragraph(D.ROTULO_SEV[sev], E["chip"])]], colWidths=[1.85 * cm], rowHeights=[0.52 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C[sev]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def selo_situacao(sit: str, largura=3.7 * cm):
    """Pílula de situação. Verde para resolvido, âmbar para o que depende do painel."""
    # Fonte própria, menor que a do chip de severidade: "Resolvido em parte" tem
    # o dobro dos caracteres de "Alta", e a 8,4 pt ele quebrava em duas linhas e
    # vazava para fora da pílula.
    st = ParagraphStyle("selo_sit", parent=E["chip"], fontSize=7.6, leading=10)
    t = Table([[Paragraph(D.ROTULO_SIT[sit], st)]], colWidths=[largura],
              rowHeights=[0.52 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(D.CORES_SIT[sit])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def titulo_secao(txt: str, sub: str | None = None):
    itens = [Paragraph(esc(txt), E["h1"])]
    if sub:
        itens.append(Spacer(1, 2))
        itens.append(Paragraph(esc(sub), E["pequeno"]))
    itens.append(Spacer(1, 4))
    itens.append(regua())
    itens.append(Spacer(1, 10))
    return itens


def regua(cor=LINHA, esp=1.2):
    t = Table([[""]], colWidths=[LARGURA_UTIL], rowHeights=[esp])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), cor)]))
    return t


# -----------------------------------------------------------------------------
# Gráficos
# -----------------------------------------------------------------------------
def graficos() -> tuple[Path, Path]:
    GRAFICOS.mkdir(exist_ok=True)
    plt.rcParams["font.family"] = "DejaVu Sans"

    # --- rosca por severidade -------------------------------------------------
    ordem = ["critica", "alta", "media", "baixa"]
    cont = Counter(a["sev"] for a in D.ACHADOS)
    sevs = [s for s in ordem if cont[s]]
    vals = [cont[s] for s in sevs]

    fig, ax = plt.subplots(figsize=(5.8, 3.0), dpi=220)
    cunhas, _ = ax.pie(
        vals,
        colors=[D.CORES[s] for s in sevs],
        startangle=90,
        counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2.2),
    )
    for cunha, v in zip(cunhas, vals):
        ang = (cunha.theta1 + cunha.theta2) / 2
        import math

        x = 0.79 * math.cos(math.radians(ang))
        y = 0.79 * math.sin(math.radians(ang))
        ax.text(x, y, str(v), ha="center", va="center", color="white", fontsize=13, fontweight="bold")

    ax.text(0, 0.08, str(len(D.ACHADOS)), ha="center", va="center", fontsize=27,
            fontweight="bold", color="#111827")
    ax.text(0, -0.24, "achados", ha="center", va="center", fontsize=10, color="#6B7280")
    ax.legend(
        cunhas,
        [f"{D.ROTULO_SEV[s]} · {cont[s]}" for s in sevs],
        loc="center left",
        bbox_to_anchor=(1.0, 0.5),
        frameon=False,
        fontsize=9.5,
        handlelength=1.0,
        handleheight=1.0,
    )
    ax.set_aspect("equal")
    fig.tight_layout()
    p1 = GRAFICOS / "severidade.png"
    fig.savefig(p1, transparent=True, bbox_inches="tight")
    plt.close(fig)

    # --- barras por categoria -------------------------------------------------
    por_cat = Counter(D.CAT_CHAVE[a["id"]] for a in D.ACHADOS)
    cats = [c for c in D.ORDEM_CAT]
    valores = [por_cat.get(c, 0) for c in cats]

    # A cor da barra é a da severidade mais grave dentro da categoria — assim o
    # gráfico não fica bonito e mudo: ele diz onde mora o problema pior.
    peso = {"critica": 4, "alta": 3, "media": 2, "baixa": 1}
    pior = {}
    for a in D.ACHADOS:
        c = D.CAT_CHAVE[a["id"]]
        if peso[a["sev"]] > peso.get(pior.get(c, "baixa"), 0) or c not in pior:
            pior[c] = a["sev"]
    cores_barra = [D.CORES[pior[c]] if por_cat.get(c) else "#CBD5E1" for c in cats]

    fig, ax = plt.subplots(figsize=(7.6, 3.0), dpi=220)
    y = range(len(cats))
    ax.barh(list(y), valores, color=cores_barra, height=0.6)
    ax.set_yticks(list(y))
    ax.set_yticklabels(cats, fontsize=9.5, color="#374151")
    ax.invert_yaxis()
    ax.set_xlim(0, max(valores) + 0.8)
    ax.set_xticks(range(0, max(valores) + 1))
    ax.tick_params(axis="x", colors="#6B7280", labelsize=9)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#E5E7EB")
    ax.xaxis.grid(True, color="#EEF2F7", linewidth=0.9)
    ax.set_axisbelow(True)
    for i, v in zip(y, valores):
        if v:
            ax.text(v + 0.12, i, str(v), va="center", fontsize=10, fontweight="bold", color="#374151")
    ax.set_xlabel("achados", fontsize=9, color="#6B7280")
    fig.tight_layout()
    p2 = GRAFICOS / "categorias.png"
    fig.savefig(p2, transparent=True, bbox_inches="tight")
    plt.close(fig)

    return p1, p2


# -----------------------------------------------------------------------------
# Cabeçalho e rodapé
# -----------------------------------------------------------------------------
def moldura(canvas, doc, capa=False):
    canvas.saveState()
    largura, altura = A4
    if not capa:
        canvas.setFont(F, 7.6)
        canvas.setFillColor(FRACO)
        canvas.drawString(2 * cm, altura - 1.28 * cm, NOME_RELATORIO)
        canvas.drawRightString(largura - 2 * cm, altura - 1.28 * cm, f"{D.DATA} · {D.COMMIT}")
        canvas.setStrokeColor(LINHA)
        canvas.setLineWidth(0.6)
        canvas.line(2 * cm, altura - 1.5 * cm, largura - 2 * cm, altura - 1.5 * cm)

    canvas.setStrokeColor(LINHA)
    canvas.setLineWidth(0.6)
    canvas.line(2 * cm, 1.42 * cm, largura - 2 * cm, 1.42 * cm)
    canvas.setFont(F, 7.6)
    canvas.setFillColor(FRACO)
    canvas.drawString(2 * cm, 1.02 * cm, f"{D.PROJETO} · auditoria de segurança")
    canvas.drawRightString(largura - 2 * cm, 1.02 * cm, f"Página {canvas.getPageNumber()}")
    canvas.restoreState()


def doc_template(caminho: Path) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        str(caminho),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=NOME_RELATORIO,
        author="Auditoria de segurança",
        subject=f"Auditoria de segurança do projeto {D.PROJETO}",
    )
    quadro_capa = Frame(2 * cm, 2 * cm, LARGURA_UTIL, A4[1] - 4 * cm, id="capa",
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    quadro = Frame(2 * cm, 2 * cm, LARGURA_UTIL, A4[1] - 4.4 * cm, id="corpo",
                   leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="capa", frames=[quadro_capa],
                     onPage=lambda c, d: moldura(c, d, capa=True)),
        PageTemplate(id="corpo", frames=[quadro], onPage=moldura),
    ])
    return doc


# -----------------------------------------------------------------------------
# Seções
# -----------------------------------------------------------------------------
def capa():
    cont = Counter(a["sev"] for a in D.ACHADOS)
    f = [Spacer(1, 1.4 * cm)]

    faixa = Table([[""]], colWidths=[3.2 * cm], rowHeights=[5])
    faixa.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C["critica"])]))
    f += [faixa, Spacer(1, 0.7 * cm)]

    f.append(Paragraph(f"Relatório de Auditoria<br/>de Segurança — {esc(D.PROJETO)}", E["capa_titulo"]))
    f.append(Spacer(1, 0.35 * cm))
    f.append(Paragraph(
        "Consulta e geração de peças para advocacia criminal · Next.js 15 + Supabase",
        E["capa_sub"]))
    f.append(Spacer(1, 0.8 * cm))

    meta = [
        ["Data da auditoria", D.DATA],
        ["Revisão auditada", f"branch {D.BRANCH}, commit {D.COMMIT}"],
        ["Achados", " · ".join(f"{cont[s]} {D.ROTULO_SEV[s].lower()}"
                               for s in ["critica", "alta", "media", "baixa"] if cont[s])],
        ["Pontos fortes verificados", f"{len(D.FORTES)} controles conferidos e aprovados"],
        ["Situação", (
            f"{sum(1 for a in D.ACHADOS if a['situacao'] == 'resolvido')} resolvidos e "
            f"{sum(1 for a in D.ACHADOS if a['situacao'] == 'parcial')} resolvidos em parte, "
            f"em {D.DATA_CORRECAO}. Os dois parciais dependem de interruptor no painel do Supabase."
        )],
        ["Método", "Revisão manual de código, migrations, CI e bundle. Sem teste dinâmico."],
    ]
    t = Table([[Paragraph(f"<b>{esc(a)}</b>", E["cel"]), Paragraph(esc(b), E["cel"])] for a, b in meta],
              colWidths=[5.0 * cm, LARGURA_UTIL - 5.0 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
    ]))
    f += [t, Spacer(1, 0.85 * cm)]

    f.append(Paragraph("Escopo auditado", E["h2"]))
    f.append(Spacer(1, 4))
    for item in D.ESCOPO:
        f.append(Paragraph(f"•&nbsp;&nbsp;{esc(item)}", E["p"]))
        f.append(Spacer(1, 3))
    f.append(Spacer(1, 0.5 * cm))

    nota = Paragraph(
        "<b>Nota metodológica.</b> As cinco categorias pedidas foram primeiro traduzidas para os "
        "mecanismos que esta stack de fato usa, antes de qualquer busca. O isolamento de inquilino "
        "aqui é Row Level Security no Postgres, não middleware de tenant nem filtro manual por "
        "usuario_id — e é por isso que uma query sem <font name=\"" + FM + "\" size=\"8.5\">where "
        "usuario_id</font> pode estar correta. Não existem papéis no produto, então a categoria de "
        "permissão no navegador foi lida como “gate que a aplicação aplica e o dado não repete”. O "
        "mapeamento completo, categoria por categoria, está na página seguinte.",
        E["p"])
    f.append(caixa(nota, fundo=colors.HexColor("#FEF9F3"), borda=colors.HexColor("#F5D9BE"),
                   faixa=C["alta"]))
    return f


def metodologia():
    f = titulo_secao("Stack detectada e mapeamento das categorias",
                     "Cada categoria da auditoria foi adaptada ao equivalente real desta stack.")

    linhas = [[Paragraph(f"<b>{esc(k)}</b>", E["cel"]), Paragraph(esc(v), E["cel"])] for k, v in D.STACK]
    t = Table(linhas, colWidths=[4.6 * cm, LARGURA_UTIL - 4.6 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), FUNDO),
        ("GRID", (0, 0), (-1, -1), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    f += [t, Spacer(1, 0.75 * cm)]

    f.append(Paragraph("Como cada categoria foi procurada", E["h2"]))
    f.append(Spacer(1, 6))
    for nome, texto in D.METODOLOGIA:
        f.append(caixa([
            Paragraph(esc(nome), E["h3"]),
            Spacer(1, 3),
            Paragraph(rico(texto), E["p"]),
        ], faixa=C["baixa"]))
        f.append(Spacer(1, 6))

    f.append(Spacer(1, 0.4 * cm))
    f.append(Paragraph("Onde a categoria não se aplica a esta stack", E["h2"]))
    f.append(Spacer(1, 6))
    linhas = [[Paragraph(f"<b>{esc(k)}</b>", E["cel_p"]), Paragraph(esc(v), E["cel_p"])]
              for k, v in D.NAO_SE_APLICA]
    t = Table(linhas, colWidths=[4.6 * cm, LARGURA_UTIL - 4.6 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
    ]))
    f.append(t)

    f.append(Spacer(1, 0.7 * cm))
    f.append(Paragraph("Fora do escopo, e dito de propósito", E["h2"]))
    f.append(Spacer(1, 6))
    for item in D.FORA_DE_ESCOPO:
        f.append(Paragraph(f"•&nbsp;&nbsp;{esc(item)}", E["pequeno"]))
        f.append(Spacer(1, 4))
    return f


def resumo(img_sev: Path, img_cat: Path):
    cont = Counter(a["sev"] for a in D.ACHADOS)
    f = titulo_secao("Resumo executivo",
                     f"{len(D.ACHADOS)} achados e {len(D.FORTES)} controles verificados como corretos.")

    # Painel de contagem
    cels, estilos = [], [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]
    ordem = ["critica", "alta", "media", "baixa", "forte"]
    rotulos = {**D.ROTULO_SEV, "forte": "Pontos fortes"}
    valores = {**{s: cont[s] for s in D.ROTULO_SEV}, "forte": len(D.FORTES)}
    for i, s in enumerate(ordem):
        num = ParagraphStyle(f"n{i}", parent=E["p_c"], fontName=FB, fontSize=21, leading=24,
                             textColor=colors.white)
        rot = ParagraphStyle(f"r{i}", parent=E["p_c"], fontSize=7.8, leading=10,
                             textColor=colors.white, fontName=FB)
        cels.append([Paragraph(str(valores[s]), num), Spacer(1, 1), Paragraph(rotulos[s].upper(), rot)])
        cor = C[s] if valores[s] else colors.HexColor("#94A3B8")
        estilos.append(("BACKGROUND", (i, 0), (i, 0), cor))
    larg = (LARGURA_UTIL - 4 * 6) / 5
    t = Table([cels], colWidths=[larg] * 5)
    t.setStyle(TableStyle(estilos))
    f += [t, Spacer(1, 0.38 * cm)]

    # O veredito vem ANTES dos dois gráficos: ele é a leitura, e os gráficos são a
    # evidência dela. Depois deles, sobrava sozinho numa página quase vazia.
    veredito = Paragraph(
        "<b>Veredito.</b> Não há achado crítico, e a razão é estrutural: o mecanismo de isolamento "
        "desta stack — a RLS do Postgres — está completo, ancorado em auth.uid() nas três tabelas "
        "de dado do usuário, e nenhuma tabela do schema ficou sem ele. Não há segredo no código, "
        "no histórico do git nem no bundle. Não há injeção de SQL, de filtro do PostgREST nem "
        "sink de XSS desprotegido.<br/><br/>"
        "O que os dois achados de severidade alta tinham em comum é outra coisa: <b>o modelo de "
        "acesso que o produto declara não era imposto por nenhuma linha de servidor.</b> O "
        "cadastro é aberto, e o teto de gasto que a aplicação protegia por sessão estava concedido "
        "a anon no banco.<br/><br/>"
        "<b>Sete dos nove foram corrigidos e verificados</b>, com três migrations aplicadas ao "
        "banco e conferidas nele. Os dois que restam são os que o código não fecha sozinho: "
        "fechar o cadastro e exigir login recente na troca de senha são <b>interruptores do painel "
        "do Supabase</b>. Remover a tela de cadastro não resolveria — signUp() sai do navegador "
        "direto para o Auth, e o app Next nunca vê essa requisição.",
        E["p"])
    f.append(caixa(veredito, fundo=colors.HexColor("#FFF7ED"), borda=colors.HexColor("#FDBA74"),
                   faixa=C["alta"]))
    f.append(Spacer(1, 0.55 * cm))

    f.append(Paragraph("Distribuição por severidade", E["h2"]))
    f.append(Spacer(1, 5))
    f.append(KeepTogether(Image(str(img_sev), width=7.2 * cm,
                            height=7.2 * cm * _prop(img_sev), hAlign="CENTER")))
    f.append(Spacer(1, 0.15 * cm))

    f.append(KeepTogether([
        Paragraph("Achados por categoria", E["h2"]),
        Spacer(1, 3),
        Paragraph("A cor de cada barra é a da severidade mais grave dentro da categoria.",
                  E["pequeno"]),
        Spacer(1, 5),
        Image(str(img_cat), width=12.8 * cm, height=12.8 * cm * _prop(img_cat), hAlign="CENTER"),
    ]))
    return f


def _prop(p: Path) -> float:
    """Proporção altura/largura da imagem, para não distorcer."""
    from reportlab.lib.utils import ImageReader

    w, h = ImageReader(str(p)).getSize()
    return h / w


def fortes_fracos():
    f = titulo_secao("Pontos fortes verificados",
                     "O que foi conferido e está correto — a prova de cobertura da auditoria.")

    for i, (t, ev) in enumerate(D.FORTES, 1):
        bloco = KeepTogether(caixa([
            Paragraph(f"<b>{i:02d}.</b>&nbsp;&nbsp;{esc(t)}", E["h3"]),
            Spacer(1, 3),
            Paragraph(esc(ev), E["pequeno"]),
        ], fundo=colors.HexColor("#F0FDF4"), borda=colors.HexColor("#BBF7D0"), faixa=C["forte"]))
        f.append(bloco)
        f.append(Spacer(1, 5))

    f.append(PageBreak())
    f += titulo_secao("Pontos fracos", "Os riscos centrais, ditos sem rodeio.")
    for i, (t, ev) in enumerate(D.FRACOS, 1):
        f.append(KeepTogether(caixa([
            Paragraph(f"<b>{i:02d}.</b>&nbsp;&nbsp;{esc(t)}", E["h3"]),
            Spacer(1, 3),
            Paragraph(esc(ev), E["pequeno"]),
        ], fundo=colors.HexColor("#FEF2F2"), borda=colors.HexColor("#FECACA"), faixa=C["critica"])))
        f.append(Spacer(1, 5))
    return f


def tabela_achados():
    f = titulo_secao("Achados — visão de tabela",
                     "Severidade, arquivo:linha e descrição. O detalhe de cada um vem depois.")

    cab = [Paragraph(f'<font color="white"><b>{h}</b></font>', E["cel"])
           for h in ("Sev.", "Situação", "#", "Arquivo : linha", "Descrição")]
    linhas = [cab]
    estilos = [
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]

    peso = {"critica": 0, "alta": 1, "media": 2, "baixa": 3}
    for i, a in enumerate(sorted(D.ACHADOS, key=lambda x: (peso[x["sev"]], x["id"])), start=1):
        sev_cel = Paragraph(f'<font color="white"><b>{D.ROTULO_SEV[a["sev"]]}</b></font>',
                            ParagraphStyle("sv", parent=E["cel"], alignment=TA_CENTER, fontSize=7.8))
        arq = "<br/>".join(f'<font name="{FM}" size="6.6">{esc(x)}</font>' for x in a["arquivos"])
        sit_cel = Paragraph(
            f'<font color="white"><b>{D.ROTULO_SIT[a["situacao"]]}</b></font>',
            ParagraphStyle("st", parent=E["cel"], alignment=TA_CENTER, fontSize=7.2, leading=9.5))
        linhas.append([
            sev_cel,
            sit_cel,
            Paragraph(f'<b>{a["id"]}</b>', ParagraphStyle("id", parent=E["cel"], alignment=TA_CENTER)),
            Paragraph(arq, E["cel_p"]),
            Paragraph(f'<b>{esc(a["titulo"])}</b><br/><font size="7.6" color="#6B7280">'
                      f'{esc(D.CAT_CHAVE[a["id"]])}</font>', E["cel"]),
        ])
        estilos.append(("BACKGROUND", (0, i), (0, i), C[a["sev"]]))
        estilos.append(("BACKGROUND", (1, i), (1, i), colors.HexColor(D.CORES_SIT[a["situacao"]])))
        estilos.append(("VALIGN", (0, i), (1, i), "MIDDLE"))
        if i % 2 == 0:
            estilos.append(("BACKGROUND", (2, i), (-1, i), colors.HexColor("#FAFBFC")))

    t = Table(linhas,
              colWidths=[1.3 * cm, 1.75 * cm, 0.65 * cm, 6.8 * cm, LARGURA_UTIL - 10.5 * cm],
              repeatRows=1)
    t.setStyle(TableStyle(estilos))
    f.append(t)
    return f


def detalhe_achados():
    f = titulo_secao("Achados detalhados",
                     "Cada achado com evidência, explorabilidade, impacto e condição.")

    peso = {"critica": 0, "alta": 1, "media": 2, "baixa": 3}
    for a in sorted(D.ACHADOS, key=lambda x: (peso[x["sev"]], x["id"])):
        bloco = []
        cab = Table(
            [[chip(a["sev"]), selo_situacao(a["situacao"]),
              Paragraph(f'<b>Achado {a["id"]} — {esc(a["titulo"])}</b>',
                        ParagraphStyle("ta", parent=E["cel"], fontSize=10.5, leading=14,
                                       textColor=TINTA))]],
            colWidths=[2.1 * cm, 3.85 * cm, LARGURA_UTIL - 5.95 * cm])
        cab.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("LEFTPADDING", (1, 0), (1, 0), 0),
            ("LEFTPADDING", (2, 0), (2, 0), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        bloco.append(cab)
        bloco.append(Spacer(1, 5))

        bloco.append(Paragraph(
            f'<font color="#6B7280" size="8">Categoria:</font> {esc(D.CAT_CHAVE[a["id"]])}'
            f'&nbsp;&nbsp;·&nbsp;&nbsp;<font color="#6B7280" size="8">Arquivos:</font> '
            + "&nbsp;&nbsp;".join(f'<font name="{FM}" size="7.6">{esc(x)}</font>'
                                 for x in a["arquivos"]),
            E["pequeno"]))
        bloco.append(Spacer(1, 7))

        bloco.append(Paragraph("Evidência", E["h3"]))
        bloco.append(Spacer(1, 3))
        bloco.append(bloco_codigo(a["trecho"]))
        bloco.append(Spacer(1, 8))

        for rot, txt, cor in (
            ("Por que é explorável", a["porque"], None),
            ("Impacto", a["impacto"], None),
            ("Condição de explorabilidade", a["condicao"], C["info"]),
        ):
            bloco.append(Paragraph(rot, E["h3"]))
            bloco.append(Spacer(1, 3))
            if cor is not None:
                bloco.append(caixa(Paragraph(esc(txt), E["pequeno"]), pad=7, faixa=cor))
            else:
                bloco.append(Paragraph(esc(txt), E["p"]))
            bloco.append(Spacer(1, 8))

        bloco.append(Paragraph("O que foi feito", E["h3"]))
        bloco.append(Spacer(1, 3))
        bloco.append(caixa(
            Paragraph(esc(a["correcao"]), E["pequeno"]),
            fundo=colors.HexColor("#F0FDF4" if a["situacao"] == "resolvido" else "#FFFBEB"),
            borda=colors.HexColor("#BBF7D0" if a["situacao"] == "resolvido" else "#FDE68A"),
            pad=7, faixa=colors.HexColor(D.CORES_SIT[a["situacao"]])))
        bloco.append(Spacer(1, 8))

        bloco.append(regua(colors.HexColor("#EDF0F4"), 1))
        # O achado é uma peça só. Sem isto, o último — que é curto — teve a
        # caixa de "condição de explorabilidade" jogada sozinha numa página em
        # branco. KeepTogether desiste sozinho quando o conteúdo não cabe nem
        # numa página limpa, então os achados longos continuam quebrando.
        f.append(KeepTogether(bloco))
        f.append(Spacer(1, 12))
    return f


def recomendacoes():
    f = titulo_secao("Recomendações priorizadas",
                     "P1 primeiro: é o par que, junto, abre o produto para quem não é o dono.")
    tons = {"P1": C["critica"], "P2": C["alta"], "P3": C["baixa"]}
    for pri, titulo, itens in D.RECOMENDACOES:
        selo = Table([[Paragraph(f'<font color="white"><b>{pri}</b></font>',
                                 ParagraphStyle("pr", parent=E["cel"], alignment=TA_CENTER,
                                                fontSize=10))]],
                     colWidths=[1.1 * cm], rowHeights=[0.62 * cm])
        selo.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), tons[pri]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        cab = Table([[selo, Paragraph(f"<b>{esc(titulo)}</b>",
                                      ParagraphStyle("rt", parent=E["cel"], fontSize=11.5,
                                                     leading=15, textColor=TINTA))]],
                    colWidths=[1.4 * cm, LARGURA_UTIL - 1.4 * cm])
        cab.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        corpo = [cab, Spacer(1, 6)]
        for it in itens:
            corpo.append(Paragraph(f"•&nbsp;&nbsp;{esc(it)}", E["p"]))
            corpo.append(Spacer(1, 5))
        f.append(KeepTogether(caixa(corpo, faixa=tons[pri])))
        f.append(Spacer(1, 9))
    return f


def secao_issues():
    f = titulo_secao(
        "Issues para o GitHub",
        "Texto integral em Markdown, pronto para copiar e colar. Cada bloco vai entre os "
        "delimitadores.")
    f.append(Paragraph(
        "São oito issues para nove achados: os achados 8 e 9 foram agrupados por serem do mesmo "
        "tema — endurecimento de borda —, para não gerar spam de issues.", E["pequeno"]))
    f.append(Spacer(1, 12))

    for n, curto, corpo in ISSUES:
        delim = ParagraphStyle("delim", parent=E["mono"], fontName=FM, fontSize=8,
                               textColor=C["critica"], leading=12)
        f.append(Paragraph(f"--- ISSUE {n} --- &nbsp;<font color='#6B7280'>{esc(curto)}</font>",
                           delim))
        f.append(Spacer(1, 4))
        f.append(bloco_codigo(corpo, fonte=7.1, colunas=108))
        f.append(Spacer(1, 4))
        f.append(Paragraph(f"--- FIM ISSUE {n} ---", delim))
        f.append(Spacer(1, 16))
    return f


# -----------------------------------------------------------------------------
def main():
    img_sev, img_cat = graficos()

    fluxo = []
    fluxo += capa()
    fluxo.append(NextPageTemplate("corpo"))
    fluxo.append(PageBreak())
    fluxo += metodologia()
    fluxo.append(PageBreak())
    fluxo += resumo(img_sev, img_cat)
    fluxo.append(PageBreak())
    fluxo += fortes_fracos()
    fluxo.append(PageBreak())
    fluxo += tabela_achados()
    fluxo.append(PageBreak())
    fluxo += detalhe_achados()
    fluxo.append(PageBreak())
    fluxo += recomendacoes()
    fluxo.append(PageBreak())
    fluxo += secao_issues()

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    doc = doc_template(SAIDA)
    doc.build(fluxo)
    print(f"PDF gerado: {SAIDA}  ({os.path.getsize(SAIDA) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
