"""Texto compilado do Planalto, artigo a artigo — a proposta de atualização do corpus.

**Por que este módulo existe.** A vigília descobriu 63 alterações posteriores à
fotografia de 28/02/2025, duas delas na Lei de Drogas. O conserto previsto era
"rodar o `vade_parser.py` sobre a nova redação", e ele não se sustenta: o PDF do
Vade Mecum **é** a fotografia de fevereiro/2025. A redação nova não está nele e
não vai estar. Sem uma segunda fonte, o corpus fica sabendo que está desatualizado
para sempre.

**O que este módulo faz, e o que continua não fazendo.** Ele lê a página compilada
e devolve a redação atual de cada artigo, em blocos, no mesmo formato do corpus —
e para aí. Ele **não escreve em `dispositivos`, `artigos` ou `leis`**, exatamente
como `coletores/planalto.py`. O que ele produz é uma *proposta*, com o texto do
corpus e o texto do Planalto lado a lado, para conferência humana; o que vira
corpus é `data/curadoria/redacoes.yaml`, versionado e revisável em diff, aplicado
por `scripts/normalize.ts`.

A diferença entre as duas coisas é a decisão nº 1 inteira. Um scraper que
escrevesse texto legal direto no banco trocaria a fonte auditada por uma raspagem,
e ninguém saberia dizer qual dispositivo passou por olho humano. Uma proposta que
alguém confere e assina em `conferido_em` é o mesmo contrato que o corpus já tem —
só que com uma segunda fonte, datada por artigo em vez de por lei.

**A conferência não é cerimônia.** A comparação roda sobre a lei INTEIRA, não só
sobre os artigos que a vigília apontou: artigo que ninguém alterou tem de bater
com o corpus, e quando não bate é o extrator que está errado. É o mesmo raciocínio
de `tests/vigilia.test.ts` rodar o filtro contra ementas reais — a divergência
aparece na hora, em vez de virar texto legal errado numa peça.

Três armadilhas do HTML, além das três que `planalto.py` já documenta:

1. **O texto revogado continua na página, riscado.** `<strike>` (e o
   `text-decoration:line-through` em `style`) marcam a redação que saiu de vigor.
   Ler a página sem descartá-los devolve as duas redações emendadas numa só frase.
2. **A anotação de procedência vem colada no fim do bloco**, como a rubrica
   marginal do Vade Mecum vem no fim do bloco anterior. `(Incluído pela Lei nº
   15.581, de 2025)` não é texto legal e não pode entrar no corpus.
3. **"Pena - reclusão…" é bloco próprio no Planalto e faz parte do caput no
   corpus.** Todo bloco que não começa por marcador reconhecido é continuação do
   anterior — é o que faz os dois lados serem comparáveis.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from bs4 import BeautifulSoup, Tag

from coletores.planalto import _LIMITE, _colapsa, _por_bloco

RAIZ = Path(__file__).resolve().parent.parent

# --- marcadores de bloco ------------------------------------------------------
#
# As mesmas formas que `src/lib/normalizacao.ts` reconhece, porque os dois lados
# desta comparação têm de segmentar igual. Rótulo diferente do lado do Planalto
# faria o alinhamento falhar e todo bloco aparecer como "novo".

# O sufixo de letra é `-A` colado, e a letra tem de terminar ali: sem o
# `(?![A-Za-zÀ-ÿ])`, o `- Não` de "Art. 1º - Não há crime…" vira o sufixo do
# artigo e o Código Penal inteiro nasce com números que o corpus não tem
# (`1-n`, `33-a`, `61-o`). Medido: 302 dos 416 artigos deixavam de casar.
# O sufixo pode ser composto (`Art. 359-M-A`, criado pela Lei 15.402/2026): sem
# o `+`, o `-A` era descartado, o artigo virava uma repetição do `359-M` e o
# texto novo sumia sem erro nenhum. Repetido é o único caso em que este extrator
# descarta um artigo — e descartar em silêncio é o modo de falha que ele existe
# para não ter.
_ART = re.compile(
    r"^Art\.?\s*(\d{1,4})\s*[ºo°]?(?:-((?:[A-Za-z]-)*[A-Za-z])(?![A-Za-zÀ-ÿ]))?\s*[.\-–—]?\s*"
)
# Mesmo cuidado do `_ART` com o sufixo de letra, pelo mesmo motivo: no Código
# Penal o parágrafo é impresso `§ 1º - Para os efeitos penais…`, e um sufixo sem
# a trava de fim de palavra transforma o `- P` de "Para" no `§ 1º-P`. O
# dispositivo real some e nasce um fantasma com o texto decapitado ("ara os
# efeitos penais…").
_PAR = re.compile(r"^§\s*(\d+)\s*[ºo°]?(?:-([A-Za-z])(?![A-Za-zÀ-ÿ]))?\s*[.\-–—]?\s*")
_PAR_UNICO = re.compile(r"^Par[áa]grafo\s+[úu]nico\s*[.\-–—]?\s*", re.IGNORECASE)
# O travessão do inciso é opcional porque o Planalto o perde às vezes — na Lei
# de Drogas, `VI (VETADO);` e `VII (VETADO);` vêm sem ele. Exigi-lo fazia os dois
# incisos serem lidos como continuação do inciso V, e o corpus aparecia com dois
# dispositivos "removidos" que ninguém revogou.
_INC = re.compile(r"^([IVXLC]{1,7})\s*[.\-–—)]?\s+(?=[(\"'A-Za-zÀ-ÿ0-9])")
_ALI = re.compile(r"^([a-z])\s*\)\s*")

# Divisor estrutural. Não é dispositivo e não pertence a nenhum: no Planalto ele
# vive num bloco próprio entre dois artigos, e sem esta regra vira continuação do
# último dispositivo do artigo anterior — "…desta Lei. CAPÍTULO II DO SISTEMA
# NACIONAL…" emendado dentro do texto legal. Foi a maior fonte de falso positivo
# da comparação: 56 dos 93 artigos da Lei de Drogas apareciam alterados.
_DIVISOR = re.compile(
    r"^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|DISPOSI[ÇC][ÕO]ES)\b",
    re.IGNORECASE,
)

# A anotação de procedência do Planalto. Allowlist por prefixo, e não "qualquer
# parêntese": `(VETADO)` é texto legal, `(dois)` é o numeral por extenso e
# `(Código Penal)` é remissão. Descartar parêntese por forma apagaria os três.
_ANOTACAO = re.compile(
    r"\(\s*(?:"
    r"Inclu[íi]d[oa]|Reda[çc][ãa]o dada|Acrescid[oa]|Renumerad[oa]|Revogad[oa]|revogado"
    r"|Vig[êe]ncia|Vide|Regulamento|Produ[çc][ãa]o de efeito|Express[ãa]o"
    r")[^()]{0,200}\)",
    re.IGNORECASE,
)

_REVOGACAO = re.compile(r"\(\s*Revogad", re.IGNORECASE)

# A mesma anotação, quando o Planalto a imprime SEM parêntese — acontece quando
# ela é o conteúdo inteiro de um link. `(Vigência)` vira `Vigência`, e o
# `_ANOTACAO`, que exige o parêntese, não a vê. Ela então é colada no
# dispositivo anterior pela regra de continuação: "…proposta a ação penal.
# Vigência". Só vale para a linha INTEIRA: exigir menos apagaria texto legal que
# comece com "Vide" por coincidência.
_ANOTACAO_NUA = re.compile(
    r"^(?:Inclu[íi]d[oa]|Reda[çc][ãa]o dada|Acrescid[oa]|Renumerad[oa]|Revogad[oa]"
    r"|Vig[êe]ncia|Vide|Regulamento|Produ[çc][ãa]o de efeito)\b",
    re.IGNORECASE,
)

# Bloco que só tem pontuação. O Planalto tem 158 deles nas três páginas — um
# ponto final órfão num parágrafo próprio, resto de formatação. Colado no
# dispositivo anterior, ele cria uma divergência em cada um: "…dos imóveis. ."
_SO_PONTUACAO = re.compile(r"^[\s.,;:·•\-–—]*$")

# `Lei nº 15.581, de 2025` dentro de uma anotação. Mesma forma de `planalto._NORMA`,
# repetida aqui porque aquela captura espécie/número/ano para rotular um achado e
# esta só precisa dizer QUEM alterou o bloco.
_NORMA = re.compile(
    r"(Lei(?:\s+Complementar)?|Medida\s+Provis[óo]ria|Decreto(?:-Lei)?)"
    r"\s*n?[ºo°.]*\s*([\d.]+)[^)\d]{0,20}?(\d{4})",
    re.IGNORECASE,
)


@dataclass
class Bloco:
    """Um dispositivo do artigo, já sem anotação e sem marcador.

    `rotulo` segue a convenção do corpus (`§ 1º`, `Parágrafo único`, `I`, `a)`);
    `sufixo` é o resto do id textual depois do artigo (`_caput`, `_p5_inc1`,
    `_p1_inc2_ala`).

    **O alinhamento é pelo id, não pelo rótulo, e não é preciosismo.** O art.
    23-A da Lei de Drogas tem um inciso "I" no caput, outro no § 3º, outro no
    § 4º e outro no § 5º. Alinhar por rótulo casava o primeiro com o último e
    apresentava quatro incisos intactos como se os quatro tivessem mudado de
    redação — o falso positivo mais perigoso possível, porque a "correção"
    proposta era o texto de outro dispositivo.
    """

    tipo: str
    rotulo: str
    sufixo: str
    texto: str
    # Quem alterou este bloco, pela anotação que veio colada nele. Vazio é o caso
    # comum: a esmagadora maioria dos dispositivos está na redação original.
    normas: list[str] = field(default_factory=list)


@dataclass
class ArtigoCompilado:
    numero: str
    blocos: list[Bloco] = field(default_factory=list)
    # As rubricas marginais encontradas dentro do artigo, na ordem. Guardadas em
    # vez de descartadas porque são a saída da heurística que mais pode errar
    # aqui: cada linha desta lista é uma linha que NÃO entrou no texto legal, e
    # o relatório da conferência as imprime para revisão.
    rubricas: list[str] = field(default_factory=list)
    # A rubrica DESTE artigo, que o Planalto imprime no fim do artigo anterior.
    rubrica_propria: str | None = None

    @property
    def normas(self) -> list[str]:
        vistas: list[str] = []
        for b in self.blocos:
            for n in b.normas:
                if n not in vistas:
                    vistas.append(n)
        return vistas


def extrai_artigos(html: bytes) -> dict[str, ArtigoCompilado]:
    """Página compilada → artigos em blocos, na redação em vigor.

    Chave: o número do artigo em caixa baixa (`33`, `40-a`), que é o sufixo do id
    textual do corpus. Separada da rede para ser testável contra HTML em disco,
    como `planalto.extrai`.
    """
    # `cp1252`, e não `latin-1` como em `planalto.py`. As páginas não declaram
    # charset e são exportação de Word: os 187 bytes na faixa 0x91–0x97 das três
    # páginas são travessão e aspas curvas do Windows-1252, faixa que o latin-1
    # decodifica como caractere de controle invisível.
    #
    # Para a vigília isso era inofensivo — ela procura "(Redação dada pela…)". Aqui
    # é grave: `Pena \x96 reclusão` some com o travessão e, pior, o `VII \x96 contra`
    # deixa de parecer um inciso. O bloco então entra como texto corrido e a
    # enumeração viaja escondida dentro do parágrafo pai.
    sopa = BeautifulSoup(html, "html.parser", from_encoding="cp1252")

    for tag in sopa.find_all(["script", "style"]):
        tag.decompose()

    # Armadilha 1: a redação revogada continua impressa, riscada. Sai antes de
    # qualquer leitura de texto — depois do `get_text()` não há como distinguir.
    for tag in sopa.find_all(["strike", "s", "del"]):
        tag.decompose()
    for tag in sopa.find_all(style=True):
        if isinstance(tag, Tag) and "line-through" in str(tag.get("style", "")).lower():
            tag.decompose()

    artigos: dict[str, ArtigoCompilado] = {}
    corrente: ArtigoCompilado | None = None
    caminho = _Caminho()
    # Um divisor costuma vir partido em dois blocos — `CAPÍTULO II` num, `DOS
    # CRIMES` no seguinte. A segunda metade não tem marcador nenhum e seria
    # colada no dispositivo anterior pela regra de continuação. Enquanto o
    # próximo marcador não chega, tudo é cabeçalho.
    em_divisor = False

    for bruto in _por_bloco(sopa).split(_LIMITE):
        linha = _colapsa(bruto)
        if not linha:
            continue

        if _DIVISOR.match(linha):
            em_divisor = True
            continue

        normas = _normas_de(linha)
        limpa = _sem_anotacao(linha)
        if not limpa or _SO_PONTUACAO.match(limpa) or _ANOTACAO_NUA.match(limpa):
            # Bloco que era só anotação — `(Revogado pela Lei nº …)` sozinho num
            # parágrafo. Não é texto legal e não é continuação de nada.
            continue

        cab = _ART.match(limpa)
        if cab:
            em_divisor = False
            sufixo = cab.group(2)
            numero = f"{cab.group(1)}-{sufixo.lower()}" if sufixo else cab.group(1)
            corrente = ArtigoCompilado(numero=numero)
            # Artigo repetido na página é o índice ou a remissão de outro diploma
            # anexado ao fim; vale a primeira ocorrência, que é o texto da lei.
            artigos.setdefault(numero, corrente)
            if artigos[numero] is not corrente:
                corrente = None
                continue
            caminho = _Caminho()
            caput = limpa[cab.end():].strip()
            # Artigo revogado por inteiro: o texto está riscado, já saiu, e sobra
            # `Art. 281. (Revogado pela Lei nº 6.368, de 1976)`. Sem escrever
            # aqui a mesma forma que o corpus usa, o caput fica vazio — e o bloco
            # seguinte, que é a rubrica marginal do artigo seguinte, deixa de ter
            # um "anterior terminado em pontuação" e é colado como se fosse o
            # texto do artigo revogado. Foi assim que o art. 281 do CP ganhou
            # "Exercício ilegal da medicina…", que é a rubrica do art. 282.
            if not caput and _REVOGACAO.search(linha):
                caput = "(Revogado)"
            corrente.blocos.append(Bloco("caput", "caput", "_caput", caput, normas))
            continue

        if corrente is None:
            continue

        bloco = _classifica(limpa, normas, caminho)
        if bloco is not None:
            em_divisor = False
            # Dispositivo revogado fica na página como marcador vazio — o texto
            # está riscado (e já saiu) e sobra `§ 1º (Revogado pela Lei nº …)`.
            # O corpus escreve `(Revogado)`, e é essa a forma que precisa sair
            # daqui: sem ela, todo dispositivo revogado aparece como alteração
            # para texto vazio.
            if not bloco.texto and _REVOGACAO.search(linha):
                bloco.texto = "(Revogado)"
            corrente.blocos.append(bloco)
            continue

        if em_divisor:
            continue

        anterior = corrente.blocos[-1] if corrente.blocos else None
        if anterior is not None and _rubrica_marginal(limpa, anterior.texto):
            # A rubrica marginal também está no Planalto, em bloco próprio entre
            # os artigos ("Lei penal no tempo", "Territorialidade", "Furto"). O
            # corpus a guarda em `rubricas`, fora do texto legal — a limpeza A do
            # CLAUDE.md. Colá-la no dispositivo anterior faria 414 artigos do
            # Código Penal aparecerem alterados, cada um com a rubrica do
            # seguinte no fim do texto.
            corrente.rubricas.append(limpa)
            continue

        # Armadilha 3: bloco sem marcador é continuação do anterior — "Pena -
        # reclusão…" e as alíneas quebradas em linha própria. É assim que o
        # `vade_parser.py` monta o caput, e os dois lados precisam concordar.
        if corrente.blocos:
            anterior = corrente.blocos[-1]
            anterior.texto = f"{anterior.texto} {limpa}".strip()
            for n in normas:
                if n not in anterior.normas:
                    anterior.normas.append(n)

    for artigo in artigos.values():
        for bloco in artigo.blocos:
            bloco.texto = _arruma(bloco.texto)

    # A rubrica impressa no fim do artigo *i* é a do artigo *i+1* — a mesma regra
    # determinística da limpeza A do Vade Mecum, e pelo mesmo motivo: a rubrica é
    # cabeçalho do que vem DEPOIS. Sem isto, o art. 121-B (vicaricídio) nasceria
    # com a rubrica do art. 122 (induzimento a suicídio), que é o próximo do
    # documento e cuja rubrica está impressa dentro do intervalo do 121-B.
    anterior: ArtigoCompilado | None = None
    for artigo in artigos.values():
        if anterior is not None and anterior.rubricas:
            artigo.rubrica_propria = anterior.rubricas[-1]
        anterior = artigo

    return artigos


def _arruma(texto: str) -> str:
    """Duas sujeiras de formatação do Planalto, as duas DENTRO do bloco.

    O ponto final órfão (`…dos imóveis. .`) e o espaço antes da pontuação
    (`no caput , serão`) vêm de tag inline vazia entre dois nós de texto — não
    são bloco separado, então nenhum filtro de bloco os alcança. Somados,
    respondiam por 165 divergências que não são diferença de redação nenhuma.
    """
    t = re.sub(r"\s+([.,;:!?])", r"\1", texto)
    t = re.sub(r"([.;:])\1+$", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


class _Caminho:
    """Onde os próximos incisos e alíneas se penduram, dentro de um artigo.

    Espelha o estado que `montaBlocos`, em `scripts/normalize.ts`, mantém: um
    inciso pende do último parágrafo aberto (ou do caput, se nenhum abriu ainda),
    e uma alínea pende do último inciso. É o que faz o id do bloco sair igual dos
    dois lados.
    """

    def __init__(self) -> None:
        self.prefixo_incisos = ""  # '' = nível do artigo; '_p4' dentro do § 4º
        self.ultimo_inciso = ""

    def paragrafo(self, sufixo_id: str) -> str:
        self.prefixo_incisos = f"_p{sufixo_id}"
        self.ultimo_inciso = ""
        return self.prefixo_incisos

    def inciso(self, arabico: int) -> str:
        self.ultimo_inciso = f"{self.prefixo_incisos}_inc{arabico}"
        return self.ultimo_inciso

    def alinea(self, letra: str) -> str:
        # Alínea antes de qualquer inciso não existe na técnica legislativa; se
        # aparecer, o id nasce pendurado no artigo e a comparação vai acusar.
        return f"{self.ultimo_inciso}_al{letra}"


_ROMANOS = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def romano_para_arabico(r: str) -> int:
    """`IV` → 4. Mesma conta de `romanoParaArabico`, em `src/lib/normalizacao.ts`."""
    total = 0
    anterior = 0
    for c in reversed(r.upper()):
        v = _ROMANOS.get(c, 0)
        total = total - v if v < anterior else total + v
        anterior = max(anterior, v)
    return total


def _classifica(linha: str, normas: list[str], caminho: _Caminho) -> Bloco | None:
    m = _PAR_UNICO.match(linha)
    if m:
        return Bloco(
            "paragrafo",
            "Parágrafo único",
            caminho.paragrafo("u"),
            linha[m.end():].strip(),
            normas,
        )

    m = _PAR.match(linha)
    if m:
        n = int(m.group(1))
        letra = (m.group(2) or "").upper()
        # Convenção brasileira, a mesma de `analisaParagrafo`: ordinal até 9,
        # cardinal a partir de 10.
        base = f"§ {n}º" if n <= 9 else f"§ {n}"
        rotulo = f"{base}-{letra}" if letra else base
        sufixo_id = f"{n}-{letra.lower()}" if letra else str(n)
        return Bloco(
            "paragrafo", rotulo, caminho.paragrafo(sufixo_id), linha[m.end():].strip(), normas
        )

    m = _INC.match(linha)
    if m:
        return Bloco(
            "inciso",
            m.group(1),
            caminho.inciso(romano_para_arabico(m.group(1))),
            linha[m.end():].strip(),
            normas,
        )

    m = _ALI.match(linha)
    if m:
        return Bloco(
            "alinea",
            f"{m.group(1)})",
            caminho.alinea(m.group(1)),
            linha[m.end():].strip(),
            normas,
        )

    return None


def _rubrica_marginal(linha: str, anterior: str) -> bool:
    """A mesma assinatura da limpeza A, aplicada a um bloco inteiro em vez de ao
    fim de um.

    Aqui a heurística é mais segura do que no PDF, e por uma razão de forma: no
    Vade Mecum a rubrica vem *colada* no fim do dispositivo anterior, e é preciso
    adivinhar onde cortar; no Planalto ela é um bloco próprio, e a pergunta é só
    se este bloco é texto legal. Quatro condições, todas necessárias:

    o bloco anterior termina em pontuação (a frase legal fechou, então este bloco
    não é continuação dela), este não tem pontuação terminal, é curto e começa em
    maiúscula. `Pena - reclusão…`, que é o caso de continuação que mais aparece,
    termina em ponto e não passa da primeira condição.
    """
    if not anterior or not re.search(r"[.:;!?)»”\"]\s*$", anterior):
        return False
    # 120, e não os ~70 da limpeza A. Lá o corte é DENTRO de um bloco e cada
    # caractere a mais é um pedaço de texto legal em risco; aqui o bloco já é
    # separado, e o custo do limite curto apareceu na prática: "Apropriação de
    # coisa havida por erro, caso fortuito ou força da natureza" tem 71
    # caracteres e "Exercício ilegal da medicina, medicina veterinária, arte
    # dentária ou farmacêutica" tem 81 — as duas foram coladas no fim do artigo
    # anterior e viraram texto legal que a lei não tem.
    if len(linha) > 120 or re.search(r"[.:;!?]$", linha):
        return False
    return bool(re.match(r"^[A-ZÀ-Ý(]", linha))


def _sem_anotacao(linha: str) -> str:
    return _colapsa(_ANOTACAO.sub(" ", linha))


def _normas_de(linha: str) -> list[str]:
    saida: list[str] = []
    for m in _ANOTACAO.finditer(linha):
        norma = _NORMA.search(m.group(0))
        if not norma:
            continue
        rotulo = f"{_especie(norma.group(1))} {norma.group(2).rstrip('.')}/{norma.group(3)}"
        if rotulo not in saida:
            saida.append(rotulo)
    return saida


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


# --- comparação ---------------------------------------------------------------


def chave(texto: str) -> str:
    """A forma em que os dois lados são comparáveis.

    O corpus vem do Vade Mecum e o outro lado vem do Planalto: os dois imprimem a
    mesma lei com tipografia diferente — travessão contra hífen, `§ 1o` contra
    `§ 1º`, aspas curvas contra retas. Comparar cru acusaria diferença em quase
    todo artigo e enterraria as alterações de verdade no meio do ruído.

    O que esta função NÃO faz é igualar palavra: acento, caixa e pontuação de
    frase continuam contando. Uma diferença de redação tem de aparecer.
    """
    t = unicodedata.normalize("NFC", texto)
    t = t.replace(" ", " ")
    t = re.sub(r"[–—−]", "-", t)
    t = t.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    # `§ 1o` → `§ 1º` e `Lei no 9.099` → `Lei nº 9.099`: a mesma limpeza C que
    # `normalize.ts` faz no corpus, para o lado do Planalto não divergir por ela.
    t = re.sub(r"(?<=\d)\s*[o°](?![a-zà-ÿ])", "º", t)
    t = re.sub(r"\bn[o°](?=\s*\d)", "nº", t, flags=re.IGNORECASE)
    # Marcador de nota de rodapé do Vade Mecum colado na pontuação ("…droga:1").
    # É artefato do PDF, não texto legal, e o Planalto não o tem.
    t = re.sub(r"(?<=[.:;,])\d{1,2}(?=\s|$)", "", t)
    # `(Vetado)` no Vade Mecum, `(VETADO).` no Planalto. É o mesmo dispositivo
    # vetado, e são 46 deles só no Código Penal — caixa e ponto final não são
    # diferença de redação.
    t = re.sub(
        r"\(\s*(vetado|revogado|revogada)\s*\)\s*\.?",
        lambda m: f"({m.group(1).lower()})",
        t,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", t).strip()


# Enumeração impressa DENTRO do bloco, em vez de em bloco próprio. O Planalto faz
# isso em alguns artigos — no art. 121-A do CP, os dois incisos do § 1º vêm na
# mesma linha do parágrafo.
#
# **É a divergência que não pode ser aplicada no automático**, e é a mais
# perigosa das três: o corpus tem esses incisos como dispositivos separados e
# citáveis, então gravar o texto do Planalto no parágrafo escreveria o texto dos
# incisos DUAS vezes no banco — uma dentro do pai, outra em cada filho — e uma
# citação ao § 1º passaria a transcrever, na peça, um trecho que não é dele.
_INLINE = re.compile(r"(?:^|[;:.]\s)\s*(?:[IVXLC]{1,7}\s*[-–—]\s+|[a-z]\s*\)\s)")


def tem_enumeracao_embutida(texto: str) -> bool:
    return bool(_INLINE.search(texto))


@dataclass
class Divergencia:
    """Um bloco em que corpus e Planalto discordam.

    `acao` é o que a curadoria teria de fazer, não o que este módulo fez —
    ele não faz nada.
    """

    id: str
    artigo_id: str
    rotulo: str
    tipo: str
    acao: str  # alterar | incluir | sumiu
    corpus: str
    planalto: str
    normas: list[str]
    # Onde o bloco novo entra, em ordem de documento. Sem isto a curadoria de uma
    # inclusão não teria como dizer se o parágrafo vem antes ou depois dos que já
    # existem — e a ordem de um artigo é a ordem em que ele se lê.
    depois_de: str = ""


def compara(
    artigo_id: str,
    blocos_corpus: list[tuple[str, str, str]],
    artigo: ArtigoCompilado | None,
) -> list[Divergencia]:
    """Alinha por id e devolve o que difere.

    `blocos_corpus` é `[(id, rotulo, texto)]` na ordem do documento.

    Artigo ausente do Planalto devolve lista vazia, e não "artigo removido". A
    página compilada tem lacuna de todo tipo — anexo, tabela, artigo cujo
    cabeçalho o extrator não reconheceu —, e um artigo que não foi encontrado é
    notícia sobre o extrator, não sobre a lei. Quem reporta isso é o relatório,
    numa lista à parte.

    `sumiu` também não é revogação: é o corpus ter um bloco que o Planalto não
    tem, o que quase sempre significa que os dois segmentaram diferente. Quem
    revoga escreve `(Revogado)` no lugar, e isso chega aqui como `alterar`.
    """
    if artigo is None:
        return []

    saida: list[Divergencia] = []
    do_planalto = {b.sufixo: b for b in artigo.blocos}
    do_corpus = {ident for ident, _, _ in blocos_corpus}
    anterior_no_corpus = ""

    for ident, rotulo, texto in blocos_corpus:
        b = do_planalto.get(ident[len(artigo_id):])
        if b is None:
            saida.append(
                Divergencia(ident, artigo_id, rotulo, "", "sumiu", texto, "", [])
            )
        elif chave(b.texto) != chave(texto):
            saida.append(
                Divergencia(ident, artigo_id, rotulo, b.tipo, "alterar", texto, b.texto, b.normas)
            )

    for b in artigo.blocos:
        ident = f"{artigo_id}{b.sufixo}"
        if ident in do_corpus:
            anterior_no_corpus = ident
            continue
        saida.append(
            Divergencia(
                ident, artigo_id, b.rotulo, b.tipo, "incluir", "", b.texto, b.normas,
                depois_de=anterior_no_corpus,
            )
        )

    return saida


# --- a proposta de conferência ------------------------------------------------
#
#     .venv/Scripts/python -m coletores.redacao            # usa o cache de página
#     .venv/Scripts/python -m coletores.redacao --sem-cache
#     .venv/Scripts/python -m coletores.redacao --lei lei_11343_2006
#
# Escreve `data/vigilia/redacoes.propostas.yaml` e não toca em mais nada. O que
# vira corpus é `data/curadoria/redacoes.yaml`, escrito por gente a partir daqui.


def blocos_do_corpus(lei_id: str, raiz: "Path | None" = None) -> "dict[str, list[tuple[str, str, str]]]":
    """`artigo_id → [(id, rotulo, texto)]`, na ordem do documento.

    Lê `data/normalizado/`, que é a mesma fonte de `tests/citacao.test.ts` e de
    `tests/peca.test.ts` — e não o banco. Conferir contra o banco exigiria
    segredo e rede para responder a uma pergunta sobre dois arquivos.
    """
    base = (raiz or RAIZ) / "data" / "normalizado" / f"{lei_id}.json"
    if not base.exists():
        raise FileNotFoundError(
            f"corpus normalizado não encontrado em {base}.\n"
            "Rode `npm run normalize` antes: a comparação é contra o corpus, não contra o banco."
        )

    dados = json.loads(base.read_text(encoding="utf-8"))
    saida: dict[str, list[tuple[str, str, str]]] = {}
    for d in dados["dispositivos"]:
        saida.setdefault(d["artigo_id"], []).append((d["id"], d["rotulo"], d["texto"]))
    return saida


def confere(lei_id: str, html: bytes, ano_de_corte: int, raiz: "Path | None" = None) -> dict:
    """Compara a lei inteira e devolve a proposta, já separada por tipo de achado.

    Três listas, e a separação é o desenho todo:

    - `alteracoes` — divergência de bloco COM norma posterior à data de corte.
      É o que vira curadoria: a lei mudou e o corpus não sabe.
    - `artigos_novos` — artigo que existe no Planalto e não no corpus, criado
      depois da data de corte.
    - `divergencias_sem_norma` — o resto. Não é alteração legislativa: é o Vade
      Mecum e o Planalto imprimindo a mesma lei com ortografia diferente
      (`seqüestro`, `Assembléias`), ou o extrator segmentando diferente. **Vai
      no relatório assim mesmo**, porque uma lista escondida é uma lista que
      ninguém audita — e é aqui que um erro do extrator apareceria.
    """
    artigos = extrai_artigos(html)
    corpus = blocos_do_corpus(lei_id, raiz)

    pos_corte = lambda ns: [n for n in ns if _ano(n) >= ano_de_corte]  # noqa: E731

    alteracoes: list[dict] = []
    sem_norma: list[dict] = []
    ausentes: list[str] = []

    for artigo_id, blocos in corpus.items():
        numero = artigo_id.split("_art", 1)[1]
        compilado = artigos.get(numero)
        if compilado is None:
            ausentes.append(artigo_id)
            continue

        for d in compara(artigo_id, blocos, compilado):
            linha = {
                "id": d.id,
                "artigo": d.artigo_id,
                "rotulo": d.rotulo,
                "tipo": d.tipo,
                "acao": d.acao,
                "era": d.corpus,
                "texto": d.planalto,
                "normas": d.normas,
                "depois_de": d.depois_de,
            }
            if pos_corte(d.normas) and d.acao != "sumiu":
                if tem_enumeracao_embutida(d.planalto):
                    # Não entra na curadoria automática e não some: vai para o
                    # relatório com o motivo, porque aplicar seria escrever o
                    # texto dos incisos dentro do parágrafo pai.
                    linha["cuidado"] = "enumeração embutida no bloco — conferir à mão"
                    sem_norma.append(linha)
                else:
                    alteracoes.append(linha)
            else:
                sem_norma.append(linha)

    # Artigo que só existe no Planalto. `int` na ordenação não serve — os números
    # têm sufixo (`121-b`) —, então a ordem é a do documento, que é a ordem em
    # que o extrator os encontrou.
    do_corpus = {aid.split("_art", 1)[1] for aid in corpus}
    artigos_novos = []
    anterior = ""  # último artigo, em ordem de documento, que o corpus já tem
    for numero, artigo in artigos.items():
        if numero in do_corpus:
            anterior = f"{lei_id}_art{numero}"
            continue
        if not pos_corte(artigo.normas):
            continue
        artigos_novos.append(
            {
                "artigo": f"{lei_id}_art{numero}",
                "numero": _exibe(numero),
                # Onde o artigo entra na lei. `artigos.ordem` é único por lei, e
                # um artigo novo empurra todos os seguintes — sem esta âncora a
                # curadoria não teria como dizer que o art. 121-B vem depois do
                # 121-A e antes do 122.
                "depois_de": anterior,
                "normas": artigo.normas,
                "rubrica": artigo.rubrica_propria,
                "blocos": [
                    {
                        "id": f"{lei_id}_art{numero}{b.sufixo}",
                        "tipo": b.tipo,
                        "rotulo": b.rotulo,
                        "texto": b.texto,
                        "cuidado": (
                            "enumeração embutida no bloco — conferir à mão"
                            if tem_enumeracao_embutida(b.texto)
                            else None
                        ),
                    }
                    for b in artigo.blocos
                ],
            }
        )

    return {
        "lei": lei_id,
        "alteracoes": alteracoes,
        "artigos_novos": artigos_novos,
        "divergencias_sem_norma": sem_norma,
        "artigos_nao_encontrados": ausentes,
    }


def _ano(norma: str) -> int:
    m = re.search(r"(\d{4})$", norma)
    return int(m.group(1)) if m else 0


def _exibe(numero: str) -> str:
    """`121-b` → `121-B`, `359-m-a` → `359-M-A`.

    O id guarda caixa baixa e a lei se cita em maiúscula. Todas as letras do
    sufixo sobem, não só a última: o sufixo composto tem duas.
    """
    return re.sub(r"-([a-z])(?=-|$)", lambda m: f"-{m.group(1).upper()}", numero)


def main(argv: "list[str] | None" = None) -> int:
    import argparse

    from coletores.config import carrega
    from coletores.rede import Sessao

    p = argparse.ArgumentParser(
        prog="python -m coletores.redacao",
        description="Compara o corpus com o texto compilado do Planalto e propõe a atualização.",
    )
    p.add_argument("--lei", help="só uma das três (lei_11343_2006, dl_2848_1940, dl_3689_1941)")
    p.add_argument("--sem-cache", action="store_true", help="rebaixa o cache de página")
    args = p.parse_args(argv)

    cfg = carrega()
    sessao = Sessao(usar_cache=not args.sem_cache)
    ano = int(cfg.data_de_corte[:4])

    saida = RAIZ / "data" / "vigilia" / "redacoes.propostas.yaml"
    saida.parent.mkdir(parents=True, exist_ok=True)

    propostas = []
    for alvo in cfg.alvos:
        if args.lei and alvo.lei_id != args.lei:
            continue

        html = sessao.bytes(alvo.planalto)
        r = confere(alvo.lei_id, html, ano)
        r["fonte"] = alvo.planalto
        propostas.append(r)

        print(
            f"· {alvo.rotulo:<28} "
            f"{len(r['alteracoes']):>3} blocos a atualizar · "
            f"{len(r['artigos_novos']):>2} artigos novos · "
            f"{len(r['divergencias_sem_norma']):>4} divergências sem norma · "
            f"{len(r['artigos_nao_encontrados']):>2} artigos não encontrados"
        )

    saida.write_text(
        yaml.safe_dump(propostas, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"\n→ {saida.relative_to(RAIZ)}")
    print("  A proposta NÃO é o corpus. O que vira corpus é data/curadoria/redacoes.yaml,")
    print("  depois de alguém conferir bloco a bloco — ver o cabeçalho deste módulo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
