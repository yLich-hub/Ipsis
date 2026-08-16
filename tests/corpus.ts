// =============================================================================
// "Este clone tem o corpus?" — a pergunta que quatro suítes precisam fazer
//
// `data/normalizado/` é saída determinística do `npm run normalize` e está no
// `.gitignore`: versiona-se a entrada e as regras, não o resultado. O PDF de
// origem também não está no repositório, então num clone novo o corpus não
// existe **e não dá nem para regenerar** sem antes obter o Vade Mecum.
//
// Quatro suítes leem de lá — `citacao`, `peca`, `redacao` e `vigilia`. Sem esta
// guarda, um `git clone && npm i && npm test` devolve quatro suítes vermelhas
// com `ENOENT`, e o erro fala de arquivo faltando, não de corpus não gerado.
// Falhar assim pune quem clonou, não quem quebrou — e num projeto de portfólio
// é o primeiro comando que alguém roda.
//
// O lado Python já resolveu isto: `exige_corpus`, em
// `coletores/tests/test_filtro.py`, pula com o motivo impresso. Este arquivo é a
// mesma escolha no vitest, e o motivo é escrito quase igual de propósito — quem
// ler um vai reconhecer o outro.
//
// **O que NÃO se pula:** asserção que roda sem corpus continua rodando sempre.
// Em `vigilia`, as regras do filtro são as que podem errar em silêncio, e elas
// não dependem de `data/normalizado/` — só a conferência de "o id gerado existe
// mesmo?" depende. Pular demais transformaria a guarda num modo de esconder
// regressão.
// =============================================================================

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { it } from 'vitest'

export const RAIZ = resolve(import.meta.dirname, '..')
export const NORMALIZADO = resolve(RAIZ, 'data/normalizado')
export const CURADORIA = resolve(RAIZ, 'data/curadoria')

/**
 * A Lei de Drogas é a sonda: é a menor das três e a primeira que o normalize
 * escreve. Se ela está lá, as outras duas também estão.
 */
export const temCorpus = existsSync(resolve(NORMALIZADO, 'lei_11343_2006.json'))

export const MOTIVO_SEM_CORPUS =
  'data/normalizado/ não está neste clone (é saída do `npm run normalize`, ' +
  'ignorada pelo git). Rode `npm run normalize` para ativar estas asserções.'

/**
 * `it` que vira `it.skip` sem corpus.
 *
 * Usado como `seComCorpus('...', () => {})`, no lugar de `it`.
 *
 * O vitest não tem o `reason=` do `pytest.mark.skipif`: `it.skip` pula calado, e
 * um "skipped" mudo é pior que a falha — some da vista sem dizer o que falta.
 * Daí o aviso abaixo, impresso uma vez quando o corpus não está lá.
 */
export const seComCorpus = temCorpus ? it : it.skip

if (!temCorpus) console.warn(`\n⚠  ${MOTIVO_SEM_CORPUS}\n`)
