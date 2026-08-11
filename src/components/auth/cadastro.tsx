'use client'

// =============================================================================
// Formulário de criação de conta.
//
// A senha nunca toca o banco da aplicação. `signUp` entrega e-mail e senha ao
// servidor de Auth, que faz o hash e guarda em `auth.users` — schema que a
// chave publishable não enxerga. Nenhuma tabela deste projeto tem coluna de
// senha, e nenhum código daqui calcula hash ou emite JWT.
//
// O projeto roda com confirmação de e-mail DESLIGADA (ver README): `signUp`
// devolve sessão pronta e o usuário entra direto. O caminho sem sessão continua
// tratado abaixo, porque quem clonar o repositório pode subir um projeto
// Supabase com a confirmação ligada — o padrão do painel.
// =============================================================================

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { Aviso, Botao, Campo } from '@/components/ui'
import {
  SENHA_MINIMA,
  mensagemDeErro,
  validarConfirmacao,
  validarEmail,
  validarSenha,
} from '@/lib/auth/mensagens'
import { supabaseNavegador } from '@/lib/auth/navegador'
import { destinoSeguro } from '@/lib/auth/rotas'

type Erros = { email?: string; senha?: string; confirmacao?: string }

export function FormularioCadastro({ proximo }: { proximo: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [aguardandoEmail, setAguardandoEmail] = useState(false)
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (carregando) return

    const achados: Erros = {
      email: validarEmail(email) ?? undefined,
      senha: validarSenha(senha) ?? undefined,
      confirmacao: validarConfirmacao(senha, confirmacao) ?? undefined,
    }
    if (achados.email || achados.senha || achados.confirmacao) {
      setErros(achados)
      return
    }

    setErros({})
    setFalha(null)
    setCarregando(true)

    const { data, error } = await supabaseNavegador().auth.signUp({
      email: email.trim(),
      password: senha,
    })

    if (error) {
      setFalha(mensagemDeErro(error, 'Não foi possível criar sua conta. Tente de novo.'))
      setCarregando(false)
      return
    }

    if (!data.session) {
      // Confirmação de e-mail ligada no projeto Supabase: existe usuário, não
      // existe sessão. Mandar para o painel aqui produziria um ricochete para
      // /login sem explicação nenhuma.
      setAguardandoEmail(true)
      setCarregando(false)
      return
    }

    router.replace(destinoSeguro(proximo))
    router.refresh()
  }

  if (aguardandoEmail) {
    return (
      <Moldura titulo="Confirme seu e-mail" sub="Falta um passo para a conta ficar ativa.">
        <Aviso tom="esmeralda" role="status">
          Conta criada. Enviamos um link de confirmação para{' '}
          <strong className="font-medium">{email.trim()}</strong>. Abra o link e depois entre
          normalmente.
        </Aviso>
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <LinkAuth href="/login">Voltar para o login</LinkAuth>
        </div>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Criar conta" sub="E-mail e senha. Nada além disso é pedido nem guardado.">
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
          erro={erros.email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Campo
          id="senha"
          rotulo="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={senha}
          disabled={carregando}
          erro={erros.senha}
          dica={`Ao menos ${SENHA_MINIMA} caracteres.`}
          onChange={(e) => setSenha(e.target.value)}
        />

        <Campo
          id="confirmacao"
          rotulo="Confirmar senha"
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
          {carregando ? 'Criando conta…' : 'Criar conta'}
        </Botao>
      </form>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <LinkAuth href={proximo ? `/login?proximo=${encodeURIComponent(proximo)}` : '/login'}>
          Já tenho conta — entrar
        </LinkAuth>
      </div>
    </Moldura>
  )
}
