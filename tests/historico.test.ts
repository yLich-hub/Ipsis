// =============================================================================
// Agrupamento e título do histórico.
//
// `agrupa` e `tituloDe` são funções puras — não tocam o banco — e são as duas
// que decidem se uma lista de 200 conversas é navegável ou uma parede de linhas
// iguais. Por isso estão aqui; o resto de `historico.ts` fala com o Supabase e é
// verificado contra o banco de verdade, não em teste offline.
// =============================================================================

import { describe, expect, it } from 'vitest'

import { agrupa, tituloDe, type Conversa } from '@/lib/toga/historico'

/** Uma conversa mínima, com a data que o agrupamento vai ler. */
const em = (iso: string, titulo = 't'): Conversa => ({
  id: iso,
  titulo,
  criadaEm: iso,
  atualizadaEm: iso,
  trocas: 1,
})

// Meio-dia para os testes não dependerem do fuso virar o dia.
const AGORA = new Date('2026-03-15T12:00:00')

describe('agrupamento por faixa de tempo', () => {
  it('separa hoje, ontem e as duas janelas seguintes', () => {
    const g = agrupa(
      [
        em('2026-03-15T09:00:00'), // hoje
        em('2026-03-14T22:00:00'), // ontem
        em('2026-03-11T10:00:00'), // dentro de 7 dias
        em('2026-02-25T10:00:00'), // dentro de 30 dias
        em('2025-11-02T10:00:00'), // mês nomeado
      ],
      AGORA,
    )
    expect(g.map((x) => x.rotulo)).toEqual([
      'Hoje',
      'Ontem',
      'Últimos 7 dias',
      'Últimos 30 dias',
      'novembro de 2025',
    ])
  })

  it('junta no mesmo grupo tudo que cai na mesma faixa', () => {
    const g = agrupa(
      [em('2026-03-15T09:00:00'), em('2026-03-15T08:00:00'), em('2026-03-15T07:00:00')],
      AGORA,
    )
    expect(g).toHaveLength(1)
    expect(g[0]!.itens).toHaveLength(3)
  })

  it('preserva a ordem recebida — quem ordena é a consulta, não o agrupamento', () => {
    const g = agrupa(
      [em('2026-03-15T09:00:00', 'nova'), em('2026-03-15T07:00:00', 'velha')],
      AGORA,
    )
    expect(g[0]!.itens.map((c) => c.titulo)).toEqual(['nova', 'velha'])
  })

  it('o ano acompanha o mês — "março" sozinho vira ambíguo no segundo ano', () => {
    const g = agrupa([em('2025-03-10T10:00:00'), em('2024-03-10T10:00:00')], AGORA)
    expect(g.map((x) => x.rotulo)).toEqual(['março de 2025', 'março de 2024'])
  })

  it('lista vazia não gera grupo vazio', () => {
    expect(agrupa([], AGORA)).toEqual([])
  })
})

describe('título da conversa', () => {
  it('mantém pergunta curta como está', () => {
    expect(tituloDe('Tráfico privilegiado')).toBe('Tráfico privilegiado')
  })

  it('corta em palavra inteira, não no meio dela', () => {
    const t = tituloDe('Requisitos da busca domiciliar sem mandado judicial no caso de flagrante', 40)
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(41)
    // O corte não pode partir a última palavra ao meio.
    expect(t.replace('…', '').trimEnd().split(' ').pop()).not.toBe('judicia')
  })

  it('normaliza espaço e quebra de linha', () => {
    expect(tituloDe('  tráfico\n\n  privilegiado  ')).toBe('tráfico privilegiado')
  })
})
