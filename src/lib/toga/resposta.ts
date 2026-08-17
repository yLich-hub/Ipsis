// =============================================================================
// A resposta do chat, composta a partir do resultado da busca híbrida
//
// Aqui está o ponto em que o desenho e a regra do projeto se encontram, e vale
// dizer como, porque não é óbvio olhando a tela.
//
// O documento de design mostra o assistente redigindo parágrafos de análise
// jurídica ("a Lei 13.654/2018 revogou a majorante genérica…"). No protótipo
// esse texto é constante literal. Num produto ele só poderia vir de um modelo —
// e o projeto proíbe as duas coisas: texto legal nunca é gerado (decisão nº 1) e
// não há chamada a LLM em runtime (ver CLAUDE.md, "Deploy").
//
// A saída aqui é não fingir. O que este módulo escreve são **fatos sobre a
// busca**: qual molde a classificação reconheceu, o que disparou a regra, se a
// rubrica bateu, quantos dispositivos vieram, qual a data de corte, o que
// degradou. Nada disso é opinião jurídica, tudo é verificável na mesma tela, e
// a prosa continua sendo prosa — a animação de digitação do desenho funciona
// igual. O conteúdo jurídico fica onde tem de ficar: no texto do dispositivo,
// lido do banco, dentro do painel da fonte.
//
// Consequência boa e não planejada: a resposta explica a própria busca. Quem
// abre o produto pela primeira vez entende em duas frases por que "tráfico
// privilegiado" achou o art. 33 §4º sem que essas palavras estejam no artigo.
// =============================================================================

import type { Achado, RespostaBusca } from '@/lib/busca/consultar'
import { dataBR } from '@/lib/formato'

export type Passo = { t: string; meta: string }
export type Paragrafo = { t: string; cite: string | null }
export type Fonte = {
  n: string
  titulo: string
  sub: string
  selo: string
  tom: 'verde' | 'ambar'
  id: string
}

export type RespostaComposta = {
  passos: Passo[]
  paras: Paragrafo[]
  fontes: Fonte[]
  sugestoes: string[]
  /** Quantas das fontes são do corpus curado — alimenta o medidor de confiança. */
  primarias: number
  /** Data de corte a exibir no rodapé da resposta. */
  vigencia: string | null
  erro: string | null
}

/** No máximo quatro cartões de fonte: além disso a lista deixa de ser lida. */
const MAX_FONTES = 4

/**
 * Os passos que a barra de progresso mostra enquanto a resposta não chega.
 *
 * São os passos reais do pipeline, na ordem em que acontecem, e não enfeite:
 * `classifica()` roda em TS sem chamada de rede, a busca é uma RPC única no
 * Postgres, e a conferência de vigência sai das colunas da própria linha. O
 * `meta` de cada um é preenchido depois, com o número que aquele passo produziu.
 */
export function passosDa(r: RespostaBusca): Passo[] {
  const passos: Passo[] = [
    { t: 'Classificando a intenção da consulta', meta: `molde ${r.intencao.molde}` },
  ]

  if (r.direta) {
    passos.push({
      t: 'Resolvendo o artigo pelo id',
      meta: r.intencao.artigo ? `art. ${r.intencao.artigo.numero}` : 'sem passar pela fusão',
    })
  } else {
    passos.push({
      t: 'Fundindo rubrica, léxico e vetor',
      meta: r.vetor ? 'RPC única · três pernas' : 'RPC única · sem a perna semântica',
    })
  }

  passos.push({ t: 'Lendo o texto dos dispositivos', meta: `${r.itens.length} encontrados` })
  passos.push({
    t: 'Conferindo vigência e cobertura',
    meta: r.itens[0] ? dataBR(r.itens[0].vigencia_ate) : '',
  })

  return passos
}

const CITACAO_CURTA = (a: Achado) => a.citacao.replace(/\s+/g, ' ').trim()

/** Rótulo do papel dentro de um cluster de rubrica. */
const PAPEL = {
  principal: 'principal',
  correlato: 'correlato',
  requisito: 'requisito',
} as const

function abertura(r: RespostaBusca): string {
  const n = r.itens.length
  const primeiro = r.itens[0]

  switch (r.intencao.molde) {
    case 'dispositivo':
      return primeiro
        ? `Você pediu um dispositivo pelo número, então resolvi direto pelo id — sem passar pela fusão de rankings. ${CITACAO_CURTA(primeiro)} está abaixo com o texto lido do banco, na redação conferida.`
        : `A consulta tem cara de citação de artigo (${r.intencao.sinal}), mas nenhum dispositivo com esse número existe no corpus curado. O recorte é tráfico de drogas: Lei 11.343 e Código Penal integrais, CPP só no subconjunto que o recorte usa.`

    case 'tema': {
      const termo = primeiro?.rubrica_termo
      return termo
        ? `“${termo}” é rubrica, não texto de lei — e é por isso que a busca acha. O apelido do instituto quase nunca aparece no artigo que o define, então há uma tabela de rubricas com match exato e peso dominante na fusão. Esta aqui aponta para ${n} dispositivo${n === 1 ? '' : 's'}, ordenados por papel.`
        : `A consulta tem forma de tema (${r.intencao.sinal}). Reuni ${n} dispositivo${n === 1 ? '' : 's'} do corpus curado, ordenados pela fusão dos três rankings.`
    }

    case 'processual':
      return `Pergunta de rito (${r.intencao.sinal}), então a busca privilegiou o processual. O CPP está aqui **integral** — 825 artigos, extraídos do mesmo Vade Mecum e com a mesma data de corte que as outras duas leis.`

    case 'doutrina':
      // A restrição de doutrina é regra dura do projeto, não preferência. Ver
      // CLAUDE.md, "Restrição de doutrina (não negociável)".
      //
      // A segunda frase é a metade que faltava: a regra sempre disse "entregar
      // entendimento consolidado extraído de jurisprudência e link para fonte
      // legítima", e por muito tempo só a recusa estava implementada. Os links
      // saem de `lib/consulta/doutrina.ts` e a tela os desenha abaixo.
      return `Isto é pedido de doutrina, e doutrina é obra autoral protegida — a Lei 9.610/98 deixa de fora lei e decisão judicial (art. 8º, IV), não livro nem artigo. Não hospedo, não indexo e não resumo de forma substitutiva, nem aqui nem em peça. O que entrego é o dispositivo legal, o entendimento consolidado da jurisprudência — que é o que está abaixo — e o endereço de onde ler a doutrina na fonte.`

    default:
      return primeiro
        ? `Consulta aberta: fundi os três rankings numa chamada só ao banco — rubrica por match exato, léxico por ts_rank_cd e semântica por distância de vetor. ${n} dispositivo${n === 1 ? '' : 's'} sobreviveram à fusão.`
        : `Nenhum dispositivo do corpus curado casou com esta consulta. O recorte é estreito de propósito: tráfico de drogas, com o Código Penal e o Código de Processo Penal integrais como apoio.`
  }
}

function segundoParagrafo(r: RespostaBusca): string | null {
  const primeiro = r.itens[0]
  if (!primeiro) return null

  const parciais = r.itens.filter((i) => i.cobertura === 'parcial')
  const revogados = r.itens.filter((i) => i.revogado)
  const partes: string[] = []

  partes.push(
    `O texto vem da fotografia de ${dataBR(primeiro.vigencia_ate)} do Vade Mecum do Senado Federal, 1ª edição — a data de corte fica visível o tempo todo porque citar redação revogada em peça criminal é grave.`,
  )

  if (parciais.length > 0) {
    const leis = [...new Set(parciais.map((p) => p.lei_apelido))].join(', ')
    partes.push(
      `${parciais.length} ${parciais.length === 1 ? 'resultado vem' : 'resultados vêm'} de lei com cobertura parcial (${leis}): a ausência de um artigo ali não significa que ele não exista.`,
    )
  }

  if (revogados.length > 0) {
    partes.push(
      `${revogados.length} ${revogados.length === 1 ? 'está marcado' : 'estão marcados'} como revogado e ${revogados.length === 1 ? 'aparece' : 'aparecem'} assim mesmo, porque o buraco na numeração é legítimo e esconder confundiria mais.`,
    )
  }

  return partes.join(' ')
}

function terceiroParagrafo(r: RespostaBusca): string | null {
  const cluster = r.itens.filter((i) => i.papel)
  if (cluster.length > 1) {
    const principal = cluster.find((i) => i.papel === 'principal')
    const outros = cluster.filter((i) => i.papel !== 'principal')
    return `Isto é um cluster, não um artigo só: ${
      principal ? `${CITACAO_CURTA(principal)} como ${PAPEL.principal}` : 'sem principal declarado'
    }${
      outros.length
        ? `, com ${outros.map((o) => `${CITACAO_CURTA(o)} (${o.papel})`).join(' e ')}`
        : ''
    }. Abra cada um para ver o texto integral antes de usar em peça.`
  }

  if (r.aviso) {
    return `Um aviso sobre esta busca: ${r.aviso}. O resultado continua válido, só chegou por menos caminhos que o normal.`
  }

  return null
}

/**
 * Sugestões de continuidade. Saem do que a busca de fato encontrou, não de uma
 * lista fixa — sugerir "ver súmulas do tema" quando não veio tema nenhum é o
 * tipo de detalhe que denuncia interface de demonstração.
 */
function sugestoesDe(r: RespostaBusca): string[] {
  const s: string[] = []
  const primeiro = r.itens[0]

  if (primeiro?.rubrica_termo) s.push(`Outros dispositivos de “${primeiro.rubrica_termo}”`)
  if (primeiro) s.push(`Texto integral de ${CITACAO_CURTA(primeiro)}`)
  if (r.itens.some((i) => i.lei_id === 'lei_11343_2006')) s.push('Dosimetria na Lei de Drogas')
  if (r.itens.some((i) => i.cobertura === 'parcial')) s.push('O que o recorte do CPP cobre')
  if (s.length < 3) s.push('Teses aplicáveis a este caso')

  return s.slice(0, 3)
}

export function comporResposta(r: RespostaBusca): RespostaComposta {
  if (r.erro) {
    return {
      passos: [{ t: 'Consultando o banco', meta: 'falhou' }],
      paras: [
        {
          t: `A base não respondeu. O projeto roda no plano gratuito do Supabase, que pausa por inatividade — o cron diário em /api/health existe justamente para evitar isso. Detalhe técnico: ${r.erro}`,
          cite: null,
        },
      ],
      fontes: [],
      sugestoes: [],
      primarias: 0,
      vigencia: null,
      erro: r.erro,
    }
  }

  const itens = r.itens.slice(0, MAX_FONTES)

  const fontes: Fonte[] = itens.map((a, i) => ({
    n: String(i + 1),
    titulo: CITACAO_CURTA(a),
    sub:
      a.rubrica_termo && a.papel
        ? `rubrica “${a.rubrica_termo}” · ${a.papel}`
        : (a.artigo_rubrica ?? a.lei_apelido),
    selo: a.revogado ? 'Revogado' : a.cobertura === 'parcial' ? 'Cobertura parcial' : 'Em vigor',
    tom: a.revogado || a.cobertura === 'parcial' ? 'ambar' : 'verde',
    id: a.dispositivo_id,
  }))

  // A citação numerada só é pendurada num parágrafo se existir fonte com aquele
  // número — no desenho o marcador é um quadradinho clicável, e clicar num
  // marcador que não abre nada é pior que não ter marcador.
  const brutos = [abertura(r), segundoParagrafo(r), terceiroParagrafo(r)].filter(
    (t): t is string => !!t,
  )

  const paras: Paragrafo[] = brutos.map((t, i) => ({
    t,
    cite: fontes[i] ? fontes[i]!.n : null,
  }))

  return {
    passos: passosDa(r),
    paras,
    fontes,
    sugestoes: sugestoesDe(r),
    primarias: itens.filter((a) => !a.revogado).length,
    vigencia: itens[0] ? dataBR(itens[0].vigencia_ate) : null,
    erro: null,
  }
}
