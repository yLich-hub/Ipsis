// =============================================================================
// Leitura do banco para as telas — só PostgREST/HTTPS, nunca conexão direta.
//
// Toda função devolve `Resultado`: o banco gratuito do Supabase pausa por
// inatividade e um portfólio é justamente um link clicado semanas depois. Uma
// tela que explode com stack trace é pior que uma tela que diz "a base está
// fora, o resto continua de pé" — então erro é valor de retorno, não exceção.
// =============================================================================

import { supabase } from '@/lib/supabase'
import type { TipoDispositivo, ValorDeFato } from '@/lib/tipos'

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

/**
 * O cliente não tem tipos gerados do schema (`supabase gen types` exigiria a
 * service role no CI), então o retorno do PostgREST chega como `unknown` e a
 * forma é afirmada aqui, num lugar só. Os tipos abaixo são a cópia manual das
 * colunas — se o schema mudar, o compilador não avisa; a migration avisa.
 */
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

/**
 * Para consultas `maybeSingle()`, onde a ausência de linha é resposta legítima
 * e não falha.
 *
 * `tenta` trata `data === null` como erro, e para uma lista isso está certo. Já
 * para uma busca por id, "não existe" virava `ok: false` e a tela renderizava
 * "a base está fora do ar" — quando o problema era um id inexistente na URL. O
 * `notFound()` das telas de dispositivo e artigo era, por causa disso, código
 * inalcançável.
 */
async function tentaTalvez<T>(
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Resultado<T | null>> {
  try {
    const { data, error } = await consulta
    if (error) return { ok: false, erro: error.message }
    return { ok: true, dados: (data ?? null) as T | null }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

// --- formatos de linha -------------------------------------------------------

export type Lei = {
  id: string
  nome: string
  apelido: string
  fonte: string
  vigencia_ate: string
  cobertura: 'integral' | 'parcial'
  cobertura_nota: string | null
  total_artigos: number
  ordem: number
}

export type Artigo = {
  id: string
  lei_id: string
  numero: string
  numero_base: number
  ordem: number
  titulo: string | null
  capitulo: string | null
  secao: string | null
  rubrica: string | null
  revogado: boolean
  conferido_em: string | null
  alterado_por: string[]
  fonte_redacao: string | null
}

/** Linha de `v_dispositivo`: o dispositivo já com artigo e lei resolvidos. */
export type Dispositivo = {
  id: string
  artigo_id: string
  lei_id: string
  tipo: TipoDispositivo
  numero: string | null
  rotulo: string
  pai_id: string | null
  ordem: number
  texto: string
  rubrica: string | null
  citacao: string
  revogado: boolean
  artigo_numero: string
  artigo_rubrica: string | null
  titulo: string | null
  capitulo: string | null
  secao: string | null
  artigo_revogado: boolean
  artigo_conferido_em: string | null
  /**
   * As leis posteriores à data de corte que alteraram este artigo.
   *
   * Vazio na esmagadora maioria. Quando tem conteúdo, `vigencia_ate` deixou de
   * responder por este dispositivo — quem responde é `artigo_conferido_em`.
   */
  artigo_alterado_por: string[]
  artigo_fonte_redacao: string | null
  lei_apelido: string
  lei_nome: string
  vigencia_ate: string
  cobertura: 'integral' | 'parcial'
  cobertura_nota: string | null
}

export type Saude = {
  ok: boolean
  leis: number
  artigos: number
  dispositivos: number
  com_embedding: number
  rubricas: number
  teses: number
  casos: number
  em: string
}

const COLUNAS_DISPOSITIVO =
  'id,artigo_id,lei_id,tipo,numero,rotulo,pai_id,ordem,texto,rubrica,citacao,revogado,' +
  'artigo_numero,artigo_rubrica,titulo,capitulo,secao,artigo_revogado,artigo_conferido_em,' +
  'artigo_alterado_por,artigo_fonte_redacao,' +
  'lei_apelido,lei_nome,vigencia_ate,cobertura,cobertura_nota'

// --- consultas ---------------------------------------------------------------

export const saude = () => tenta<Saude>(supabase.rpc('saude'))

export const leis = () =>
  tenta<Lei[]>(supabase.from('leis').select('*').order('ordem'))

export const lei = (id: string) =>
  tentaTalvez<Lei>(supabase.from('leis').select('*').eq('id', id).maybeSingle())

export const artigosDaLei = (leiId: string) =>
  tenta<Artigo[]>(
    supabase
      .from('artigos')
      .select(
        'id,lei_id,numero,numero_base,ordem,titulo,capitulo,secao,rubrica,revogado,' +
          'conferido_em,alterado_por,fonte_redacao',
      )
      .eq('lei_id', leiId)
      .order('ordem'),
  )

export const artigo = (id: string) =>
  tentaTalvez<Artigo>(supabase.from('artigos').select('*').eq('id', id).maybeSingle())

export const dispositivosDoArtigo = (artigoId: string) =>
  tenta<Dispositivo[]>(
    supabase.from('v_dispositivo').select(COLUNAS_DISPOSITIVO).eq('artigo_id', artigoId).order('ordem'),
  )

export const dispositivo = (id: string) =>
  tentaTalvez<Dispositivo>(
    supabase.from('v_dispositivo').select(COLUNAS_DISPOSITIVO).eq('id', id).maybeSingle(),
  )

/**
 * Artigo anterior e seguinte na ordem do documento. Duas consultas de uma linha
 * cada — `ordem` é único por lei e indexado, então sai barato e sobrevive aos
 * buracos legítimos da numeração (a Lei 11.343 pula do 8º ao 15).
 */
export async function vizinhos(leiId: string, ordem: number) {
  const lado = (dir: 'lt' | 'gt') =>
    supabase
      .from('artigos')
      .select('id,numero,rubrica')
      .eq('lei_id', leiId)
      [dir]('ordem', ordem)
      .order('ordem', { ascending: dir === 'gt' })
      .limit(1)
      .maybeSingle()

  const [ant, prox] = await Promise.all([tenta(lado('lt')), tenta(lado('gt'))])
  return {
    anterior: ant.ok ? ant.dados : null,
    proximo: prox.ok ? prox.dados : null,
  } as {
    anterior: { id: string; numero: string; rubrica: string | null } | null
    proximo: { id: string; numero: string; rubrica: string | null } | null
  }
}

export type RubricaLigada = {
  dispositivo_id: string
  papel: 'principal' | 'correlato' | 'requisito'
  peso: number
  rubricas: {
    termo: string
    slug: string
    tipo: 'dispositivo' | 'tema' | 'processual'
    origem: 'oficial' | 'curada'
    explicacao: string | null
  } | null
}

/** Rubricas de vários dispositivos numa consulta só (a página do artigo pede todas). */
export const rubricasDe = (dispositivoIds: string[]) =>
  tenta<RubricaLigada[]>(
    supabase
      .from('rubrica_dispositivos')
      .select('dispositivo_id,papel,peso,rubricas(termo,slug,tipo,origem,explicacao)')
      .in('dispositivo_id', dispositivoIds),
  )

/** Contagens por lei para o painel — `head: true` não traz linha, só o total. */
export async function contagemDispositivos(leiId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('dispositivos')
    .select('id', { count: 'exact', head: true })
    .eq('lei_id', leiId)
  return error ? null : (count ?? null)
}

// `contagemRubricas(origem)` saiu junto com o painel de diagnóstico que a
// exibia. Nenhuma das sete telas conta rubrica por origem, e uma consulta ao
// banco que ninguém chama envelhece sem que nada quebre.

export type Tese = {
  id: string
  nome: string
  resumo: string
  fundamentos: string[]
  jurisprudencia: { tribunal?: string; classe?: string; numero?: string; tese?: string; url?: string }[]
  /** Condições objetivas. Mesmas chaves de `casos.fatos` — ver `aplicaA`. */
  gatilho: Record<string, ValorDeFato>
  ordem: number
  /** Ver `TeseCurada.revisao`. NULL/ausente = sem registro, nunca "conferida". */
  revisao?: 'pendente' | null
}

export const teses = () =>
  tenta<Tese[]>(
    supabase
      .from('teses')
      .select('id,nome,resumo,fundamentos,jurisprudencia,gatilho,ordem,revisao')
      .eq('ativo', true)
      .order('ordem'),
  )

/**
 * Tese com o corpo da minuta. Leitor separado de propósito: `template_md` são
 * ~2 KB por tese, e `/jurisprudencia` e `/pecas` só listam — mandar 30 KB de
 * marcadores para telas que não os renderizam é peso puro no payload. Só a rota
 * que gera o DOCX precisa disto.
 */
export type TeseComTemplate = Tese & { template_md: string }

export const tesesComTemplate = () =>
  tenta<TeseComTemplate[]>(
    supabase
      .from('teses')
      .select('id,nome,resumo,fundamentos,jurisprudencia,gatilho,ordem,revisao,template_md')
      .eq('ativo', true)
      .order('ordem'),
  )

export type Caso = {
  id: string
  titulo: string
  narrativa: string
  imputacao: string[]
  fatos: Record<string, ValorDeFato>
  ordem: number
}

export const caso = (id: string) =>
  tentaTalvez<Caso>(
    supabase
      .from('casos')
      .select('id,titulo,narrativa,imputacao,fatos,ordem')
      .eq('id', id)
      .maybeSingle(),
  )

export const casos = () =>
  tenta<Caso[]>(
    supabase.from('casos').select('id,titulo,narrativa,imputacao,fatos,ordem').order('ordem'),
  )

/**
 * O checklist: uma tese se aplica quando TODA condição do gatilho bate, por
 * igualdade direta, com o fato de mesma chave.
 *
 * É consulta, não heurística — e é por isso que `casos.fatos` carrega todas as
 * chaves de gatilho, inclusive as desfavoráveis. `tests/citacao.test.ts` guarda
 * esse contrato: falha se um caso não tiver alguma chave, ou se alguma tese não
 * for acionada por caso nenhum.
 */
export const aplicaA = (tese: Tese, caso: Caso) =>
  Object.entries(tese.gatilho ?? {}).every(([chave, valor]) => caso.fatos?.[chave] === valor)
