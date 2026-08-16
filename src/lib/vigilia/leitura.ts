// =============================================================================
// Vigília do corpus — leitura para a tela
//
// Chave publishable e RLS somente-leitura, como todo o resto do runtime. A
// escrita mora em `escrita.ts` e não é importada daqui.
//
// Falha de leitura vira `Resultado`, não exceção: o banco gratuito do Supabase
// pausa por inatividade, e a tela precisa poder dizer "a base não respondeu" em
// vez de explodir. Mesmo contrato de `lib/dados.ts`.
// =============================================================================

import { supabase } from '@/lib/supabase'
import { soArtigo } from '@/lib/vigilia/alvos'
import type { FonteId } from '@/lib/vigilia/tipos'

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

export type Alteracao = {
  id: string
  fonte: FonteId
  leisTocadas: string[]
  artigosTocados: string[]
  identificacao: string
  ementa: string
  apresentadoEm: string | null
  situacao: string | null
  virouNorma: boolean
  norma: string | null
  url: string | null
  vistoEm: string
  reconferidoEm: string | null
}

export type Coleta = {
  fonte: FonteId
  rodouEm: string
  ok: boolean
  erro: string | null
  vistos: number
  candidatos: number
  novos: number
  ms: number
}

const daLinha = (l: Record<string, unknown>): Alteracao => ({
  id: l.id as string,
  fonte: l.fonte as FonteId,
  leisTocadas: (l.leis_tocadas as string[]) ?? [],
  artigosTocados: (l.artigos_tocados as string[]) ?? [],
  identificacao: (l.identificacao as string) ?? '',
  ementa: (l.ementa as string) ?? '',
  apresentadoEm: (l.apresentado_em as string | null) ?? null,
  situacao: (l.situacao as string | null) ?? null,
  virouNorma: Boolean(l.virou_norma),
  norma: (l.norma as string | null) ?? null,
  url: (l.url as string | null) ?? null,
  vistoEm: l.visto_em as string,
  reconferidoEm: (l.reconferido_em as string | null) ?? null,
})

/**
 * Os achados, com o que virou lei no topo.
 *
 * A ordem é a da urgência, e não a cronológica: uma lei sancionada em julho de
 * 2025 fura a data de corte hoje, enquanto um projeto apresentado ontem não
 * fura nada. Ordenar por data poria o irrelevante recente acima do relevante
 * antigo — que é o modo mais confiável de fazer alguém parar de ler a lista.
 */
export async function alteracoes(limite = 80): Promise<Resultado<Alteracao[]>> {
  try {
    const { data, error } = await supabase
      .from('vigilia_alteracoes')
      .select(
        'id,fonte,leis_tocadas,artigos_tocados,identificacao,ementa,apresentado_em,situacao,virou_norma,norma,url,visto_em,reconferido_em',
      )
      .order('virou_norma', { ascending: false })
      .order('apresentado_em', { ascending: false, nullsFirst: false })
      .limit(limite)

    if (error) return { ok: false, erro: error.message }
    return { ok: true, dados: (data ?? []).map(daLinha) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler a vigília' }
  }
}

/**
 * Os artigos cuja redação já foi alinhada ao texto compilado, com as leis que os
 * alteraram: `dl_2848_1940_art121` → `['Lei 15.134/2025', …]`.
 *
 * **É o que fecha o ciclo da vigília, e é derivado — não é um estado novo.** O
 * achado diz "a Lei 15.581/2025 mudou o art. 23"; `artigos.alterado_por` diz que
 * o art. 23 do corpus já traz a redação dessa lei. Cruzar os dois responde
 * "isto ainda está pendente?" sem que ninguém precise marcar caixinha — e uma
 * marca manual poderia mentir, esta não pode: ela sai do mesmo lugar de onde a
 * peça tira o texto.
 *
 * Não substitui `reconferido_em`, que continua sendo "uma pessoa olhou". As duas
 * perguntas são diferentes: uma é sobre o corpus, a outra é sobre quem leu.
 */
export async function artigosAtualizados(): Promise<Resultado<Map<string, string[]>>> {
  try {
    const { data, error } = await supabase
      .from('artigos')
      .select('id,alterado_por')
      .neq('alterado_por', '{}')

    if (error) return { ok: false, erro: error.message }
    return {
      ok: true,
      dados: new Map(
        (data ?? []).map((a) => [a.id as string, (a.alterado_por as string[] | null) ?? []]),
      ),
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler os artigos' }
  }
}

/** Uma tese da peça e os artigos que ela cita — o outro lado do vínculo. */
export type TeseCitante = { id: string; nome: string; artigos: string[] }

/**
 * As teses da peça, com os ARTIGOS que cada uma cita.
 *
 * É o que transforma a vigília numa tela útil. `teses.fundamentos` guarda ids
 * de dispositivo (`lei_11343_2006_art33_p4`); a vigília sabe artigos
 * (`lei_11343_2006_art33`), porque a ementa quase nunca desce ao parágrafo. O
 * corte no `_p`/`_inc` é o que faz os dois lados se encontrarem, e é o mesmo
 * grafo de citação da decisão nº 1 do projeto — o que a peça cita é exatamente
 * o que não pode mudar sem alguém saber.
 *
 * O link "Impacto nas teses (7)" do desenho TOGA v2 é isto, e só passa a ser
 * verdadeiro porque os dois lados saem do banco.
 */
export async function tesesCitantes(): Promise<Resultado<TeseCitante[]>> {
  try {
    const { data, error } = await supabase
      .from('teses')
      .select('id,nome,fundamentos')
      .eq('ativo', true)

    if (error) return { ok: false, erro: error.message }

    return {
      ok: true,
      dados: (data ?? []).map((l) => {
        const linha = l as { id: string; nome: string; fundamentos: string[] | null }
        return {
          id: linha.id,
          nome: linha.nome,
          artigos: [...new Set((linha.fundamentos ?? []).map(soArtigo))],
        }
      }),
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler as teses' }
  }
}


export type Jurimetria = {
  assunto: string
  tribunal: string
  total: number
  coletadoEm: string
}

/**
 * Contagem de processos do DataJud, por assunto e tribunal.
 *
 * Fica numa tabela separada (migration 0013) e numa função separada porque
 * responde outra pergunta: não é "a lei mudou?", é "quanto o recorte pesa no
 * Judiciário?". Misturá-la com as alterações faria um número de jurimetria
 * aparecer numa lista de normas publicadas, e é assim que um painel começa a
 * mentir sem que ninguém tenha escrito uma linha falsa.
 */
export async function jurimetria(): Promise<Resultado<Jurimetria[]>> {
  try {
    const { data, error } = await supabase
      .from('vigilia_jurimetria')
      .select('assunto,tribunal,total,coletado_em')
      .order('total', { ascending: false })

    if (error) return { ok: false, erro: error.message }

    return {
      ok: true,
      dados: (data ?? []).map((l) => {
        const linha = l as Record<string, unknown>
        return {
          assunto: linha.assunto as string,
          tribunal: linha.tribunal as string,
          total: Number(linha.total ?? 0),
          coletadoEm: linha.coletado_em as string,
        }
      }),
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler a jurimetria' }
  }
}

/**
 * A última execução de cada fonte — é daqui que sai o "há 3 min" dos cards.
 *
 * Lê as últimas execuções e fica com a primeira de cada fonte, em vez de uma
 * consulta por fonte: são duas fontes hoje, e duas idas ao banco para montar um
 * cabeçalho é ida a mais. O `limit(20)` cobre com folga o histórico recente
 * necessário para achar a última de cada uma.
 */
export async function ultimasColetas(): Promise<Resultado<Record<string, Coleta>>> {
  try {
    const { data, error } = await supabase
      .from('vigilia_coletas')
      .select('fonte,rodou_em,ok,erro,vistos,candidatos,novos,ms')
      .order('rodou_em', { ascending: false })
      .limit(20)

    if (error) return { ok: false, erro: error.message }

    const porFonte: Record<string, Coleta> = {}
    for (const l of data ?? []) {
      const linha = l as Record<string, unknown>
      const fonte = linha.fonte as FonteId
      if (porFonte[fonte]) continue
      porFonte[fonte] = {
        fonte,
        rodouEm: linha.rodou_em as string,
        ok: Boolean(linha.ok),
        erro: (linha.erro as string | null) ?? null,
        vistos: Number(linha.vistos ?? 0),
        candidatos: Number(linha.candidatos ?? 0),
        novos: Number(linha.novos ?? 0),
        ms: Number(linha.ms ?? 0),
      }
    }
    return { ok: true, dados: porFonte }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler as coletas' }
  }
}
