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

/** Uma linha da lista: o que a fonte publica ao lado do ato, sem o texto. */
export type DecretoResumo = {
  id: string
  numero: string
  ano: number
  epigrafe: string
  sumula: string
  publicado_em: string
  conferido_em: string
  versao: string
  url: string
}

export type BlocoDecreto = {
  id: string
  ordem: number
  rotulo: string
  texto: string
}

export type DecretoInteiro = DecretoResumo & {
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
