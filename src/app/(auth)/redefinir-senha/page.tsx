// =============================================================================
// /redefinir-senha
//
// Rota pública na lista do middleware, mas nem por isso aberta: sem a sessão
// que o link de recuperação abriu, não há o que redefinir. A verificação é aqui
// no servidor, e não dentro do formulário, para que a mensagem de link inválido
// apareça já na primeira renderização — o usuário não deve digitar uma senha
// nova para só então descobrir que o link venceu.
//
// **Duas condições, e a segunda é nova.** Sessão, e a marca de que ela nasceu de
// um link de recuperação. Só a primeira deixava quem já estava logado trocar a
// senha sem provar que conhecia a antiga — ver o comentário dentro da função.
// =============================================================================

import { cookies } from 'next/headers'
import type { Metadata } from 'next'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { FormularioRedefinirSenha } from '@/components/auth/redefinir-senha'
import { Aviso } from '@/components/ui'
import { usuarioAtual } from '@/lib/auth/servidor'
import { titulo } from '@/lib/toga/marca'

export const metadata: Metadata = {
  title: titulo('Nova senha'),
  description: 'Definição de nova senha pelo Supabase Auth.',
}

export const dynamic = 'force-dynamic'

export default async function RedefinirSenhaPage() {
  const usuario = await usuarioAtual()

  // **Sessão não basta, e é isso que mudou.** O comentário do formulário dizia
  // que `updateUser({ password })` só existe para quem tem sessão válida, "e é
  // isso que impede que a URL desta tela, sozinha, troque a senha de alguém".
  // A frase estava certa e era insuficiente: para o Supabase, a sessão aberta
  // pelo link de recuperação e a sessão comum de trabalho são a mesma coisa.
  // Quem já estava logado abria esta tela e trocava a senha sem provar que
  // conhecia a antiga — e um cookie emprestado virava conta perdida.
  //
  // A marca é posta por `/auth/confirmar` quando o link levava para cá, e vale
  // 15 minutos. Sem ela, esta tela não é a tela certa: o caminho é pedir um
  // link novo, que custa segundos.
  const recuperando = (await cookies()).get('ipsis-recuperacao')?.value === '1'

  if (!usuario || !recuperando) {
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
