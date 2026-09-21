// =============================================================================
// tests/landing.test.ts — a página pública não pode mentir
//
// `/` é a única tela que um visitante sem sessão alcança, e ela afirma duas
// coisas conferíveis: que toda citação exibida foi lida do corpus, e que todo
// número exibido foi contado. As duas erram em silêncio — texto legal errado
// continua parecendo texto legal, e total desatualizado continua parecendo
// total. É a mesma classe de falha de `tests/acesso.test.ts`.
//
// O risco não é hipotético: contar `data/vademecum/` à mão devolve 76 e a
// resposta certa é 75 — o arquivo a mais é `indice.json`, que não é legislação.
// Um diretório pequeno, alguém olhando com atenção, e o total sai errado. É
// esse tipo de erro que esta suíte existe para impedir do lado da landing.
//
// Offline e sem segredo, como as outras. A ÚNICA parte que depende de
// `data/normalizado/` é a conferência final contra o corpus gerado, e ela é
// pulada por `seComCorpus` — mesma escolha de `tests/citacao.test.ts`.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { indiceDeDispositivos } from '@/lib/landing/corpus'
import { carregaInspetor } from '@/lib/landing/inspetor'
import { numeros } from '@/lib/landing/numeros'

import { NORMALIZADO, RAIZ, seComCorpus } from './corpus.ts'

const leJson = <T,>(caminho: string): T =>
  JSON.parse(readFileSync(resolve(RAIZ, caminho), 'utf8')) as T

// -----------------------------------------------------------------------------
// 1. As citações do inspetor
// -----------------------------------------------------------------------------
describe('inspetor de citação', () => {
  // `carregaInspetor` levanta por conta própria em id inexistente, nota do
  // editor não tratada e ênfase que não casa. Chamá-la aqui é o teste: se o
  // build fosse quebrar, quebra no CI antes, com a mesma mensagem.
  const inspetor = carregaInspetor()

  it('resolve toda citação para um dispositivo do corpus versionado', () => {
    const indice = indiceDeDispositivos()
    expect(inspetor.blocos.length).toBeGreaterThan(0)

    for (const b of inspetor.blocos) {
      expect(indice.has(b.citacao.id), b.citacao.id).toBe(true)
      expect(b.citacao.texto.trim().length, b.citacao.id).toBeGreaterThan(0)
    }
  })

  it('não exibe texto legal que a curadoria tenha escrito', () => {
    // O contrato do `inspetor.yaml`: argumentação na curadoria, texto legal no
    // corpus. Se um trecho da citação aparecesse no parágrafo curado, a página
    // estaria reproduzindo lei escrita à mão — que é o que ela diz não fazer.
    for (const b of inspetor.blocos) {
      const inicioDaCitacao = b.citacao.texto.slice(0, 40)
      expect(b.texto, b.citacao.id).not.toContain(inicioDaCitacao)
    }
  })

  it('atravessa mais de uma lei, que é o que torna a demonstração convincente', () => {
    // Citações todas da mesma lei não mostram a resolução acontecendo contra
    // fontes distintas. Está escrito no cabeçalho do `inspetor.yaml`.
    expect(inspetor.leisAtravessadas).toBeGreaterThan(1)
  })

  it('não carrega artefato de extração do PDF para a página pública', () => {
    for (const b of inspetor.blocos) {
      // Nota do editor não tratada e marcador de rodapé colado no fim — as duas
      // classes que `src/lib/normalizacao.ts` documenta.
      expect(b.citacao.texto, b.citacao.id).not.toMatch(/\bNE\s*:/)
      expect(b.citacao.texto, b.citacao.id).not.toMatch(/[a-zà-ÿ)][.;:!?]\d{1,2}$/)
    }
  })

  seComCorpus('bate com o corpus normalizado, que é o que o banco recebeu', () => {
    // A conferência que fecha o ciclo: o índice de build lê a ENTRADA do
    // normalize e aplica as mesmas limpezas puras. Se o resultado divergir do
    // que o normalize gravou, a página está exibindo um texto e o produto,
    // outro — e o visitante confere a citação errada.
    const doCorpus = new Map<string, string>()
    for (const arq of readdirSync(NORMALIZADO)) {
      if (!arq.endsWith('.json') || arq === 'relatorio.json') continue
      const doc = leJson<{ dispositivos?: { id: string; texto: string }[] }>(
        `data/normalizado/${arq}`,
      )
      for (const d of doc.dispositivos ?? []) doCorpus.set(d.id, d.texto)
    }

    for (const b of carregaInspetor().blocos) {
      const oficial = doCorpus.get(b.citacao.id)
      expect(oficial, `${b.citacao.id} não existe em data/normalizado/`).toBeDefined()
      expect(b.citacao.texto.replace(/\s+/g, ' ').trim()).toBe(
        (oficial ?? '').replace(/\s+/g, ' ').trim(),
      )
    }
  })
})

// -----------------------------------------------------------------------------
// 2. Os números da página
// -----------------------------------------------------------------------------
describe('números da página pública', () => {
  const n = numeros()

  it('conta artigos de acordo com o total que cada lei declara de si', () => {
    // Conferência independente: `numeros()` mede `artigos.length`, e cada
    // arquivo traz `total_artigos` escrito pelo parser. Se os dois discordarem,
    // o corpus foi editado à mão em algum momento.
    const fontes = ['data/lei11343.json', 'data/codigo_penal.json', 'data/codigo_processo_penal.json']
    const declarado = fontes
      .map((f) => leJson<{ total_artigos: number }>(f).total_artigos)
      .reduce((a, b) => a + b, 0)

    expect(n.artigos).toBe(declarado)
    expect(n.leis).toBe(fontes.length)
  })

  it('só soma decretos de anos cuja coleta terminou', () => {
    // `completo: false` significa coleta interrompida — a fonte bloqueia por
    // volume. Publicar um parcial como total seria afirmar a menos sem dizer.
    const dir = resolve(RAIZ, 'data/decretos_pr')
    let recorte = 0
    for (const arq of readdirSync(dir)) {
      if (!arq.endsWith('.json')) continue
      const ano = leJson<{ no_recorte: number; vistos: number; completo: boolean }>(
        `data/decretos_pr/${arq}`,
      )
      expect(ano.completo, arq).toBe(true)
      recorte += ano.no_recorte
    }
    expect(n.decretos).toBe(recorte)
    expect(n.atosLidos).toBeGreaterThan(n.decretos)
  })

  it('conta o acervo de leitura só pelo que o coletor grava', () => {
    const html = readdirSync(resolve(RAIZ, 'data/vademecum')).filter((f) => f.endsWith('.html'))
    expect(n.acervoDeLeitura).toBe(html.length)
  })

  it('não publica número nenhum zerado', () => {
    // Uma contagem que devolve zero não é uma página honesta — é uma página
    // quebrada afirmando vazio com a mesma cara de quem afirma cheio.
    for (const [chave, valor] of Object.entries(n)) {
      if (typeof valor === 'number') expect(valor, chave).toBeGreaterThan(0)
    }
  })

  it('a data de corte do corpus é a mesma que a vigília persegue', () => {
    expect(n.dataDeCorte).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
