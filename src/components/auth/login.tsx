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
import { MARCA } from '@/lib/toga/marca'

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
      // `Campo` já marcava `aria-invalid` e ligava a mensagem por
      // `aria-describedby`; o que faltava era o foco chegar lá. Sem isto, quem
      // envia por teclado fica no botão e a mensagem some do caminho — ela está
      // acima, e a próxima tecla leva para baixo.
      //
      // Pelo `id`, que é prop obrigatória de `Campo` e já é o que sustenta o
      // `htmlFor` e o `aria-describedby` dele. Um `ref` novo diria a mesma coisa
      // por um segundo caminho.
      document.getElementById(erroEmail ? 'email' : 'senha')?.focus()
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
      // Sem mover o foco, e é decisão: a mensagem diz "E-mail ou senha
      // incorretos" nos dois casos justamente para não dizer qual dos dois
      // errou, e mandar o cursor para um deles desfaria isso na prática. O
      // `role="alert"` do aviso é o que anuncia, e ele basta.
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
    <Moldura titulo="Entrar" sub={`Acesse sua área de trabalho no ${MARCA.nome}.`}>
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
