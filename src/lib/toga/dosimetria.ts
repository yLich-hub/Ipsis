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

/**
 * Um crime da Lei de Drogas, com o que muda de um para o outro.
 *
 * O que **não** muda, e por isso não está aqui: as três fases, o art. 59, a
 * preponderância do art. 42 (que o artigo manda valer na fixação das penas
 * desta Lei, não só do art. 33), a Súmula 231 na segunda fase e as faixas de
 * regime do art. 33, § 2º, do CP. São quatro números por crime e uma regra.
 *
 * `artigo` é o id do dispositivo no corpus, e não enfeite: é por ele que
 * `tests/dosimetria.test.ts` confere `minimo`, `maximo` e a multa contra o
 * texto do próprio artigo em `data/normalizado/`. Faixa de pena digitada de
 * memória é do mesmo tamanho de gravidade que citação quebrada em peça — e a
 * resposta do projeto para as duas é a mesma: um teste que quebra.
 */
export type Crime = {
  /** Id do artigo no corpus — a chave da conferência. */
  artigo: string
  /** Como a tela o chama. */
  rotulo: string
  /** Como a tela o cita, curto: cabe na pílula do cartão. */
  citacao: string
  /**
   * Como o memorial o cita, por extenso.
   *
   * O art. 33 leva "caput" porque o § 1º é crime equiparado com a mesma pena e
   * outra conduta, e memorial que vai para dentro de uma peça não pode deixar
   * essa distinção para o leitor adivinhar.
   */
  citacaoPeca: string
  /** Mínimo e máximo do preceito secundário, em meses. */
  minimo: number
  maximo: number
  /** Dias-multa, mínimo e máximo. */
  multaMinima: number
  multaMaxima: number
  /**
   * O § 4º alcança este crime?
   *
   * Só o art. 33 — o próprio § 4º diz "nos delitos definidos no **caput** e no
   * § 1º **deste artigo**". Associação, financiamento, maquinário e informante
   * ficam de fora, e o STJ não os alcança por analogia. Enquanto a calculadora
   * dosava um crime só, a redução de 2/3 era sempre oferecível; com cinco, ela
   * passa a ser recusada onde a lei a recusa. É a mesma trava que
   * `trafico_imputado` faz nas teses.
   */
  privilegio: boolean
}

/**
 * Os cinco crimes de tráfico da Lei 11.343/2006.
 *
 * Faixas lidas do texto de cada artigo, não da memória — ver `Crime.artigo`.
 */
const TRAFICO_ART33: Crime = {
  artigo: 'lei_11343_2006_art33',
  rotulo: 'Tráfico',
  citacao: 'art. 33',
  citacaoPeca: 'Art. 33, caput,',
  minimo: 60,
  maximo: 180,
  multaMinima: 500,
  multaMaxima: 1500,
  privilegio: true,
}

export const CRIMES: readonly Crime[] = [
  TRAFICO_ART33,
  {
    artigo: 'lei_11343_2006_art34',
    rotulo: 'Maquinário',
    citacao: 'art. 34',
    citacaoPeca: 'Art. 34',
    minimo: 36,
    maximo: 120,
    multaMinima: 1200,
    multaMaxima: 2000,
    privilegio: false,
  },
  {
    artigo: 'lei_11343_2006_art35',
    rotulo: 'Associação',
    citacao: 'art. 35',
    citacaoPeca: 'Art. 35',
    minimo: 36,
    maximo: 120,
    multaMinima: 700,
    multaMaxima: 1200,
    privilegio: false,
  },
  {
    artigo: 'lei_11343_2006_art36',
    rotulo: 'Financiamento',
    citacao: 'art. 36',
    citacaoPeca: 'Art. 36',
    minimo: 96,
    maximo: 240,
    multaMinima: 1500,
    multaMaxima: 4000,
    privilegio: false,
  },
  {
    artigo: 'lei_11343_2006_art37',
    rotulo: 'Informante',
    citacao: 'art. 37',
    citacaoPeca: 'Art. 37',
    minimo: 24,
    maximo: 72,
    multaMinima: 300,
    multaMaxima: 700,
    privilegio: false,
  },
] as const

/** O crime central do recorte, e o que a ferramenta e o cartão assumem. */
export const CRIME_PADRAO: Crime = TRAFICO_ART33

/** Art. 33, caput — reclusão de 5 a 15 anos. Em meses. */
export const MINIMO = CRIME_PADRAO.minimo
export const MAXIMO = CRIME_PADRAO.maximo

/**
 * A fração por vetor negativo na primeira fase.
 *
 * 1/8 do intervalo é o critério majoritário do STJ, e é *critério*, não lei: o
 * art. 59 manda o juiz fixar a pena "conforme seja necessário e suficiente" sem
 * dizer quanto vale cada circunstância. Há juízo que usa 1/6 e há quem module.
 * Fixar 1/8 aqui é escolha explícita, não descuido.
 *
 * É fração do intervalo, então cada crime tem a sua: 15 meses no art. 33, 10,5
 * no art. 35. Uma constante única transportaria a régua do tráfico para um
 * crime cuja pena vai de 2 a 6 anos.
 */
export function porVetor(crime: Crime = CRIME_PADRAO): number {
  return (crime.maximo - crime.minimo) / 8
}

export const POR_VETOR = porVetor(CRIME_PADRAO)

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

/**
 * Estado inicial **da ferramenta**, em `/dosimetria`.
 *
 * Traz confissão e privilégio ligados de propósito: ali as duas aparecem como
 * chave marcada na tela, o usuário vê o cenário de que partiu e desliga o que
 * não for o caso dele.
 */
export const ENTRADA_PADRAO: EntradaDosimetria = {
  vetores: Array(VETORES.length).fill('neutra') as Peso[],
  agravantes: { menoridade: false, confissao: true, reincidencia: false },
  causas: { privilegiado: true, proximidade: false, tentativa: false },
}

/**
 * O ponto de partida de quem lê uma conversa: nada suposto.
 *
 * `leDaConversa` partia de `ENTRADA_PADRAO`, e isso punha na boca do usuário
 * dois fatos que ele não disse — confissão espontânea e tráfico privilegiado,
 * que é rendição de 2/3. Medido: pergunta sem nenhum fato reconhecível exibia
 * "1a 8m", o cenário mais favorável que a calculadora sabe produzir, e o
 * cabeçalho recolhido do cartão mostra só esse número. Na ferramenta a
 * suposição é visível e se desliga; dentro da resposta do chat ela é invisível.
 *
 * Sem fato lido, a conta agora dá o mínimo do caput — que é o que se pode
 * afirmar de um caso sobre o qual nada se sabe.
 */
export const ENTRADA_NEUTRA: EntradaDosimetria = {
  vetores: Array(VETORES.length).fill('neutra') as Peso[],
  agravantes: { menoridade: false, confissao: false, reincidencia: false },
  causas: { privilegiado: false, proximidade: false, tentativa: false },
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

export function calcula(
  { vetores, agravantes, causas }: EntradaDosimetria,
  crime: Crime = CRIME_PADRAO,
): Calculo {
  const negativos = vetores.filter((v) => v === 'desf').length
  const peso = vetores.reduce(
    (a, v, i) => a + (v === 'desf' ? (i === PREPONDERANTE ? 2 : 1) : 0),
    0,
  )
  const base = Math.min(crime.maximo, crime.minimo + peso * porVetor(crime))

  let provisoria = base
  if (agravantes.reincidencia) provisoria *= 7 / 6
  // Súmula 231/STJ: a atenuante não leva a pena abaixo do mínimo legal. É a
  // trava mais desrespeitada em cálculo de padaria, e por isso é `Math.max` e
  // não subtração livre.
  if (agravantes.menoridade) provisoria = Math.max(crime.minimo, (provisoria * 5) / 6)
  if (agravantes.confissao) provisoria = Math.max(crime.minimo, (provisoria * 5) / 6)
  provisoria = Math.min(crime.maximo, provisoria)

  // Terceira fase: aqui a pena PODE ficar abaixo do mínimo. Causa de diminuição
  // não é atenuante, e a Súmula 231 não a alcança — é exatamente o que faz o
  // § 4º valer a pena no tráfico.
  //
  // `crime.privilegio` é a trava, e ela mora aqui e não só na tela: a tela pode
  // esconder a chave, e uma entrada montada em código — que é como o cartão do
  // chat monta a dele — passaria direto. O § 4º alcança o art. 33 e mais nada.
  let definitiva = provisoria
  if (causas.proximidade) definitiva *= 7 / 6
  if (causas.privilegiado && crime.privilegio) definitiva *= 1 / 3
  if (causas.tentativa) definitiva *= 2 / 3

  const arredondada = Math.round(definitiva)

  return {
    negativos,
    peso,
    base,
    provisoria,
    definitiva: arredondada,
    // A multa acompanha a mesma régua de oitavos da pena-base, entre o mínimo e
    // o máximo do próprio artigo — 500 a 1.500 no art. 33, 300 a 700 no art. 37.
    multa: Math.round(
      Math.min(
        crime.multaMaxima,
        crime.multaMinima + (peso * (crime.multaMaxima - crime.multaMinima)) / 8,
      ),
    ),
    abaixoDoMinimo: arredondada < crime.minimo,
    regime: regimeDe(arredondada),
  }
}

/**
 * O memorial de cálculo, em texto corrido, pronto para colar numa peça.
 *
 * Existe porque o botão que o oferecia não o produzia: ele acendia "Gerando
 * memorial…" por 1400 ms e passava a "Memorial pronto ✓" sem nada ter sido
 * gerado. Um visto de conclusão sobre trabalho que não aconteceu é o mesmo
 * defeito de classe que uma barra de progresso chegando a 100% antes do
 * resultado — e este projeto recusa os dois.
 *
 * Fica aqui, ao lado de `calcula`, pelo motivo de sempre: o memorial descreve a
 * conta, e conta e descrição em arquivos diferentes divergem na primeira
 * correção. A tela só copia o que esta função escreveu.
 *
 * Não cita artigo por marcador `{{cite:}}` e não vai para o `.docx`: isto é
 * saída de calculadora, não peça. O texto legal continua saindo do banco, pelo
 * caminho de `lib/peca/`.
 */
export function memorialDe(
  entrada: EntradaDosimetria,
  c = calcula(entrada),
  crime: Crime = CRIME_PADRAO,
): string {
  const desfavoraveis = VETORES.filter((_, i) => entrada.vetores[i] === 'desf')
  const favoraveis = VETORES.filter((_, i) => entrada.vetores[i] === 'fav')
  const marcadas = <T extends { k: string; nome: string }>(
    lista: readonly T[],
    estado: Record<string, boolean>,
  ) => lista.filter((x) => estado[x.k]).map((x) => x.nome)

  const agravantes = marcadas(AGRAVANTES, entrada.agravantes)
  const causas = marcadas(CAUSAS, entrada.causas)
  const lista = (xs: string[]) => (xs.length ? xs.join('; ') : 'nenhuma')

  return [
    'MEMORIAL DE CÁLCULO DA PENA',
    `${crime.citacaoPeca} da Lei nº 11.343/2006 — reclusão de ${anos(crime.minimo)} a ` +
      `${anos(crime.maximo)} anos e ${milhar(crime.multaMinima)} a ${milhar(crime.multaMaxima)} ` +
      'dias-multa.',
    '',
    '1ª FASE — pena-base (art. 59 do CP e art. 42 da Lei nº 11.343/2006)',
    `Circunstâncias desfavoráveis: ${lista(desfavoraveis.map((v) => v.nome))}.`,
    `Circunstâncias favoráveis: ${lista(favoraveis.map((v) => v.nome))}.`,
    // O art. 42 é o que distingue a dosimetria do tráfico da de qualquer outro
    // crime, e o memorial tem de dizer isso quando ele pesou.
    entrada.vetores[PREPONDERANTE] === 'desf'
      ? 'A natureza e a quantidade da droga preponderam sobre as demais, por força do art. 42 da Lei nº 11.343/2006, e entram com peso dobrado.'
      : 'A natureza e a quantidade da droga não foram consideradas desfavoráveis.',
    `Pena-base fixada em ${meses(c.base)}.`,
    '',
    '2ª FASE — agravantes e atenuantes (arts. 61 a 65 do CP)',
    `Marcadas: ${lista(agravantes)}.`,
    'A pena provisória não desce abaixo do mínimo legal nesta fase (Súmula 231 do STJ).',
    `Pena provisória: ${meses(c.provisoria)}.`,
    '',
    '3ª FASE — causas de aumento e de diminuição',
    `Aplicadas: ${lista(causas)}.`,
    // Escrever por que o § 4º não entrou é mais útil que omiti-lo, e a linha
    // sai do CRIME e não da chave marcada: é afirmação sobre o artigo dosado,
    // verdadeira mesmo que ninguém tenha tentado aplicar a redução. Numa conta
    // de associação, é a primeira pergunta de quem lê.
    crime.privilegio
      ? ''
      : `A redução do art. 33, § 4º, não incide sobre o ${crime.citacao}: o dispositivo a ` +
        'restringe aos delitos do caput e do § 1º do art. 33.',
    `Pena definitiva: ${meses(c.definitiva)} de reclusão e ${c.multa} dias-multa.`,
    c.abaixoDoMinimo
      ? `A pena definitiva ficou abaixo do mínimo legal de ${anos(crime.minimo)} anos, o que é ` +
        'válido: a redução veio de causa de diminuição na terceira fase, onde a Súmula 231 não ' +
        'incide.'
      : '',
    `Regime inicial estimado: ${c.regime} (art. 33, § 2º, do CP).`,
    '',
    'Calculadora, não parecer. As frações são as majoritárias; o caso concreto pode justificar outra.',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

/** `60` → `5`. As faixas do preceito secundário são sempre em anos cheios. */
function anos(meses: number): number {
  return Math.round(meses / 12)
}

/** `1500` → `1.500`, como a lei imprime. */
function milhar(n: number): string {
  return n.toLocaleString('pt-BR')
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
    re: /\btentativ|tentad[ao]/i,
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

/**
 * A calculadora dosa **um** crime: o art. 33, caput, da Lei 11.343/2006.
 *
 * Tudo aqui é dele — o intervalo de 5 a 15 anos, os dias-multa, o vetor
 * preponderante do art. 42, o § 4º da terceira fase. Isso não era problema
 * enquanto o produto inteiro era tráfico; hoje a busca alcança roubo majorado e
 * o art. 217-A, e o cartão aparecia igual sob a resposta sobre eles, com o selo
 * "art. 33 · 5 a 15 anos" e uma pena que não é a do crime perguntado. Pena
 * plausível e falsa é o que este projeto existe para não produzir.
 *
 * **A pergunta é quem decide, e não os dispositivos recuperados.** Medido
 * contra a busca de verdade: "pena para porte de muitas armas" traz o art. 28
 * da Lei de Drogas entre os dez primeiros, então olhar a lei do contexto
 * manteria o cartão justamente no caso que motivou o conserto. É também a
 * pergunta que `leDaConversa` lê — as duas leem a mesma coisa.
 *
 * Segue valendo o motivo de ele não depender de palavra de dosimetria: advogado
 * pergunta pelo § 4º, não por "calcule a pena". O que se exige é que a pergunta
 * seja de droga, não que seja de cálculo.
 *
 * O peso e a porção entram na lista porque caso de tráfico se descreve por
 * quantidade — "réu com 3 kg apreendidos" é pergunta de tráfico sem a palavra
 * tráfico, e sem eles o caso mais típico do recorte ficava de fora.
 *
 * **O erro é enviesado para esconder**, ao contrário do filtro da vigília. Lá um
 * achado a mais custa uma linha que se lê e descarta; aqui um cartão a mais é
 * a pena de um crime exibida sob a resposta de outro.
 */
const TRAFICO =
  /\btr[áa]fic|traficant|entorpecent|\bdrogas?\b|11\.?\s?343|maconha|coca[íi]na|\bcrack\b|33,?\s*§\s*4|\bprivilegiad|minorante|\bkg\b|\bquilos?\b|\bgramas?\b|porç(ão|ões)|trouxinha/i

/**
 * Crime de outra lei nomeado na pergunta.
 *
 * `privilegiad` entrou na lista acima porque "cabe o privilegiado?" é pergunta
 * de tráfico sem a palavra tráfico — e o furto tem o seu, no art. 155, § 2º.
 * Sem esta guarda, a palavra que consertou um caso estragaria outro.
 */
const OUTRO_CRIME =
  /\bfurto|\broubo|estelionato|receptaç|homic[íi]d|estupro|217-A|arma de fogo|10\.?\s?826/i

/**
 * Porte para consumo é o art. 28, que não tem pena de prisão — dosar 5 a 15
 * anos sobre ele seria errar mais feio do que sobre um crime de outra lei.
 */
const CONSUMO = /consumo pessoal|uso pr[óo]prio|porte para consumo|art\.?\s*28\b/i

export function dosavel(pergunta: string): boolean {
  const traficoExpresso = /\btr[áa]fic/i.test(pergunta)
  if (CONSUMO.test(pergunta) && !traficoExpresso) return false
  if (OUTRO_CRIME.test(pergunta) && !traficoExpresso) return false
  return TRAFICO.test(pergunta)
}

/**
 * Negação antes do termo.
 *
 * O reconhecimento era por termo solto, e "o réu **não** é reincidente" ligava
 * a reincidência — que agrava a pena E desliga o § 4º. O erro tem a pior
 * direção possível: transforma o fato favorável que o usuário escreveu no
 * desfavorável que ele negou. "Sem maus antecedentes" fazia o mesmo.
 *
 * A janela é de 40 caracteres e não atravessa pontuação forte: "não cabe o
 * § 4º. Réu reincidente" são duas afirmações, e a segunda vale.
 */
const NEGADOR = /\b(n[ãa]o|sem|nunca|jamais|inexist\w*|ausent\w*|afastad\w*)\b[^.;!?]{0,30}$/i

function negado(pergunta: string, indice: number): boolean {
  return NEGADOR.test(pergunta.slice(Math.max(0, indice - 40), indice))
}

/**
 * Qual dos cinco crimes a pergunta descreve.
 *
 * Vocabulário próprio de cada artigo, e nada de adivinhação: sem sinal, é o
 * art. 33 — o crime central do recorte, e o único que o selo do cartão já
 * nomeava. Errar para o art. 33 é errar para o conhecido, com o artigo escrito
 * na tela; errar para um artigo deduzido seria a pena de um crime exibida com
 * o nome de outro.
 *
 * "Olheiro" e "fogueteiro" estão aqui pelo mesmo motivo de estarem nas
 * variantes da rubrica do art. 37: é como o caso chega falado.
 */
const CRIME_NA_PERGUNTA: { re: RegExp; artigo: string }[] = [
  { re: /\bassocia[çc]|\bassociar-se|art\.?\s*35\b/i, artigo: 'lei_11343_2006_art35' },
  { re: /financia|custei|art\.?\s*36\b/i, artigo: 'lei_11343_2006_art36' },
  { re: /informante|olheiro|fogueteir|art\.?\s*37\b/i, artigo: 'lei_11343_2006_art37' },
  { re: /maquin[áa]ri|petrech|apetrech|art\.?\s*34\b/i, artigo: 'lei_11343_2006_art34' },
]

export function crimeDaPergunta(pergunta: string): Crime {
  for (const { re, artigo } of CRIME_NA_PERGUNTA) {
    const achado = re.exec(pergunta)
    if (!achado || negado(pergunta, achado.index)) continue
    const crime = CRIMES.find((c) => c.artigo === artigo)
    if (crime) return crime
  }
  return CRIME_PADRAO
}

export type LeituraDaConversa = {
  entrada: EntradaDosimetria
  /** O que foi reconhecido no texto, para o cartão mostrar. */
  chips: string[]
  /** Qual crime a pergunta descreve. Ver `crimeDaPergunta`. */
  crime: Crime
}

export function leDaConversa(pergunta: string): LeituraDaConversa {
  const entrada: EntradaDosimetria = {
    vetores: [...ENTRADA_NEUTRA.vetores],
    agravantes: { ...ENTRADA_NEUTRA.agravantes },
    causas: { ...ENTRADA_NEUTRA.causas },
  }
  const chips: string[] = []

  for (const g of GATILHOS) {
    const achado = g.re.exec(pergunta)
    if (!achado) continue
    // Termo negado não vira fato e não vira chip: o cartão mostra o que leu, e
    // exibir "Reincidente" para quem escreveu "não é reincidente" seria o
    // próprio erro anunciado como leitura.
    if (negado(pergunta, achado.index)) continue
    g.aplica(entrada)
    chips.push(g.rotulo)
  }

  const crime = crimeDaPergunta(pergunta)

  // O § 4º não alcança os outros quatro, então nem como fato lido ele entra: o
  // cartão mostra os chips como "o que eu li da sua pergunta", e deixar
  // "Tráfico privilegiado" ali sob uma pena de associação diria que a redução
  // foi considerada e não foi. `calcula` já recusaria; aqui a tela também.
  if (!crime.privilegio && entrada.causas.privilegiado) {
    entrada.causas.privilegiado = false
    const i = chips.indexOf('Tráfico privilegiado · § 4º')
    if (i >= 0) chips.splice(i, 1)
  }

  return { entrada, chips, crime }
}
