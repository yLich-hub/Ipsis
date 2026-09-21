// =============================================================================
// Os números da página pública — contados em build, nunca digitados.
//
// **Contar à mão erra, e este arquivo nasceu de um erro desses.** Ao escrever a
// página, `ls data/vademecum | wc -l` devolveu 76 e pareceu contradizer as "75
// legislações" que o README afirma. O README estava certo: o 76º arquivo é
// `indice.json`, que não é legislação nenhuma. Um total conferido de olho, por
// alguém atento, num diretório de um projeto pequeno — e ainda assim errado.
//
// Numa página cuja tese é que afirmação sem lastro não chega ao leitor, esse
// seria o pior lugar possível para repetir o hábito. Então nenhum número abaixo
// é literal: todos são `length` de algo versionado, lido no build, com o filtro
// que diz o que conta como item. Se o acervo crescer, a página acompanha; se
// alguém apagar dado, ela deixa de afirmar.
//
// **O que este arquivo se recusa a publicar.** O README também afirma 1.340
// artigos e 3.771 dispositivos, e os dois vêm de `data/normalizado/`, que não
// está versionado — o `normalize` fatia parágrafos e aplica curadoria, somando
// nós que a entrada não tem. Contados na entrada dão 1.330 e 3.664. Publicar o
// número do README aqui seria copiar um total que esta página não consegue
// conferir, que é exatamente o hábito que ela acusa. Então ela publica o que
// contou, e o rótulo diz onde contou.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { contaCorpus } from '@/lib/landing/corpus'
import { DATA_DE_CORTE } from '@/lib/vigilia/alvos'

const RAIZ = process.cwd()

const leYaml = <T,>(nome: string): T[] =>
  (parseYaml(readFileSync(resolve(RAIZ, 'data/curadoria', nome), 'utf8')) ?? []) as T[]

/** Cada ano do acervo do Paraná traz o próprio placar de coleta. */
type AnoDeDecretos = { ano: number; vistos: number; no_recorte: number }

function contaDecretosPR(): { decretos: number; atosLidos: number } {
  const dir = resolve(RAIZ, 'data/decretos_pr')
  let decretos = 0
  let atosLidos = 0
  for (const arq of readdirSync(dir)) {
    if (!arq.endsWith('.json')) continue
    const ano = JSON.parse(readFileSync(resolve(dir, arq), 'utf8')) as AnoDeDecretos
    decretos += ano.no_recorte
    atosLidos += ano.vistos
  }
  return { decretos, atosLidos }
}

export type Numeros = {
  /** Leis do corpus citável — o que a resposta pode citar. */
  leis: number
  /** Artigos dessas leis, contados na entrada versionada do normalize. */
  artigos: number
  /** Apelidos de instituto que a busca casa por match exato. */
  rubricas: number
  /** Teses da resposta à acusação, escritas à mão e revisadas. */
  teses: number
  /** Decretos do Paraná dentro do recorte normativo. */
  decretos: number
  /** Atos lidos na fonte para achar esses decretos. */
  atosLidos: number
  /**
   * Legislações do acervo de leitura.
   *
   * **Deliberadamente FORA do corpus citável** — ver `docs/acervo-vademecum.md`.
   * A página tem de rotular os dois separadamente: exibir este número ao lado
   * de "toda citação resolve para o corpus" sugeriria que estas 76 são
   * citáveis, e elas não são.
   */
  acervoDeLeitura: number
  /** A fotografia da legislação que o corpus congela. */
  dataDeCorte: string
  /**
   * Decisões em `docs/decisoes-de-arquitetura.md`.
   *
   * Contado pela mesma razão do resto: a página dizia "as sete decisões" e o
   * número ficou errado no instante em que a oitava foi escrita — dentro do
   * mesmo commit que criou esta página.
   */
  decisoesRegistradas: number
}

export function numeros(): Numeros {
  const { leis, artigos } = contaCorpus()
  const { decretos, atosLidos } = contaDecretosPR()

  return {
    leis,
    artigos,
    rubricas: leYaml('rubricas.yaml').length,
    teses: leYaml('teses.yaml').length,
    decretos,
    atosLidos,
    // Só `.html`, que é o que o `scripts/vademecum.ts` grava. Contar a pasta
    // inteira faria um README solto ali virar uma legislação na página.
    acervoDeLeitura: readdirSync(resolve(RAIZ, 'data/vademecum')).filter((f) => f.endsWith('.html'))
      .length,
    dataDeCorte: DATA_DE_CORTE,
    decisoesRegistradas: (
      readFileSync(resolve(RAIZ, 'docs/decisoes-de-arquitetura.md'), 'utf8').match(
        /^## \d+\. /gm,
      ) ?? []
    ).length,
  }
}
