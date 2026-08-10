"""
Vade Mecum -> JSON estruturado.

Pipeline:
  1. extração ciente de colunas (calhas detectadas por cobertura de linhas)
  2. fatiamento de cada linha nas calhas -> segmentos por coluna
  3. de-hifenização e remontagem de parágrafos
  4. parser hierárquico: lei > (título/capítulo/seção) > artigo > §/inciso
  5. validação: sequência de artigos monotônica
"""
import json
import re
import sys

import pdfplumber

PDF = "/mnt/user-data/uploads/Vade_mecum_Senado_Federal_1ed.pdf"
HEADER_ZONE = 42
FOOTER_ZONE = 18
MIN_GUTTER = 7.0
LINE_TOL = 3.5
WORD_GAP = 12.0     # gap acima disto = fronteira de coluna, não espaço normal


# ---------------------------------------------------------------- extração
def group_lines(words):
    words = sorted(words, key=lambda w: w["top"])
    lines, cur, top = [], [], None
    for w in words:
        if top is None or abs(w["top"] - top) <= LINE_TOL:
            cur.append(w)
            top = w["top"] if top is None else min(top, w["top"])
        else:
            lines.append(sorted(cur, key=lambda x: x["x0"]))
            cur, top = [w], w["top"]
    if cur:
        lines.append(sorted(cur, key=lambda x: x["x0"]))
    return lines


def find_gutters(lines, page_w):
    n = len(lines)
    if n < 10:
        return []
    cover = [0] * (int(page_w) + 2)
    for ln in lines:
        for w in ln:
            for x in range(int(w["x0"]), min(int(w["x1"]) + 1, len(cover))):
                cover[x] += 1
    thresh = max(1, int(0.08 * n))
    gutters, start = [], None
    for x, c in enumerate(cover):
        if c <= thresh and start is None:
            start = x
        elif c > thresh and start is not None:
            if x - start >= MIN_GUTTER and 40 < start < page_w - 40:
                gutters.append((start, x))
            start = None
    return gutters


def split_segments(line):
    """Quebra a linha onde o espaço entre palavras é grande demais."""
    segs, cur = [], [line[0]]
    for prev, w in zip(line, line[1:]):
        if w["x0"] - prev["x1"] > WORD_GAP:
            segs.append(cur)
            cur = [w]
        else:
            cur.append(w)
    segs.append(cur)
    return segs


def page_lines(page):
    words = page.extract_words(use_text_flow=False)
    h = page.height
    words = [w for w in words if HEADER_ZONE < w["top"] < h - FOOTER_ZONE]
    if not words:
        return []

    lines = group_lines(words)
    cuts = [0.0] + [(a + b) / 2 for a, b in find_gutters(lines, page.width)]
    cuts.append(page.width)
    ncols = len(cuts) - 1

    cols = [[] for _ in range(ncols)]
    wide = []
    for ln in lines:
        # linha genuinamente full-width: alguma palavra ATRAVESSA uma calha
        straddles = any(
            w["x0"] < c < w["x1"] for w in ln for c in cuts[1:-1]
        )
        if straddles:
            wide.append((ln[0]["top"], " ".join(w["text"] for w in ln)))
            continue
        # caso normal: reparte as palavras pela coluna do seu centro
        buckets = [[] for _ in range(ncols)]
        for w in ln:
            mid = (w["x0"] + w["x1"]) / 2
            ci = next(i for i in range(ncols) if mid < cuts[i + 1])
            buckets[ci].append(w)
        for ci, b in enumerate(buckets):
            if b:
                cols[ci].append((b[0]["top"], " ".join(x["text"] for x in b)))

    out = [t for _, t in sorted(wide)]
    for c in cols:
        out.extend(t for _, t in sorted(c))
    return out


# ------------------------------------------------------------- remontagem
ART_RE = re.compile(r"^Art\.\s*(\d+)\s*[oº°]?(-[A-Z])?\s*[.\s]")
PAR_RE = re.compile(r"^§\s*(\d+)\s*[oº°]?|^Parágrafo único")
INC_RE = re.compile(r"^([IVXLC]+)\s*[–\-—]\s")
ALI_RE = re.compile(r"^([a-z])\)\s")
STRUCT_RE = re.compile(r"^(TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)\s+[IVXLC\d]")


def dehyphenate(lines):
    """Junta 'con-' + 'junto' e remonta parágrafos lógicos."""
    buf, out = "", []
    for raw in lines:
        ln = raw.strip()
        if not ln:
            continue
        starts_block = bool(
            ART_RE.match(ln) or PAR_RE.match(ln) or INC_RE.match(ln)
            or ALI_RE.match(ln) or STRUCT_RE.match(ln)
        )
        if starts_block and buf:
            out.append(buf.strip())
            buf = ""
        if buf.endswith("-"):
            buf = buf[:-1] + ln
        else:
            buf = (buf + " " + ln).strip() if buf else ln
    if buf:
        out.append(buf.strip())
    return out


def parse(blocks, lei_id, lei_nome):
    arts, cur = [], None
    ctx = {"titulo": None, "capitulo": None, "secao": None}

    for b in blocks:
        if STRUCT_RE.match(b):
            kind = b.split()[0].lower()
            key = {"título": "titulo", "capítulo": "capitulo",
                   "seção": "secao", "subseção": "secao"}[kind]
            ctx[key] = b
            if key == "titulo":
                ctx["capitulo"] = ctx["secao"] = None
            if key == "capitulo":
                ctx["secao"] = None
            continue

        m = ART_RE.match(b)
        if m:
            if cur:
                arts.append(cur)
            num = m.group(1) + (m.group(2) or "")
            cur = {
                "id": f"{lei_id}_art{num.lower()}",
                "artigo": num,
                "contexto": {k: v for k, v in ctx.items() if v},
                "caput": ART_RE.sub("", b).strip(),
                "paragrafos": [],
                "incisos": [],
            }
            continue

        if cur is None:
            continue

        if PAR_RE.match(b):
            unico = b.startswith("Parágrafo único")
            cur["paragrafos"].append({
                "numero": "único" if unico else PAR_RE.match(b).group(1),
                "texto": b,
                "incisos": [],
            })
        elif INC_RE.match(b):
            item = {"numero": INC_RE.match(b).group(1), "texto": b}
            (cur["paragrafos"][-1]["incisos"] if cur["paragrafos"]
             else cur["incisos"]).append(item)
        elif ALI_RE.match(b):
            alvo = (cur["paragrafos"][-1]["incisos"] if cur["paragrafos"]
                    else cur["incisos"])
            if alvo:
                alvo[-1].setdefault("alineas", []).append(b)
        else:
            # continuação de texto solto
            if cur["paragrafos"]:
                cur["paragrafos"][-1]["texto"] += " " + b
            else:
                cur["caput"] += " " + b

    if cur:
        arts.append(cur)
    return {"lei": lei_id, "nome": lei_nome,
            "fonte": "Vade Mecum Senado Federal, 1ed, atualizado até fev/2025",
            "total_artigos": len(arts), "artigos": arts}


def validate(doc):
    """Sequência deve ser monotônica; retorna anomalias."""
    problems, last = [], 0
    for a in doc["artigos"]:
        n = int(re.match(r"\d+", a["artigo"]).group())
        if n < last:
            problems.append(f"fora de ordem: Art. {a['artigo']} após Art. {last}")
        last = max(last, n)
        if len(a["caput"]) < 15:
            problems.append(f"caput suspeito (curto): Art. {a['artigo']}")
    return problems


if __name__ == "__main__":
    first, last = int(sys.argv[1]), int(sys.argv[2])
    lei_id, lei_nome, out = sys.argv[3], sys.argv[4], sys.argv[5]

    raw = []
    with pdfplumber.open(PDF) as pdf:
        for p in range(first, last + 1):
            raw.extend(page_lines(pdf.pages[p - 1]))

    blocks = dehyphenate(raw)
    doc = parse(blocks, lei_id, lei_nome)
    probs = validate(doc)

    json.dump(doc, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"artigos: {doc['total_artigos']}")
    print(f"anomalias: {len(probs)}")
    for p in probs[:15]:
        print("  -", p)
