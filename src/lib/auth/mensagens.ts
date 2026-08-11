// =============================================================================
// Validação de formulário e tradução de erro do Auth.
//
// Duas responsabilidades, um arquivo, porque são o mesmo assunto visto de dois
// lados: o que a interface diz ao usuário quando algo não passa.
//
// Nenhuma mensagem do Supabase chega crua à tela. Além de vir em inglês, o
// texto do erro carrega detalhe de implementação que não ajuda quem digitou a
// senha errada — e, no caso de cadastro, distinguir "e-mail não existe" de
// "senha errada" entrega ao atacante quais e-mails têm conta.
// =============================================================================

/** Erro do supabase-js, sem depender do import de tipo em código de cliente. */
type ErroAuth = { code?: string; status?: number; message?: string }

export const SENHA_MINIMA = 8

// --- validação ---------------------------------------------------------------

/**
 * Não é a gramática do RFC 5322 e não tenta ser: o veredito real sobre um
 * e-mail é o servidor de Auth. O que se quer aqui é pegar o erro de digitação
 * antes da ida à rede — daí a regra ser "algo@algo.tld, sem espaço".
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export function validarEmail(email: string): string | null {
  if (!email.trim()) return 'Informe seu e-mail.'
  if (!EMAIL_RE.test(email.trim())) return 'Digite um e-mail válido.'
  return null
}

export function validarSenha(senha: string): string | null {
  if (!senha) return 'Informe sua senha.'
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`
  return null
}

export function validarConfirmacao(senha: string, confirmacao: string): string | null {
  if (!confirmacao) return 'Repita a senha para confirmar.'
  if (senha !== confirmacao) return 'As senhas não coincidem.'
  return null
}

// --- tradução de erro --------------------------------------------------------

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed:
    'Esta conta ainda exige confirmação de e-mail. Verifique sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
  email_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
  weak_password: `Senha fraca. Use ao menos ${SENHA_MINIMA} caracteres.`,
  same_password: 'A nova senha precisa ser diferente da anterior.',
  signup_disabled: 'A criação de contas está desativada neste ambiente.',
  user_banned: 'Esta conta está bloqueada.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  otp_expired: 'Este link expirou. Peça um novo e-mail de recuperação.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  refresh_token_not_found: 'Sua sessão expirou. Entre novamente.',
  validation_failed: 'Confira os dados informados.',
}

/**
 * O padrão por operação existe porque erro sem código conhecido não pode virar
 * "erro inesperado: [object Object]" na cara do usuário. Rede fora do ar,
 * projeto pausado por inatividade e código novo do Supabase caem todos aqui.
 */
export function mensagemDeErro(erro: unknown, padrao: string): string {
  const e = erro as ErroAuth | null
  if (!e) return padrao

  if (e.code && POR_CODIGO[e.code]) return POR_CODIGO[e.code]!
  if (e.status === 429) return POR_CODIGO.over_request_rate_limit!

  // Instâncias mais antigas do Auth respondem sem `code`; a mensagem é o que há.
  const msg = (e.message ?? '').toLowerCase()
  if (msg.includes('invalid login credentials')) return POR_CODIGO.invalid_credentials!
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return POR_CODIGO.user_already_exists!
  if (msg.includes('email not confirmed')) return POR_CODIGO.email_not_confirmed!
  if (msg.includes('password should be')) return POR_CODIGO.weak_password!
  if (msg.includes('failed to fetch') || msg.includes('fetch failed'))
    return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.'

  return padrao
}
