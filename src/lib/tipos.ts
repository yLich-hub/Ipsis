// =============================================================================
// Tipos de fronteira: o que o parser entrega e o que o banco espera.
//
// A distância entre os dois é exatamente o trabalho de scripts/normalize.ts.
// =============================================================================

// --- entrada: saída de vade_parser.py (imutável, ver CLAUDE.md) --------------

export type IncisoBruto = {
  numero: string
  texto: string
  alineas?: string[]
}

export type ParagrafoBruto = {
  numero: string // '4' | 'único'
  texto: string
  incisos: IncisoBruto[]
}

export type ArtigoBruto = {
  id: string
  artigo: string
  contexto: { titulo?: string; capitulo?: string; secao?: string }
  caput: string
  paragrafos: ParagrafoBruto[]
  incisos: IncisoBruto[]
}

export type LeiBruta = {
  lei: string
  nome: string
  fonte: string
  total_artigos: number
  artigos: ArtigoBruto[]
}

// --- saída: linhas prontas para o schema de 0001_schema.sql ------------------

export type TipoDispositivo = 'caput' | 'paragrafo' | 'inciso' | 'alinea'

export type LinhaLei = {
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

export type LinhaArtigo = {
  id: string
  lei_id: string
  numero: string
  numero_base: number
  numero_sufixo: string | null
  ordem: number
  titulo: string | null
  capitulo: string | null
  secao: string | null
  rubrica: string | null
  revogado: boolean
  conferido_em: string | null
}

export type LinhaDispositivo = {
  id: string
  artigo_id: string
  lei_id: string
  tipo: TipoDispositivo
  numero: string | null
  rotulo: string
  pai_id: string | null
  ordem: number
  texto: string
  texto_bruto: string
  rubrica: string | null
  citacao: string
  texto_embed: string
  embed_hash: string
  revogado: boolean
}

/** Rubrica extraída do PDF (`rubricas.origem = 'oficial'`), já com os alvos. */
export type LinhaRubricaOficial = {
  termo: string
  slug: string
  tipo: 'dispositivo'
  origem: 'oficial'
  dispositivos: string[]
}

// --- auditoria ---------------------------------------------------------------

export type Alteracao = {
  dispositivo_id: string
  regra:
    | 'ordinal'
    | 'nota_rodape'
    | 'nota_editor'
    | 'rubrica_marginal'
    | 'estrutura'
    | 'emenda'
  antes: string
  depois: string
  /** só em rubrica_marginal: para onde o fragmento removido foi parar */
  rubrica?: string
  destino?: string
  /** só em emenda/nota_editor: por que a curadoria interveio */
  motivo?: string
}

export type CorteHeading = {
  lei_id: string
  nivel: 'titulo' | 'capitulo' | 'secao'
  bruto: string
  heading: string
  rubrica: string | null
  regra: 'sentence-case' | 'repeticao' | 'curadoria' | 'nao-segmentado'
  primeiro_artigo: string
}

export type Relatorio = {
  gerado_em: string
  leis: {
    lei_id: string
    artigos: number
    dispositivos: number
    revogados: number
    rubricas_oficiais: number
    contagem: Record<Alteracao['regra'], number>
  }[]
  alteracoes: Alteracao[]
  headings: CorteHeading[]
  conflitos: string[]
  /** dispositivos que passaram na limpeza mas continuam com cara de truncados */
  suspeitos: { dispositivo_id: string; motivo: string; trecho: string }[]
}

export type LeiNormalizada = {
  lei: LinhaLei
  artigos: LinhaArtigo[]
  dispositivos: LinhaDispositivo[]
  rubricas: LinhaRubricaOficial[]
}
