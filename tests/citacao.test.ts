// =============================================================================
// Citação quebrada é erro de compilação, não erro em audiência.
//
// Este é o teste que a decisão nº 1 do CLAUDE.md exige: todo `{{cite:id}}` e
// todo id de `fundamentos`/`imputacao` da curadoria tem de resolver para um
// dispositivo que existe. Uma minuta que cita dispositivo inexistente é uma peça
// que vai a juízo com fundamento vazio.
//
// Por que validar contra `data/normalizado/` e não contra o banco: teste tem de
// rodar no CI sem rede e sem segredo. O normalizado é a mesma fonte que o seed
// escreve, então concordar com ele é concordar com o banco. Os triggers
// `valida_ids_dispositivo` e `valida_citacoes` são a segunda camada, na
// escrita; este teste é a primeira, antes do build.
//
// **Não relaxar este teste.** Se um id deixar de existir, a correção é a
// curadoria ou o corpus — nunca afrouxar a asserção.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { CURADORIA, NORMALIZADO, seComCorpus, temCorpus } from './corpus.ts'

// --- fontes ------------------------------------------------------------------

/**
 * Ids de dispositivo que realmente existem, lidos da saída do normalize.
 *
 * Devolve conjunto vazio quando `data/normalizado/` não está no clone — sem
 * isso, `readdirSync` levanta ENOENT durante a COLETA do vitest e o arquivo
 * inteiro fica vermelho antes de qualquer asserção rodar. Quem depende do
 * corpus é pulado por `seComCorpus`; quem não depende continua valendo.
 */
function idsDoCorpus(): Set<string> {
  const ids = new Set<string>()
  if (!temCorpus) return ids
  for (const arq of readdirSync(NORMALIZADO)) {
    if (!arq.endsWith('.json') || arq === 'relatorio.json') continue
    const doc = JSON.parse(readFileSync(resolve(NORMALIZADO, arq), 'utf8')) as {
      dispositivos?: { id: string }[]
    }
    for (const d of doc.dispositivos ?? []) ids.add(d.id)
  }
  return ids
}

function leYaml<T>(nome: string): T[] | null {
  const f = resolve(CURADORIA, nome)
  if (!existsSync(f)) return null
  return (parseYaml(readFileSync(f, 'utf8')) ?? []) as T[]
}

type Tese = {
  id: string
  nome: string
  ordem: number
  fundamentos: string[]
  gatilho: Record<string, unknown>
  template_md: string
  jurisprudencia?: { tribunal?: string; tese?: string }[]
}

type Caso = {
  id: string
  ordem: number
  imputacao: string[]
  fatos: Record<string, unknown>
}

type RubricaCurada = {
  slug: string
  termo: string
  variantes?: string[]
  dispositivos: { id: string }[]
}

const CORPUS = idsDoCorpus()
const TESES = leYaml<Tese>('teses.yaml')
const CASOS = leYaml<Caso>('casos.yaml')
const RUBRICAS = leYaml<RubricaCurada>('rubricas.yaml')

/**
 * Mesmo padrão do trigger `valida_citacoes`, para não divergirem.
 *
 * O hífen é obrigatório: artigo com sufixo de letra vira `art396-a`, `art3-a`,
 * `art28-a`. Sem ele no conjunto, `{{cite:dl_3689_1941_art396-a_caput}}` — a
 * citação do artigo que dá nome à peça inteira — simplesmente não era vista
 * por este teste nem pelo trigger, e uma citação quebrada para artigo sufixado
 * passaria em silêncio pelas duas camadas. Corrigido no banco por 0006.
 */
const CITE = /\{\{cite:([a-z0-9_-]+)\}\}/g

const citacoesDe = (md: string) => [...md.matchAll(CITE)].map((m) => m[1]!)

// --- o corpus existe ---------------------------------------------------------

describe('corpus', () => {
  seComCorpus('data/normalizado/ tem dispositivos', () => {
    expect(CORPUS.size).toBeGreaterThan(0)
  })
})

// --- teses -------------------------------------------------------------------

describe('teses.yaml', () => {
  it('existe', () => {
    expect(TESES, 'data/curadoria/teses.yaml não encontrado').not.toBeNull()
  })

  seComCorpus('todo {{cite:}} resolve para um dispositivo do corpus', () => {
    const quebradas: string[] = []
    for (const t of TESES ?? []) {
      for (const id of citacoesDe(t.template_md)) {
        if (!CORPUS.has(id)) quebradas.push(`${t.id}: {{cite:${id}}}`)
      }
    }
    expect(quebradas, `citações órfãs:\n  ${quebradas.join('\n  ')}`).toEqual([])
  })

  seComCorpus('todo fundamento resolve para um dispositivo do corpus', () => {
    const quebrados: string[] = []
    for (const t of TESES ?? []) {
      for (const id of t.fundamentos ?? []) {
        if (!CORPUS.has(id)) quebrados.push(`${t.id}: ${id}`)
      }
    }
    expect(quebrados, `fundamentos órfãos:\n  ${quebrados.join('\n  ')}`).toEqual([])
  })

  it('toda tese tem ao menos um fundamento (constraint teses_fundamentos_ck)', () => {
    const vazias = (TESES ?? []).filter((t) => !t.fundamentos?.length).map((t) => t.id)
    expect(vazias).toEqual([])
  })

  it('ids e ordens são únicos', () => {
    const ids = (TESES ?? []).map((t) => t.id)
    expect(new Set(ids).size, `id repetido em teses.yaml`).toBe(ids.length)
    const ordens = (TESES ?? []).map((t) => t.ordem)
    expect(new Set(ordens).size, `ordem repetida em teses.yaml`).toBe(ordens.length)
  })

  it('todo fundamento aparece citado no template, e vice-versa', () => {
    // Fundamento que o template não cita é fundamento decorativo: aparece na
    // ficha da tese e some da minuta. Citação sem fundamento correspondente é o
    // contrário — texto legal na peça que a tese não declara usar.
    const divergencias: string[] = []
    for (const t of TESES ?? []) {
      const citados = new Set(citacoesDe(t.template_md))
      const declarados = new Set(t.fundamentos ?? [])
      for (const id of declarados) {
        if (!citados.has(id)) divergencias.push(`${t.id}: fundamento ${id} não é citado no template`)
      }
      for (const id of citados) {
        if (!declarados.has(id)) divergencias.push(`${t.id}: {{cite:${id}}} não está em fundamentos`)
      }
    }
    expect(divergencias, divergencias.join('\n  ')).toEqual([])
  })

  it('nenhuma entrada de jurisprudência é anônima', () => {
    // Entendimento consolidado sem tribunal identificado não é verificável, e
    // não verificável em peça criminal é pior que ausente.
    const anonimas: string[] = []
    for (const t of TESES ?? []) {
      for (const [i, j] of (t.jurisprudencia ?? []).entries()) {
        if (!j.tribunal?.trim() || !j.tese?.trim()) anonimas.push(`${t.id}[${i}]`)
      }
    }
    expect(anonimas, `jurisprudência sem tribunal ou sem tese: ${anonimas.join(', ')}`).toEqual([])
  })
})

// --- casos -------------------------------------------------------------------

describe('casos.yaml', () => {
  it('existe', () => {
    expect(CASOS, 'data/curadoria/casos.yaml não encontrado').not.toBeNull()
  })

  seComCorpus('toda imputação resolve para um dispositivo do corpus', () => {
    const quebradas: string[] = []
    for (const c of CASOS ?? []) {
      for (const id of c.imputacao ?? []) {
        if (!CORPUS.has(id)) quebradas.push(`${c.id}: ${id}`)
      }
    }
    expect(quebradas, `imputações órfãs:\n  ${quebradas.join('\n  ')}`).toEqual([])
  })

  it('ids e ordens são únicos', () => {
    const ids = (CASOS ?? []).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const ordens = (CASOS ?? []).map((c) => c.ordem)
    expect(new Set(ordens).size).toBe(ordens.length)
  })
})

// --- o contrato entre gatilho e fatos ---------------------------------------

describe('gatilho × fatos', () => {
  it('todo caso carrega todas as chaves de gatilho', () => {
    // É isto que faz o checklist ser avaliação direta e não heurística: a chave
    // existe em todo caso, então comparar é uma consulta, não uma inferência.
    // Chave ausente viraria `undefined`, e "não apurado" passaria por "não
    // ocorreu".
    const chaves = new Set((TESES ?? []).flatMap((t) => Object.keys(t.gatilho ?? {})))
    const faltas: string[] = []
    for (const c of CASOS ?? []) {
      for (const k of chaves) {
        if (!(k in (c.fatos ?? {}))) faltas.push(`${c.id}: falta "${k}"`)
      }
    }
    expect(faltas, `chaves de gatilho ausentes:\n  ${faltas.join('\n  ')}`).toEqual([])
  })

  it('nenhum fato é inútil: toda chave de fatos é usada por alguma tese', () => {
    const chaves = new Set((TESES ?? []).flatMap((t) => Object.keys(t.gatilho ?? {})))
    const orfas = new Set<string>()
    for (const c of CASOS ?? []) {
      for (const k of Object.keys(c.fatos ?? {})) if (!chaves.has(k)) orfas.add(k)
    }
    expect([...orfas], `chaves de fatos que nenhum gatilho lê: ${[...orfas].join(', ')}`).toEqual([])
  })

  it('todo gatilho dispara em ao menos um caso', () => {
    // Tese cuja condição nenhum caso satisfaz não é demonstrável: ou o gatilho
    // está errado, ou falta um caso que a exercite.
    const aplica = (g: Record<string, unknown>, f: Record<string, unknown>) =>
      Object.entries(g).every(([k, v]) => f[k] === v)

    const mortas = (TESES ?? [])
      .filter((t) => !(CASOS ?? []).some((c) => aplica(t.gatilho ?? {}, c.fatos ?? {})))
      .map((t) => t.id)

    expect(mortas, `teses que nenhum caso aciona: ${mortas.join(', ')}`).toEqual([])
  })
})

// --- rubricas curadas --------------------------------------------------------

describe('rubricas.yaml', () => {
  seComCorpus('todo dispositivo de rubrica curada existe no corpus', () => {
    const quebrados: string[] = []
    for (const r of RUBRICAS ?? []) {
      for (const d of r.dispositivos ?? []) {
        if (!CORPUS.has(d.id)) quebrados.push(`${r.slug}: ${d.id}`)
      }
    }
    expect(quebrados, `rubricas apontando para o vazio:\n  ${quebrados.join('\n  ')}`).toEqual([])
  })

  it('nenhum termo ou variante se repete entre rubricas', () => {
    // O match é por igualdade exata: um termo em duas rubricas faz a consulta
    // devolver dois clusters concorrentes, e qual encabeça vira sorte.
    const vistos = new Map<string, string>()
    const colisoes: string[] = []
    for (const r of RUBRICAS ?? []) {
      for (const t of [r.termo, ...(r.variantes ?? [])]) {
        const chave = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        const dono = vistos.get(chave)
        if (dono) colisoes.push(`"${t}" em ${dono} e ${r.slug}`)
        else vistos.set(chave, r.slug)
      }
    }
    expect(colisoes, colisoes.join('\n  ')).toEqual([])
  })
})
