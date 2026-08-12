// =============================================================================
// /esqueci-senha
//
// `?erro=link` chega de /auth/confirmar quando o link do e-mail já foi usado,
// expirou ou foi aberto em outro navegador — casos em que o usuário precisa
// pedir outro, e é exatamente esta a tela do pedido.
// =============================================================================

import type { Metadata } from 'next'

import { FormularioEsqueciSenha } from '@/components/auth/esqueci-senha'

export const metadata: Metadata = {
  title: 'Recuperar senha — Toga',
  description: 'Envio do link de redefinição de senha pelo Supabase Auth.',
}

const ERROS: Record<string, string> = {
  link: 'Este link de recuperação não vale mais — pode ter expirado, já ter sido usado ou ter sido aberto em outro navegador. Peça um novo abaixo.',
}

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const p = await searchParams
  const chave = typeof p.erro === 'string' ? p.erro : null

  return <FormularioEsqueciSenha erroInicial={(chave && ERROS[chave]) ?? null} />
}
