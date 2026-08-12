// =============================================================================
// /jurisprudencia — entendimento consolidado ligado às teses.
//
// A jurisprudência mora em `teses.jurisprudencia` (jsonb), não numa base
// própria: ela existe para sustentar uma tese da peça, não para ser um buscador
// de acórdãos. O desenho do TOGA v2 é de buscador; o que se aproveitou dele e o
// que se recusou está no cabeçalho de `components/toga/jurisprudencia.tsx`.
// =============================================================================

import type { Metadata } from 'next'

import { Jurisprudencia, type Linha } from '@/components/toga/jurisprudencia'
import { ErroBanco } from '@/components/toga/estados'
import { teses } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jurisprudência — Toga',
  description: 'Entendimento consolidado extraído de acórdãos, ligado às teses da peça.',
}

export default async function PaginaJurisprudencia() {
  const ts = await teses()

  if (!ts.ok) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <ErroBanco erro={ts.erro} />
      </div>
    )
  }

  const linhas: Linha[] = ts.dados.flatMap((t) =>
    (t.jurisprudencia ?? []).map((j) => ({ ...j, origem: t.nome, origemId: t.id })),
  )

  return <Jurisprudencia linhas={linhas} />
}
