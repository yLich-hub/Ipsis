// =============================================================================
// /fontes — procedência do corpus.
//
// Os números vêm das duas fontes onde eles realmente existem: o relatório que
// `normalize.ts` escreve em disco, e a RPC `saude()`. Nenhum é digitado na
// tela. Uma página que se propõe a mostrar procedência e traz contagem escrita à
// mão desmente a si mesma — e desmentia: exibia 534 artigos e 3 leis contra 509
// e 2 no banco, e 923 correções contra as 506 do relatório.
//
// `force-dynamic` porque `saude()` é o estado do banco agora, não o de quando o
// build rodou. Se o banco estiver pausado, `banco` chega `null` e a tela diz
// isso — o relatório em disco continua de pé, que é justamente a parte que não
// depende do Supabase.
// =============================================================================

import type { Metadata } from 'next'

import { Fontes, type Banco } from '@/components/toga/fontes'
import { saude } from '@/lib/dados'
import { resumoDoPipeline } from '@/lib/toga/pipeline'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fontes — Toga',
  description: 'De onde vem cada caractere do corpus, e o que foi preciso consertar no caminho.',
}

export default async function PaginaFontes() {
  const s = await saude()

  const banco: Banco | null = s.ok
    ? {
        leis: s.dados.leis,
        artigos: s.dados.artigos,
        dispositivos: s.dados.dispositivos,
        comEmbedding: s.dados.com_embedding,
        rubricas: s.dados.rubricas,
        teses: s.dados.teses,
        casos: s.dados.casos,
      }
    : null

  return <Fontes pipeline={resumoDoPipeline()} banco={banco} />
}
