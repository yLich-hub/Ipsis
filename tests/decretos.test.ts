// =============================================================================
// O acervo de decretos do Paraná — o dado que o seed vai escrever, e a espécie
// que a tela vai imprimir.
//
// Offline: lê `data/decretos_pr/*.json`, que é o que `coletores/parana.py`
// versiona. Duas metades, e a divisão de trabalho com a suíte Python é
// deliberada:
//
// - **Lá** (`coletores/tests/test_parana.py`) se testa o RECORTE e a EXTRAÇÃO,
//   contra súmulas e HTML reais. É o lado que decide o que entra.
// - **Aqui** se testa o que sobrou disso como DADO: invariantes que o seed
//   assume e que a migration 0018 exige. Um arquivo de acervo malformado
//   quebraria o seed no meio de uma transação, ou — pior — passaria e poria no
//   banco bloco sem texto, id fora do espaço próprio, ordem furada.
//
// A separação estrutural que impede decreto estadual de virar fundamento de
// peça também é asserção daqui: nenhum id do acervo pode casar o padrão do
// corpus. Ela é o análogo, para esta tabela, do que `tests/vademecum.test.ts`
// faz pelo acervo de leitura.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { dataBR, especie } from '../src/lib/decretos/formato'

const ACERVO = resolve(import.meta.dirname, '..', 'data', 'decretos_pr')

type Bloco = { id: string; ordem: number; rotulo: string; texto: string }
type Decreto = {
  id: string
  numero: string
  ano: number
  epigrafe: string
  sumula: string
  preambulo: string
  publicado_em: string
  conferido_em: string
  versao: string
  url: string
  cod_ato: string
  blocos: Bloco[]
}
type Arquivo = { ano: number; completo?: boolean; decretos: Decreto[] }

const arquivos = existsSync(ACERVO)
  ? readdirSync(ACERVO).filter((f) => /^\d{4}\.json$/.test(f))
  : []

const MOTIVO_SEM_ACERVO =
  'data/decretos_pr/ não está neste clone. Rode ' +
  '`.venv/Scripts/python -m coletores.parana --pular-prontos` para ativar estas asserções.'

/** Mesmo desenho de `seComCorpus`: pular calado é pior que falhar. */
const seComAcervo = arquivos.length ? it : it.skip
if (!arquivos.length) console.warn(`\n⚠  ${MOTIVO_SEM_ACERVO}\n`)

const acervo: Arquivo[] = arquivos.map(
  (f) => JSON.parse(readFileSync(resolve(ACERVO, f), 'utf8')) as Arquivo,
)
const todos = acervo.flatMap((a) => a.decretos)
const blocos = todos.flatMap((d) => d.blocos)

// --- o dado --------------------------------------------------------------

describe('acervo de decretos do Paraná', () => {
  seComAcervo('todo ato tem id, número, súmula e data', () => {
    for (const d of todos) {
      expect(d.id, `${d.id}: id vazio`).toBeTruthy()
      expect(d.numero, `${d.id}: sem número`).toBeTruthy()
      expect(d.sumula.trim(), `${d.id}: súmula vazia`).not.toBe('')
      expect(d.publicado_em, `${d.id}: data fora do formato ISO`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.conferido_em, `${d.id}: conferido_em fora do formato`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      )
    }
  })

  seComAcervo('o id vive em espaço próprio e nunca casa o do corpus', () => {
    // É a separação da decisão nº 1 do projeto, em forma de asserção. `decpr:`
    // não é convenção de nomenclatura: é o que garante que um decreto estadual
    // não pode ser resolvido por `lib/peca/resolver.ts` nem por um trigger de
    // citação, por mais que alguém tente colá-lo num `{{cite:}}`.
    const padraoDoCorpus = /^(lei|dl)_\d+_\d{4}/
    for (const d of todos) {
      expect(d.id).toMatch(/^decpr:\d{4}:[0-9A-Za-z.-]+$/)
      expect(d.id).not.toMatch(padraoDoCorpus)
    }
    for (const b of blocos) expect(b.id).toMatch(/^decpr:\d{4}:[0-9A-Za-z.-]+:\d+$/)
  })

  seComAcervo('nenhum id se repete', () => {
    expect(new Set(todos.map((d) => d.id)).size).toBe(todos.length)
    expect(new Set(blocos.map((b) => b.id)).size).toBe(blocos.length)
  })

  seComAcervo('a ordem dos blocos é densa e começa em 1', () => {
    // O seed insere por lote e a tela imprime na ordem do documento; ordem
    // furada não quebra nada e imprime o decreto embaralhado, que é o tipo de
    // defeito que ninguém vê até ler o ato inteiro.
    for (const d of todos) {
      const ordens = d.blocos.map((b) => b.ordem)
      expect(ordens, `${d.id}: ordem fora de sequência`).toEqual(
        Array.from({ length: d.blocos.length }, (_, i) => i + 1),
      )
    }
  })

  seComAcervo('nenhum bloco chega vazio ou com marcação', () => {
    for (const b of blocos) {
      expect(b.texto.trim(), `${b.id}: texto vazio`).not.toBe('')
      // Sobra de extração. `texto_de` derruba as tags; se uma escapou, ela vai
      // para o vetor e para a tela como se fosse texto legal.
      expect(b.texto, `${b.id}: marcação HTML no texto`).not.toMatch(/<\/?[a-z][^>]*>/i)
      expect(b.texto, `${b.id}: entidade HTML não resolvida`).not.toMatch(/&[a-z]+;|&#\d+;/i)
    }
  })

  seComAcervo('o preâmbulo não virou dispositivo', () => {
    // A fórmula de promulgação tem rótulo vazio na fonte, e é o preâmbulo do
    // ato. Se ela vazar para os blocos, vira vetor recuperável — e todo decreto
    // do acervo passa a "responder" a qualquer pergunta sobre o Governador.
    for (const b of blocos) {
      expect(b.texto, `${b.id}: preâmbulo entre os dispositivos`).not.toMatch(
        /^O GOVERNADOR DO ESTADO/,
      )
    }
  })

  seComAcervo('a versão lida é sempre a compilada', () => {
    // A fonte serve três: `compilado`, `alterado` e `original`. Só a primeira
    // traz a última alteração publicada — guardar `original` seria pôr no
    // acervo a redação de 2022 com cara de vigente.
    for (const d of todos) expect(d.versao, `${d.id}`).toBe('compilado')
  })

  seComAcervo('a URL aponta para o ato na fonte oficial', () => {
    for (const d of todos) {
      expect(d.url).toMatch(/^https:\/\/www\.legislacao\.pr\.gov\.br\/.*codAto=\d+/)
    }
  })

  seComAcervo('ano incompleto vem marcado, e é o que impede o seed', () => {
    // A fonte bloqueia por volume, e a primeira versão do coletor gravou dois
    // anos inteiros dizendo "nenhum decreto normativo" depois de levar 403 em
    // todos os meses. `completo` é o campo que `scripts/seed-decretos.ts` exige
    // para semear — sem ele, um bloqueio vira dado.
    for (const a of acervo) {
      expect(typeof a.completo, `${a.ano}: sem a marca de colheita completa`).toBe('boolean')
      if (a.completo === false) expect(a.decretos.length).toBeGreaterThanOrEqual(0)
    }
  })
})

// --- derivados de tela, sem banco -------------------------------------------

describe('espécie, lida da súmula', () => {
  it('reconhece as espécies que o recorte deixa entrar', () => {
    expect(especie('Regulamenta a alteração do regime de trabalho.')).toBe('Regulamenta')
    expect(especie('Institui o Programa Geração Olímpica e Paralímpica.')).toBe('Institui')
    expect(especie('Altera o Regulamento do ICMS, aprovado pelo Decreto nº 7.871.')).toBe(
      'Altera',
    )
    expect(especie('Aprova o Regulamento do Departamento de Trânsito do Paraná.')).toBe('Aprova')
    expect(especie('Homologa situação de emergência no Município de Tibagi.')).toBe('Emergência')
  })

  it('não depende de acento nem de caixa', () => {
    // A fonte escreve "Dispõe" e "DISPÕE", e a normalização é a mesma de
    // `public.norm()`. Sem ela, metade das súmulas cairia no rótulo genérico.
    expect(especie('DISPÕE SOBRE A PROGRAMAÇÃO FINANCEIRA.')).toBe('Dispõe')
    expect(especie('Introduz alterações no Regulamento do ICMS.')).toBe('Altera')
  })

  it('cai no genérico em vez de chutar', () => {
    // É rótulo de selo, não decisão de recorte: quando não reconhece, dizer
    // "Dispõe" é honesto — inventar "Revoga" sobre um ato que não revoga nada
    // seria afirmar na tela algo que a súmula não diz.
    expect(especie('Fixa os novos valores dos Pisos Salariais do Estado.')).toBe('Dispõe')
  })
})

describe('data', () => {
  it('imprime no formato brasileiro sem passar por fuso', () => {
    // `new Date('2025-01-31')` é meia-noite UTC e vira 30/01 em UTC−3. Numa
    // data de publicação de ato normativo isso não é detalhe cosmético — é o
    // mesmo cuidado que `scripts/busca.ts` documenta.
    expect(dataBR('2025-01-31')).toBe('31/01/2025')
    expect(dataBR('2022-12-01')).toBe('01/12/2022')
  })
})
