// =============================================================================
// O acervo Vade Mecum é de LEITURA e vive fora do corpus curado.
//
// Essa separação é a única coisa que impede texto sem data de vigência
// conferida de virar fundamento de peça criminal (CLAUDE.md, decisão nº 3).
// Convenção não segura isso sozinha — daqui a seis meses alguém liga o acervo
// no seed "só para a busca ficar mais completa" e o erro entra em produção sem
// ninguém notar. Estes testes fazem essa ligação falhar no CI.
//
// Também cobre o saneamento do HTML de terceiro, que é servido com
// dangerouslySetInnerHTML: sanear é build-time, e este é o teste que garante
// que a saída do build está limpa.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { filtraAcervo } from '../src/lib/vademecum.ts'
import type { IndiceAcervo } from '../src/lib/tipos.ts'

const RAIZ = resolve(import.meta.dirname, '..')
const PASTA = resolve(RAIZ, 'data/vademecum')

const indice = JSON.parse(readFileSync(resolve(PASTA, 'indice.json'), 'utf8')) as IndiceAcervo
const html = new Map(
  indice.leis.map((l) => [l.id, readFileSync(resolve(PASTA, `${l.id}.html`), 'utf8')]),
)

describe('isolamento do corpus curado', () => {
  // Ids do corpus são 'lei_11343_2006', 'dl_2848_1940', 'dl_3689_1941' e seus
  // derivados. Um id do acervo que casasse esse padrão poderia ser confundido
  // com dispositivo citável em qualquer lugar que resolve citação por id.
  it('nenhum id do acervo se parece com id do corpus curado', () => {
    const padraoDoCorpus = /^(lei_\d+_\d{4}|dl_\d+_\d{4})/
    const colidem = indice.leis.filter((l) => padraoDoCorpus.test(l.id))
    expect(colidem.map((l) => l.id)).toEqual([])
  })

  it('o acervo não é lido pelo seed nem pelo embed', () => {
    for (const script of ['seed.ts', 'embed.ts', 'normalize.ts']) {
      const fonte = readFileSync(resolve(RAIZ, 'scripts', script), 'utf8')
      expect(fonte, `${script} referencia o acervo`).not.toMatch(/vademecum/i)
    }
  })

  it('a busca híbrida só conhece as leis do corpus curado', () => {
    const consultar = readFileSync(resolve(RAIZ, 'src/lib/busca/consultar.ts'), 'utf8')
    expect(consultar).not.toMatch(/vademecum/i)
  })

  // O caminho contrário: quem está nos dois lados tem que apontar para o lado
  // citável, senão o link cruzado da tela não aparece justamente onde importa.
  it('CP e CPP apontam para o corpus curado', () => {
    expect(indice.leis.find((l) => l.id === 'cp')?.corpus_id).toBe('dl_2848_1940')
    expect(indice.leis.find((l) => l.id === 'cpp')?.corpus_id).toBe('dl_3689_1941')
  })
})

describe('saneamento do HTML importado', () => {
  it('não sobrou script, handler de evento ou javascript:', () => {
    for (const [id, corpo] of html) {
      expect(corpo, `${id}: <script>`).not.toMatch(/<script/i)
      expect(corpo, `${id}: handler inline`).not.toMatch(/<[^>]+\son\w+\s*=/i)
      expect(corpo, `${id}: javascript:`).not.toMatch(/javascript:/i)
      expect(corpo, `${id}: <iframe>`).not.toMatch(/<iframe/i)
      expect(corpo, `${id}: atributo style`).not.toMatch(/<[^>]+\sstyle\s*=/i)
    }
  })

  it('todo link externo sai com rel de segurança', () => {
    for (const [id, corpo] of html) {
      for (const tag of corpo.match(/<a\s[^>]*href=[^>]*>/gi) ?? []) {
        expect(tag, `${id}: ${tag}`).toMatch(/rel="noopener noreferrer nofollow"/)
      }
    }
  })
})

describe('índice', () => {
  it('toda lei do índice tem arquivo, e todo arquivo está no índice', () => {
    const noDisco = readdirSync(PASTA)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.replace(/\.html$/, ''))
      .sort()
    expect(noDisco).toEqual(indice.leis.map((l) => l.id).sort())
  })

  it('o id serve como segmento de URL', () => {
    for (const l of indice.leis) expect(l.id, l.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })

  it('toda lei tem área conhecida', () => {
    const conhecidas = new Set(indice.areas.map((a) => a.chave))
    for (const l of indice.leis) expect(conhecidas, l.id).toContain(l.area)
  })

  // Âncora quebrada é sumário que não navega — e o sumário é a única forma de
  // percorrer 831 KB de Constituição sem rolar no braço.
  it('toda âncora do sumário existe no corpo da lei', () => {
    for (const l of indice.leis) {
      const corpo = html.get(l.id) ?? ''
      for (const t of l.sumario) {
        expect(corpo, `${l.id} → #${t.id}`).toContain(`id="${t.id}"`)
      }
    }
  })

  it('link para o texto oficial, quando existe, é http(s)', () => {
    for (const l of indice.leis) {
      if (l.link_oficial) expect(l.link_oficial, l.id).toMatch(/^https?:\/\//)
    }
  })

  it('a procedência do espelho está registrada', () => {
    expect(indice.origem.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(indice.origem.commit_em).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('filtro do catálogo', () => {
  it('ignora acento e caixa', () => {
    const achado = filtraAcervo(indice.leis, 'CODIGO PENAL')
    expect(achado.map((l) => l.id)).toContain('cp')
  })

  it('exige todas as palavras', () => {
    const so = filtraAcervo(indice.leis, 'processo penal')
    expect(so.map((l) => l.id)).toContain('cpp')
    expect(so.map((l) => l.id)).not.toContain('cpc')
  })

  it('casa pelo número da lei', () => {
    const achado = filtraAcervo(indice.leis, '13.709')
    expect(achado.map((l) => l.id)).toContain('lgpd')
  })

  it('termo vazio devolve tudo', () => {
    expect(filtraAcervo(indice.leis, '   ')).toHaveLength(indice.leis.length)
  })
})
