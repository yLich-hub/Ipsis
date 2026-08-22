// =============================================================================
// Acervo de decretos do Paraná — formatos e derivados puros.
//
// **Sem cliente de banco, e é a razão de este arquivo existir separado.**
// `lib/supabase.ts` lança no import quando falta variável de ambiente, então
// qualquer módulo que o importe é intestável offline — e um teste que exigisse
// segredo não rodaria no CI. É a mesma separação de `lib/peca/resolver.ts` e
// `lib/peca/montar.ts`, e ela foi imposta do mesmo jeito: por um teste que
// quebrou ao tentar importar a função pura de um módulo que falava com o banco.
//
// O que fala com o banco mora em `leitura.ts`, ao lado.
// =============================================================================

// --- formatos ----------------------------------------------------------------

/**
 * Uma linha da lista: o que o CARTÃO imprime, e nada além.
 *
 * `epigrafe` e `url` saíram daqui de propósito — ver `COLUNAS_LISTA`, em
 * `leitura.ts`: são 130 caracteres por linha que ninguém lê na lista, e com
 * 1.989 linhas viram meio megabyte indo para o telefone.
 */
export type DecretoResumo = {
  id: string
  numero: string
  ano: number
  sumula: string
  publicado_em: string
  conferido_em: string
  versao: string
}

/** O ato inteiro, como o leitor precisa dele. */
export type DecretoCabecalho = DecretoResumo & { epigrafe: string; url: string }

export type BlocoDecreto = {
  id: string
  ordem: number
  rotulo: string
  texto: string
}

export type DecretoInteiro = DecretoCabecalho & {
  preambulo: string
  diario: string | null
  blocos: BlocoDecreto[]
}

/** Um acerto da busca: o bloco, com o ato em volta para a tela dar contexto. */
export type AchadoDecreto = {
  bloco_id: string
  decreto_id: string
  numero: string
  ano: number
  epigrafe: string
  sumula: string
  publicado_em: string
  conferido_em: string
  versao: string
  url: string
  ordem: number
  rotulo: string
  texto: string
  score: number
  via_sumula: boolean
}

// --- derivados de tela --------------------------------------------------------

/**
 * A espécie do decreto, lida da súmula.
 *
 * É rótulo de tela, não dado do banco, e a distinção importa: o recorte que
 * decidiu a entrada mora em `data/curadoria/decretos_pr.yaml` e é do coletor.
 * Repeti-lo como coluna criaria uma segunda verdade para divergir da primeira.
 * Aqui a pergunta é outra e mais frouxa — "que palavra ponho no selo?" —, e o
 * erro custa um selo errado, não um decreto a menos no acervo.
 */
export function especie(sumula: string): string {
  const t = sumula
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

  if (/^regulamenta/.test(t)) return 'Regulamenta'
  if (/^(institui|cria|fica instituido)/.test(t)) return 'Institui'
  if (/^(altera|introduz altera|acrescenta|atualiza|reajusta|prorroga)/.test(t)) return 'Altera'
  if (/^aprova/.test(t)) return 'Aprova'
  if (/^revoga/.test(t)) return 'Revoga'
  if (/^homologa situacao/.test(t)) return 'Emergência'
  if (/^declara/.test(t)) return 'Declara'
  return 'Dispõe'
}

/** `2025-01-31` → `31/01/2025`. */
export const dataBR = (iso: string) => iso.split('-').reverse().join('/')

/**
 * A data de publicação como ela pode ser exibida.
 *
 * **Existe por causa de um ato em 1.989.** O Decreto 4.895 foi listado em 2024,
 * tem epígrafe "21 de Fevereiro de 2024" e traz `21/02/2021` na coluna de data
 * de publicação da fonte. O ano do id vem da epígrafe — dois sinais contra um —,
 * mas a data continua gravada como a fonte a deu, porque corrigi-la por dedução
 * seria inventar justamente o dado de que se desconfia.
 *
 * O efeito, sem isto, é um cartão que diz "Decreto 4895/2024" ao lado de
 * "21/02/2021" e parece defeito do produto. Dizer que a fonte diverge é a única
 * saída que não mente de um dos dois lados.
 */
export function publicacao(d: { publicado_em: string; ano: number }): {
  texto: string
  divergente: boolean
} {
  const texto = dataBR(d.publicado_em)
  return { texto, divergente: Number(d.publicado_em.slice(0, 4)) !== d.ano }
}

/**
 * A versão do texto, concordando em português.
 *
 * A coluna guarda o vocabulário da fonte — `compilado`, `alterado`, `original`
 * —, e é assim que ela deve continuar: é o nome que a página do Paraná dá aos
 * três botões, e trocá-lo no banco faria o dado deixar de casar com a origem.
 *
 * A tela, porém, escreve "Redação ___", e "redação" é feminino: colada no valor
 * cru ela dizia **"Redação compilado"** no cartão da lista, no selo da fonte
 * citada no chat e no painel de procedência do leitor. Erro de concordância em
 * três lugares, num produto cujo leitor é advogado.
 */
export function versaoFem(versao: string): string {
  return versao === 'compilado' ? 'compilada' : versao === 'alterado' ? 'alterada' : versao
}
