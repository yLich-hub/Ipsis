// =============================================================================
// /redefinir-senha
//
// Rota pública na lista do middleware, mas nem por isso aberta: sem a sessão
// que o link de recuperação abriu, não há o que redefinir. A verificação é aqui
// no servidor, e não dentro do formulário, para que a mensagem de link inválido
// apareça já na primeira renderização — o usuário não deve digitar uma senha
// nova para só então descobrir que o link venceu.
// =============================================================================

import type { Metadata } from 'next'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { FormularioRedefinirSenha } from '@/components/auth/redefinir-senha'
import { Aviso } from '@/components/ui'
import { usuarioAtual } from '@/lib/auth/servidor'

export const metadata: Metadata = {
  title: 'Nova senha — Toga',
  description: 'Definição de nova senha pelo Supabase Auth.',
}

export const dynamic = 'force-dynamic'

export default async function RedefinirSenhaPage() {
  const usuario = await usuarioAtual()

  if (!usuario) {
    return (
      <Moldura titulo="Link inválido" sub="Não há uma recuperação de senha em andamento.">
        <Aviso tom="vermelho" role="alert">
          Abra esta tela pelo link enviado ao seu e-mail. Se o link já foi usado ou expirou, peça
          outro — leva alguns segundos.
        </Aviso>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-tg-linha pt-4">
          <LinkAuth href="/esqueci-senha">Pedir novo link</LinkAuth>
          <LinkAuth href="/login">Voltar para o login</LinkAuth>
        </div>
      </Moldura>
    )
  }

  return <FormularioRedefinirSenha />
}
