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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const destino = destinoSeguro(searchParams.get('proximo'))
  const paraOrigem = (caminho: string) => new URL(caminho, request.nextUrl.origin)

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type')

  try {
    const supabase = await supabaseServidor()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(paraOrigem(destino))
    } else if (tokenHash && tipo && TIPOS.includes(tipo as EmailOtpType)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: tipo as EmailOtpType,
      })
      if (!error) return NextResponse.redirect(paraOrigem(destino))
    }
  } catch {
    // Auth fora do ar cai no mesmo lugar que link vencido: a tela do pedido.
  }

  return NextResponse.redirect(paraOrigem('/esqueci-senha?erro=link'))
}
