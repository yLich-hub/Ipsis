// =============================================================================
// Limpeza dos artefatos de extração do PDF + derivação de rótulo e citação.
//
// Funções puras, sem I/O: scripts/normalize.ts orquestra, tests/ verifica.
// As três classes de artefato (A, B, C) estão documentadas no CLAUDE.md.
// =============================================================================

import { createHash } from 'node:crypto'

export const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export const chave = (s: string) => semAcento(s).toLowerCase().trim()

export const slug = (s: string) =>
  chave(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const sha256 = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex')

// -----------------------------------------------------------------------------
// C. Ordinais escritos com a letra `o` (98 alterações registradas)
//
// `§ 1o` → `§ 1º`, `Lei no 9.099` → `Lei nº 9.099`.
//
// A segunda regra é a perigosa: "no 1º grau" é português legítimo, não abreviação
// de número. Por isso ela só dispara depois de uma palavra que anuncia um
// diploma legal, ou diante de um número com separador de milhar. Preferir
// deixar passar a corromper texto legal.
// -----------------------------------------------------------------------------
const DIPLOMAS =
  'Lei|Leis|Decreto|Decreto-Lei|Decreto-lei|Súmula|Portaria|Resolução|Emenda|Ato|Projeto|Provimento|Medida Provisória'

export function normalizaOrdinais(s: string): { texto: string; n: number } {
  let n = 0

  const texto = s
    // 1o → 1º · 1° → 1º   (nunca "1 o", que é dígito seguido de artigo definido)
    .replace(/(\d)[o°](?![a-zà-ÿ])/g, (_m, d: string) => (n++, `${d}º`))
    // Lei no 9.099 → Lei nº 9.099
    .replace(
      new RegExp(`\\b(${DIPLOMAS})(\\s+)n[o°](?=\\s*\\d)`, 'g'),
      (_m, dip: string, sp: string) => (n++, `${dip}${sp}nº`),
    )
    // "no 9.099" solto: só com separador de milhar, que artigo definido não tem
    .replace(/\bn[o°](?=\s+\d{1,3}\.\d{3})/g, () => (n++, 'nº'))

  return { texto, n }
}

// -----------------------------------------------------------------------------
// B. Marcador de nota de rodapé colado (6 ocorrências)
//
// `"...integre organização criminosa.2"`. Dígito de 1–2 casas grudado logo após
// pontuação de fim de frase, no fim do bloco.
//
// O caractere anterior à pontuação não pode ser dígito — é o que impede comer o
// final de `1.500`. E o marcador tem que estar no fim do bloco, o que impede
// tocar em `art. 33`.
// -----------------------------------------------------------------------------
const NOTA_RODAPE = /([a-zà-ÿA-ZÀ-Ý)\]"'»])([.;:!?])(\d{1,2})$/

export function removeNotaRodape(s: string): { texto: string; n: number } {
  const t = s.trimEnd()
  if (!NOTA_RODAPE.test(t)) return { texto: s, n: 0 }
  return { texto: t.replace(NOTA_RODAPE, '$1$2'), n: 1 }
}

// -----------------------------------------------------------------------------
// A2. Rubrica marginal colada no fim do dispositivo (379 no relatório)
//
// O caput do art. 1º do CP termina em "...prévia cominação legal. Lei penal no
// tempo" — e "Lei penal no tempo" é a rubrica do art. 2º.
//
// Heurística, com as guardas do CLAUDE.md: fragmento após pontuação de fim de
// frase, sem pontuação terminal própria, iniciando em maiúscula, curto, e sem
// "Pena –". Vai ter falso positivo — por isso scripts/audit.ts existe e
// dispositivos.texto_bruto guarda o original.
// -----------------------------------------------------------------------------
// O `\d{0,2}` depois da pontuação é o marcador de nota de rodapé: em
// "…suspensivas da prescrição.4 Modo de conversão" ele fica entre o texto legal e
// a rubrica. Sem essa folga a regra não enxerga a rubrica; o dígito sobrando é
// varrido depois, por removeNotaRodape.
const FRAGMENTO_FINAL =
  /(?<=[.;:!?)»”"']\d{0,2})\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][^.;:!?]{2,130})$/

export function detectaRubricaFinal(
  s: string,
): { texto: string; rubrica: string } | null {
  const t = s.trimEnd()
  const m = FRAGMENTO_FINAL.exec(t)
  if (!m || m[1] === undefined) return null

  const frag = m[1].trim()

  // Preceito secundário nunca é rubrica — mas "Pena de multa" é (art. 58).
  // O travessão é o que separa os dois casos.
  if (/\bPena\s*[–—-]/.test(frag)) return null
  // Notas de vigência do Vade Mecum: "(Redação dada pela Lei ...)".
  if (/[(\[]/.test(frag)) return null
  // Remissão a dispositivo é continuação de texto, não rubrica. Exigir o número
  // depois da abreviação não é preciosismo: `\b` do JS só conhece [A-Za-z0-9_],
  // então `\bart\b` casa dentro de "artístico" e derrubava a rubrica do art. 164
  // ("Dano em coisa de valor artístico, arqueológico ou histórico").
  if (/\b(arts?|incs?)\s*\.?\s*\d|§|\bn[ºo]\s*\d|\d{3,}/i.test(frag)) return null
  if (/[,;:]$/.test(frag)) return null
  // Fragmento todo em caixa alta é divisor estrutural vazado, não rubrica.
  if (frag === frag.toUpperCase()) return null

  return { texto: t.slice(0, m.index).trimEnd(), rubrica: frag }
}

/**
 * Divisor estrutural que vazou para o fim do texto legal:
 * "…não será considerada para efeitos de reincidência. PARTE ESPECIAL".
 *
 * Sai do texto e não vira rubrica — não é rubrica de nada.
 */
const ESTRUTURA_FINAL = /(?<=[.;:!?)»”"'])\s+([A-ZÀ-Ý][A-ZÀ-Ý\s]{4,44})$/

export function detectaEstruturaFinal(s: string): { texto: string; fragmento: string } | null {
  const t = s.trimEnd()
  const m = ESTRUTURA_FINAL.exec(t)
  if (!m || m[1] === undefined) return null
  return { texto: t.slice(0, m.index).trimEnd(), fragmento: m[1].trim() }
}

// -----------------------------------------------------------------------------
// A1. Rubrica marginal colada no heading
//
// "CAPÍTULO III – Da Aplicação da Pena Fixação da pena" → heading
// "Da Aplicação da Pena" + rubrica "Fixação da pena" (do art. 59).
//
// Duas regras, nesta ordem:
//
//   sentence-case — heading do Vade Mecum é Title Case: toda palavra é maiúscula
//     ou conectivo. A rubrica não é ("Fixação da pena" tem "pena" minúsculo).
//     Achada a primeira minúscula não-conectiva, o começo da rubrica é a última
//     palavra maiúscula antes dela, pulando conectivos.
//
//   repetição — quando a rubrica também é Title Case a regra acima é cega
//     ("Do Furto Furto"). Aqui: última palavra maiúscula que já apareceu no
//     próprio heading. NÃO é dedup ingênuo de heading — é uma regra sobre o
//     último token, e por isso não quebra "Dos Crimes contra o Respeito aos
//     Mortos".
//
// O que escapa das duas (rubrica Title Case e sem repetição — "Dos Crimes
// contra a Honra Calúnia") sai marcado como 'nao-segmentado' e vai para
// curadoria. São ~10 headings no CP inteiro.
// -----------------------------------------------------------------------------
const CONECTIVOS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os', 'ao', 'aos',
  'à', 'às', 'em', 'no', 'na', 'nos', 'nas', 'num', 'numa', 'contra', 'para',
  'por', 'pelo', 'pela', 'pelos', 'pelas', 'sobre', 'com', 'sem', 'entre',
  'que', 'se', 'ante', 'após', 'até', 'desde', 'perante', 'sob',
])

const HEADING = /^(TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)\s+([IVXLC]+(?:-[A-Z])?|\d+)\s*[–—-]\s*(.+)$/

const ehMaiuscula = (t: string) => /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(t)
const ehConectivo = (t: string) => CONECTIVOS.has(chave(t.replace(/[^\p{L}]/gu, '')))

export type Corte = {
  heading: string
  rubrica: string | null
  regra: 'sentence-case' | 'repeticao' | 'nao-segmentado'
}

export function separaHeading(bruto: string): Corte {
  const m = HEADING.exec(bruto.trim())
  if (!m || m[3] === undefined) return { heading: bruto, rubrica: null, regra: 'nao-segmentado' }

  const [, especie, numeral, corpo] = m
  const prefixo = `${especie} ${numeral} – `
  const tk = corpo.split(/\s+/)

  const monta = (i: number, regra: Corte['regra']): Corte => ({
    heading: prefixo + tk.slice(0, i).join(' '),
    rubrica: tk.slice(i).join(' '),
    regra,
  })

  // regra 1 — sentence-case
  const j = tk.findIndex((t, i) => i > 0 && !ehMaiuscula(t) && !ehConectivo(t))
  if (j > 0) {
    let i = j - 1
    while (i > 0 && ehConectivo(tk[i]!)) i--
    const rubrica = tk.slice(i).join(' ')
    if (i > 0 && rubrica.length <= 140) return monta(i, 'sentence-case')
  }

  // regra 2 — repetição do último token
  const ultimo = tk.at(-1)!
  if (tk.length > 1 && ehMaiuscula(ultimo) && !ehConectivo(ultimo)) {
    const anteriores = tk.slice(0, -1).map(chave)
    if (anteriores.includes(chave(ultimo))) return monta(tk.length - 1, 'repeticao')
  }

  return { heading: bruto, rubrica: null, regra: 'nao-segmentado' }
}

// -----------------------------------------------------------------------------
// Rótulos, numeração e citação
// -----------------------------------------------------------------------------

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

export function romanoParaArabico(r: string): number {
  let total = 0
  const s = r.toUpperCase()
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]!] ?? 0
    const prox = ROMANOS[s[i + 1]!] ?? 0
    total += v < prox ? -v : v
  }
  return total
}

/** '216-B' → { base: 216, sufixo: 'B' }; '33' → { base: 33, sufixo: null } */
export function partesNumeroArtigo(numero: string) {
  const m = /^(\d+)(?:-([A-Za-z]+))?$/.exec(numero.trim())
  if (!m) throw new Error(`número de artigo fora do padrão: ${numero}`)
  return { base: Number(m[1]), sufixo: m[2]?.toUpperCase() ?? null }
}

/**
 * O número real do parágrafo, lido do próprio marcador.
 *
 * PAR_RE do parser captura só o dígito: `§ 4o`, `§ 4o-A`, `§ 4o-B` e `§ 4o-C`
 * chegam todos como numero = "4". Confiar nisso colapsa quatro dispositivos
 * distintos no mesmo id — e o art. 155 do CP tem exatamente esses quatro.
 */
export function analisaParagrafo(textoBruto: string, numeroParser: string) {
  const t = textoBruto.trim()
  if (/^Parágrafo\s+único/i.test(t) || chave(numeroParser).startsWith('unico')) {
    return { numero: 'único', sufixoId: 'u', rotulo: 'Parágrafo único' }
  }

  const m = /^§\s*(\d+)\s*[oº°]?(?:\s*-\s*([A-Za-z]))?/.exec(t)
  const n = m?.[1] ?? numeroParser
  const letra = m?.[2]?.toUpperCase() ?? null

  const numero = letra ? `${n}-${letra}` : n
  // Convenção brasileira: ordinal até 9, cardinal a partir de 10.
  const base = Number(n) <= 9 ? `§ ${n}º` : `§ ${n}`
  return {
    numero,
    sufixoId: chave(numero),
    rotulo: letra ? `${base}-${letra}` : base,
  }
}

/** Remove o marcador que o parser deixou no início do bloco (§ 4º-A, IV –, a). */
export function tiraMarcador(texto: string, tipo: 'paragrafo' | 'inciso' | 'alinea'): string {
  const re = {
    paragrafo: /^(?:§\s*\d+\s*[oº°]?(?:\s*-\s*[A-Za-z])?|Parágrafo\s+único)\s*[.\-–—]?\s*/,
    inciso: /^[IVXLC]+\s*[.\-–—)]\s*/,
    alinea: /^[a-z]\s*\)\s*/,
  }[tipo]
  return texto.replace(re, '').trim()
}

/**
 * Artigo de 1 a 9 se cita com ordinal — `art. 1º`, `art. 3º-A` —, e de 10 em
 * diante com cardinal: `art. 10`, `art. 33`. É convenção de redação legislativa
 * (LC 95/1998), não preferência de estilo, e o Vade Mecum a segue na fonte.
 *
 * Vale para os quatro primeiros dispositivos de qualquer lei, o que inclui o
 * `art. 3º-A` do CPP — a estrutura acusatória — e o `art. 5º` da Lei de Drogas.
 */
export function ordinalDoArtigo(numero: string): string {
  // O sufixo de letra não muda a regra: quem manda é a base numérica.
  const m = /^(\d+)(-[A-Za-z])?$/.exec(numero.trim())
  if (!m) return numero
  const base = Number(m[1])
  return base >= 1 && base <= 9 ? `${base}º${m[2] ?? ''}` : numero
}

/**
 * 'art. 33, § 4º, I, a, da Lei nº 11.343/2006'
 *
 * É o texto que sai impresso na peça. Erro aqui aparece em audiência, não em
 * log — daí montar por partes em vez de concatenar na mão em cada chamada.
 */
export function montaCitacao(
  artigoNumero: string,
  cadeia: string[],
  sufixoLei: string,
): string {
  const partes = [`art. ${ordinalDoArtigo(artigoNumero)}`, ...cadeia]
  return partes.length > 1
    ? `${partes.join(', ')}, ${sufixoLei}`
    : `${partes[0]} ${sufixoLei}`
}
