// =============================================================================
// Leitura do acervo Vade Mecum — disco, não banco.
//
// O acervo é arquivo estático gerado por scripts/vademecum.ts. Não passa por
// Supabase de propósito: é a única parte do produto que continua inteira com o
// banco pausado, e o plano gratuito pausa por inatividade. Também não há
// `Resultado<T>` aqui — arquivo que veio no bundle ou existe, ou é bug de
// build, e nesse caso o certo é estourar, não degradar em silêncio.
//
// NÃO é o corpus curado. Ver o cabeçalho de scripts/vademecum.ts: texto sem
// data de vigência conferida, fora da busca híbrida, não citável em peça.
// =============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { semAcento } from '@/lib/formato'
import type { IndiceAcervo, LeiAcervo } from '@/lib/tipos'

// `process.cwd()` é a raiz do projeto tanto em `next dev` quanto no bundle da
// Vercel; `data/` entra no deploy por `outputFileTracingIncludes`, ver
// next.config.mjs.
const PASTA = join(process.cwd(), 'data', 'vademecum')

let cacheIndice: IndiceAcervo | null = null

export function indiceAcervo(): IndiceAcervo {
  cacheIndice ??= JSON.parse(readFileSync(join(PASTA, 'indice.json'), 'utf8')) as IndiceAcervo
  return cacheIndice
}

export const leisDoAcervo = (): LeiAcervo[] => indiceAcervo().leis

export const areasDoAcervo = () => indiceAcervo().areas

export const origemDoAcervo = () => indiceAcervo().origem

export function leiDoAcervo(id: string): LeiAcervo | null {
  return leisDoAcervo().find((l) => l.id === id) ?? null
}

/**
 * O HTML da lei, já saneado em build.
 *
 * Sem cache em memória, ao contrário do índice: são 9,4 MB somados, e a
 * Constituição sozinha tem 831 KB. Guardar tudo seguraria o dobro disso em
 * heap de função serverless para servir uma leitura que o CDN já pode guardar.
 * O `id` é conferido contra o índice antes de virar caminho — é segmento de
 * URL, e concatenar entrada de usuário em path é como se lê arquivo fora da
 * pasta.
 */
export function textoDoAcervo(id: string): string | null {
  if (!leiDoAcervo(id)) return null
  return readFileSync(join(PASTA, `${id}.html`), 'utf8')
}

/**
 * Busca no catálogo: apelido, título, número da lei e ementa.
 *
 * Só metadado, nunca o texto das leis — varrer 9,4 MB a cada tecla no filtro
 * seria caro e, pior, daria a impressão de que o acervo participa da busca do
 * produto. A busca de verdade é a híbrida, e ela só enxerga o corpus curado.
 */
export function filtraAcervo(leis: LeiAcervo[], termo: string): LeiAcervo[] {
  const alvo = semAcento(termo.trim())
  if (!alvo) return leis

  // Todas as palavras têm que casar: "codigo penal" não deve trazer todo
  // código nem toda lei penal do acervo.
  const partes = alvo.split(/\s+/)
  return leis.filter((l) => {
    const campo = semAcento(
      [l.apelido, l.titulo, l.num_lei, l.ementa, l.area_rotulo].filter(Boolean).join(' '),
    )
    return partes.every((p) => campo.includes(p))
  })
}
