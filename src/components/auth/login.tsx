'use client'

// =============================================================================
// Formulário de login.
//
// A validação roda antes da ida à rede (poupa uma requisição por erro de
// digitação), mas a decisão é sempre do servidor de Auth — o que está aqui é
// conveniência, não segurança.
//
// A mensagem de falha é uma só, "E-mail ou senha incorretos", nos dois casos.
// Separar "não existe conta com este e-mail" de "senha errada" transformaria a
// tela num verificador de quais e-mails têm conta.
// =============================================================================

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { LinkAuth, Moldura } from '@/components/auth/moldura'
import { Aviso, Botao, Campo } from '@/components/ui'
import { mensagemDeErro, validarEmail } from '@/lib/auth/mensagens'
import { supabaseNavegador } from '@/lib/auth/navegador'
import { destinoSeguro } from '@/lib/auth/rotas'

export function FormularioLogin({
  proximo,
  recado,
}: {
  proximo: string | null
  recado: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState<{ email?: string; senha?: string }>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (carregando) return

    const erroEmail = validarEmail(email)
    // Sem `validarSenha` aqui: exigir 8 caracteres para ENTRAR recusaria, na
    // tela, a senha curta de uma conta que já existe. O mínimo vale no cadastro.
    const erroSenha = senha ? undefined : 'Informe sua senha.'
    if (erroEmail || erroSenha) {
      setErros({ email: erroEmail ?? undefined, senha: erroSenha })
      return
    }

    setErros({})
    setFalha(null)
    setCarregando(true)

    const { error } = await supabaseNavegador().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })

    if (error) {
      setFalha(mensagemDeErro(error, 'Não foi possível entrar. Tente de novo em instantes.'))
      setCarregando(false)
      return
    }

    // `carregando` continua ligado de propósito: a navegação abaixo leva alguns
    // quadros, e reabilitar o botão nesse intervalo permite um segundo submit.
    router.replace(destinoSeguro(proximo))
    // Os componentes de servidor foram renderizados sem sessão; sem o refresh,
    // o cabeçalho continuaria mostrando o estado anônimo até um F5.
    router.refresh()
  }

  return (
    <Moldura titulo="Entrar" sub="Acesse sua área de trabalho no Toga.">
      {recado && (
        <Aviso tom="esmeralda" className="mb-4" role="status">
          {recado}
        </Aviso>
      )}

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
          autoComplete="current-password"
          placeholder="••••••••"
          value={senha}
          disabled={carregando}
          erro={erros.senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        {falha && (
          <Aviso tom="vermelho" role="alert">
            {falha}
          </Aviso>
        )}

        <Botao type="submit" carregando={carregando} className="w-full">
          {carregando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-tg-linha pt-4">
        <LinkAuth href="/esqueci-senha">Esqueci minha senha</LinkAuth>
        <LinkAuth href={proximo ? `/cadastro?proximo=${encodeURIComponent(proximo)}` : '/cadastro'}>
          Criar conta
        </LinkAuth>
      </div>
    </Moldura>
  )
}
