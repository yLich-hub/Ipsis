import type { Metadata } from 'next'

import { PaginaArtigo } from '@/components/artigo'
import { Cabecalho } from '@/components/casca/cabecalho'
import { artigo } from '@/lib/dados'
import { tituloArtigo } from '@/lib/formato'
import { titulo } from '@/lib/toga/marca'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const a = await artigo((await params).id)
  return {
    title:
      a.ok && a.dados
        ? titulo(`${tituloArtigo(a.dados.numero)}${a.dados.rubrica ? ` · ${a.dados.rubrica}` : ''}`)
        : titulo('Artigo'),
  }
}

export default async function ArtigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <Cabecalho titulo="Texto legal" sub="lido do banco por id — nunca gerado" />
      <div className="flex-1 lg:overflow-y-auto">
        <PaginaArtigo artigoId={id} />
      </div>
    </>
  )
}
