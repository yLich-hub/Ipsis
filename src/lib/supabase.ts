// =============================================================================
// Cliente Supabase para o runtime.
//
// Em runtime o app fala com o banco só por PostgREST/HTTPS (.rpc(), .from()).
// Conexão direta ao Postgres é exclusiva de scripts/, que rodam localmente:
// serverless + pool esgota conexão. Ver CLAUDE.md, "Deploy (Vercel)".
//
// A chave usada aqui é a publishable, sujeita a RLS somente-leitura. A service
// role NUNCA entra neste arquivo — ela ignora RLS e abriria o banco para
// escrita se vazasse no bundle do cliente.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

function exige(nome: string): string {
  const v = process.env[nome]
  if (!v) throw new Error(`variável de ambiente ausente: ${nome} (ver .env.local)`)
  return v
}

export const supabase = createClient(
  exige('NEXT_PUBLIC_SUPABASE_URL'),
  exige('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
)
