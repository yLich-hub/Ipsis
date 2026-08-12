'use client'

// =============================================================================
// Pedido de recuperação de senha.
//
// Quem gera, envia e valida o token é o Supabase — não há token, tabela de
// pedidos nem expiração escritos aqui. `resetPasswordForEmail` manda o e-mail;
// o link volta em /auth/confirmar, que troca o código por sessão e encaminha
// para /redefinir-senha.
//
// A confirmação na tela é a MESMA para e-mail cadastrado e não cadastrado (o
// Supabase também não distingue na resposta): dizer "este e-mail não existe"
// entregaria a qualquer visitante a lista de quem tem conta.
// =============================================================================

import { useState, type FormEvent } from 'react'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { Aviso, Botao, Campo } from '@/components/ui'
import { mensagemDeErro, validarEmail } from '@/lib/auth/mensagens'
import { supabaseNavegador } from '@/lib/auth/navegador'

export function FormularioEsqueciSenha({ erroInicial }: { erroInicial: string | null }) {
  const [email, setEmail] = useState('')
  const [erroCampo, setErroCampo] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(erroInicial)
  const [enviado, setEnviado] = useState(false)
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (carregando) return

    const erro = validarEmail(email)
    if (erro) {
      setErroCampo(erro)
      return
    }

    setErroCampo(null)
    setFalha(null)
    setCarregando(true)

    // `origin` do navegador em vez de variável de ambiente: o link precisa
    // apontar para o mesmo host em que o pedido nasceu, e isso vale igual em
    // localhost, no preview da Vercel e em produção. O host de destino ainda
    // precisa estar na lista de Redirect URLs do painel do Supabase.
    const { error } = await supabaseNavegador().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirmar?proximo=%2Fredefinir-senha`,
    })

    if (error) {
      setFalha(mensagemDeErro(error, 'Não foi possível enviar o e-mail. Tente de novo.'))
      setCarregando(false)
      return
    }

    setEnviado(true)
    setCarregando(false)
  }

  if (enviado) {
    return (
      <Moldura titulo="Verifique seu e-mail" sub="O link de recuperação já está a caminho.">
        <Aviso tom="esmeralda" role="status">
          Se existir uma conta para <strong className="font-medium">{email.trim()}</strong>, o link
          de redefinição chegará em instantes. Ele vale por tempo limitado e só pode ser usado uma
          vez.
        </Aviso>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-tg-linha pt-4">
          <LinkAuth href="/login">Voltar para o login</LinkAuth>
          <button
            type="button"
            onClick={() => setEnviado(false)}
            className="rounded text-[12.5px] text-tg-corpo underline-offset-4 transition-colors hover:text-tg-acento-txt hover:underline"
          >
            Enviar de novo
          </button>
        </div>
      </Moldura>
    )
  }

  return (
    <Moldura
      titulo="Esqueci minha senha"
      sub="Informe o e-mail da conta. Enviaremos um link para você definir uma senha nova."
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo
          id="email"
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          placeholder="voce@escritorio.com.br"
          value={email}
          disabled={carregando}
          erro={erroCampo}
          onChange={(e) => setEmail(e.target.value)}
        />

        {falha && (
          <Aviso tom="vermelho" role="alert">
            {falha}
          </Aviso>
        )}

        <Botao type="submit" carregando={carregando} className="w-full">
          {carregando ? 'Enviando…' : 'Enviar link de recuperação'}
        </Botao>
      </form>

      <div className="mt-5 border-t border-tg-linha pt-4">
        <LinkAuth href="/login">Voltar para o login</LinkAuth>
      </div>
    </Moldura>
  )
}
