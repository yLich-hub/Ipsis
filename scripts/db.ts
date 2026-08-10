// =============================================================================
// Conexão direta ao Postgres — exclusiva de scripts/, nunca do runtime.
//
// Serverless + pool esgota conexão; por isso a Vercel fala com o banco só por
// PostgREST. Aqui, rodando na máquina local, a conexão direta é o que permite
// transação explícita — e transação explícita é o que faz as constraints
// `deferrable initially deferred` do 0001_schema.sql valerem alguma coisa.
// Via PostgREST cada upsert é sua própria transação e a checagem volta a ser
// imediata, o que quebra qualquer reordenação num re-seed.
// =============================================================================

import { config } from 'dotenv'
import postgres from 'postgres'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '..', '.env.local'), quiet: true })

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL ausente em .env.local.\n' +
      'Supabase → botão Connect → Connection String → Transaction pooler (porta 6543).',
  )
}
if (!/:6543\//.test(url)) {
  console.warn(
    '· aviso: DATABASE_URL não aponta para a porta 6543 (transaction pooler). ' +
      'Confira a aba escolhida no modal Connect.',
  )
}

export const sql = postgres(url, {
  // O pooler em modo transaction não guarda estado entre statements, então
  // prepared statements nomeados quebram na segunda chamada.
  prepare: false,
  ssl: 'require',
  max: 4,
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice: () => {},
})

/** Fecha a conexão e devolve o código de saída certo. Use no fim de todo script. */
export async function encerra(erro?: unknown) {
  await sql.end({ timeout: 5 })
  if (erro) {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  }
}
