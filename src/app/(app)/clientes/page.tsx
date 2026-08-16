// =============================================================================
// /clientes — cadastro do escritório
//
// A página é de servidor só para buscar a lista de casos que o formulário
// oferece no vínculo. Os clientes em si são lidos e escritos pelo NAVEGADOR,
// com a sessão: é a RLS por `auth.uid()` (migration 0009) que torna a agenda
// inacessível a qualquer outra sessão, e o cliente anônimo do servidor não
// enxergaria linha nenhuma.
//
// Banco fora do ar aqui não derruba a tela: o vínculo com caso é opcional, e a
// lista vazia só faz o `select` do formulário ficar sem opções — a tela diz isso.
// =============================================================================

import type { Metadata } from 'next'

import { Clientes } from '@/components/toga/clientes'
import { casos } from '@/lib/dados'
import { titulo } from '@/lib/toga/marca'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: titulo('Clientes'),
  description: 'Cadastro de clientes do escritório, sob RLS por sessão.',
}

export default async function PaginaClientes() {
  const cs = await casos()
  const lista = cs.ok ? cs.dados.map((c) => ({ id: c.id, titulo: c.titulo })) : []

  return <Clientes casos={lista} />
}
