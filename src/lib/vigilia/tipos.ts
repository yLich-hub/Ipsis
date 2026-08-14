// =============================================================================
// Vigília do corpus — o formato comum das fontes
//
// Câmara e Senado devolvem JSONs sem nenhum parentesco entre si: uma tem
// `siglaTipo`/`numero`/`ano` e `statusProposicao.descricaoSituacao`; a outra tem
// `identificacao` já montada e `situacaoAtual`. Este arquivo é o formato que as
// duas viram antes de qualquer coisa a jusante encostar nelas — o filtro, a
// gravação e a tela conhecem só `Bruto`.
// =============================================================================

/** Um item como a fonte o devolveu, já traduzido para o vocabulário do projeto. */
export type Bruto = {
  /** Id estável, com prefixo da fonte: `camara:2602373`. */
  id: string
  fonte: FonteId
  identificacao: string
  ementa: string
  /** ISO `YYYY-MM-DD`; vazio quando a fonte não informa. */
  apresentadoEm: string
  situacao: string
  /** Link para o item na origem. Vazio quando a fonte não dá um endereço. */
  url: string
}

/** O mesmo item depois de passar pelo filtro do corpus. */
export type Candidato = Bruto & {
  /** `leis.id` das leis do corpus que a ementa diz alterar. Nunca vazio. */
  leisTocadas: string[]
  /**
   * Ids de artigo (`dl_2848_1940_art59`) que a ementa nomeia. Vazio é comum e
   * legítimo: metade das ementas diz "altera o Código Penal" sem dizer onde, e
   * `artigosDe()` prefere não atribuir a atribuir errado.
   */
  artigosTocados: string[]
  virouNorma: boolean
  norma: string | null
}

/**
 * As cinco fontes. Só as duas primeiras são coletadas pelo runtime TypeScript —
 * as outras três exigem scraping, extração de HTML e consulta Elasticsearch, e
 * moram em `coletores/`, em Python. A tela lê as cinco do mesmo jeito.
 */
export type FonteId = 'camara' | 'senado' | 'planalto' | 'dou' | 'datajud'

/** O que uma fonte devolve ao coletor. Erro é valor, não exceção. */
export type Colheita =
  | { ok: true; itens: Bruto[] }
  | { ok: false; erro: string; itens: Bruto[] }
