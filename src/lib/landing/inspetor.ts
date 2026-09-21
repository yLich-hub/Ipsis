// =============================================================================
// O inspetor de citação da página pública — resolução em tempo de build.
//
// Este arquivo é o lugar onde a decisão nº 1 do projeto vira mecanismo para o
// visitante sem sessão: `data/curadoria/inspetor.yaml` escreve argumentação e
// ids; o texto legal vem do corpus. Não há caminho por onde o texto de um
// dispositivo entre na página sem ter sido lido de `data/`.
//
// **As quatro recusas são de build, e é o ponto.** Id inexistente, marca de
// nota do editor não tratada, ênfase que não aparece no próprio parágrafo e
// arquivo sem bloco nenhum derrubam `next build` com a razão escrita. Numa
// página cuja tese é que citação quebrada não chega ao leitor, descobrir isso
// em produção seria a página desmentindo a si mesma.
//
// A terceira recusa parece cosmética e não é: `enfase` marca QUAL afirmação
// aquele dispositivo sustenta. Ênfase que não casa não some da tela — ela
// apenas deixa de destacar, e o leitor passa a ver uma citação pendurada numa
// frase que ninguém apontou.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { type Dispositivo, indiceDeDispositivos } from '@/lib/landing/corpus'

const ARQUIVO = 'data/curadoria/inspetor.yaml'

/** A mesma sonda de `scripts/normalize.ts`: nota do editor que sobrou no texto. */
const MARCA_NOTA = /\bNE\s*:/

type BlocoCurado = { texto: string; enfase: string; cite: string }
type InspetorCurado = { pergunta: string; rubrica: string; blocos: BlocoCurado[] }

export type BlocoDaResposta = {
  /** A argumentação — escrita na curadoria, nunca lida do corpus. */
  texto: string
  /** Trecho de `texto` que o dispositivo sustenta. Garantido presente. */
  enfase: string
  /** O dispositivo — lido do corpus, nunca escrito na curadoria. */
  citacao: Dispositivo
}

export type Inspetor = {
  pergunta: string
  rubrica: string
  blocos: BlocoDaResposta[]
  /** Quantas leis distintas as citações atravessam. Derivado, não digitado. */
  leisAtravessadas: number
}

function erro(motivo: string): never {
  throw new Error(`${ARQUIVO}: ${motivo}`)
}

export function carregaInspetor(): Inspetor {
  const cru = parseYaml(readFileSync(resolve(process.cwd(), ARQUIVO), 'utf8')) as InspetorCurado
  const indice = indiceDeDispositivos()

  if (!cru?.blocos?.length) erro('nenhum bloco — a página não tem o que inspecionar')

  const blocos = cru.blocos.map((b): BlocoDaResposta => {
    const citacao = indice.get(b.cite)
    if (!citacao) {
      erro(
        `o id "${b.cite}" não existe no corpus versionado.\n` +
          '  A correção é a curadoria ou o corpus — nunca exibir o texto na página.',
      )
    }
    if (MARCA_NOTA.test(citacao.texto)) {
      erro(
        `o dispositivo "${b.cite}" ainda carrega nota do editor e não pode ir para a ` +
          'página pública. Escolha outro dispositivo, ou trate a nota em ' +
          'data/curadoria/notas_editor.yaml.',
      )
    }
    if (!b.texto.includes(b.enfase)) {
      erro(`a ênfase de "${b.cite}" não aparece no parágrafo dela:\n  ${b.enfase}`)
    }
    return { texto: b.texto, enfase: b.enfase, citacao }
  })

  return {
    pergunta: cru.pergunta,
    rubrica: cru.rubrica,
    blocos,
    leisAtravessadas: new Set(blocos.map((b) => b.citacao.lei)).size,
  }
}
