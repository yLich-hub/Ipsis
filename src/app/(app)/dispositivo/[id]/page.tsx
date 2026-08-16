// =============================================================================
// /dispositivo/[id] — destino canônico de toda citação.
//
// Renderiza o artigo inteiro com o dispositivo em destaque. O id textual
// (`lei_11343_2006_art33_p4`) é a chave de citação estável do projeto: é ele que
// aparece no marcador {{cite:}} dos templates de tese e é para cá que o
// renderizador aponta. Por isso esta rota nunca pode 404 num id válido.
// =============================================================================

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { PaginaArtigo } from '@/components/artigo'
import { Cabecalho } from '@/components/casca/cabecalho'
import { dispositivo } from '@/lib/dados'
import { titulo } from '@/lib/toga/marca'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const d = await dispositivo((await params).id)
  return { title: d.ok && d.dados ? titulo(d.dados.citacao) : titulo('Dispositivo') }
}

export default async function DispositivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await dispositivo(id)

  // Erro de banco não é o mesmo que id inexistente: só o segundo vira 404. O
  // primeiro cai na tela de erro dentro de PaginaArtigo, com o motivo à vista.
  if (d.ok && !d.dados) notFound()

  const artigoId = d.ok && d.dados ? d.dados.artigo_id : id.replace(/_(caput|p[\w-]+|inc\w+|al\w+).*$/, '')

  return (
    <>
      <Cabecalho
        titulo={d.ok && d.dados ? d.dados.citacao : 'Dispositivo'}
        sub="texto lido do banco por id — nunca gerado"
      />
      <div className="flex-1 overflow-y-auto">
        <PaginaArtigo artigoId={artigoId} destaque={id} />
      </div>
    </>
  )
}
