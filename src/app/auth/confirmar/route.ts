// =============================================================================
// /auth/confirmar — o retorno dos links enviados por e-mail.
//
// O link de recuperação não chega direto na tela de nova senha: ele traz um
// código de uso único que precisa virar sessão, e trocar código por sessão é
// operação de servidor. Feito aqui, o cookie de sessão sai já na resposta do
// redirect e a tela seguinte renderiza autenticada de primeira, sem piscar.
//
// Dois formatos são aceitos porque o Supabase emite um ou outro conforme o
// template de e-mail do projeto:
//   `?code=`       — fluxo PKCE, o padrão de quem pede pelo navegador;
//   `?token_hash=` — template customizado com {{ .TokenHash }}.
// Falhou qualquer um dos dois, o usuário vai pedir outro link em vez de encarar
// uma tela de erro sem saída.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { destinoSeguro } from '@/lib/auth/rotas'
import { supabaseServidor } from '@/lib/auth/servidor'

const TIPOS: EmailOtpType[] = ['recovery', 'email', 'signup', 'magiclink', 'invite', 'email_change']

/**
 * Marca de que ESTA sessão nasceu de um link de recuperação.
 *
 * Existe porque, para o Supabase, a sessão aberta pelo link e a sessão comum de
 * trabalho são a mesma coisa — e `updateUser({ password })` aceita as duas. Sem
 * uma marca, quem já está logado abre `/redefinir-senha` e troca a senha sem
 * provar que conhece a antiga; um cookie emprestado vira conta perdida.
 *
 * `httpOnly` porque quem lê é o servidor, na página. Curto porque o gesto é de
 * um minuto: quem demorar mais que a janela pede outro link, que é barato.
 *
 * **Isto não substitui a configuração do painel.** A trava completa é "Secure
 * password change" no Supabase, que exige login recente e vale também para quem
 * chamar o SDK direto, sem passar por tela nenhuma. O cookie resolve o acidente;
 * o painel resolve o atacante. Ver README, "Configuração exigida no painel".
 */
const COOKIE_RECUPERACAO = 'ipsis-recuperacao'
const MINUTOS_DE_RECUPERACAO = 15

const TELA_DE_NOVA_SENHA = '/redefinir-senha'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const destino = destinoSeguro(searchParams.get('proximo'))
  const paraOrigem = (caminho: string) => new URL(caminho, request.nextUrl.origin)

  /**
   * O redirect de sucesso, com a marca quando o destino é a tela de nova senha.
   *
   * O sinal é o `proximo`, e não o `type` do link: o fluxo PKCE manda só um
   * `?code=`, que não diz de que espécie é. Quem sabe é `esqueci-senha.tsx`, que
   * pede `redirectTo=…/auth/confirmar?proximo=%2Fredefinir-senha` — então o
   * destino É a informação, e ele já passou por `destinoSeguro`.
   */
  const concluir = () => {
    const r = NextResponse.redirect(paraOrigem(destino))
    if (destino.split('?')[0] === TELA_DE_NOVA_SENHA) {
      r.cookies.set(COOKIE_RECUPERACAO, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: MINUTOS_DE_RECUPERACAO * 60,
      })
    }
    return r
  }

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type')

  try {
    const supabase = await supabaseServidor()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return concluir()
    } else if (tokenHash && tipo && TIPOS.includes(tipo as EmailOtpType)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: tipo as EmailOtpType,
      })
      if (!error) return concluir()
    }
  } catch {
    // Auth fora do ar cai no mesmo lugar que link vencido: a tela do pedido.
  }

  return NextResponse.redirect(paraOrigem('/esqueci-senha?erro=link'))
}
