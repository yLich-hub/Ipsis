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

/**
 * Como o escopo aparece na tela quando o tema não traz a casa legislativa.
 *
 * `parte_especial` entrou com os dois institutos que o projeto acolheu por
 * pedido — roubo majorado e a vulnerabilidade do art. 217-A. O rótulo diz
 * "artigo do Código Penal" e não "parte especial" porque a distinção entre
 * parte geral e especial é vocabulário de quem estuda o Código, não de quem
 * procura o precedente.
 */
export type Precedente = {
  id: string
  tipo: string
  numero: string
  situacao: string
  teseFirmada: string | null
  questao: string | null
  entendimentoAnterior: string | null
  julgadoEm: string | null
  escopo: 'drogas' | 'parte_geral' | 'parte_especial'
  artigosTocados: string[]
}

const ROTULO_ESCOPO: Record<Precedente['escopo'], string> = {
  drogas: 'Lei de Drogas',
  parte_geral: 'Parte geral do Código Penal',
  parte_especial: 'Artigo do Código Penal',
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
  escopo: (l.escopo as Precedente['escopo']) ?? 'drogas',
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
 * A situação que um precedente precisa ter para entrar no contexto do chat.
 *
 * **Só o que transitou em julgado.** Tema afetado, sobrestado, em julgamento ou
 * revisado continua na TELA — com selo âmbar, onde o advogado o encontra
 * conscientemente — e fica fora da prosa gerada. A diferença importa: na tela
 * ele é informação sob ressalva; na resposta do modelo ele viraria afirmação.
 *
 * O caso que decidiu a regra é o Tema 600 — *o tráfico privilegiado não é
 * equiparado a hediondo*. É a resposta mais procurada do recorte e está
 * `Revisado`. Deixá-lo entrar faria o chat afirmar um entendimento revisto sem
 * dizer que foi; e uma ressalva escrita pelo modelo não é garantia, é promessa.
 */
const CITAVEL = 'Trânsito em Julgado'

/**
 * Quantos precedentes entram no contexto, no máximo.
 *
 * O alcance é por grafo de artigo — o precedente entra quando compartilha
 * artigo com um dispositivo recuperado —, e isso traz cauda: numa pergunta
 * sobre hediondez, o tema do critério trifásico aparece só porque os dois
 * tocam o art. 33. Três é o bastante para responder e pouco para afogar.
 */
const MAX = 3

export type Citavel = {
  docId: string
  rotulo: string
  situacao: string
  tese: string
  artigos: string[]
}

/**
 * Os precedentes que respondem à pergunta, alcançados pelos artigos que a busca
 * já recuperou.
 *
 * **Sem embedding e sem quarta perna na fusão**, e isso é a economia central do
 * desenho: os precedentes já estão pendurados no mesmo grafo de citação da
 * decisão nº 1, então basta cruzar os artigos. Medido em 14/08/2026, o grafo
 * traz o Tema 1139 para "posso usar inquéritos para afastar o § 4º" e o Tema
 * 1194 para "a confissão compensa a reincidência" — as duas respostas exatas,
 * sem tocar em `busca_hibrida`.
 *
 * `achados` deve ser o contexto JÁ FILTRADO pelo piso de fusão. Passar os oito
 * brutos faria um dispositivo de cauda arrastar um precedente para a resposta.
 */
export async function precedentesPara(artigos: string[]): Promise<Citavel[]> {
  if (artigos.length === 0) return []

  try {
    const { data, error } = await supabase
      .from('precedentes_stj')
      .select('id,tipo,numero,situacao,tese_firmada,artigos_tocados')
      .eq('situacao', CITAVEL)
      .not('tese_firmada', 'is', null)
      .overlaps('artigos_tocados', artigos)

    if (error) return []

    return (data ?? [])
      .map((l) => {
        const p = l as Record<string, unknown>
        const seus = (p.artigos_tocados as string[]) ?? []
        return {
          docId: p.id as string,
          rotulo: `${p.tipo as string} ${p.numero as string}`.trim(),
          situacao: p.situacao as string,
          tese: p.tese_firmada as string,
          artigos: seus,
          // Quantos artigos em comum: o precedente que casa em dois artigos da
          // pergunta é mais provável de respondê-la que o que casa num só.
          peso: seus.filter((a) => artigos.includes(a)).length,
        }
      })
      .sort((a, b) => b.peso - a.peso)
      .slice(0, MAX)
      .map(({ peso: _peso, ...c }) => c)
  } catch {
    // Falha de leitura vira lista vazia: o chat continua respondendo com o
    // corpus, que é o que ele sempre fez. Precedente é acréscimo, não
    // dependência.
    return []
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
      origem: casa?.nome ?? ROTULO_ESCOPO[p.escopo],
      origemId: casa?.id ?? p.escopo,
    }
  })
}
