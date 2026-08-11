// =============================================================================
// A busca do runtime: embedding da consulta + uma única RPC.
//
// Server-side apenas — a chave da OpenAI não pode ir para o bundle do browser.
// Chamado pela página /busca e pela rota /api/busca (console do agente).
//
// Duas degradações previstas, ambas silenciosas para o app e visíveis para o
// usuário: sem OPENAI_API_KEY ou com a API fora, `p_embedding` vai nulo e a
// busca cai para rubrica + lexical. Melhor uma busca com duas pernas do que uma
// tela de erro. Ver docs/busca.md.
// =============================================================================

import { supabase } from '@/lib/supabase'
import { classifica, refina, type Intencao } from './intencao'

export type Achado = {
  dispositivo_id: string
  lei_id: string
  lei_apelido: string
  vigencia_ate: string
  cobertura: 'integral' | 'parcial'
  cobertura_nota: string | null
  artigo_numero: string
  artigo_rubrica: string | null
  capitulo: string | null
  tipo: string
  rotulo: string
  citacao: string
  texto: string
  revogado: boolean
  score: number
  via_rubrica: boolean
  rubrica_termo: string | null
  papel: 'principal' | 'correlato' | 'requisito' | null
}

export type RespostaBusca = {
  consulta: string
  lei: string | null
  intencao: Intencao
  itens: Achado[]
  /** Resolvido por id de artigo, sem passar pela fusão. */
  direta: boolean
  /** A perna semântica entrou na fusão? */
  vetor: boolean
  /** Por que degradou, quando degradou. */
  aviso: string | null
  erro: string | null
  ms: number
}

const MODELO_EMBEDDING = 'text-embedding-3-small'

/**
 * Embedding da consulta. Custa fração de centavo por milhão de buscas — é a
 * única chamada a modelo aceitável em runtime neste projeto (geração de texto
 * é offline, ver CLAUDE.md, "Nenhuma chamada a LLM em runtime").
 */
async function embutir(consulta: string): Promise<{ vetor: string | null; aviso: string | null }> {
  const chave = process.env.OPENAI_API_KEY
  if (!chave) return { vetor: null, aviso: 'OPENAI_API_KEY ausente — busca sem a perna semântica' }

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
      body: JSON.stringify({ model: MODELO_EMBEDDING, input: consulta }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!r.ok) return { vetor: null, aviso: `OpenAI respondeu ${r.status} — busca sem a perna semântica` }

    const json = (await r.json()) as { data?: { embedding?: number[] }[] }
    const vetor = json.data?.[0]?.embedding
    if (!vetor?.length) return { vetor: null, aviso: 'embedding vazio — busca sem a perna semântica' }

    // A RPC recebe o vetor como string; PostgREST faz o cast para vector(1536).
    return { vetor: JSON.stringify(vetor), aviso: null }
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e)
    return { vetor: null, aviso: `embedding indisponível (${causa}) — busca sem a perna semântica` }
  }
}

const LEIS_CONHECIDAS = ['lei_11343_2006', 'dl_2848_1940', 'dl_3689_1941']

/**
 * Molde `dispositivo`: "art. 33 da Lei 11.343" não é uma busca, é um endereço.
 * Os ids textuais são estáveis e previsíveis (`lei_11343_2006_art33`), então o
 * artigo é lido direto — mandar isso para a fusão devolveria vizinhança
 * semântica em vez do artigo pedido, que é o pior resultado possível para a
 * consulta mais literal que existe.
 */
async function resolveDireto(
  intencao: Intencao,
  leiFiltro: string | null,
  qtd: number,
): Promise<Achado[] | null> {
  const alvo = intencao.artigo
  if (intencao.molde !== 'dispositivo' || !alvo) return null

  const numero = alvo.numero.toLowerCase()
  const leis = alvo.lei ? [alvo.lei] : leiFiltro ? [leiFiltro] : LEIS_CONHECIDAS
  const ids = leis
    .filter((l) => !leiFiltro || l === leiFiltro)
    .map((l) => `${l}_art${numero}`)
  if (ids.length === 0) return null

  const { data, error } = await supabase
    .from('v_dispositivo')
    .select(
      'id,lei_id,lei_apelido,vigencia_ate,cobertura,cobertura_nota,artigo_numero,artigo_rubrica,' +
        'capitulo,tipo,rotulo,citacao,texto,revogado,ordem',
    )
    .in('artigo_id', ids)
    .order('lei_id')
    .order('ordem')
    .limit(qtd)

  if (error || !data?.length) return null

  type LinhaDireta = Omit<
    Achado,
    'dispositivo_id' | 'score' | 'via_rubrica' | 'rubrica_termo' | 'papel'
  > & { id: string }

  return (data as unknown as LinhaDireta[]).map((d) => ({
    ...d,
    dispositivo_id: d.id,
    score: 0,
    via_rubrica: false,
    rubrica_termo: null,
    papel: null,
  }))
}

export async function consultar({
  q,
  lei = null,
  qtd = 12,
}: {
  q: string
  lei?: string | null
  qtd?: number
}): Promise<RespostaBusca> {
  const inicio = Date.now()
  const consulta = q.trim()
  const intencao = classifica(consulta)

  const base: RespostaBusca = {
    consulta,
    lei,
    intencao,
    itens: [],
    direta: false,
    vetor: false,
    aviso: null,
    erro: null,
    ms: 0,
  }

  if (!consulta) return { ...base, ms: Date.now() - inicio }

  // Endereço explícito não precisa de embedding: economiza a chamada e responde
  // em uma viagem. Artigo inexistente cai na busca híbrida logo abaixo.
  const direto = await resolveDireto(intencao, lei, qtd)
  if (direto) return { ...base, itens: direto, direta: true, ms: Date.now() - inicio }

  const { vetor, aviso } = await embutir(consulta)

  const { data, error } = await supabase.rpc('busca_hibrida', {
    p_consulta: consulta,
    p_embedding: vetor,
    p_qtd: Math.min(Math.max(qtd, 1), 40),
    p_lei: lei,
  })

  if (error) {
    return { ...base, vetor: vetor !== null, aviso, erro: error.message, ms: Date.now() - inicio }
  }

  const itens = (data ?? []) as Achado[]
  const primeiro = itens.find((i) => i.via_rubrica)

  return {
    ...base,
    intencao: refina(intencao, primeiro?.rubrica_termo ?? null),
    itens,
    vetor: vetor !== null,
    aviso,
    ms: Date.now() - inicio,
  }
}
