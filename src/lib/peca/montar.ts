// =============================================================================
// Montagem da peça — a parte que fala com o banco.
//
// A resolução de `{{cite:}}` mora em `resolver.ts`, sem import de cliente, para
// que o teste monte a peça inteira offline. Aqui só se busca o que ela precisa.
// =============================================================================

import { supabase } from '@/lib/supabase'
import type { Caso, TeseComTemplate } from '@/lib/dados'
import {
  type Citado,
  type PecaMontada,
  idsNecessarios,
  resolvePeca,
} from '@/lib/peca/resolver'

export { CitacaoOrfa } from '@/lib/peca/resolver'
export type { Citado, PecaMontada, TeseMontada, Trecho } from '@/lib/peca/resolver'

/**
 * Busca os dispositivos de todos os ids de uma vez.
 *
 * Uma consulta para a peça inteira, não uma por marcador: são ~19 citações numa
 * minuta, e 19 idas ao PostgREST em série é o que transforma um download em
 * espera visível.
 */
async function carregaCitados(ids: string[]): Promise<Map<string, Citado>> {
  if (!ids.length) return new Map()

  const { data, error } = await supabase
    .from('v_dispositivo')
    .select('id,citacao,texto,lei_apelido,vigencia_ate,revogado')
    .in('id', ids)

  if (error) throw new Error(`falha ao ler dispositivos da minuta: ${error.message}`)

  return new Map(
    (data ?? []).map((d) => [
      d.id as string,
      {
        id: d.id as string,
        citacao: d.citacao as string,
        texto: d.texto as string,
        leiApelido: d.lei_apelido as string,
        vigenciaAte: d.vigencia_ate as string,
        revogado: Boolean(d.revogado),
      },
    ]),
  )
}

/** Monta a peça de um caso com as teses que o checklist acionou. */
export async function montarPeca(
  caso: Caso,
  teses: TeseComTemplate[],
): Promise<PecaMontada> {
  const mapa = await carregaCitados(idsNecessarios(teses))
  return resolvePeca(caso, teses, mapa)
}
