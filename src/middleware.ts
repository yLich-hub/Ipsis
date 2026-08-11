// =============================================================================
// Middleware — renovação da sessão e porteiro das rotas.
//
// Duas coisas acontecem aqui, e a ordem importa:
//
// 1. O token de acesso é renovado e reescrito nos cookies. Precisa ser no
//    middleware: componente de servidor não pode escrever cookie (a resposta já
//    começou a ser transmitida), então se a renovação não acontecer antes, a
//    sessão morre em ~1h e o usuário é deslogado no meio do trabalho.
//
// 2. A decisão de acesso, tomada sobre `getUser()` — que valida o JWT no
//    servidor de Auth — e nunca sobre `getSession()`, que só lê o cookie. O
//    cookie é território do cliente: quem decidisse por ele estaria deixando o
//    navegador afirmar quem é.
//
// Proteger aqui, e não em cada página, é o que garante que rota nova nasça
// fechada. Ver `lib/auth/rotas.ts` para a lista de exceções.
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { chaveSupabase, urlSupabase } from '@/lib/auth/ambiente'
import {
  DESTINO_PADRAO,
  PARAM_PROXIMO,
  ROTA_LOGIN,
  destinoSeguro,
  ehFormularioDeAuth,
  ehPublica,
} from '@/lib/auth/rotas'

/** Visitante anônimo não tem cookie de sessão — e não precisa de ida à rede. */
const temCookieDeSessao = (req: NextRequest) =>
  req.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))

export async function middleware(request: NextRequest) {
  const caminho = request.nextUrl.pathname

  // `/auth/*` passa direto. Não é só economia de uma ida ao Auth: o retorno do
  // link de recuperação traz o cookie de code verifier do PKCE, e quem troca o
  // código por sessão é o route handler. Deixar o middleware mexer na sessão
  // antes dele é convidar a corrida em que o verifier some no meio da troca.
  if (caminho.startsWith('/auth/')) return NextResponse.next()

  const publica = ehPublica(caminho)

  if (publica && !temCookieDeSessao(request)) return NextResponse.next()

  // `resposta` é reatribuída dentro de `setAll` porque os cookies renovados
  // precisam existir nos DOIS lados: na requisição (para o componente de
  // servidor que roda logo abaixo enxergar o token novo) e na resposta (para o
  // navegador guardá-lo). Recriar o `NextResponse.next({ request })` é a forma
  // documentada de propagar a requisição já alterada.
  let resposta = NextResponse.next({ request })

  const supabase = createServerClient(urlSupabase(), chaveSupabase(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesNovos) => {
        for (const { name, value } of cookiesNovos) request.cookies.set(name, value)
        resposta = NextResponse.next({ request })
        for (const { name, value, options } of cookiesNovos) resposta.cookies.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()
  const usuario = error ? null : data.user

  // Um redirect é uma resposta nova: sem copiar os cookies renovados para ela, a
  // renovação feita acima se perde e o usuário roda em círculo entre a rota
  // protegida e o login.
  const redirecionar = (destino: URL) => {
    const r = NextResponse.redirect(destino)
    for (const c of resposta.cookies.getAll()) r.cookies.set(c)
    return r
  }

  if (!usuario && !publica) {
    const url = request.nextUrl.clone()
    url.pathname = ROTA_LOGIN
    url.search = ''
    // O destino original volta pela URL para que o login termine onde o usuário
    // queria estar, não num painel genérico. Saneado em `destinoSeguro`.
    url.searchParams.set(PARAM_PROXIMO, `${caminho}${request.nextUrl.search}`)
    return redirecionar(url)
  }

  if (usuario && ehFormularioDeAuth(caminho)) {
    // `new URL(destino, base)` e não `url.pathname = destino`: o destino pode
    // trazer query (`/busca?q=…`), e atribuir tudo ao pathname escaparia o `?`.
    const destino = destinoSeguro(request.nextUrl.searchParams.get(PARAM_PROXIMO))
    return redirecionar(new URL(destino || DESTINO_PADRAO, request.url))
  }

  return resposta
}

export const config = {
  // Tudo, menos estático. Rota nova entra na proteção sem ninguém lembrar de
  // adicioná-la — que é o ponto de proteger por exclusão e não por inclusão.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
