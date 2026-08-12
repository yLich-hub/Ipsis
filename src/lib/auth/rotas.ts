// =============================================================================
// Quem é público e quem exige sessão — a lista mora aqui, não espalhada.
//
// A regra é fechada por padrão: só é público o que está listado abaixo. Rota
// nova nasce protegida, que é o lado certo para errar.
// =============================================================================

/** Para onde vai quem acabou de entrar, e o padrão de todo redirect pós-login. */
export const DESTINO_PADRAO = '/consulta'

export const ROTA_LOGIN = '/login'

/** Nome do parâmetro que carrega o destino original através do login. */
export const PARAM_PROXIMO = 'proximo'

/**
 * Formulários de autenticação. Quem já tem sessão não deve vê-los — reapresentar
 * o login a quem está logado é a forma mais rápida de fazer o usuário duvidar de
 * que entrou.
 *
 * `/redefinir-senha` fica de fora de propósito: chega-se lá COM sessão (a que o
 * link de recuperação abriu), e mandar essa sessão de volta para o painel
 * tornaria a troca de senha impossível.
 */
export const ROTAS_DE_FORMULARIO = ['/login', '/cadastro', '/esqueci-senha'] as const

/**
 * Público. `/api/health` é o alvo do cron diário da Vercel que impede o banco
 * gratuito de pausar — exigir sessão nele derrubaria justamente a defesa contra
 * inatividade.
 *
 * `/api/busca` também é público: ele lê o mesmo corpus que a chave anônima já
 * expõe sob RLS somente-leitura, e devolver um redirect 307 para /login a um
 * `fetch()` de JSON produz erro incompreensível no console do agente.
 *
 * `/` não está aqui, e não está por ser protegida: ela não é tela nenhuma. O
 * middleware a trata antes desta lista, desviando para `/consulta` ou `/login`
 * conforme a sessão. Ver `ehRaiz` em `middleware.ts`.
 */
const PUBLICAS = [
  '/login',
  '/cadastro',
  '/esqueci-senha',
  '/redefinir-senha',
  '/auth',
  '/api/health',
  '/api/busca',
]

export function ehPublica(caminho: string): boolean {
  return PUBLICAS.some((p) => caminho === p || caminho.startsWith(`${p}/`))
}

export function ehFormularioDeAuth(caminho: string): boolean {
  return ROTAS_DE_FORMULARIO.some((p) => caminho === p)
}

/**
 * Destino pós-login vindo da URL, saneado.
 *
 * `?proximo=` é entrada do usuário e vira um `redirect()`. Sem esta trava,
 * `?proximo=https://sitemalicioso.exemplo` transforma a tela de login num
 * trampolim de phishing hospedado no domínio do projeto — o clássico open
 * redirect. Só passa caminho relativo de uma barra só: `//host` é URL protocolo-
 * relativa e o navegador a trata como absoluta.
 */
export function destinoSeguro(proximo: string | null | undefined): string {
  if (!proximo) return DESTINO_PADRAO
  if (!proximo.startsWith('/') || proximo.startsWith('//')) return DESTINO_PADRAO
  const semQuery = proximo.split('?')[0] ?? ''
  if (ehFormularioDeAuth(semQuery)) return DESTINO_PADRAO
  // `/` só devolveria o usuário ao middleware para ser desviado de novo. Vale o
  // mesmo motivo dos formulários de auth: terminar onde se trabalha.
  if (semQuery === '/') return DESTINO_PADRAO
  return proximo
}
