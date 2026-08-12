// =============================================================================
// /login
//
// A página é de servidor e só lê a URL; o formulário é a ilha de cliente. Os
// recados de sucesso chegam por query (`?saiu=1`, `?criada=1`) porque quem os
// dispara está em OUTRA página — logout, cadastro, redefinição — e a query é o
// único canal que sobrevive à navegação.
// =============================================================================

import type { Metadata } from 'next'

import { FormularioLogin } from '@/components/auth/login'
import { PARAM_PROXIMO } from '@/lib/auth/rotas'

export const metadata: Metadata = {
  title: 'Entrar — Toga',
  description: 'Acesso à área de trabalho do Toga.',
}

const RECADOS: Record<string, string> = {
  saiu: 'Sessão encerrada. Até logo.',
  criada: 'Conta criada. Entre com seu e-mail e senha.',
  senha: 'Senha alterada. Entre com a senha nova.',
  expirada: 'Sua sessão expirou. Entre novamente para continuar.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const p = await searchParams
  const proximo = typeof p[PARAM_PROXIMO] === 'string' ? p[PARAM_PROXIMO] : null
  const chave = typeof p.recado === 'string' ? p.recado : null

  return <FormularioLogin proximo={proximo} recado={(chave && RECADOS[chave]) ?? null} />
}
