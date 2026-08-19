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
  /**
   * Data em que a redação deste artigo foi conferida contra o texto oficial.
   *
   * Nula na esmagadora maioria: o artigo está na redação da fotografia do Vade
   * Mecum, e quem responde por ela é `leis.vigencia_ate`. Preenchida nos artigos
   * que `data/curadoria/redacoes.yaml` atualizou — ali a data da lei não vale
   * mais, e é esta que a tela mostra.
   */
  conferido_em: string | null
  /** As leis posteriores à data de corte que alteraram este artigo. */
  alterado_por: string[]
  /** Endereço do texto compilado contra o qual a conferência foi feita. */
  fonte_redacao: string | null
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

/**
 * Valor de um fato do caso e de uma condição de gatilho.
 *
 * Primitivo de propósito: o checklist compara por igualdade direta
 * (`fatos[k] === gatilho[k]`). Objeto ou array aqui tornaria a comparação uma
 * decisão de implementação — igualdade profunda? por referência? — e o gatilho
 * deixaria de ser objetivo, que é a razão de ele existir.
 */
export type ValorDeFato = string | number | boolean | null

/** Uma entrada de `data/curadoria/teses.yaml`. */
export type TeseCurada = {
  id: string
  nome: string
  resumo: string
  ordem: number
  ativo?: boolean
  /** Chaves objetivas, avaliadas por igualdade direta contra `casos.fatos`. */
  gatilho: Record<string, ValorDeFato>
  fundamentos: string[]
  jurisprudencia?: { tribunal?: string; classe?: string; numero?: string; tese?: string; url?: string }[]
  template_md: string
  /**
   * `'pendente'` enquanto a argumentação não tiver sido lida por quem assina a
   * peça. Ausente é "sem registro", NUNCA "conferida" — ver o cabeçalho de
   * `teses.yaml` e a migration 0016.
   */
  revisao?: 'pendente'
}

/** Uma entrada de `data/curadoria/casos.yaml`. */
export type CasoCurado = {
  id: string
  titulo: string
  narrativa: string
  ordem: number
  imputacao: string[]
  /** Mesmas chaves de `teses.gatilho` — ver o cabeçalho de casos.yaml. */
  fatos: Record<string, ValorDeFato>
}

/** Papel do dispositivo dentro do cluster de uma rubrica curada. */
export type PapelRubrica = 'principal' | 'correlato' | 'requisito'

/**
 * Uma entrada de `data/curadoria/rubricas.yaml`. Diferente da oficial em três
 * pontos que importam: tem `variantes` (o match é por igualdade exata, então é
 * a variante que faz o trabalho), tem `explicacao` autoral, e aponta para um
 * cluster ordenado em vez de um dispositivo só.
 */
export type RubricaCurada = {
  termo: string
  slug: string
  tipo: 'dispositivo' | 'tema' | 'processual'
  explicacao?: string
  variantes?: string[]
  dispositivos: {
    id: string
    papel?: PapelRubrica
    peso?: number
    nota?: string
  }[]
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
    // A única regra que NÃO é limpeza de artefato do PDF: a redação mudou depois
    // da fotografia, e o corpus está sendo alinhado ao texto compilado. Fica na
    // mesma lista porque o que ela precisa é do mesmo: aparecer no diff da
    // auditoria, com o antes e o depois lado a lado.
    | 'redacao'
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

// --- acervo Vade Mecum (leitura, fora do corpus curado) ----------------------
//
// Tipos deliberadamente sem parentesco com LinhaDispositivo & cia.: o acervo é
// um espelho de leitura, não fonte de citação. Ver scripts/vademecum.ts.

/** Entrada do menu lateral: um Livro/Título/Capítulo, com âncora no corpo. */
export type TopicoSumario = {
  /** 1 a 4, na hierarquia do próprio documento */
  nivel: number
  titulo: string
  /** id injetado no heading em build; destino do link do sumário */
  id: string
}

export type LeiAcervo = {
  id: string
  titulo: string
  apelido: string
  area: string
  area_rotulo: string
  jurisdicao: string
  num_lei: string | null
  ementa: string | null
  /**
   * Texto oficial no Planalto — a única redação que vale conferir.
   *
   * `null` quando o espelho não trouxe link e ninguém curou um à mão. A tela
   * diz que falta, em vez de apontar para destino derivado por chute: normas
   * estaduais do acervo não vivem no ccivil_03, e uma URL montada pelo número
   * abriria a lei federal homônima. Ver scripts/vademecum.ts, linkOficial().
   */
  link_oficial: string | null
  /** id no corpus curado, quando a mesma lei existe lá com citação estável */
  corpus_id: string | null
  artigos: number
  bytes: number
  relacionadas: { id: string; nome: string }[]
  sumario: TopicoSumario[]
}

export type AreaAcervo = {
  chave: string
  rotulo: string
  descricao: string | null
  total: number
}

export type IndiceAcervo = {
  /** procedência do espelho: vai à tela, não fica só no commit */
  origem: {
    repo: string
    url: string
    sha: string
    commit_em: string
    licenca: string
  }
  areas: AreaAcervo[]
  leis: LeiAcervo[]
}
