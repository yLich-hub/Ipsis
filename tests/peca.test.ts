// =============================================================================
// A minuta se monta, e falha quando tem de falhar.
//
// `tests/citacao.test.ts` prova que os ids da curadoria existem. Este prova o
// passo seguinte: que a peça REALMENTE se monta com eles, que o texto legal
// entra vindo da fonte, e que uma citação órfã derruba a montagem em vez de
// produzir minuta pela metade.
//
// Roda offline. Os dispositivos vêm de `data/normalizado/`, que é a mesma fonte
// que o seed escreve — por isso `lib/peca/resolver.ts` não importa cliente
// nenhum. `lib/supabase.ts` lança no import quando falta variável de ambiente, e
// um teste que exigisse segredo não rodaria no CI.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { describe, expect } from 'vitest'

import { CURADORIA, NORMALIZADO, seComCorpus, temCorpus } from './corpus.ts'
import { pecaEmDocx } from '@/lib/peca/docx'
import {
  type CasoResolvivel,
  type Citado,
  type TeseResolvivel,
  CitacaoOrfa,
  idsNecessarios,
  resolvePeca,
} from '@/lib/peca/resolver'

// --- fonte ------------------------------------------------------------------

type LinhaNormalizada = {
  id: string
  artigo_id: string
  citacao: string
  texto: string
  revogado?: boolean
}

/**
 * O mesmo mapa que `carregaCitados` monta do banco, montado do disco.
 *
 * Vazio quando `data/normalizado/` não está no clone: `readdirSync` levantaria
 * ENOENT na coleta do vitest, e o arquivo inteiro ficaria vermelho antes de
 * qualquer asserção. Quem depende do corpus é pulado por `seComCorpus`.
 */
function mapaDoCorpus(): Map<string, Citado> {
  const mapa = new Map<string, Citado>()
  if (!temCorpus) return mapa
  for (const arq of readdirSync(NORMALIZADO)) {
    if (!arq.endsWith('.json') || arq === 'relatorio.json') continue
    const doc = JSON.parse(readFileSync(resolve(NORMALIZADO, arq), 'utf8')) as {
      lei?: { apelido?: string; vigencia_ate?: string }
      artigos?: { id: string; conferido_em: string | null; alterado_por?: string[] }[]
      dispositivos?: LinhaNormalizada[]
    }
    // A procedência mora no ARTIGO, e é ela que o rodapé imprime quando a
    // redação transcrita é posterior à data de corte. Montar o mapa sem ela
    // faria o teste passar por cima justamente do caso que importa — o art. 65
    // do CP, que é fundamento de tese e mudou depois da fotografia.
    const porArtigo = new Map((doc.artigos ?? []).map((a) => [a.id, a]))
    for (const d of doc.dispositivos ?? []) {
      const a = porArtigo.get(d.artigo_id)
      mapa.set(d.id, {
        id: d.id,
        citacao: d.citacao,
        texto: d.texto,
        leiApelido: doc.lei?.apelido ?? '',
        vigenciaAte: doc.lei?.vigencia_ate ?? '',
        revogado: Boolean(d.revogado),
        conferidoEm: a?.conferido_em ?? null,
        alteradoPor: a?.alterado_por ?? [],
      })
    }
  }
  return mapa
}

function leYaml<T>(nome: string): T[] {
  const f = resolve(CURADORIA, nome)
  if (!existsSync(f)) return []
  return (parseYaml(readFileSync(f, 'utf8')) ?? []) as T[]
}

type TeseYaml = TeseResolvivel & { gatilho: Record<string, unknown>; ordem: number }
type CasoYaml = CasoResolvivel & { fatos: Record<string, unknown>; ordem: number }

const CORPUS = mapaDoCorpus()
const TESES = leYaml<TeseYaml>('teses.yaml')
const CASOS = leYaml<CasoYaml>('casos.yaml')

/** Mesma regra de `aplicaA` em lib/dados.ts — igualdade direta, chave a chave. */
const aplicaA = (t: TeseYaml, c: CasoYaml) =>
  Object.entries(t.gatilho ?? {}).every(([k, v]) => c.fatos?.[k] === v)

/**
 * Lê uma parte de um .docx sem depender de lib de zip.
 *
 * O rodapé NÃO mora em `word/document.xml` — é `word/footer1.xml`, uma parte
 * separada do pacote. Procurar a data de corte no documento e não achar diz
 * apenas isso, e não que ela não foi impressa.
 */
function parteDoDocx(buf: Buffer, parte: string): string {
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue
    const nlen = buf.readUInt16LE(i + 26)
    const elen = buf.readUInt16LE(i + 28)
    if (buf.subarray(i + 30, i + 30 + nlen).toString() !== parte) continue
    const comp = buf.readUInt16LE(i + 8)
    const csize = buf.readUInt32LE(i + 18)
    const dados = buf.subarray(i + 30 + nlen + elen, i + 30 + nlen + elen + csize)
    return (comp === 8 ? inflateRawSync(dados) : dados).toString('utf8')
  }
  throw new Error(`${parte} não encontrado no .docx`)
}

const textoDoDocx = (buf: Buffer) => parteDoDocx(buf, 'word/document.xml')

// --- montagem ---------------------------------------------------------------

describe('montagem da minuta', () => {
  seComCorpus('há corpus, teses e casos para montar', () => {
    expect(CORPUS.size).toBeGreaterThan(0)
    expect(TESES.length).toBeGreaterThan(0)
    expect(CASOS.length).toBeGreaterThan(0)
  })

  seComCorpus('todo id necessário existe no corpus', () => {
    const faltando = idsNecessarios(TESES).filter((id) => !CORPUS.has(id))
    expect(faltando, `ids sem dispositivo: ${faltando.join(', ')}`).toEqual([])
  })

  seComCorpus('cada caso monta sem citação órfã, e com citação de verdade', () => {
    for (const c of CASOS) {
      const aplicaveis = TESES.filter((t) => aplicaA(t, c))
      const peca = resolvePeca(c, aplicaveis, CORPUS)

      expect(peca.teses.length, `${c.id}: nenhuma tese acionada`).toBeGreaterThan(0)
      expect(peca.citados.length, `${c.id}: minuta sem nenhuma citação`).toBeGreaterThan(0)
      expect(peca.vigenciaAte, `${c.id}: minuta sem data de corte`).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      for (const t of peca.teses) {
        for (const tr of t.trechos) {
          if (tr.tipo !== 'citacao') continue
          // Texto vazio significaria citação resolvida "com sucesso" para nada —
          // o modo de falha silencioso que a decisão nº 1 existe para impedir.
          expect(tr.d.texto.trim().length, `${t.id}: ${tr.d.id} sem texto`).toBeGreaterThan(0)
          expect(tr.d.citacao.trim().length, `${t.id}: ${tr.d.id} sem rótulo`).toBeGreaterThan(0)
        }
      }
    }
  })

  seComCorpus('nenhum marcador cru sobrevive à montagem', () => {
    for (const c of CASOS) {
      const peca = resolvePeca(c, TESES.filter((t) => aplicaA(t, c)), CORPUS)
      const prosa = peca.teses
        .flatMap((t) => t.trechos)
        .filter((tr) => tr.tipo === 'prosa')
        .map((tr) => (tr as { texto: string }).texto)
        .join('\n')
      expect(prosa, `${c.id}: marcador cru na prosa`).not.toMatch(/\{\{cite:/)
    }
  })

  seComCorpus('citação órfã derruba a montagem — não gera minuta parcial', () => {
    const vitima = TESES[0]!
    const quebrada: TeseResolvivel = {
      ...vitima,
      template_md: `${vitima.template_md}\n\n{{cite:dl_3689_1941_art396-z_caput}}`,
    }
    expect(() => resolvePeca(CASOS[0]!, [quebrada], CORPUS)).toThrow(CitacaoOrfa)

    // O erro tem de dizer QUAL id quebrou, senão não serve para consertar.
    try {
      resolvePeca(CASOS[0]!, [quebrada], CORPUS)
    } catch (e) {
      expect((e as CitacaoOrfa).ids).toContain('dl_3689_1941_art396-z_caput')
    }
  })

  seComCorpus('fundamento órfão também derruba, mesmo sem marcador no template', () => {
    const vitima = TESES[0]!
    const quebrada: TeseResolvivel = {
      ...vitima,
      fundamentos: [...vitima.fundamentos, 'lei_11343_2006_art999_caput'],
    }
    expect(() => resolvePeca(CASOS[0]!, [quebrada], CORPUS)).toThrow(CitacaoOrfa)
  })
})

// --- o arquivo --------------------------------------------------------------

describe('.docx gerado', () => {
  seComCorpus('é um zip válido, com o texto legal lido da fonte dentro', async () => {
    const c = CASOS[0]!
    const aplicaveis = TESES.filter((t) => aplicaA(t, c))
    const peca = resolvePeca(c, aplicaveis, CORPUS)
    const buf = await pecaEmDocx(peca)

    expect(buf.length, 'arquivo vazio').toBeGreaterThan(4000)
    // Assinatura de zip local file header.
    expect(buf.readUInt32LE(0)).toBe(0x04034b50)

    const xml = textoDoDocx(buf)

    expect(xml, 'marcador cru chegou ao arquivo').not.toMatch(/\{\{cite:/)
    expect(xml, 'escape duplo de entidade XML').not.toMatch(/&amp;(quot|amp|lt|gt);/)

    expect(xml).toContain('RESPOSTA À ACUSAÇÃO')

    // O texto de cada dispositivo citado tem de estar no arquivo. É a asserção
    // que liga as duas pontas: o que a fonte diz é o que o arquivo imprime.
    for (const id of new Set(peca.citados)) {
      const d = CORPUS.get(id)!
      const trecho = d.texto.slice(0, 40).replace(/[<>&]/g, '')
      if (trecho.length < 20) continue // dispositivos curtos demais para servir de âncora
      expect(xml, `texto de ${id} ausente do .docx`).toContain(trecho)
    }
  })

  seComCorpus('imprime a data de corte no rodapé — a decisão nº 3 sobrevive ao download', async () => {
    const c = CASOS[0]!
    const peca = resolvePeca(c, TESES.filter((t) => aplicaA(t, c)), CORPUS)
    const rodape = parteDoDocx(await pecaEmDocx(peca), 'word/footer1.xml')

    expect(rodape, 'data de corte ausente do rodapé').toContain(peca.vigenciaAte)
    expect(rodape).toContain('dispositivos transcritos do banco')
  })

  // Uma data só no rodapé deixou de bastar quando o corpus passou a ter artigo
  // em redação posterior à fotografia — e a peça cita um: o art. 65 do Código
  // Penal, atenuantes, alterado pela Lei 15.160/2025. Carimbar 28/02/2025 sobre
  // esse texto seria a decisão nº 3 mentindo dentro do arquivo protocolado.
  seComCorpus('o rodapé diz quando a redação transcrita é posterior à data de corte', async () => {
    const comConferido = CASOS.map((c) => resolvePeca(c, TESES.filter((t) => aplicaA(t, c)), CORPUS))
      .find((p) => p.conferidos.length > 0)

    if (!comConferido) {
      // Nenhuma tese cita artigo atualizado hoje. Não é falha: é o corpus não
      // ter mudado onde a peça pisa. A asserção volta a morder sozinha no dia
      // em que mudar.
      expect(true).toBe(true)
      return
    }

    const rodape = parteDoDocx(await pecaEmDocx(comConferido), 'word/footer1.xml')
    expect(rodape, 'rodapé não menciona a conferência').toContain('redação posterior à data de corte')
    expect(rodape).toContain(comConferido.conferidos[0]!.conferidoEm)
    for (const lei of new Set(comConferido.conferidos.flatMap((c) => c.alteradoPor))) {
      expect(rodape, `rodapé sem a lei ${lei}`).toContain(lei)
    }
  })

  seComCorpus('caso sem tese aplicável gera peça que diz isso, em vez de peça vazia', async () => {
    const c = CASOS[0]!
    const peca = resolvePeca(c, [], CORPUS)
    const xml = textoDoDocx(await pecaEmDocx(peca))
    expect(xml).toContain('Nenhuma das teses curadas foi acionada')
  })

  // --- revisão da argumentação ---------------------------------------------
  //
  // O texto legal da minuta tem três camadas de conferência. A ARGUMENTAÇÃO
  // entre as citações não tinha nenhuma: o projeto afirmava, em cinco
  // documentos, que cada frase do `.docx` passou por revisão humana, e não
  // existia campo que registrasse isso. Era garantia em prosa sobre um dado que
  // o sistema não guardava.

  seComCorpus('`revisao` só admite ausência ou "pendente"', () => {
    // Ausência significa "sem registro", NUNCA "conferida". Um valor novo
    // inventado aqui — 'ok', 'conferida' — passaria despercebido e viraria
    // carimbo de aprovação que ninguém deu.
    for (const t of TESES) {
      expect(
        t.revisao === undefined || t.revisao === 'pendente',
        `${t.id}: 'revisao' aceita só ausência ou 'pendente'`,
      ).toBe(true)
    }
  })

  seComCorpus('o rodapé declara as teses que aguardam revisão', async () => {
    const comPendencia = CASOS.map((c) =>
      resolvePeca(c, TESES.filter((t) => aplicaA(t, c)), CORPUS),
    ).find((p) => p.pendentes.length > 0)

    if (!comPendencia) {
      // Todas revisadas: o aviso não tem o que dizer, e é o estado saudável.
      // A asserção volta a morder no dia em que uma tese nova entrar sem leitura.
      expect(true).toBe(true)
      return
    }

    // O que a peça declara é exatamente o que as teses dela marcam — nem a
    // mais, que assustaria à toa, nem a menos, que é o defeito grave.
    expect(comPendencia.pendentes).toEqual(
      comPendencia.teses.filter((t) => t.revisao === 'pendente').map((t) => t.nome),
    )

    const rodape = parteDoDocx(await pecaEmDocx(comPendencia), 'word/footer1.xml')
    expect(rodape, 'a pendência de revisão não sobreviveu ao download').toContain(
      'aguardam revisão de advogado',
    )
    expect(rodape).toContain(String(comPendencia.pendentes.length))
    expect(rodape).toContain(comPendencia.pendentes[0]!)
  })

  seComCorpus('minuta sem pendência não imprime o aviso', async () => {
    const semPendencia = CASOS.map((c) =>
      resolvePeca(c, TESES.filter((t) => aplicaA(t, c)), CORPUS),
    ).find((p) => p.pendentes.length === 0)

    if (!semPendencia) return expect(true).toBe(true)

    const rodape = parteDoDocx(await pecaEmDocx(semPendencia), 'word/footer1.xml')
    expect(rodape).not.toContain('aguardam revisão')
  })
})
