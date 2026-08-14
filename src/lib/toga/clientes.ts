// =============================================================================
// Clientes do escritório — a agenda, em `public.clientes` (migration 0009)
//
// Quem escreve é o cliente do NAVEGADOR, com a sessão. A RLS por `auth.uid()` é
// o que torna a agenda inacessível a qualquer outra sessão — e aqui isso pesa
// mais que no histórico de conversas: a linha guarda o nome de quem o advogado
// defende, num projeto de direito criminal.
//
// **Ao contrário do histórico, falha aqui não pode ser silenciosa.** Perder uma
// linha do histórico custa conforto; perder o cadastro de um cliente que a
// pessoa acabou de digitar custa o dado. Por isso as funções deste arquivo
// devolvem `{ ok: false, erro }` em vez de engolir — a tela mostra o recado e o
// formulário continua preenchido.
//
// O CPF é guardado como 11 dígitos, sem pontuação: máscara é assunto da tela, e
// gravar "123.456.789-09" faria a busca depender de o usuário digitar a
// pontuação do mesmo jeito das duas vezes.
// =============================================================================

'use client'

import { supabaseNavegador } from '@/lib/auth/navegador'

export type Cliente = {
  id: string
  nome: string
  /** 11 dígitos, ou vazio. A tela formata; o banco guarda cru. */
  cpf: string
  telefone: string
  email: string
  /** Id do caso vinculado, ou vazio. `on delete set null` no banco. */
  casoId: string
  nota: string
  criadoEm: string
  atualizadoEm: string
}

/** O que o formulário manda. Sem id: quem tem id é edição, e vai por parâmetro. */
export type Rascunho = Omit<Cliente, 'id' | 'criadoEm' | 'atualizadoEm'>

export const RASCUNHO_VAZIO: Rascunho = {
  nome: '',
  cpf: '',
  telefone: '',
  email: '',
  casoId: '',
  nota: '',
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

/** Disparado depois de toda escrita, para a lista se atualizar sem recarregar. */
export const EVENTO_CLIENTES = 'toga:clientes'

function avisa() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_CLIENTES))
}

// --- CPF ---------------------------------------------------------------------

export const soDigitos = (v: string) => v.replace(/\D/g, '')

/** `12345678909` → `123.456.789-09`. Deixa passar o que não tiver 11 dígitos. */
export function formataCpf(cpf: string): string {
  const d = soDigitos(cpf)
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * Dígitos verificadores do CPF.
 *
 * Vale a pena conferir aqui e não só no banco: o check de 0009 só olha o
 * formato (11 dígitos), e um CPF com dígito errado é o tipo de dado que passa
 * despercebido até a hora de peticionar. Recusa também os onze repetidos
 * (`111.111.111-11` e companhia), que passam na conta mas não existem.
 */
export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false

  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

// --- validação do rascunho ---------------------------------------------------

/**
 * Confere o que o banco também confere, e um pouco mais.
 *
 * Não é redundância inútil: o check do banco devolve uma mensagem do Postgres
 * ("violates check constraint clientes_cpf_ck"), que não é recado para
 * advogado nenhum. Aqui a mensagem é em português e aponta o campo.
 */
export function critica(r: Rascunho): string | null {
  if (!r.nome.trim()) return 'O nome é obrigatório.'
  if (r.nome.trim().length > 120) return 'O nome passa de 120 caracteres.'

  const cpf = soDigitos(r.cpf)
  if (cpf && cpf.length !== 11) return 'O CPF precisa ter 11 dígitos.'
  if (cpf && !cpfValido(cpf)) return 'CPF inválido — confira os dígitos verificadores.'

  const tel = r.telefone.trim()
  if (tel && (tel.length < 8 || tel.length > 24)) return 'O telefone precisa ter de 8 a 24 caracteres.'

  const email = r.email.trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail inválido.'

  if (r.nota.length > 2000) return 'A anotação passa de 2000 caracteres.'
  return null
}

/** Campo opcional vazio vira `null`, não `''`: o check do banco recusa string vazia. */
const ouNulo = (v: string) => (v.trim() ? v.trim() : null)

const daLinha = (l: Record<string, unknown>): Cliente => ({
  id: l.id as string,
  nome: (l.nome as string) ?? '',
  cpf: (l.cpf as string | null) ?? '',
  telefone: (l.telefone as string | null) ?? '',
  email: (l.email as string | null) ?? '',
  casoId: (l.caso_id as string | null) ?? '',
  nota: (l.nota as string | null) ?? '',
  criadoEm: l.criado_em as string,
  atualizadoEm: l.atualizado_em as string,
})

const COLUNAS = 'id,nome,cpf,telefone,email,caso_id,nota,criado_em,atualizado_em'

// --- leitura -----------------------------------------------------------------

/** A agenda, em ordem alfabética. `termo` filtra por nome, CPF, e-mail ou telefone. */
export async function lista(termo = ''): Promise<Resultado<Cliente[]>> {
  try {
    let q = supabaseNavegador().from('clientes').select(COLUNAS).order('nome')

    const t = termo.trim()
    if (t) {
      // `%` e `_` são curingas do `ilike` e não sobrevivem a escape pelo
      // PostgREST — o histórico já tropeçou nisso. Remover é melhor que uma
      // busca que devolve a agenda inteira em silêncio.
      const padrao = `%${t.replace(/[%_\\,()]/g, '')}%`
      const digitos = soDigitos(t)
      const alvos = [`nome.ilike.${padrao}`, `email.ilike.${padrao}`, `telefone.ilike.${padrao}`]
      // Procurar "123.456" por CPF só funciona contra os dígitos guardados.
      if (digitos) alvos.push(`cpf.ilike.%${digitos}%`)
      q = q.or(alvos.join(','))
    }

    const { data, error } = await q
    if (error) return { ok: false, erro: error.message }
    return { ok: true, dados: (data ?? []).map(daLinha) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler a agenda' }
  }
}

// --- escrita -----------------------------------------------------------------

/** Cria. Devolve o cliente com o id do banco. */
export async function cria(r: Rascunho): Promise<Resultado<Cliente>> {
  const problema = critica(r)
  if (problema) return { ok: false, erro: problema }

  try {
    const sb = supabaseNavegador()
    const { data: dono } = await sb.auth.getUser()
    if (!dono.user) return { ok: false, erro: 'sessão expirada — entre de novo' }

    const { data, error } = await sb
      .from('clientes')
      .insert({
        usuario_id: dono.user.id,
        nome: r.nome.trim(),
        cpf: ouNulo(soDigitos(r.cpf)),
        telefone: ouNulo(r.telefone),
        email: ouNulo(r.email),
        caso_id: ouNulo(r.casoId),
        nota: ouNulo(r.nota),
      })
      .select(COLUNAS)
      .single()

    if (error) return { ok: false, erro: traduz(error.message) }
    avisa()
    return { ok: true, dados: daLinha(data) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao cadastrar' }
  }
}

/** Atualiza. `atualizado_em` é escrito aqui porque não há trigger para isso. */
export async function atualiza(id: string, r: Rascunho): Promise<Resultado<Cliente>> {
  const problema = critica(r)
  if (problema) return { ok: false, erro: problema }

  try {
    const { data, error } = await supabaseNavegador()
      .from('clientes')
      .update({
        nome: r.nome.trim(),
        cpf: ouNulo(soDigitos(r.cpf)),
        telefone: ouNulo(r.telefone),
        email: ouNulo(r.email),
        caso_id: ouNulo(r.casoId),
        nota: ouNulo(r.nota),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select(COLUNAS)
      .single()

    if (error) return { ok: false, erro: traduz(error.message) }
    avisa()
    return { ok: true, dados: daLinha(data) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao salvar' }
  }
}

/** Apaga. Não há lixeira: a tela pede confirmação antes de chamar. */
export async function remove(id: string): Promise<Resultado<null>> {
  try {
    const { error } = await supabaseNavegador().from('clientes').delete().eq('id', id)
    if (error) return { ok: false, erro: error.message }
    avisa()
    return { ok: true, dados: null }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao apagar' }
  }
}

/**
 * Erro do Postgres vira recado em português.
 *
 * Só os dois que o usuário consegue causar digitando. O resto passa cru: uma
 * mensagem genérica esconderia a causa de quem pode consertá-la.
 */
function traduz(mensagem: string): string {
  if (mensagem.includes('clientes_usuario_cpf_uq')) {
    return 'Já existe um cliente cadastrado com este CPF.'
  }
  if (mensagem.includes('clientes_email_ck')) return 'E-mail inválido.'
  return mensagem
}
