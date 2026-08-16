// =============================================================================
// Resolução de {{cite:}} — a parte pura, sem rede.
//
// Está separada de `montar.ts` por um motivo concreto: `lib/supabase.ts` lança
// no import quando falta variável de ambiente, então qualquer teste que
// importasse a montagem junto com o cliente exigiria segredo e rede. Aqui não há
// import de cliente nenhum, e `tests/peca.test.ts` monta a peça inteira contra
// `data/normalizado/`, offline.
//
// É aqui que a decisão nº 1 do CLAUDE.md vira código: o texto legal que sai na
// minuta é LIDO da fonte, nunca escrito no template. O que a curadoria escreve
// em `teses.template_md` é só a argumentação *entre* as citações.
// =============================================================================

/**
 * Mesmo padrão do trigger `valida_citacoes` e de `tests/citacao.test.ts`. O
 * hífen é obrigatório — `art396-a` é o artigo que dá nome à peça. Ver 0006.
 */
export const CITE = /\{\{cite:([a-z0-9_-]+)\}\}/g

/** Um dispositivo como ele entra na peça: rótulo de citação + texto da fonte. */
export type Citado = {
  id: string
  citacao: string
  texto: string
  leiApelido: string
  vigenciaAte: string
  revogado: boolean
  /**
   * Procedência do ARTIGO, quando ela já não é a da fotografia.
   *
   * Um dispositivo transcrito na peça pode estar em redação mais nova que a data
   * de corte — 45 artigos estão. O rodapé precisa disso: quem abrir o .docx daqui
   * a seis meses lê uma data só, e ela tem de cobrir o que está transcrito acima.
   */
  conferidoEm?: string | null
  alteradoPor?: string[]
}

/** Um pedaço de tese já resolvido: ou prosa da curadoria, ou citação da fonte. */
export type Trecho = { tipo: 'prosa'; texto: string } | { tipo: 'citacao'; d: Citado }

/** O mínimo que a resolução precisa de uma tese — não a linha inteira do banco. */
export type TeseResolvivel = {
  id: string
  nome: string
  resumo: string
  template_md: string
  fundamentos: string[]
  jurisprudencia?: { tribunal?: string; classe?: string; numero?: string; tese?: string; url?: string }[]
}

/** E o mínimo que precisa de um caso. */
export type CasoResolvivel = {
  id: string
  titulo: string
  narrativa: string
  imputacao: string[]
}

export type TeseMontada = {
  id: string
  nome: string
  resumo: string
  trechos: Trecho[]
  fundamentos: Citado[]
  jurisprudencia: NonNullable<TeseResolvivel['jurisprudencia']>
}

export type PecaMontada = {
  caso: CasoResolvivel
  teses: TeseMontada[]
  /** Data de corte do corpus. Vai impressa no rodapé — decisão nº 3. */
  vigenciaAte: string
  /**
   * Os dispositivos transcritos cuja redação é posterior à data de corte, com a
   * data em que foram conferidos. Vazio na maioria das minutas — e o rodapé
   * então diz só a data de corte, como sempre disse.
   */
  conferidos: { id: string; citacao: string; conferidoEm: string; alteradoPor: string[] }[]
  /** Ids citados, na ordem em que aparecem. Serve de conferência na tela. */
  citados: string[]
}

export class CitacaoOrfa extends Error {
  constructor(readonly ids: string[]) {
    super(
      `A minuta não pôde ser montada: ${ids.length} citação(ões) apontam para ` +
        `dispositivo inexistente — ${ids.join(', ')}.`,
    )
    this.name = 'CitacaoOrfa'
  }
}

/** Todos os ids que a peça vai precisar — de marcador e de `fundamentos`. */
export function idsNecessarios(teses: TeseResolvivel[]): string[] {
  const deTemplate = teses.flatMap((t) => [...t.template_md.matchAll(CITE)].map((m) => m[1]!))
  const deFundamento = teses.flatMap((t) => t.fundamentos ?? [])
  return [...new Set([...deTemplate, ...deFundamento])]
}

/** Quebra o template em prosa e marcadores, sem perder a ordem. */
function fatia(template: string, mapa: Map<string, Citado>, faltando: Set<string>): Trecho[] {
  const trechos: Trecho[] = []
  let cursor = 0

  for (const m of template.matchAll(CITE)) {
    const prosa = template.slice(cursor, m.index).trim()
    if (prosa) trechos.push({ tipo: 'prosa', texto: prosa })

    const id = m[1]!
    const d = mapa.get(id)
    if (d) trechos.push({ tipo: 'citacao', d })
    else faltando.add(id)

    cursor = m.index + m[0].length
  }

  const resto = template.slice(cursor).trim()
  if (resto) trechos.push({ tipo: 'prosa', texto: resto })
  return trechos
}

/**
 * Monta a peça a partir de um mapa de dispositivos já carregado.
 *
 * `teses` já vem filtrada pelo checklist — esta função não decide o que se
 * aplica, só resolve o que recebeu. Separar as duas coisas é o que permite a
 * tela mostrar o checklist antes de gerar o arquivo, com o mesmo cálculo.
 *
 * **Não existe modo degradado.** Id que não resolve derruba a montagem inteira:
 * uma minuta que sai com "{{cite:...}}" cru envergonha, e uma que sai com a
 * citação silenciosamente omitida vai a juízo com fundamento vazio.
 */
export function resolvePeca(
  caso: CasoResolvivel,
  teses: TeseResolvivel[],
  mapa: Map<string, Citado>,
): PecaMontada {
  const faltando = new Set<string>()

  const montadas: TeseMontada[] = teses.map((t) => {
    const trechos = fatia(t.template_md, mapa, faltando)
    const fundamentos = (t.fundamentos ?? []).map((id) => {
      const d = mapa.get(id)
      if (!d) faltando.add(id)
      return d
    })
    return {
      id: t.id,
      nome: t.nome,
      resumo: t.resumo,
      trechos,
      fundamentos: fundamentos.filter((d): d is Citado => Boolean(d)),
      jurisprudencia: t.jurisprudencia ?? [],
    }
  })

  if (faltando.size) throw new CitacaoOrfa([...faltando].sort())

  const citados = montadas.flatMap((t) =>
    t.trechos
      .filter((x): x is { tipo: 'citacao'; d: Citado } => x.tipo === 'citacao')
      .map((x) => x.d.id),
  )

  // Lida do dispositivo, e não de constante: assim a peça não pode afirmar uma
  // vigência que a fonte não tem.
  const vigencia = [...mapa.values()][0]?.vigenciaAte ?? ''

  const conferidos = citados
    .map((id) => mapa.get(id))
    .filter((d): d is Citado => Boolean(d?.conferidoEm && d.alteradoPor?.length))
    .map((d) => ({
      id: d.id,
      citacao: d.citacao,
      conferidoEm: d.conferidoEm!,
      alteradoPor: d.alteradoPor ?? [],
    }))

  return { caso, teses: montadas, vigenciaAte: vigencia, citados, conferidos }
}
