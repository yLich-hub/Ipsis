// =============================================================================
// Precedentes qualificados do STJ — leitura para a tela
//
// Chave publishable e RLS somente-leitura, como todo o resto do runtime. Quem
// escreve é `coletores/stj.py`, com service role.
//
// **Estes precedentes não participam da busca nem da peça**, e isso é a regra
// que os deixa entrar no projeto. Precedente interpreta a lei e a interpretação
// muda: dos 61 coletados, 14 estão cancelados ou sobrestados. Se um tema
// pudesse virar fundamento pelo mesmo caminho de um dispositivo, a decisão nº 1
// deixaria de valer — o que se citaria não seria texto legal conferido, seria
// entendimento que pode ter morrido. Ver o cabeçalho da migration 0014.
//
// Aqui eles alimentam uma tela de leitura, com a situação sempre visível.
// =============================================================================

import { supabase } from '@/lib/supabase'
import { soArtigo } from '@/lib/vigilia/alvos'

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

export type Precedente = {
  id: string
  tipo: string
  numero: string
  situacao: string
  teseFirmada: string | null
  questao: string | null
  entendimentoAnterior: string | null
  julgadoEm: string | null
  escopo: 'drogas' | 'parte_geral'
  artigosTocados: string[]
}

const daLinha = (l: Record<string, unknown>): Precedente => ({
  id: l.id as string,
  tipo: (l.tipo as string) ?? '',
  numero: (l.numero as string) ?? '',
  situacao: (l.situacao as string) ?? '—',
  teseFirmada: (l.tese_firmada as string | null) ?? null,
  questao: (l.questao as string | null) ?? null,
  entendimentoAnterior: (l.entendimento_anterior as string | null) ?? null,
  julgadoEm: (l.julgado_em as string | null) ?? null,
  escopo: (l.escopo as 'drogas' | 'parte_geral') ?? 'drogas',
  artigosTocados: (l.artigos_tocados as string[]) ?? [],
})

/**
 * Todos os precedentes do recorte.
 *
 * Sem filtro por situação: **tema cancelado é guardado e mostrado**, com selo
 * âmbar. Sumir com ele faria a tela esquecer o que já foi verdade, e é
 * justamente ao topar com a tese num texto antigo que o advogado precisa
 * descobrir que ela caiu.
 */
export async function precedentes(): Promise<Resultado<Precedente[]>> {
  try {
    const { data, error } = await supabase
      .from('precedentes_stj')
      .select(
        'id,tipo,numero,situacao,tese_firmada,questao,entendimento_anterior,julgado_em,escopo,artigos_tocados',
      )
      .order('julgado_em', { ascending: false, nullsFirst: false })

    if (error) return { ok: false, erro: error.message }
    return { ok: true, dados: (data ?? []).map(daLinha) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao ler os precedentes' }
  }
}

/**
 * Qual tese da peça cada precedente sustenta.
 *
 * Reusa `soArtigo` — o mesmo corte que a vigília faz para cruzar achado com
 * tese. `teses.fundamentos` guarda ids de dispositivo (`..._art33_p4`) e o
 * precedente sabe artigo (`..._art33`); o corte é o que faz os dois se
 * encontrarem, e é o mesmo grafo de citação da decisão nº 1.
 *
 * Precedente sem tese correspondente **não é descartado**: ele entra sob o
 * rótulo do escopo. Um tema sobre prescrição não sustenta nenhuma das 16 teses
 * e ainda assim é o que decide um caso.
 */
export function agrupaPorTese(
  ps: Precedente[],
  teses: { id: string; nome: string; fundamentos: string[] }[],
): { precedente: Precedente; origem: string; origemId: string }[] {
  const porArtigo = new Map<string, { id: string; nome: string }>()
  for (const t of teses) {
    for (const f of t.fundamentos) {
      // A primeira tese que cita o artigo fica com ele. Uma linha por par
      // (precedente, tese) multiplicaria o Tema 600 por seis cartões iguais.
      if (!porArtigo.has(soArtigo(f))) porArtigo.set(soArtigo(f), { id: t.id, nome: t.nome })
    }
  }

  return ps.map((p) => {
    const casa = p.artigosTocados.map((a) => porArtigo.get(a)).find(Boolean)
    return {
      precedente: p,
      origem: casa?.nome ?? (p.escopo === 'drogas' ? 'Lei de Drogas' : 'Parte geral do Código Penal'),
      origemId: casa?.id ?? p.escopo,
    }
  })
}
