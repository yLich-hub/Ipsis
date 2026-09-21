// =============================================================================
// O corpus citável, lido em tempo de build — para a página pública.
//
// **Por que não ler `data/normalizado/`, que é a fonte do seed.** Ela está no
// `.gitignore`: versiona-se a entrada e as regras, não o resultado (ver
// `tests/corpus.ts`, que trata do mesmo buraco no vitest). O build da Vercel
// roda de clone limpo, então uma landing que dependesse do normalizado
// quebraria o deploy — e quebraria justamente no ambiente onde ela é a única
// tela que um visitante alcança.
//
// **Por que não ler o banco.** A ADR 6 diz que a demonstração precisa
// sobreviver à inatividade, e o plano gratuito pausa por inatividade. Uma
// página que consulta o Supabase para provar que não alucina fica em branco
// exatamente no dia em que alguém clica no link semanas depois.
//
// **O que sobra, e por que é suficiente.** Os três JSON de `data/` são o que o
// `npm run normalize` recebe de entrada, e estão versionados. O texto deles
// difere do normalizado por três limpezas de artefato de PDF — e as três são
// funções PURAS em `src/lib/normalizacao.ts`, que este arquivo importa em vez
// de reescrever. Aplicá-las aqui é concordar com o normalizado pelo mesmo
// caminho, não por coincidência.
//
// **O que este módulo NÃO reproduz, e por isso recusa.** O normalize também
// fatia parágrafos (`analisaParagrafo`), herda rubrica de heading e aplica
// emendas de fronteira de bloco. Nada disso cabe num leitor de build, então
// só `caput`, inciso de artigo e alínea de inciso ganham id aqui. Pedir outro
// dispositivo levanta — em vez de devolver o vizinho errado, que é a classe de
// erro que o projeto inteiro existe para impedir.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { normalizaOrdinais, removeNotaRodape } from '@/lib/normalizacao'

const RAIZ = process.cwd()

/** Os três arquivos do corpus citável, na ordem em que o normalize os lê. */
const FONTES = [
  'data/lei11343.json',
  'data/codigo_penal.json',
  'data/codigo_processo_penal.json',
] as const

type IncisoBruto = { numero: string; texto: string; alineas?: string[] }
type ArtigoBruto = {
  id: string
  artigo: string
  contexto?: { titulo?: string; capitulo?: string; secao?: string }
  caput: string
  paragrafos?: { numero: string; texto: string; incisos?: IncisoBruto[] }[]
  incisos?: IncisoBruto[]
}
type LeiBruta = { lei: string; nome: string; fonte: string; artigos: ArtigoBruto[] }

export type Dispositivo = {
  id: string
  /** 'caput' | 'II' | 'a)' — o mesmo rótulo que o normalize grava. */
  rotulo: string
  /** 'Art. 42' — já com o ordinal quando cabe. */
  artigo: string
  /** Nome da lei como o corpus a declara. */
  lei: string
  /** O texto do dispositivo, com as limpezas de extração aplicadas. */
  texto: string
}

/**
 * As mesmas duas limpezas que `scripts/normalize.ts` aplica, na mesma ordem.
 *
 * A terceira classe de artefato — nota do editor — não entra: ela depende de
 * `data/curadoria/notas_editor.yaml` casar com o trecho exato, e o normalize
 * LEVANTA quando não casa. Repetir isso aqui daria ao build da landing o poder
 * de derrubar o deploy por um problema de curadoria que não é dela. Em vez
 * disso, `inspetor.ts` recusa dispositivo que ainda tenha marca de nota.
 */
function limpa(bruto: string): string {
  return normalizaOrdinais(removeNotaRodape(bruto.trim()).texto).texto
}

/** 'Art. 33' a partir de '33'; '7' vira 'Art. 7º'. Mesma regra de `formato.ts`. */
function tituloArtigo(numero: string): string {
  const base = Number(numero.split('-')[0])
  const ordinal = base >= 1 && base <= 9 ? numero.replace(/^(\d)/, '$1º') : numero
  return `Art. ${ordinal}`
}

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 }

/** 'XIV' → 14. Mesma conversão que o normalize usa para montar `_inc`. */
function romanoParaArabico(r: string): number {
  const s = r.toUpperCase().replace(/[^IVXLC]/g, '')
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const atual = ROMANOS[s[i] as string] ?? 0
    const proximo = ROMANOS[s[i + 1] as string] ?? 0
    total += atual < proximo ? -atual : atual
  }
  return total
}

function leLei(caminho: string): LeiBruta {
  return JSON.parse(readFileSync(resolve(RAIZ, caminho), 'utf8')) as LeiBruta
}

/**
 * Índice id → dispositivo, montado uma vez por build.
 *
 * Só as três formas cujo id este módulo consegue reproduzir com certeza. Ver o
 * cabeçalho sobre o que fica de fora e por quê.
 */
function montaIndice(): Map<string, Dispositivo> {
  const indice = new Map<string, Dispositivo>()

  for (const caminho of FONTES) {
    const doc = leLei(caminho)
    for (const a of doc.artigos) {
      const artigo = tituloArtigo(a.artigo)
      const comum = { artigo, lei: doc.nome }

      indice.set(`${a.id}_caput`, {
        ...comum,
        id: `${a.id}_caput`,
        rotulo: 'caput',
        texto: limpa(a.caput),
      })

      for (const inc of a.incisos ?? []) {
        const incId = `${a.id}_inc${romanoParaArabico(inc.numero)}`
        indice.set(incId, { ...comum, id: incId, rotulo: inc.numero, texto: limpa(inc.texto) })

        for (const al of inc.alineas ?? []) {
          const letra = /^([a-z])\s*\)/.exec(al)?.[1] ?? '?'
          const alId = `${incId}_al${letra}`
          indice.set(alId, { ...comum, id: alId, rotulo: `${letra})`, texto: limpa(al) })
        }
      }
    }
  }

  return indice
}

let cache: Map<string, Dispositivo> | null = null

/** O índice, montado na primeira chamada e reaproveitado no resto do build. */
export function indiceDeDispositivos(): Map<string, Dispositivo> {
  cache ??= montaIndice()
  return cache
}

/** Contagens derivadas do corpus citável — nunca digitadas. */
export function contaCorpus(): { leis: number; artigos: number } {
  let artigos = 0
  for (const caminho of FONTES) artigos += leLei(caminho).artigos.length
  return { leis: FONTES.length, artigos }
}
