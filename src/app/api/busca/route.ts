// =============================================================================
// GET|POST /api/busca — a busca híbrida para o console do agente
//
// Existe porque o embedding da consulta precisa da chave da OpenAI, que é
// server-side. O console (componente cliente) chama esta rota; a página /busca
// chama `consultar()` direto, sem passar pela rede duas vezes.
//
// Sem autenticação no projeto, a rota é pública — por isso ela só embute
// consulta (fração de centavo por milhão) e nunca gera texto.
// =============================================================================

import { consultar } from '@/lib/busca/consultar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMITE_CONSULTA = 400

async function responde(q: string, lei: string | null, qtd: number) {
  if (!q.trim()) {
    return Response.json({ erro: 'consulta vazia' }, { status: 400 })
  }
  const resposta = await consultar({ q: q.slice(0, LIMITE_CONSULTA), lei, qtd })
  return Response.json(resposta, {
    status: resposta.erro ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return responde(p.get('q') ?? '', p.get('lei'), Number(p.get('qtd') ?? 8))
}

export async function POST(req: Request) {
  let corpo: { q?: string; lei?: string | null; qtd?: number }
  try {
    corpo = (await req.json()) as typeof corpo
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }
  return responde(corpo.q ?? '', corpo.lei ?? null, corpo.qtd ?? 8)
}
