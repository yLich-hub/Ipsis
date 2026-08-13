// =============================================================================
// GET /api/vigilia/coletar — alvo do Vercel Cron diário
//
// A rota é o único ponto do produto que fala com API de terceiro em runtime, e
// ela não está no caminho de ninguém: quem abre `/fontes` lê o que esta rota
// gravou, não dispara coleta. Foi decisão — uma tela que coleta ao abrir põe a
// disponibilidade da Câmara e do Senado no caminho do usuário, e some junto com
// elas.
//
// **Autenticação por segredo, não por sessão.** O cron da Vercel não tem
// navegador nem cookie, então `lib/auth/rotas.ts` não serve aqui: a rota entra
// em `PUBLICAS` para o middleware não a redirecionar para o login, e a porta
// fecha com `CRON_SECRET`. Sem o segredo configurado a rota recusa tudo — o
// lado certo para errar, já que ela escreve no banco com service role.
//
// A Vercel manda o segredo em `Authorization: Bearer <CRON_SECRET>` sozinha,
// sem que o `vercel.json` precise declará-lo.
// =============================================================================

import { atualizaPendentes, coleta } from '@/lib/vigilia/coletar'
import { clienteDeEscrita } from '@/lib/vigilia/escrita'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// A coleta pagina a Câmara e baixa a janela do Senado; os 10s do padrão não
// chegam perto. 300s é o teto do plano Pro; no Hobby a plataforma corta antes,
// e o que já foi gravado até ali permanece — a coleta grava fonte a fonte.
export const maxDuration = 300

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return Response.json(
      { ok: false, erro: 'CRON_SECRET ausente — a rota de coleta fica fechada sem ele' },
      { status: 503 },
    )
  }

  if (req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return Response.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  if (!clienteDeEscrita()) {
    return Response.json(
      {
        ok: false,
        erro:
          'SUPABASE_SERVICE_ROLE_KEY ausente. A coleta escreve numa tabela com RLS fechada ' +
          'para anon e authenticated (migration 0012) e não tem sessão para ancorar policy.',
      },
      { status: 503 },
    )
  }

  const inicio = Date.now()

  try {
    // A janela vem vazia de propósito: quem decide é `JANELA_DIAS`. `?desde=`
    // existe para a carga inicial, feita uma vez, e é aceito só no formato ISO
    // — data livre viraria consulta arbitrária a duas APIs públicas.
    const url = new URL(req.url)
    const pedido = url.searchParams.get('desde') ?? ''
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : undefined

    const resumo = await coleta(desde)
    const promovidos = await atualizaPendentes()

    return Response.json(
      { ...resumo, promovidos, ms: Date.now() - inicio },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    return Response.json(
      { ok: false, erro: e instanceof Error ? e.message : String(e), ms: Date.now() - inicio },
      { status: 500 },
    )
  }
}
