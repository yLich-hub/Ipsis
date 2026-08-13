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

/** As três leis do corpus — espelha `LEIS_CONHECIDAS` em `lib/busca/consultar.ts`. */
const LEIS = ['lei_11343_2006', 'dl_2848_1940', 'dl_3689_1941']

const QTD_PADRAO = 8
const QTD_MAX = 40

/**
 * `qtd` vem da URL ou do corpo, e as duas são entrada de usuário.
 *
 * `Number('abc')` é `NaN`, e `NaN` atravessa `Math.max`, `Math.min` e
 * `Array.slice` sem reclamar: `slice(0, NaN)` devolve lista vazia. O efeito era
 * uma resposta de zero resultados apresentada como busca bem-sucedida —
 * silenciosa, que é o pior modo de falha. Sanear na borda impede que a consulta
 * receba algo que não é número.
 */
function saneiaQtd(bruto: unknown): number {
  // Ausente é diferente de inválido, e os dois querem o padrão. `Number(null)` e
  // `Number('')` são 0, não NaN — sem este primeiro teste, uma chamada sem `qtd`
  // caía em 0, era elevada a 1 pelo clamp, e a busca devolvia um resultado só.
  if (bruto === null || bruto === undefined || bruto === '') return QTD_PADRAO
  const n = Math.trunc(Number(bruto))
  if (!Number.isFinite(n) || n <= 0) return QTD_PADRAO
  return Math.min(n, QTD_MAX)
}

/**
 * Lei fora do corpus filtraria tudo e devolveria vazio sem dizer por quê.
 * Valor desconhecido vira `null`, que é "todas as leis" — o padrão honesto.
 */
function saneiaLei(bruto: unknown): string | null {
  return typeof bruto === 'string' && LEIS.includes(bruto) ? bruto : null
}

async function responde(q: unknown, lei: unknown, qtd: unknown) {
  const consulta = typeof q === 'string' ? q.trim() : ''
  if (!consulta) {
    return Response.json({ erro: 'consulta vazia' }, { status: 400 })
  }
  const resposta = await consultar({
    q: consulta.slice(0, LIMITE_CONSULTA),
    lei: saneiaLei(lei),
    qtd: saneiaQtd(qtd),
  })
  return Response.json(resposta, {
    status: resposta.erro ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return responde(p.get('q'), p.get('lei'), p.get('qtd'))
}

export async function POST(req: Request) {
  let corpo: { q?: unknown; lei?: unknown; qtd?: unknown }
  try {
    corpo = (await req.json()) as typeof corpo
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }
  return responde(corpo?.q, corpo?.lei, corpo?.qtd)
}
