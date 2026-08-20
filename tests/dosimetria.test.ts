// =============================================================================
// A conta da dosimetria, e as travas legais que ela precisa respeitar.
//
// O cálculo tem dois consumidores — a tela de Dosimetria e o cartão dentro da
// resposta do chat — e os dois importam `lib/toga/dosimetria.ts`. Este teste
// existe para que ele continue sendo um só: se alguém reintroduzir a conta em
// qualquer um dos dois, é aqui que a divergência aparece.
//
// As asserções não são sobre números bonitos, e sim sobre regras: a Súmula 231
// na segunda fase, a preponderância do art. 42 na primeira, e a terceira fase
// podendo cair abaixo do mínimo — que é justamente o que faz o § 4º valer a pena
// no tráfico.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { NORMALIZADO, seComCorpus } from './corpus.ts'

import {
  CRIMES,
  CRIME_PADRAO,
  ENTRADA_NEUTRA,
  ENTRADA_PADRAO,
  MAXIMO,
  MINIMO,
  PREPONDERANTE,
  VETORES,
  calcula,
  crimeDaPergunta,
  dosavel,
  leDaConversa,
  memorialDe,
  meses,
  porVetor,
  type EntradaDosimetria,
  type Peso,
} from '@/lib/toga/dosimetria'

/** Entrada limpa: nenhum vetor negativo, nenhuma agravante, nenhuma causa. */
const neutra = (): EntradaDosimetria => ({
  vetores: Array(VETORES.length).fill('neutra') as Peso[],
  agravantes: { menoridade: false, confissao: false, reincidencia: false },
  causas: { privilegiado: false, proximidade: false, tentativa: false },
})

describe('primeira fase', () => {
  it('sem circunstância desfavorável, a pena-base é o mínimo legal', () => {
    expect(calcula(neutra()).base).toBe(MINIMO)
  })

  it('cada circunstância desfavorável soma um oitavo do intervalo', () => {
    const e = neutra()
    e.vetores[0] = 'desf'
    // 60 + (180-60)/8 = 75
    expect(calcula(e).base).toBe(75)
  })

  it('o art. 42 pesa o dobro — é o que "preponderância" significa aqui', () => {
    const comum = neutra()
    comum.vetores[0] = 'desf'

    const art42 = neutra()
    art42.vetores[PREPONDERANTE] = 'desf'

    expect(calcula(art42).base - MINIMO).toBe((calcula(comum).base - MINIMO) * 2)
  })

  it('a pena-base nunca passa do máximo legal', () => {
    const e = neutra()
    e.vetores = e.vetores.map(() => 'desf') as Peso[]
    expect(calcula(e).base).toBe(MAXIMO)
  })
})

describe('segunda fase — Súmula 231/STJ', () => {
  it('atenuante não leva a pena abaixo do mínimo', () => {
    const e = neutra()
    e.agravantes.confissao = true
    // Base já está no mínimo; a atenuante não pode descer dali.
    expect(calcula(e).provisoria).toBe(MINIMO)
  })

  it('duas atenuantes também não furam o piso', () => {
    const e = neutra()
    e.agravantes.confissao = true
    e.agravantes.menoridade = true
    expect(calcula(e).provisoria).toBe(MINIMO)
  })

  it('a atenuante reduz de fato quando há espaço acima do mínimo', () => {
    const e = neutra()
    e.vetores[0] = 'desf' // base 75
    e.agravantes.confissao = true
    expect(calcula(e).provisoria).toBeCloseTo(75 * (5 / 6), 5)
  })

  it('agravante não passa do teto', () => {
    const e = neutra()
    e.vetores = e.vetores.map(() => 'desf') as Peso[] // base no máximo
    e.agravantes.reincidencia = true
    expect(calcula(e).provisoria).toBe(MAXIMO)
  })
})

describe('terceira fase', () => {
  it('causa de diminuição PODE levar abaixo do mínimo — a Súmula 231 não a alcança', () => {
    const e = neutra()
    e.causas.privilegiado = true
    const c = calcula(e)
    expect(c.definitiva).toBeLessThan(MINIMO)
    expect(c.abaixoDoMinimo).toBe(true)
  })

  it('a redução de dois terços do § 4º deixa um terço da provisória', () => {
    const e = neutra()
    e.causas.privilegiado = true
    expect(calcula(e).definitiva).toBe(Math.round(MINIMO / 3))
  })
})

describe('regime inicial', () => {
  it('acompanha as faixas do art. 33, § 2º, do Código Penal', () => {
    const so = (definitivaAlvo: 'aberto' | 'semiaberto' | 'fechado') => definitivaAlvo

    // Privilegiado sobre o mínimo: 20 meses -> aberto
    const leve = neutra()
    leve.causas.privilegiado = true
    expect(calcula(leve).regime).toBe(so('aberto'))

    // Sem redução, no mínimo: 60 meses (5 anos) -> semiaberto
    expect(calcula(neutra()).regime).toBe(so('semiaberto'))

    // Todos os vetores negativos: 180 meses -> fechado
    const grave = neutra()
    grave.vetores = grave.vetores.map(() => 'desf') as Peso[]
    expect(calcula(grave).regime).toBe(so('fechado'))
  })
})

describe('leitura da conversa', () => {
  it('não inventa: pergunta sem fato de dosimetria não muda nada', () => {
    const { entrada, chips } = leDaConversa('qual a diferença entre dolo e culpa?')
    expect(chips).toEqual([])
    expect(entrada).toEqual(ENTRADA_NEUTRA)
  })

  // A leitura partia de `ENTRADA_PADRAO`, que traz confissão e privilégio
  // ligados — e o cartão do chat mostrava 1a 8m para quem não disse nenhum dos
  // dois. Na ferramenta a suposição é visível e se desliga; no cartão, não.
  it('não supõe confissão nem privilégio em pergunta que não os menciona', () => {
    const { entrada } = leDaConversa('quanto pega quem é pego com droga?')
    expect(entrada.agravantes.confissao).toBe(false)
    expect(entrada.causas.privilegiado).toBe(false)
    expect(calcula(entrada).definitiva).toBe(MINIMO)
  })

  it('o padrão da ferramenta continua sendo o cenário visível, e não o neutro', () => {
    expect(ENTRADA_PADRAO.agravantes.confissao).toBe(true)
    expect(ENTRADA_PADRAO.causas.privilegiado).toBe(true)
    expect(ENTRADA_NEUTRA).not.toEqual(ENTRADA_PADRAO)
  })
})

// A calculadora dosa o art. 33 e mais nada. O cartão aparecia sob toda resposta,
// e desde que a busca alcançou o art. 157 e o art. 217-A isso virou pena de um
// crime exibida sob a resposta de outro.
describe('a que pergunta a calculadora se aplica', () => {
  it('não dosa crime que não é o art. 33', () => {
    expect(dosavel('estupro de vulnerável, qual a pena?')).toBe(false)
    expect(dosavel('pena para porte de muitas armas')).toBe(false)
    expect(dosavel('roubo majorado por concurso de agentes')).toBe(false)
    expect(dosavel('requisitos da busca domiciliar sem mandado judicial')).toBe(false)
  })

  it('dosa a pergunta de tráfico mesmo sem palavra de cálculo', () => {
    expect(dosavel('o que caracteriza o tráfico privilegiado do art. 33, § 4º?')).toBe(true)
    expect(dosavel('apreensão de 3 kg de cocaína em rodovia')).toBe(true)
    expect(dosavel('associação para o tráfico e concurso de pessoas')).toBe(true)
  })

  // Caso de tráfico se descreve por quantidade, e este é o exemplo que a suíte
  // usa desde sempre para provar que a leitura muda o resultado: sem o peso na
  // lista, ele ficava sem cartão nenhum.
  // "cabe o privilegiado?" é pergunta de tráfico sem a palavra tráfico — e o
  // furto tem o privilégio dele, no art. 155, § 2º. A palavra que conserta um
  // caso estragaria o outro sem a guarda de crime alheio.
  it('privilégio é do tráfico aqui, mas não quando a pergunta nomeia outro crime', () => {
    expect(dosavel('cabe o privilegiado para réu primário?')).toBe(true)
    expect(dosavel('furto privilegiado, art. 155, § 2º')).toBe(false)
    expect(dosavel('roubo privilegiado existe?')).toBe(false)
  })

  it('quantidade descreve o caso quando a palavra não aparece', () => {
    expect(dosavel('réu reincidente com 3 kg perto de escola')).toBe(true)
    expect(dosavel('pego com 500 gramas na mochila')).toBe(true)
  })

  // Art. 28 não tem pena de prisão: dosar 5 a 15 anos sobre ele erra mais feio
  // do que sobre um crime de outra lei.
  it('porte para consumo não é tráfico', () => {
    expect(dosavel('porte de droga para consumo pessoal')).toBe(false)
    expect(dosavel('quando o porte para consumo vira tráfico?')).toBe(true)
  })

  it('reconhece reincidência e desliga o privilégio, que a lei veda ao reincidente', () => {
    const { entrada, chips } = leDaConversa('réu reincidente pego com droga')
    expect(chips).toContain('Reincidente')
    expect(entrada.agravantes.reincidencia).toBe(true)
    expect(entrada.causas.privilegiado).toBe(false)
  })

  // O reconhecimento era por termo solto: "o réu NÃO é reincidente" ligava a
  // reincidência, que agrava a pena E desliga o § 4º. O erro tem a pior direção
  // possível — vira o fato favorável escrito no desfavorável negado.
  it('não lê como fato o termo que a pergunta nega', () => {
    const negada = leDaConversa('o réu não é reincidente, cabe o § 4º do tráfico?')
    expect(negada.entrada.agravantes.reincidencia).toBe(false)
    expect(negada.chips).not.toContain('Reincidente')

    const sem = leDaConversa('tráfico com réu sem maus antecedentes')
    expect(sem.entrada.vetores[1]).not.toBe('desf')
  })

  // A janela da negação não atravessa pontuação forte: são duas afirmações, e a
  // segunda vale por si.
  it('a negação para no ponto final', () => {
    const { entrada } = leDaConversa('não cabe o § 4º. Réu reincidente no tráfico')
    expect(entrada.agravantes.reincidencia).toBe(true)
  })

  it('lê a tentativa escrita no feminino', () => {
    expect(leDaConversa('tráfico na forma tentada').entrada.causas.tentativa).toBe(true)
    expect(leDaConversa('tráfico tentado').entrada.causas.tentativa).toBe(true)
  })

  it('reconhece quantidade expressiva no vetor do art. 42', () => {
    const { entrada } = leDaConversa('apreensão de 3 kg de cocaína')
    expect(entrada.vetores[PREPONDERANTE]).toBe('desf')
  })

  it('o que é lido muda o resultado — a leitura não é decorativa', () => {
    const nada = calcula(leDaConversa('o que diz o art. 33?').entrada)
    const grave = calcula(leDaConversa('réu reincidente com 3 kg perto de escola').entrada)
    expect(grave.definitiva).toBeGreaterThan(nada.definitiva)
  })
})

describe('formatação', () => {
  it('escreve anos e meses como peça escreve', () => {
    expect(meses(60)).toBe('5 anos')
    expect(meses(12)).toBe('1 ano')
    expect(meses(74)).toBe('6a 2m')
    expect(meses(1)).toBe('1 mês')
    expect(meses(11)).toBe('11 meses')
  })
})

/**
 * O memorial existe porque o botão que o oferecia não o produzia: acendia
 * "Gerando memorial…" por 1400 ms e passava a "Memorial pronto ✓" sem gerar
 * nada. Estas asserções são o que impede a volta do teatro — um memorial que
 * não repita os números da conta é indistinguível de texto fixo.
 */
describe('memorial de cálculo', () => {
  it('imprime as três fases com os números que `calcula` devolveu', () => {
    const e = neutra()
    const c = calcula(e)
    const m = memorialDe(e, c)

    expect(m).toContain('1ª FASE')
    expect(m).toContain('2ª FASE')
    expect(m).toContain('3ª FASE')
    expect(m).toContain(meses(c.base))
    expect(m).toContain(meses(c.provisoria))
    expect(m).toContain(meses(c.definitiva))
    expect(m).toContain(`${c.multa} dias-multa`)
  })

  it('acompanha a entrada em vez de ser texto fixo', () => {
    const leve = neutra()
    const grave = neutra()
    grave.vetores = grave.vetores.map(() => 'desf') as Peso[]
    expect(memorialDe(grave)).not.toBe(memorialDe(leve))
  })

  it('nomeia o art. 42 só quando a droga pesou de verdade', () => {
    const semDroga = neutra()
    const comDroga = neutra()
    comDroga.vetores[PREPONDERANTE] = 'desf'

    expect(memorialDe(comDroga)).toContain('art. 42')
    expect(memorialDe(semDroga)).not.toContain('preponderam')
  })

  it('avisa quando a pena caiu abaixo do mínimo, e só então', () => {
    const comPrivilegio = neutra()
    comPrivilegio.causas = { ...comPrivilegio.causas, privilegiado: true }
    const c = calcula(comPrivilegio)

    // A frase conferida é a da terceira fase, e não "abaixo do mínimo legal"
    // solto: a linha da Súmula 231 usa as mesmas palavras para dizer o oposto
    // ("a pena provisória NÃO desce abaixo do mínimo"), e uma asserção frouxa
    // passaria nos dois casos sem distinguir nada.
    expect(c.abaixoDoMinimo).toBe(true)
    expect(memorialDe(comPrivilegio, c)).toContain('A pena definitiva ficou abaixo do mínimo legal')
    expect(memorialDe(neutra())).not.toContain('A pena definitiva ficou abaixo do mínimo legal')
  })

  it('diz que é calculadora, não parecer — a mesma ressalva da tela', () => {
    expect(memorialDe(neutra())).toContain('Calculadora, não parecer')
  })
})

// --- os cinco crimes ---------------------------------------------------------

/**
 * As faixas não são conferidas contra a memória de quem escreveu a tabela.
 *
 * Cada `Crime` carrega o id do artigo no corpus, e estas asserções leem o
 * preceito secundário do texto normalizado — "Pena – reclusão, de 3 (três) a 10
 * (dez) anos, e pagamento de 700 (setecentos) a 1.200 (mil e duzentos)
 * dias-multa" — e comparam com o que a tabela afirma.
 *
 * É o desenho de `tests/citacao.test.ts` aplicado a número em vez de id: faixa
 * errada numa dosimetria tem o mesmo tamanho de gravidade que citação quebrada
 * numa peça, e a resposta do projeto para as duas é a mesma — um teste que
 * quebra antes de alguém protocolar.
 *
 * Pulado em clone sem `data/normalizado/`, como as outras quatro suítes.
 */
describe('a tabela de crimes bate com o texto da lei', () => {
  seComCorpus('as cinco faixas de pena e de multa saem do corpus', () => {
    const bruto = readFileSync(resolve(NORMALIZADO, 'lei_11343_2006.json'), 'utf8')
    const corpus = JSON.parse(bruto) as {
      dispositivos: { artigo_id: string; tipo: string; texto: string }[]
    }

    for (const crime of CRIMES) {
      const caput = corpus.dispositivos.find(
        (d) => d.artigo_id === crime.artigo && d.tipo === 'caput',
      )
      expect(caput, `${crime.artigo} não está no corpus`).toBeDefined()

      const texto = caput!.texto.replace(/\s+/g, ' ')
      // A vírgula depois de "reclusão" está no art. 34 ao 37 e NÃO está no art.
      // 33 — o preceito secundário não é escrito igual em toda a lei. Foi o
      // teste que mostrou isso, e é o argumento de ler do texto em vez de
      // digitar de memória: a diferença passaria batida em qualquer revisão.
      const pena = /reclusão,? de (\d+) \([^)]+\) a (\d+) \([^)]+\) anos/.exec(texto)
      expect(pena, `sem faixa de pena legível em ${crime.artigo}`).not.toBeNull()
      expect(Number(pena![1]) * 12).toBe(crime.minimo)
      expect(Number(pena![2]) * 12).toBe(crime.maximo)

      const multa = /pagamento de ([\d.]+) \([^)]+\) a ([\d.]+) \([^)]+\) dias-multa/.exec(texto)
      expect(multa, `sem faixa de multa legível em ${crime.artigo}`).not.toBeNull()
      const numero = (t: string | undefined) => Number((t ?? '').replace(/\./g, ''))
      expect(numero(multa![1])).toBe(crime.multaMinima)
      expect(numero(multa![2])).toBe(crime.multaMaxima)
    }
  })

  // O § 4º diz "nos delitos definidos no caput e no § 1º DESTE artigo". A
  // restrição é do texto, não de jurisprudência, e é o que a coluna guarda.
  it('só o art. 33 admite o § 4º', () => {
    expect(CRIME_PADRAO.privilegio).toBe(true)
    for (const c of CRIMES.filter((x) => x !== CRIME_PADRAO)) {
      expect(c.privilegio, `${c.citacao} não pode admitir o § 4º`).toBe(false)
    }
  })

  it('a redução do § 4º é recusada no cálculo, e não só na tela', () => {
    const associacao = CRIMES.find((c) => c.citacao === 'art. 35')!
    const entrada = {
      ...ENTRADA_NEUTRA,
      causas: { ...ENTRADA_NEUTRA.causas, privilegiado: true },
    }
    // Entrada montada em código, como a do cartão do chat: a tela pode esconder
    // a chave, e ainda assim a conta não pode aplicar a redução.
    expect(calcula(entrada, associacao).definitiva).toBe(associacao.minimo)
    expect(calcula(entrada, CRIME_PADRAO).definitiva).toBeLessThan(CRIME_PADRAO.minimo)
  })

  it('a régua de um oitavo é a do intervalo de cada crime', () => {
    expect(porVetor(CRIME_PADRAO)).toBe(15)
    const informante = CRIMES.find((c) => c.citacao === 'art. 37')!
    expect(porVetor(informante)).toBe(6)
  })

  it('a multa anda entre o mínimo e o máximo do próprio artigo', () => {
    const informante = CRIMES.find((c) => c.citacao === 'art. 37')!
    const todosNegativos = {
      ...ENTRADA_NEUTRA,
      vetores: ENTRADA_NEUTRA.vetores.map(() => 'desf') as Peso[],
    }
    expect(calcula(ENTRADA_NEUTRA, informante).multa).toBe(informante.multaMinima)
    expect(calcula(todosNegativos, informante).multa).toBe(informante.multaMaxima)
  })

  it('lê o crime da pergunta, e na dúvida fica no art. 33', () => {
    expect(crimeDaPergunta('associação para o tráfico, qual a pena?').citacao).toBe('art. 35')
    expect(crimeDaPergunta('financiamento do tráfico').citacao).toBe('art. 36')
    expect(crimeDaPergunta('olheiro do tráfico responde por quê?').citacao).toBe('art. 37')
    expect(crimeDaPergunta('maquinário para preparar droga').citacao).toBe('art. 34')
    expect(crimeDaPergunta('tráfico privilegiado, 3 kg').citacao).toBe('art. 33')
    expect(crimeDaPergunta('quanto pega quem é pego com droga?').citacao).toBe('art. 33')
  })

  it('não oferece o § 4º nem como fato lido quando o crime não o admite', () => {
    const { entrada, chips, crime } = leDaConversa(
      'associação para o tráfico, réu primário — cabe o privilegiado?',
    )
    expect(crime.citacao).toBe('art. 35')
    expect(entrada.causas.privilegiado).toBe(false)
    expect(chips).not.toContain('Tráfico privilegiado · § 4º')
  })

  it('o memorial nomeia o artigo dosado e a faixa dele', () => {
    const associacao = CRIMES.find((c) => c.citacao === 'art. 35')!
    const texto = memorialDe(ENTRADA_NEUTRA, calcula(ENTRADA_NEUTRA, associacao), associacao)
    expect(texto).toContain('Art. 35 da Lei nº 11.343/2006')
    expect(texto).toContain('de 3 a 10 anos')
    expect(texto).toContain('700 a 1.200')
    // A restrição do § 4º sai do crime, não da chave marcada: é afirmação
    // sobre o artigo dosado, e a primeira pergunta de quem lê a conta.
    expect(texto).toContain('não incide sobre o art. 35')
  })

  it('o memorial do tráfico continua dizendo caput, e não anuncia restrição', () => {
    const texto = memorialDe(ENTRADA_NEUTRA, calcula(ENTRADA_NEUTRA), CRIME_PADRAO)
    expect(texto).toContain('Art. 33, caput, da Lei nº 11.343/2006')
    expect(texto).not.toContain('não incide')
  })
})
