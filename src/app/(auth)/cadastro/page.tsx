// =============================================================================
// /cadastro
// =============================================================================

import type { Metadata } from 'next'

import { FormularioCadastro } from '@/components/auth/cadastro'
import { PARAM_PROXIMO } from '@/lib/auth/rotas'
import { titulo } from '@/lib/toga/marca'

export const metadata: Metadata = {
  title: titulo('Criar conta'),
  description: 'Criação de conta por e-mail e senha, gerida pelo Supabase Auth.',
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const p = await searchParams
  const proximo = typeof p[PARAM_PROXIMO] === 'string' ? p[PARAM_PROXIMO] : null

  return <FormularioCadastro proximo={proximo} />
}
