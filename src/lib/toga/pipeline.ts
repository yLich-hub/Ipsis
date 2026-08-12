// =============================================================================
// Resumo do pipeline de normalização, lido do artefato que ele mesmo produz.
//
// `/fontes` existe para dizer de onde vem cada caractere do corpus. Números
// digitados à mão nessa tela são a contradição da própria tela: até esta função
// existir, ela exibia 534 artigos, 3 leis e 923 correções, enquanto o banco
// tinha 509 artigos e 2 leis e o relatório registrava 506 alterações.
//
// A fonte é `data/normalizado/relatorio.json`, escrito por `scripts/normalize.ts`.
// Ler o relatório em vez de recontar tem uma razão: recontar produziria um
// segundo número, com sua própria chance de divergir. Aqui só existe um.
//
// Só servidor. O relatório tem ~330 KB — o que vai para o cliente é o resumo.
// =============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Alteracao, Relatorio } from '@/lib/tipos'

/** Mesma escolha de `lib/vademecum.ts`: raiz do projeto em dev e no bundle. */
const ARQUIVO = join(process.cwd(), 'data', 'normalizado', 'relatorio.json')

export type ResumoLei = {
  leiId: string
  artigos: number
  dispositivos: number
  revogados: number
  rubricasOficiais: number
}

export type ResumoPipeline = {
  geradoEm: string
  leis: ResumoLei[]
  /** Quantas alterações cada regra de limpeza produziu. */
  porRegra: Record<Alteracao['regra'], number>
  totalAlteracoes: number
  headings: number
  conflitos: number
  /** Dispositivos que passaram na limpeza mas continuam com cara de truncados. */
  suspeitos: number
}

let cache: ResumoPipeline | null | undefined

/**
 * `null` quando o relatório não existe — repositório recém-clonado, antes de
 * `npm run normalize`. A tela diz que falta, em vez de exibir zeros que se leem
 * como "nada foi corrigido".
 */
export function resumoDoPipeline(): ResumoPipeline | null {
  if (cache !== undefined) return cache

  let bruto: Relatorio
  try {
    bruto = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Relatorio
  } catch {
    cache = null
    return cache
  }

  const porRegra = {} as Record<Alteracao['regra'], number>
  for (const a of bruto.alteracoes ?? []) {
    porRegra[a.regra] = (porRegra[a.regra] ?? 0) + 1
  }

  cache = {
    geradoEm: bruto.gerado_em,
    leis: (bruto.leis ?? []).map((l) => ({
      leiId: l.lei_id,
      artigos: l.artigos,
      dispositivos: l.dispositivos,
      revogados: l.revogados,
      rubricasOficiais: l.rubricas_oficiais,
    })),
    porRegra,
    totalAlteracoes: (bruto.alteracoes ?? []).length,
    headings: (bruto.headings ?? []).length,
    conflitos: (bruto.conflitos ?? []).length,
    suspeitos: (bruto.suspeitos ?? []).length,
  }
  return cache
}
