'use client'

// =============================================================================
// Definição da senha nova, ao fim do fluxo de recuperação.
//
// Chega-se aqui já com sessão: /auth/confirmar trocou o código do e-mail por
// uma sessão de recuperação. `updateUser({ password })` só existe para quem tem
// sessão válida — é isso que impede que a URL desta tela, sozinha, troque a
// senha de alguém.
//
// Depois de trocar, a sessão é encerrada de propósito. A sessão em curso nasceu
// de um link de e-mail; encerrá-la obriga a primeira entrada com a senha nova,
// que é a única prova de que a troca funcionou.
// =============================================================================

import { useState, type FormEvent } from 'react'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { Aviso, Botao, Campo } from '@/components/ui'
import {
  SENHA_MINIMA,
  mensagemDeErro,
  validarConfirmacao,
  validarSenha,
} from '@/lib/auth/mensagens'
import { supabaseNavegador } from '@/lib/auth/navegador'

export function FormularioRedefinirSenha() {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<{ senha?: string; confirmacao?: string }>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (carregando) return

    const achados = {
      senha: validarSenha(senha) ?? undefined,
      confirmacao: validarConfirmacao(senha, confirmacao) ?? undefined,
    }
    if (achados.senha || achados.confirmacao) {
      setErros(achados)
      return
    }

    setErros({})
    setFalha(null)
    setCarregando(true)

    const supabase = supabaseNavegador()
    const { error } = await supabase.auth.updateUser({ password: senha })

    if (error) {
      setFalha(mensagemDeErro(error, 'Não foi possível alterar sua senha. Tente de novo.'))
      setCarregando(false)
      return
    }

    await supabase.auth.signOut()
    setPronto(true)
    setCarregando(false)
  }

  if (pronto) {
    return (
      <Moldura titulo="Senha alterada" sub="Pronto. Sua senha nova já está valendo.">
        <Aviso tom="esmeralda" role="status">
          Encerramos a sessão aberta pelo link de recuperação. Entre com a senha nova para
          continuar.
        </Aviso>
        <div className="mt-5">
          <a
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-[13.5px] font-medium text-slate-950 transition-colors hover:bg-emerald-400"
          >
            Ir para o login
          </a>
        </div>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Definir nova senha" sub="Escolha uma senha nova para sua conta.">
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo
          id="senha"
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder="••••••••"
          value={senha}
          disabled={carregando}
          erro={erros.senha}
          dica={`Ao menos ${SENHA_MINIMA} caracteres.`}
          onChange={(e) => setSenha(e.target.value)}
        />

        <Campo
          id="confirmacao"
          rotulo="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmacao}
          disabled={carregando}
          erro={erros.confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        {falha && (
          <Aviso tom="vermelho" role="alert">
            {falha}
          </Aviso>
        )}

        <Botao type="submit" carregando={carregando} className="w-full">
          {carregando ? 'Alterando…' : 'Alterar senha'}
        </Botao>
      </form>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <LinkAuth href="/login">Voltar para o login</LinkAuth>
      </div>
    </Moldura>
  )
}
