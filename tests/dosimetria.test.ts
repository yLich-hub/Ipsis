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

import { describe, expect, it } from 'vitest'

import {
  ENTRADA_PADRAO,
  MAXIMO,
  MINIMO,
  PREPONDERANTE,
  VETORES,
  calcula,
  leDaConversa,
  memorialDe,
  meses,
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
    expect(entrada).toEqual(ENTRADA_PADRAO)
  })

  it('reconhece reincidência e desliga o privilégio, que a lei veda ao reincidente', () => {
    const { entrada, chips } = leDaConversa('réu reincidente pego com droga')
    expect(chips).toContain('Reincidente')
    expect(entrada.agravantes.reincidencia).toBe(true)
    expect(entrada.causas.privilegiado).toBe(false)
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
