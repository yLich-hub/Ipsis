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

// -----------------------------------------------------------------------------
// Content-Security-Policy
//
// **Por que aqui e não em `next.config.mjs`.** A política precisa de um nonce
// novo por requisição, e `headers()` do Next é estático — o valor é calculado no
// build e repetido para todo mundo. Nonce fixo não é nonce. O que não muda por
// requisição (nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy)
// ficou lá.
//
// **Como o Next enxerga o nonce.** Ele lê o cabeçalho `content-security-policy`
// da REQUISIÇÃO e carimba o nonce nos próprios scripts. Por isso ele é escrito
// nos dois lados: na requisição, para o Next; na resposta, para o navegador.
//
// `'strict-dynamic'` é o que permite aos scripts do Next carregar os chunks
// deles sem que cada arquivo precise estar numa lista — o nonce autoriza o
// carregador, e o carregador propaga a confiança. Com ele, `'self'` vira
// redundante para script, e é assim que a política fica curta sem ficar frouxa.
//
// **O único `dangerouslySetInnerHTML` do produto é o motivo de tudo isto.** Ele
// está em `app/(app)/vademecum/[leiId]/page.tsx` e recebe HTML saneado em build
// por allowlist. A CSP não substitui aquele saneamento: ela é a camada que sobra
// no dia em que o saneamento falhar.
// -----------------------------------------------------------------------------
const EM_DESENVOLVIMENTO = process.env.NODE_ENV !== 'production'

function politicaDeSeguranca(nonce: string): string {
  return [
    "default-src 'self'",
    // `unsafe-eval` só em desenvolvimento: o `next dev` compila e recarrega por
    // eval, e sem esta folga a tela não sobe na máquina de ninguém. Em produção
    // ela não entra — e é justamente a diferença que faz a suíte de navegador
    // precisar rodar contra `next start`, não contra `next dev`, para provar
    // alguma coisa sobre a política que vai ao ar.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:${
      EM_DESENVOLVIMENTO ? " 'unsafe-eval'" : ''
    }`,
    // `unsafe-inline` em estilo é inevitável e é aceitável: o JSX usa `style={{}}`
    // em vários pontos (largura de barra, cor calculada em runtime — ver
    // `lib/toga/tokens.ts`), e atributo de estilo não carrega nonce. Estilo não
    // executa código; o risco que resta é de aparência, não de execução.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // `data:` porque o cartão do OpenGraph e os ícones em SVG embutido passam
    // por aí; `blob:` porque o `.docx` é entregue como blob para download.
    "img-src 'self' data: blob:",
    // O navegador fala com o Supabase (Auth e PostgREST) e com mais ninguém. A
    // OpenAI é chamada só do servidor, e por isso não está aqui — se um dia
    // aparecer nesta linha, é sinal de que a chave desceu para o cliente.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/**
 * Carimba a política na resposta.
 *
 * Chamada em TODA saída do middleware, e não numa só: o arquivo tem cinco
 * caminhos de retorno (o `/auth/*`, os dois desvios da raiz, o `next()` da rota
 * pública e a resposta final), e uma política que só sai por um deles é uma
 * política que não existe nas outras quatro telas.
 */
function comSeguranca(resposta: NextResponse, csp: string): NextResponse {
  resposta.headers.set('Content-Security-Policy', csp)
  return resposta
}

export async function middleware(request: NextRequest) {
  const caminho = request.nextUrl.pathname

  // Um nonce por requisição, de fonte criptográfica. `Math.random()` não serve
  // aqui: nonce previsível é nonce escrito pelo atacante.
  const nonce = btoa(crypto.randomUUID())
  const csp = politicaDeSeguranca(nonce)

  // O Next lê a política da REQUISIÇÃO para saber com que nonce carimbar os
  // próprios scripts. Escrever só na resposta produziria o pior dos mundos: uma
  // CSP estrita no navegador e nenhum script do Next autorizado por ela.
  request.headers.set('x-nonce', nonce)
  request.headers.set('Content-Security-Policy', csp)

  // `/auth/*` passa direto. Não é só economia de uma ida ao Auth: o retorno do
  // link de recuperação traz o cookie de code verifier do PKCE, e quem troca o
  // código por sessão é o route handler. Deixar o middleware mexer na sessão
  // antes dele é convidar a corrida em que o verifier some no meio da troca.
  if (caminho.startsWith('/auth/')) {
    return comSeguranca(NextResponse.next({ request }), csp)
  }

  // A raiz não é tela: é um desvio. Quem tem sessão vai para o trabalho, quem
  // não tem vai para o login. Sem cookie a decisão já está tomada, e resolvê-la
  // aqui poupa a ida ao servidor de Auth do visitante anônimo — que é o caso
  // mais comum de todos na raiz.
  const ehRaiz = caminho === '/'
  if (ehRaiz && !temCookieDeSessao(request)) {
    return comSeguranca(NextResponse.redirect(new URL(ROTA_LOGIN, request.url)), csp)
  }

  const publica = ehPublica(caminho)

  if (publica && !temCookieDeSessao(request)) {
    return comSeguranca(NextResponse.next({ request }), csp)
  }

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
    return comSeguranca(r, csp)
  }

  // Raiz com cookie: só agora se sabe se o cookie vale alguma coisa. Cookie
  // expirado cai no login, não numa tela em branco.
  if (ehRaiz) {
    return redirecionar(new URL(usuario ? DESTINO_PADRAO : ROTA_LOGIN, request.url))
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

  return comSeguranca(resposta, csp)
}

export const config = {
  // Tudo, menos estático. Rota nova entra na proteção sem ninguém lembrar de
  // adicioná-la — que é o ponto de proteger por exclusão e não por inclusão.
  //
  // **`(?!api/)` na frente da lista de extensões, e ele não é detalhe.** A
  // exclusão por extensão existe para arquivo estático, mas ela olhava o caminho
  // inteiro: num segmento dinâmico, quem escolhe o fim do caminho é o chamador.
  // Medido executando este próprio regex, antes do conserto:
  //
  //     /api/peca/caso_flagrante   ->  middleware RODA
  //     /api/peca/caso.txt         ->  middleware PULADO
  //
  // Nada vazava por ali — nenhum id de caso termina em extensão excluída, e
  // `casos` é curadoria pública. Mas a autorização das rotas de API vivia só
  // aqui, então quem contornasse esta linha contornava tudo. Duas coisas mudaram
  // juntas: o `(?!api/)` abaixo, e a checagem de sessão dentro de cada handler.
  //
  // Página continua fora da negativa de propósito: `/artigo/abc.xml` segue
  // pulando o middleware, e não é problema, porque tudo sob `(app)/` repete o
  // `redirect` no layout. Quem não tinha segunda camada era a rota de API.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
