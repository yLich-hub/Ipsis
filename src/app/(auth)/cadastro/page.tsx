// =============================================================================
// /cadastro
// =============================================================================

import type { Metadata } from 'next'

import { FormularioCadastro } from '@/components/auth/cadastro'
import { PARAM_PROXIMO } from '@/lib/auth/rotas'

export const metadata: Metadata = {
  title: 'Criar conta — Toga',
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
