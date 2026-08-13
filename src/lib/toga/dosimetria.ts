// =============================================================================
// Dosimetria trifásica — o cálculo, sem tela.
//
// Está separado de `components/toga/dosimetria.tsx` porque agora tem dois
// consumidores: a ferramenta e o cartão que aparece dentro da resposta do chat.
// Duas cópias da mesma conta divergiriam na primeira correção — e divergir aqui
// significa a tela dizer uma pena e o cartão dizer outra, sobre o mesmo caso.
//
// **Isto é uma calculadora, não um parecer.** Cada fração aplicada é a
// majoritária, e os dois pontos onde a conta pode divergir de um juiz real
// estão anotados onde acontecem.
// =============================================================================

/** Art. 33, caput da Lei 11.343/2006 — reclusão de 5 a 15 anos. Em meses. */
export const MINIMO = 60
export const MAXIMO = 180
const INTERVALO = MAXIMO - MINIMO

/**
 * A fração por vetor negativo na primeira fase.
 *
 * 1/8 do intervalo é o critério majoritário do STJ, e é *critério*, não lei: o
 * art. 59 manda o juiz fixar a pena "conforme seja necessário e suficiente" sem
 * dizer quanto vale cada circunstância. Há juízo que usa 1/6 e há quem module.
 * Fixar 1/8 aqui é escolha explícita, não descuido.
 */
export const POR_VETOR = INTERVALO / 8

export type Peso = 'fav' | 'neutra' | 'desf'

export const VETORES = [
  { nome: 'Culpabilidade', dica: 'grau de reprovabilidade' },
  { nome: 'Antecedentes', dica: 'certidões nos autos' },
  { nome: 'Conduta social', dica: 'meio familiar e laboral' },
  { nome: 'Personalidade', dica: 'sem laudo — cautela' },
  { nome: 'Motivos', dica: 'motivação do agente' },
  { nome: 'Circunstâncias', dica: 'modo de execução' },
  { nome: 'Consequências', dica: 'extensão do dano' },
  { nome: 'Vítima', dica: 'comportamento da vítima' },
  // O nono não é do art. 59. Ver PREPONDERANTE, abaixo.
  { nome: 'Natureza e quantidade', dica: 'art. 42 — preponderante' },
] as const

/**
 * Índice do vetor do art. 42 da Lei de Drogas.
 *
 * O artigo manda o juiz considerar "com preponderância sobre o previsto no art.
 * 59 do Código Penal" a natureza e a quantidade da droga. Preponderância que não
 * pesa mais que as outras não é preponderância — daí o peso dobrado. É a
 * tradução aritmética mais simples e defensável da palavra.
 */
export const PREPONDERANTE = 8

export const AGRAVANTES = [
  { k: 'menoridade', nome: 'Menoridade relativa (art. 65, I)', base: 'réu com menos de 21 anos na data do fato', nota: 'atenuante preponderante', fr: '− 1/6' },
  { k: 'confissao', nome: 'Confissão espontânea (art. 65, III, d)', base: 'confissão usada na fundamentação', nota: 'Súmula 545/STJ', fr: '− 1/6' },
  { k: 'reincidencia', nome: 'Reincidência (art. 61, I)', base: 'condenação anterior transitada em julgado', nota: 'agravante preponderante', fr: '+ 1/6' },
] as const

export const CAUSAS = [
  { k: 'privilegiado', nome: 'Tráfico privilegiado (art. 33, §4º)', base: 'primário, bons antecedentes, sem organização nem dedicação', nota: 'redução de 1/6 a 2/3 — aqui, 2/3', fr: '− 2/3' },
  { k: 'proximidade', nome: 'Proximidade de escola (art. 40, III)', base: 'nas imediações de estabelecimento de ensino', nota: 'aumento de 1/6 a 2/3 — aqui, o mínimo', fr: '+ 1/6' },
  { k: 'tentativa', nome: 'Tentativa (art. 14, II)', base: 'execução iniciada e não consumada', nota: 'redução de 1/3 a 2/3 — aqui, 1/3', fr: '− 1/3' },
] as const

export type ChaveAgravante = (typeof AGRAVANTES)[number]['k']
export type ChaveCausa = (typeof CAUSAS)[number]['k']

export type EntradaDosimetria = {
  vetores: Peso[]
  agravantes: Record<ChaveAgravante, boolean>
  causas: Record<ChaveCausa, boolean>
}

export type Calculo = {
  negativos: number
  peso: number
  base: number
  provisoria: number
  definitiva: number
  multa: number
  abaixoDoMinimo: boolean
  /** Regime inicial pelo art. 33, § 2º, do CP, sobre a pena definitiva. */
  regime: 'fechado' | 'semiaberto' | 'aberto'
}

/** Estado inicial da ferramenta, e o ponto de partida do cartão do chat. */
export const ENTRADA_PADRAO: EntradaDosimetria = {
  vetores: Array(VETORES.length).fill('neutra') as Peso[],
  agravantes: { menoridade: false, confissao: true, reincidencia: false },
  causas: { privilegiado: true, proximidade: false, tentativa: false },
}

/**
 * Regime inicial pelas faixas do art. 33, § 2º, do Código Penal.
 *
 * Faixas puras, sem o art. 33, § 3º (que manda observar o art. 59) nem as
 * súmulas 440/STJ e 719/STF, porque as duas dependem de fundamentação concreta
 * e não de aritmética. A tela diz que é estimativa.
 */
function regimeDe(meses: number): Calculo['regime'] {
  if (meses > 96) return 'fechado' // acima de 8 anos
  if (meses > 48) return 'semiaberto' // acima de 4 anos
  return 'aberto'
}

export function calcula({ vetores, agravantes, causas }: EntradaDosimetria): Calculo {
  const negativos = vetores.filter((v) => v === 'desf').length
  const peso = vetores.reduce(
    (a, v, i) => a + (v === 'desf' ? (i === PREPONDERANTE ? 2 : 1) : 0),
    0,
  )
  const base = Math.min(MAXIMO, MINIMO + peso * POR_VETOR)

  let provisoria = base
  if (agravantes.reincidencia) provisoria *= 7 / 6
  // Súmula 231/STJ: a atenuante não leva a pena abaixo do mínimo legal. É a
  // trava mais desrespeitada em cálculo de padaria, e por isso é `Math.max` e
  // não subtração livre.
  if (agravantes.menoridade) provisoria = Math.max(MINIMO, (provisoria * 5) / 6)
  if (agravantes.confissao) provisoria = Math.max(MINIMO, (provisoria * 5) / 6)
  provisoria = Math.min(MAXIMO, provisoria)

  // Terceira fase: aqui a pena PODE ficar abaixo do mínimo. Causa de diminuição
  // não é atenuante, e a Súmula 231 não a alcança — é exatamente o que faz o
  // § 4º valer a pena no tráfico.
  let definitiva = provisoria
  if (causas.proximidade) definitiva *= 7 / 6
  if (causas.privilegiado) definitiva *= 1 / 3
  if (causas.tentativa) definitiva *= 2 / 3

  const arredondada = Math.round(definitiva)

  return {
    negativos,
    peso,
    base,
    provisoria,
    definitiva: arredondada,
    multa: Math.min(1500, 500 + peso * 125),
    abaixoDoMinimo: arredondada < MINIMO,
    regime: regimeDe(arredondada),
  }
}

/** `74` → `6a 2m`. Meses arredondados: a lei não conta pena em fração de mês. */
export function meses(m: number): string {
  const total = Math.round(m)
  const anos = Math.floor(total / 12)
  const resto = total % 12
  if (anos && resto) return `${anos}a ${resto}m`
  if (anos) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  return `${resto} ${resto === 1 ? 'mês' : 'meses'}`
}

// --- leitura da conversa -----------------------------------------------------

/**
 * Lê da pergunta os fatos que a dosimetria sabe representar.
 *
 * É reconhecimento de termo, não interpretação: cada gatilho abaixo é uma
 * expressão que o usuário digitou. O que não for reconhecido não vira suposição
 * — fica no padrão, e o cartão mostra em cima de que fatos calculou, para o
 * usuário ver o que foi lido e o que não foi.
 */
const GATILHOS: { re: RegExp; rotulo: string; aplica: (e: EntradaDosimetria) => void }[] = [
  {
    re: /\bprivilegiad|33,?\s*§\s*4|art\.?\s*33\s*§\s*4|minorante/i,
    rotulo: 'Tráfico privilegiado · § 4º',
    aplica: (e) => { e.causas.privilegiado = true },
  },
  {
    re: /\breincid/i,
    rotulo: 'Reincidente',
    aplica: (e) => { e.agravantes.reincidencia = true; e.causas.privilegiado = false },
  },
  {
    re: /\bprim[áa]ri/i,
    rotulo: 'Réu primário',
    aplica: (e) => { e.agravantes.reincidencia = false },
  },
  {
    re: /\bconfess|confiss[ãa]o/i,
    rotulo: 'Confissão espontânea',
    aplica: (e) => { e.agravantes.confissao = true },
  },
  {
    re: /\bmenor de 21|menoridade/i,
    rotulo: 'Menor de 21 anos',
    aplica: (e) => { e.agravantes.menoridade = true },
  },
  {
    re: /\bescola|ensino|col[ée]gio|imedia[çc][õo]es/i,
    rotulo: 'Imediações de escola · art. 40, III',
    aplica: (e) => { e.causas.proximidade = true },
  },
  {
    re: /\btentativ|tentado/i,
    rotulo: 'Tentativa · art. 14, II',
    aplica: (e) => { e.causas.tentativa = true },
  },
  {
    re: /\bgrande quantidade|muita droga|quantidade expressiva|\bkg\b|quilos?\b/i,
    rotulo: 'Quantidade expressiva · art. 42',
    aplica: (e) => { e.vetores[PREPONDERANTE] = 'desf' },
  },
  {
    re: /\bmaus antecedentes|antecedentes desfavor/i,
    rotulo: 'Maus antecedentes',
    aplica: (e) => { e.vetores[1] = 'desf' },
  },
]

export type LeituraDaConversa = {
  entrada: EntradaDosimetria
  /** O que foi reconhecido no texto, para o cartão mostrar. */
  chips: string[]
}

export function leDaConversa(pergunta: string): LeituraDaConversa {
  const entrada: EntradaDosimetria = {
    vetores: [...ENTRADA_PADRAO.vetores],
    agravantes: { ...ENTRADA_PADRAO.agravantes },
    causas: { ...ENTRADA_PADRAO.causas },
  }
  const chips: string[] = []

  for (const g of GATILHOS) {
    if (!g.re.test(pergunta)) continue
    g.aplica(entrada)
    chips.push(g.rotulo)
  }

  return { entrada, chips }
}
