// =============================================================================
// As duas variáveis de ambiente do Auth, lidas num lugar só.
//
// São as MESMAS já usadas por `lib/supabase.ts` — autenticação não introduziu
// segredo novo. `NEXT_PUBLIC_*` é o que vai para o bundle do navegador, e por
// isso só a chave publishable pode morar aqui: ela é pública por construção e
// está sujeita a RLS. `SUPABASE_SERVICE_ROLE_KEY` ignora RLS e não é lida em
// nenhum arquivo de `src/`.
//
// A leitura é literal (`process.env.NOME`, não `process.env[nome]`) porque o
// Next substitui `NEXT_PUBLIC_*` em tempo de build por casamento textual;
// acesso indexado chega ao navegador como `undefined`.
// =============================================================================

function exige(nome: string, valor: string | undefined): string {
  if (!valor) throw new Error(`variável de ambiente ausente: ${nome} (ver .env.example)`)
  return valor
}

export const urlSupabase = () =>
  exige('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)

export const chaveSupabase = () =>
  exige('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
