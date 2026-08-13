// =============================================================================
// Fonte: Dados Abertos da Câmara dos Deputados
//
// REST/JSON, sem chave, documentada em Swagger. É a mais completa das duas para
// a pergunta desta tela porque devolve, no detalhe da proposição,
// `statusProposicao.descricaoSituacao` — que é onde aparece "Transformado em
// Norma Jurídica". Esse campo é o que separa "alguém propôs mexer no Código
// Penal" de "o Código Penal mudou".
//
// **Por que `keywords` e não uma varredura.** A API não aceita busca livre na
// ementa (`?ementa=` devolve 400, conferido). O que existe é `keywords`, o
// índice de assunto curado pela própria Câmara. Varrer todos os PLs desde a
// data de corte seria mais de 4 mil itens por ano em páginas de 100 — caro para
// um cron diário e sem ganho, porque o filtro real é `tocaOCorpus()` e ele roda
// depois, sobre a ementa.
//
// Os termos abaixo são a rede, não o filtro. Erram para o lado de trazer
// demais: "codigo penal" traz projeto de trânsito que altera o CP de raspão, e
// é justamente esse que interessa — o que altera o CP sem falar de droga é o
// achado que uma busca por "drogas" perderia.
// =============================================================================

import { DATA_DE_CORTE, tocaOCorpus } from '@/lib/vigilia/alvos'
import type { Bruto, Colheita } from '@/lib/vigilia/tipos'

const BASE = 'https://dadosabertos.camara.leg.br/api/v2'

/**
 * Índice de assunto da Câmara. Termo novo aqui alarga a rede, não o filtro.
 *
 * `crime` foi tentado e recusado: sozinho traz 11 páginas de 100 desde a data
 * de corte, quase tudo sobre tipos penais em leis especiais que o corpus não
 * guarda. Os quatro abaixo dão 12 páginas somadas e já pegam pelo nome as três
 * leis do banco — uma proposição que altera o Código Penal é indexada em
 * "código penal" pela própria Câmara.
 */
const TERMOS = ['drogas', 'tráfico de drogas', 'código penal', 'processo penal']

/**
 * Teto de páginas por termo. A listagem devolve 100 por página e a Câmara
 * pagina de verdade; sem teto, um termo que crescer transforma o cron numa
 * varredura sem fim. Doze cobre com folga a maior das quatro consultas hoje
 * (sete páginas), e o coletor registra quando bate no teto.
 */
const PAGINAS = 12

/** Tipos que podem alterar lei ordinária. RQ, INC e afins não alteram nada. */
const TIPOS = ['PL', 'PLP', 'MPV', 'PLV']

type ItemLista = {
  id: number
  siglaTipo: string
  numero: number
  ano: number
  ementa: string | null
  dataApresentacao: string | null
}

type Detalhe = {
  statusProposicao?: { descricaoSituacao?: string | null; despacho?: string | null } | null
}

async function json<T>(url: string, sinal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: sinal })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${new URL(url).pathname}`)
  return (await r.json()) as T
}

/**
 * Colhe as proposições candidatas. Não filtra pelo corpus — quem faz isso é
 * `tocaOCorpus()`, para que a regra viva num lugar só e seja testável offline.
 *
 * A situação vem em segunda chamada, uma por proposição: a listagem não a traz.
 * É aceitável porque a rede já veio estreita (algumas dezenas de itens por
 * termo), e `limiteDeDetalhes` põe um teto duro para o dia em que não vier.
 */
export async function colhe(
  desde = DATA_DE_CORTE,
  limiteDeDetalhes = 60,
  sinal?: AbortSignal,
): Promise<Colheita> {
  const porId = new Map<number, ItemLista>()
  const falhas: string[] = []

  for (const termo of TERMOS) {
    for (let pagina = 1; pagina <= PAGINAS; pagina++) {
      const url =
        `${BASE}/proposicoes?keywords=${encodeURIComponent(termo)}` +
        `&dataApresentacaoInicio=${desde}` +
        TIPOS.map((t) => `&siglaTipo=${t}`).join('') +
        `&itens=100&pagina=${pagina}&ordem=DESC&ordenarPor=id`

      try {
        const r = await json<{ dados: ItemLista[] }>(url, sinal)
        const dados = r.dados ?? []
        // O mesmo PL cai em dois termos com frequência; o Map é a deduplicação.
        for (const d of dados) porId.set(d.id, d)
        // Página incompleta é a última. Confiar no `rel: last` dos links custaria
        // uma análise a mais para saber o que a contagem já diz.
        if (dados.length < 100) break
      } catch (e) {
        falhas.push(`${termo}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
    }
  }

  // Toda a rede falhou: é erro de fonte, não "nada mudou hoje". A diferença
  // importa porque a tela mostra as duas coisas de forma diferente.
  if (porId.size === 0 && falhas.length === TERMOS.length) {
    return { ok: false, erro: falhas[0] ?? 'a Câmara não respondeu', itens: [] }
  }

  const lista = [...porId.values()]
  const itens: Bruto[] = []

  for (const d of lista) {
    const bruto: Bruto = {
      id: `camara:${d.id}`,
      fonte: 'camara',
      identificacao: `${d.siglaTipo} ${d.numero}/${d.ano}`,
      ementa: (d.ementa ?? '').trim(),
      apresentadoEm: (d.dataApresentacao ?? '').slice(0, 10),
      situacao: '',
      url: `https://www.camara.leg.br/propostas-legislativas/${d.id}`,
    }
    itens.push(bruto)
  }

  // A situação é o que custa uma ida por item, então só se pergunta pelos que
  // interessam — e mesmo assim com teto. Uma fonte que resolvesse devolver mil
  // itens não pode virar mil requisições dentro de um cron.
  const alvos = itens.filter((i) => tocaOCorpus(i.ementa).length > 0).slice(0, limiteDeDetalhes)

  await Promise.all(
    alvos.map(async (i) => {
      try {
        const r = await json<{ dados: Detalhe }>(`${BASE}/proposicoes/${i.id.split(':')[1]}`, sinal)
        const s = r.dados?.statusProposicao
        // O despacho entra junto porque é lá que a Câmara escreve "Transformado
        // na Lei nº 15.123/2026"; `descricaoSituacao` costuma trazer só o rótulo.
        i.situacao = [s?.descricaoSituacao, s?.despacho].filter(Boolean).join(' — ')
      } catch {
        // Situação em branco não invalida o achado: a ementa já disse que a
        // proposição mexe no corpus, e é isso que a tela precisa mostrar.
      }
    }),
  )

  const erro = falhas.length > 0 ? `${falhas.length} de ${TERMOS.length} termos falharam` : null
  return erro ? { ok: false, erro, itens } : { ok: true, itens }
}

/**
 * Situação atual de uma proposição já conhecida, por id.
 *
 * Existe para o mesmo buraco que `senado.normaDe()` fecha: um PL apresentado em
 * 2025 e sancionado hoje está fora da janela de apresentação do cron, e é
 * justamente ele que fura a data de corte. `descricaoSituacao` e `despacho`
 * voltam juntos porque o número da lei resultante aparece no segundo.
 */
export async function situacaoDe(id: string, sinal?: AbortSignal): Promise<string | null> {
  const numero = id.split(':')[1]
  if (!numero) return null

  try {
    const r = await json<{ dados: Detalhe }>(`${BASE}/proposicoes/${numero}`, sinal)
    const s = r.dados?.statusProposicao
    const texto = [s?.descricaoSituacao, s?.despacho].filter(Boolean).join(' — ')
    return texto || null
  } catch {
    return null
  }
}
