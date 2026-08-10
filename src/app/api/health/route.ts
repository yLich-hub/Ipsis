// =============================================================================
// GET /api/health — alvo do Vercel Cron diário
//
// O plano gratuito do Supabase pausa projetos após alguns dias sem atividade, e
// um portfólio é justamente um link clicado semanas depois. Esta rota toca o
// banco uma vez por dia para impedir isso.
//
// Também serve de diagnóstico: devolve as contagens de public.saude(), então dá
// para ver num GET se o seed e os embeddings estão de pé.
// =============================================================================

import { supabase } from '@/lib/supabase'

// Sem cache: uma resposta memoizada não tocaria o banco, que é o único motivo
// desta rota existir.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const inicio = Date.now()
  const { data, error } = await supabase.rpc('saude')

  if (error) {
    return Response.json(
      { ok: false, erro: error.message, ms: Date.now() - inicio },
      { status: 503 },
    )
  }

  return Response.json(
    { ...(data as Record<string, unknown>), ms: Date.now() - inicio },
    { headers: { 'cache-control': 'no-store' } },
  )
}
