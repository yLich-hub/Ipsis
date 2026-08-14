// =============================================================================
// Fonte: Dados Abertos do Senado Federal
//
// Usa `/dadosabertos/processo`, e não `/dadosabertos/materia`: a família
// `materia` está marcada como depreciada na própria resposta da API
// (`Metadados.Descontinuacao`, com `UrlServicoSubstituto` apontando para
// `/processo`). Escrever contra um endereço que a fonte já anunciou como morto
// seria começar devendo manutenção.
//
// **`normaGerada` é o achado que dispensa o DOU.** No detalhe do processo, um
// projeto que virou lei traz o objeto completo — número, data de assinatura,
// data de publicação e o veículo ("Diário Oficial da União de 15/07/2025").
// Ou seja: o dado que justificaria montar um coletor do DOU chega aqui de
// graça, estruturado, por uma API sem chave. É a diferença entre "há um projeto
// que quer alterar o Código Penal" e "a Lei 15.164/2025 alterou o Código Penal
// e saiu no Diário em 15/07/2025" — e é a segunda frase que fura a fotografia
// de 28/02/2025.
//
// Só o campo `situacaoAtual` vem na listagem; `normaGerada` exige uma ida ao
// detalhe. Por isso o detalhe só é pedido para quem já passou pelo filtro do
// corpus E já mudou de situação.
// =============================================================================

import { DATA_DE_CORTE } from '@/lib/vigilia/alvos'
import type { Bruto, Colheita } from '@/lib/vigilia/tipos'

const BASE = 'https://legis.senado.leg.br/dadosabertos'

type ItemLista = {
  id: number
  codigoMateria?: number
  identificacao?: string
  ementa?: string | null
  dataApresentacao?: string | null
  situacaoAtual?: string | null
}

type NormaGerada = {
  descricao?: string | null
  numero?: number | null
  anoAssinatura?: string | null
  dataPublicacao?: string | null
}

async function json<T>(url: string, sinal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: sinal })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${new URL(url).pathname}`)
  return (await r.json()) as T
}

/**
 * Colhe os processos apresentados a partir de `desde`.
 *
 * Uma requisição só, sem paginação — a API devolve o intervalo inteiro num
 * array. Desde a data de corte são ~5.200 itens e ~4 MB, o que é aceitável num
 * cron diário e é o motivo de `desde` existir como parâmetro: quem roda o
 * script local pede a janela inteira; o cron pede a janela recente.
 *
 * **O parâmetro é `dataInicioApresentacao`, e a ordem das palavras importa.**
 * `dataApresentacaoInicio` — a grafia que a Câmara usa — é aceita sem erro e
 * silenciosamente ignorada, devolvendo processos desde 1949. Foi conferido: com
 * a grafia errada o menor `dataApresentacao` da resposta é de 1949; com a certa,
 * é a data pedida. Parâmetro ignorado em silêncio é o pior tipo de defeito, e é
 * por isso que ele está anotado aqui.
 */
export async function colhe(desde = DATA_DE_CORTE, sinal?: AbortSignal): Promise<Colheita> {
  try {
    const lista = await json<ItemLista[]>(
      `${BASE}/processo?dataInicioApresentacao=${desde}`,
      sinal,
    )

    const itens: Bruto[] = (lista ?? []).map((p) => ({
      id: `senado:${p.id}`,
      fonte: 'senado' as const,
      identificacao: (p.identificacao ?? `processo ${p.id}`).trim(),
      ementa: (p.ementa ?? '').trim(),
      apresentadoEm: (p.dataApresentacao ?? '').slice(0, 10),
      situacao: (p.situacaoAtual ?? '').trim(),
      url: p.codigoMateria
        ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.codigoMateria}`
        : '',
    }))

    return { ok: true, itens }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), itens: [] }
  }
}

/**
 * Número da lei em que o processo se transformou, ou `null`.
 *
 * Devolve a descrição já normalizada (`'Lei 15.164/2025'`) a partir de
 * `normaGerada`. Não se monta o número a partir do texto da situação: a
 * situação diz "TRANSFORMADA EM NORMA JURÍDICA" e nada mais, e derivar um
 * número de lei de uma frase que não o contém seria inventá-lo.
 */
export async function normaDe(id: string, sinal?: AbortSignal): Promise<string | null> {
  const numero = id.split(':')[1]
  if (!numero) return null

  try {
    const p = await json<{ normaGerada?: NormaGerada | null }>(
      `${BASE}/processo/${numero}`,
      sinal,
    )
    const n = p.normaGerada
    if (!n || Object.keys(n).length === 0) return null

    if (n.numero && n.anoAssinatura) return `Lei ${formataNumero(n.numero)}/${n.anoAssinatura}`
    // `descricao` chega como 'Lei nº 15.164 de 14/07/2025'. Sem número e ano
    // separados, vale mais repassá-la crua que tentar recortá-la.
    return n.descricao?.trim() || null
  } catch {
    return null
  }
}

/** `15164` → `15.164`, a grafia com que a lei é citada em peça. */
function formataNumero(n: number): string {
  return n.toLocaleString('pt-BR')
}
