// =============================================================================
// O corpus está em dia — e o que o atualizou continua rastreável.
//
// `data/curadoria/redacoes.yaml` é a primeira curadoria do projeto que REESCREVE
// texto legal em vez de consertar artefato de extração do PDF. Isso muda o que
// precisa ser trancado: os outros testes perguntam se a citação resolve; este
// pergunta se o dispositivo que a citação abre traz a redação que alguém
// conferiu, e não a de fevereiro de 2025.
//
// Offline, contra `data/normalizado/` — a mesma fonte de `tests/citacao.test.ts`
// e pelo mesmo motivo: é o que o seed escreve, e conferir contra ela é conferir
// contra o banco sem precisar de rede nem de segredo.
//
// **Não relaxar.** Uma asserção que caia aqui significa uma de duas coisas: o
// corpus perdeu a atualização (e a peça volta a transcrever redação revogada),
// ou a curadoria descreve um dispositivo que não existe mais. As duas se
// consertam na curadoria ou no corpus, nunca na asserção.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(import.meta.dirname, '..')
const NORMALIZADO = resolve(RAIZ, 'data/normalizado')
const CURADORIA = resolve(RAIZ, 'data/curadoria')

type Dispositivo = {
  id: string
  artigo_id: string
  tipo: string
  rotulo: string
  texto: string
  texto_embed: string
  citacao: string
  ordem: number
}

type Artigo = {
  id: string
  numero: string
  ordem: number
  conferido_em: string | null
  alterado_por: string[]
  fonte_redacao: string | null
}

type BlocoCurado = {
  id: string
  acao: 'alterar' | 'incluir'
  tipo: string
  rotulo: string
  depois_de?: string
  era?: string
  texto: string
}

type Redacao = {
  artigo: string
  acao?: 'criar'
  numero?: string
  depois_de?: string
  normas: string[]
  fonte: string
  conferido_em: string
  blocos?: BlocoCurado[]
  caput?: string
  paragrafos?: { rotulo: string; texto: string }[]
}

function corpus() {
  const dispositivos = new Map<string, Dispositivo>()
  const artigos = new Map<string, Artigo>()
  for (const arq of readdirSync(NORMALIZADO)) {
    if (!arq.endsWith('.json') || arq === 'relatorio.json') continue
    const doc = JSON.parse(readFileSync(resolve(NORMALIZADO, arq), 'utf8')) as {
      artigos?: Artigo[]
      dispositivos?: Dispositivo[]
    }
    for (const a of doc.artigos ?? []) artigos.set(a.id, a)
    for (const d of doc.dispositivos ?? []) dispositivos.set(d.id, d)
  }
  return { dispositivos, artigos }
}

const arquivo = resolve(CURADORIA, 'redacoes.yaml')
const REDACOES: Redacao[] = existsSync(arquivo)
  ? ((parseYaml(readFileSync(arquivo, 'utf8')) ?? []) as Redacao[])
  : []

const { dispositivos, artigos } = corpus()
const temCorpus = dispositivos.size > 0

// `data/normalizado/` é ignorado pelo git — num clone novo ele não existe até
// alguém rodar `npm run normalize`, e o PDF de origem também não está no
// repositório. Pular com o motivo impresso é o que o lado Python já faz em
// `exige_corpus`; falhar aqui puniria quem clonou, não quem quebrou.
const seComCorpus = temCorpus ? it : it.skip

describe('redações posteriores à data de corte', () => {
  it('a curadoria existe e não está vazia', () => {
    expect(REDACOES.length, 'redacoes.yaml sem nenhuma entrada').toBeGreaterThan(0)
  })

  seComCorpus('todo artigo da curadoria existe no corpus', () => {
    const faltando = REDACOES.map((r) => r.artigo).filter((id) => !artigos.has(id))
    expect(faltando, `artigos da curadoria ausentes do corpus: ${faltando.join(', ')}`).toEqual([])
  })

  // A asserção central: não basta a curadoria existir, o corpus tem de estar
  // carregando o texto dela. Se `normalize.ts` deixar de aplicar as redações, é
  // aqui que aparece — e antes que o seed leve o texto velho ao banco.
  seComCorpus('todo bloco alterado carrega a redação nova, não a antiga', () => {
    const errados: string[] = []
    for (const r of REDACOES) {
      for (const b of r.blocos ?? []) {
        if (b.acao !== 'alterar') continue
        const d = dispositivos.get(b.id)
        if (!d) {
          errados.push(`${b.id}: não existe no corpus`)
          continue
        }
        if (d.texto !== b.texto) errados.push(`${b.id}: texto do corpus não é o conferido`)
        if (d.texto === b.era) errados.push(`${b.id}: corpus ainda tem a redação anterior`)
      }
    }
    expect(errados, errados.join('\n')).toEqual([])
  })

  seComCorpus('todo bloco incluído existe, na posição e com o rótulo certos', () => {
    const errados: string[] = []
    for (const r of REDACOES) {
      let ultimo: Dispositivo | undefined
      for (const b of r.blocos ?? []) {
        if (b.acao !== 'incluir') continue
        const d = dispositivos.get(b.id)
        if (!d) {
          errados.push(`${b.id}: dispositivo incluído não chegou ao corpus`)
          continue
        }
        if (d.texto !== b.texto) errados.push(`${b.id}: texto diferente do conferido`)
        if (d.rotulo !== b.rotulo) errados.push(`${b.id}: rótulo ${d.rotulo} ≠ ${b.rotulo}`)
        if (d.tipo !== b.tipo) errados.push(`${b.id}: tipo ${d.tipo} ≠ ${b.tipo}`)

        // Vários blocos novos ancoram no mesmo dispositivo — `depois_de` aponta
        // para o último que a fotografia tinha. Então a exigência não é "entrou
        // logo depois da âncora", e sim: entrou DEPOIS dela e na ordem da
        // curadoria, que é a ordem do documento. Foi assim que os treze
        // parágrafos novos do art. 310 do CPP apareceram de trás para a frente.
        const anterior = dispositivos.get(b.depois_de ?? '')
        if (anterior && d.ordem <= anterior.ordem) {
          errados.push(`${b.id}: entrou antes da âncora (${d.ordem} ≤ ${anterior.ordem})`)
        }
        if (ultimo && d.ordem <= ultimo.ordem) {
          errados.push(`${b.id}: entrou antes de ${ultimo.id}, que a curadoria põe acima dele`)
        }
        ultimo = d
      }
    }
    expect(errados, errados.join('\n')).toEqual([])
  })

  seComCorpus('todo artigo criado entra depois da âncora e com os blocos dele', () => {
    const errados: string[] = []
    for (const r of REDACOES.filter((x) => x.acao === 'criar')) {
      const a = artigos.get(r.artigo)
      const ancora = artigos.get(r.depois_de ?? '')
      if (!a) {
        errados.push(`${r.artigo}: artigo criado não chegou ao corpus`)
        continue
      }
      if (a.numero !== r.numero) errados.push(`${r.artigo}: número ${a.numero} ≠ ${r.numero}`)
      if (ancora && a.ordem <= ancora.ordem) {
        errados.push(`${r.artigo}: ordem ${a.ordem} não vem depois de ${r.depois_de}`)
      }

      const caput = dispositivos.get(`${r.artigo}_caput`)
      if (!caput) errados.push(`${r.artigo}: sem caput`)
      else if (caput.texto !== r.caput) errados.push(`${r.artigo}: caput diferente do conferido`)

      const seus = [...dispositivos.values()].filter((d) => d.artigo_id === r.artigo)
      const esperados = 1 + (r.paragrafos?.length ?? 0)
      if (seus.length < esperados) {
        errados.push(`${r.artigo}: ${seus.length} dispositivos, esperados ao menos ${esperados}`)
      }
    }
    expect(errados, errados.join('\n')).toEqual([])
  })

  // A decisão nº 3 aplicada ao artigo: quem foi atualizado carrega a própria
  // data e a lei que o alterou. Sem isso a tela mostraria 28/02/2025 ao lado de
  // um texto de 2026, que é a mentira que este projeto existe para não contar.
  seComCorpus('todo artigo atualizado carrega data, leis e fonte', () => {
    const errados: string[] = []
    for (const r of REDACOES) {
      const a = artigos.get(r.artigo)
      if (!a) continue
      if (a.conferido_em !== r.conferido_em) errados.push(`${r.artigo}: sem a data da conferência`)
      if (!a.alterado_por?.length) errados.push(`${r.artigo}: sem as leis que o alteraram`)
      if (a.fonte_redacao !== r.fonte) errados.push(`${r.artigo}: sem o endereço da fonte`)
    }
    expect(errados, errados.join('\n')).toEqual([])
  })

  // A recíproca: artigo carimbado como conferido tem de ter curadoria por trás.
  // É o mesmo `artigos_conferencia_ck` da migration 0015, um passo antes do
  // banco — carimbo sem procedência é garantia vazia.
  seComCorpus('nenhum artigo se diz atualizado sem curadoria que o sustente', () => {
    const daCuradoria = new Set(REDACOES.map((r) => r.artigo))
    const orfaos = [...artigos.values()]
      .filter((a) => a.alterado_por?.length && !daCuradoria.has(a.id))
      .map((a) => a.id)
    expect(orfaos, `artigos com alterado_por sem entrada em redacoes.yaml: ${orfaos}`).toEqual([])
  })

  // O texto vem do Planalto, e a página do Planalto imprime a procedência colada
  // no fim do dispositivo. Se uma dessas anotações vazar para o corpus, ela vai
  // parar dentro das aspas de uma transcrição no .docx.
  seComCorpus('nenhuma anotação do Planalto vazou para o texto legal', () => {
    const sujos = [...dispositivos.values()]
      .filter((d) =>
        /\((Incluíd|Redação dada|Acrescid|Renumerad|Vigência|Vide|Revogado pel)/i.test(d.texto),
      )
      .map((d) => d.id)
    expect(sujos, `dispositivos com anotação de procedência no texto: ${sujos}`).toEqual([])
  })

  // Enumeração que o Planalto imprime dentro do parágrafo pai é o modo de falha
  // mais caro do extrator: o texto dos incisos ficaria gravado duas vezes, e uma
  // citação ao parágrafo transcreveria, na peça, trecho que não é dele.
  seComCorpus('nenhum bloco novo traz a enumeração dos filhos embutida', () => {
    const curados = new Set(
      REDACOES.flatMap((r) => (r.blocos ?? []).map((b) => b.id)).concat(
        REDACOES.filter((r) => r.acao === 'criar').map((r) => `${r.artigo}_caput`),
      ),
    )
    const suspeitos = [...dispositivos.values()]
      .filter((d) => curados.has(d.id) && d.tipo !== 'inciso' && d.tipo !== 'alinea')
      .filter((d) => /[;:.]\s+[IVXLC]{1,7}\s+[-–—]\s+/.test(d.texto))
      .map((d) => d.id)
    expect(suspeitos, `blocos com inciso embutido no texto: ${suspeitos}`).toEqual([])
  })

  // Dispositivo novo tem de nascer citável e embutível como qualquer outro: é o
  // que garante que ele passou pelo mesmo caminho dos outros 3.700, e não por um
  // atalho paralelo.
  seComCorpus('dispositivo novo nasce com citação e com contexto no vetor', () => {
    const errados: string[] = []
    for (const r of REDACOES) {
      const novos = (r.blocos ?? [])
        .filter((b) => b.acao === 'incluir')
        .map((b) => b.id)
        .concat(r.acao === 'criar' ? [`${r.artigo}_caput`] : [])

      for (const id of novos) {
        const d = dispositivos.get(id)
        if (!d) continue
        const numero = artigos.get(d.artigo_id)?.numero ?? ''
        if (!d.citacao.includes(numero)) errados.push(`${id}: citação sem o número do artigo`)
        // A alínea guarda o parêntese no rótulo (`m)`) e a citação imprime só
        // a letra (`art. 61, II, m`) — convenção de `montaCitacao`.
        const naCitacao = d.rotulo.replace(')', '')
        if (d.tipo !== 'caput' && !d.citacao.includes(naCitacao)) {
          errados.push(`${id}: citação sem o rótulo (${d.citacao})`)
        }
        const caput = dispositivos.get(`${d.artigo_id}_caput`)
        if (caput && !d.texto_embed.includes(caput.texto.slice(0, 40))) {
          errados.push(`${id}: texto_embed sem o caput do artigo`)
        }
      }
    }
    expect(errados, errados.join('\n')).toEqual([])
  })
})
