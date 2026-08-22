// =============================================================================
// Acervo de decretos do Paraná — leitura para as telas.
//
// Mesmo contrato de `lib/dados.ts`: só PostgREST/HTTPS, e erro é valor de
// retorno, não exceção. O banco gratuito do Supabase pausa por inatividade, e
// uma tela que explode com stack trace é pior que uma que diz o que houve.
//
// **Este módulo é o único caminho para `decretos_pr`, e ele não conhece
// `dispositivos`.** A separação é a mesma do acervo Vade Mecum e dos
// precedentes do STJ, e está escrita na migration 0018: decreto do Executivo
// estadual não é corpus citável em peça. Aqui ela aparece como ausência —
// nenhuma função devolve um id que a minuta saiba resolver.
//
// O que é puro — tipos, espécie, data — mora em `formato.ts`, que não importa
// cliente nenhum e por isso pode ser testado offline.
// =============================================================================

import { supabase } from '@/lib/supabase'

import type {
  AchadoDecreto,
  BlocoDecreto,
  DecretoInteiro,
  DecretoResumo,
} from './formato'

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

async function tenta<T>(
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Resultado<T>> {
  try {
    const { data, error } = await consulta
    if (error) return { ok: false, erro: error.message }
    if (data === null) return { ok: false, erro: 'sem dados' }
    return { ok: true, dados: data as T }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

const COLUNAS_RESUMO =
  'id, numero, ano, epigrafe, sumula, publicado_em, conferido_em, versao, url'

// --- leitura -----------------------------------------------------------------

/**
 * Teto de linhas por resposta do PostgREST.
 *
 * **Não é escolha nossa: é o padrão do Supabase**, e ele trunca em silêncio.
 * Uma consulta sem `range` devolve no máximo mil linhas, com status 200 e sem
 * aviso nenhum — a lista chega curta e parece completa.
 */
const PAGINA = 1000

/**
 * A lista inteira, sem o texto dos blocos.
 *
 * **Pagina de propósito, e isso custou um defeito visível.** A primeira versão
 * fazia um `select` só, e a tela mostrava 1.000 dos 1.989 decretos: 2026
 * inteiro (214), 2025 inteiro (436) e 350 de 2024 — a soma dá exatamente mil.
 * Como a ordem é por data decrescente, o corte comia os anos mais antigos por
 * inteiro: **2022 e 2023 simplesmente não existiam na tela**, nem na faceta de
 * ano, nem na contagem. Nada quebrou e nada avisou; a tela dizia "1000 de 1000"
 * e parecia certa.
 *
 * É a mesma classe de erro que este projeto persegue em toda parte — o número
 * plausível que responde à pergunta errada —, e aqui ela vinha de um padrão de
 * infraestrutura, não de uma decisão de produto.
 *
 * Sem paginação de resultado na tela: o recorte normativo é de ordem de milhar,
 * os resumos não trazem texto, e o filtro é local e instantâneo, como em
 * `/jurisprudencia`. Se o acervo crescer uma ordem de grandeza, isto vira
 * paginação de verdade — e o sinal disso é esta função, não uma suposição de
 * hoje.
 */
export async function decretos(): Promise<Resultado<DecretoResumo[]>> {
  const todos: DecretoResumo[] = []

  for (let inicio = 0; ; inicio += PAGINA) {
    const r = await tenta<DecretoResumo[]>(
      supabase
        .from('decretos_pr')
        .select(COLUNAS_RESUMO)
        .order('publicado_em', { ascending: false })
        .order('numero', { ascending: false })
        .range(inicio, inicio + PAGINA - 1),
    )
    if (!r.ok) return r

    todos.push(...r.dados)
    // Página curta é o fim do acervo. Página cheia pode ser o fim exato, e a
    // volta seguinte devolve vazio — uma ida a mais é barata; um acervo cortado
    // pela metade, não.
    if (r.dados.length < PAGINA) break
  }

  return { ok: true, dados: todos }
}

/** Um decreto com seus blocos, na ordem do documento. */
export async function decreto(id: string): Promise<Resultado<DecretoInteiro | null>> {
  try {
    const { data, error } = await supabase
      .from('decretos_pr')
      .select(
        `${COLUNAS_RESUMO}, preambulo, diario,
         decretos_pr_blocos ( id, ordem, rotulo, texto )`,
      )
      .eq('id', id)
      .maybeSingle()

    if (error) return { ok: false, erro: error.message }
    if (!data) return { ok: true, dados: null }

    const linha = data as unknown as DecretoInteiro & {
      decretos_pr_blocos: BlocoDecreto[]
    }
    const { decretos_pr_blocos: blocos, ...ato } = linha

    return {
      ok: true,
      dados: { ...ato, blocos: [...(blocos ?? [])].sort((a, b) => a.ordem - b.ordem) },
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * A busca do acervo — a RPC `busca_decretos` da migration 0018.
 *
 * **Chamada separada de `busca_hibrida`, e é decisão de arquitetura.** Os dois
 * corpora não se fundem numa RRF só porque o piso de contexto do chat é
 * derivado de `p_k` e dos pesos das três pernas de lá; misturar reabriria a
 * classe de erro que a migration 0017 fechou. Quem precisar das duas chama as
 * duas em `Promise.all` — são independentes, e a latência é a maior, não a
 * soma.
 *
 * `p_embedding` nulo é degradação prevista, igual à do corpus: sem chave da
 * OpenAI a busca cai para súmula + léxico. Duas pernas valem mais que uma tela
 * de erro.
 */
export async function buscaDecretos({
  consulta,
  embedding = null,
  qtd = 12,
  ano = null,
}: {
  consulta: string
  embedding?: string | null
  qtd?: number
  ano?: number | null
}): Promise<Resultado<AchadoDecreto[]>> {
  return tenta<AchadoDecreto[]>(
    supabase.rpc('busca_decretos', {
      p_consulta: consulta,
      p_embedding: embedding,
      p_qtd: qtd,
      p_ano: ano,
    }),
  )
}
