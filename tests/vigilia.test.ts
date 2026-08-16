// =============================================================================
// O filtro da vigília do corpus.
//
// `tocaOCorpus` é a única peça da vigília que pode errar em silêncio. Um cliente
// de API que quebra devolve erro, e a tela mostra; um filtro que erra devolve
// uma lista plausível — vazia demais ou cheia de ruído — e ninguém desconfia.
//
// **As ementas deste arquivo são reais**, colhidas das duas APIs em 13/08/2026,
// e não inventadas para o teste passar. É a diferença entre trancar a regra e
// trancar a impressão que se tem dela: a grafia de ementa legislativa brasileira
// tem particularidades ("Decreto-Lei nº 2.848, de 7 de dezembro de 1940 –
// Código Penal", com travessão) que ninguém escreveria de memória.
//
// Offline e sem segredo, como as outras seis suítes. O que fala com o Supabase
// ou com a Câmara é conferido contra o serviço de verdade, não aqui.
// =============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  ALVOS,
  DATA_DE_CORTE,
  artigosDe,
  soArtigo,
  depoisDoCorte,
  extraiNorma,
  tocaOCorpus,
  virouNorma,
} from '@/lib/vigilia/alvos'
import { FONTES, fonte } from '@/lib/vigilia/fontes'
import { NORMALIZADO, seComCorpus, temCorpus } from './corpus.ts'


/**
 * Os ids de artigo do corpus, lidos da mesma fonte que o seed escreve.
 *
 * Conjunto vazio quando `data/normalizado/` não está no clone — antes, o
 * `readFileSync` aqui no topo do módulo levantava ENOENT na COLETA e derrubava
 * as 35 asserções de uma vez, inclusive as 31 que testam o filtro e não tocam o
 * corpus. Eram justamente as que mais importam: **o filtro é a peça que pode
 * errar em silêncio**, e perdê-las por causa de um arquivo ausente é o pior
 * troco possível.
 *
 * Só as duas que conferem "o id gerado existe mesmo?" dependem do corpus, e são
 * essas que `seComCorpus` pula.
 */
const idsDoCorpus = new Set<string>(
  !temCorpus
    ? []
    : ALVOS.flatMap((a) => {
        const j = JSON.parse(
          readFileSync(join(NORMALIZADO, `${a.leiId}.json`), 'utf8'),
        ) as { artigos: { id: string }[] }
        return j.artigos.map((art) => art.id)
      }),
)

/** Ementas reais. A origem de cada uma está no comentário. */
const EMENTAS = {
  // Câmara, PL 466/2026 — o caso de duas leis numa ementa só.
  duasLeis:
    'Altera a Lei nº 7.560, de 19 de dezembro de 1986, e a Lei nº 11.343, de 23 de agosto de 2006, ' +
    'para aperfeiçoar o regime de destinação de bens e valores apreendidos em crimes relacionados ao ' +
    'tráfico de drogas e conexos, garantir repasse automático às unidades responsáveis pela apreensão.',

  // Câmara, PL 19/2026 — altera o CP sem falar uma vez em droga. É o achado que
  // uma busca por "drogas" perderia, e o motivo de "código penal" estar na rede.
  oculos:
    'Estabelece condições, deveres e restrições ao uso de óculos inteligentes com recursos de ' +
    'inteligência artificial, altera a Lei nº 9.503, de 23 de setembro de 1997 (Código de Trânsito ' +
    'Brasileiro) e o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), e dá outras ' +
    'providências.',

  // Senado, PL 1028/2025 — travessão no lugar dos parênteses.
  travessao:
    'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 - Código Penal, para suspender a ' +
    'prescrição em caso de fuga do condenado.',

  // Senado, PL 715/2026 — apelido da lei junto do número.
  apelido:
    'Altera a Lei nº 11.343, de 23 de agosto de 2006 – Lei do Tráfico Ilícito de Drogas, para ' +
    'modificar as causas de aumento de pena do crime de tráfico de drogas.',

  // Câmara, PL 40/2026 — fala da Lei Antidrogas e a altera, mas sem citar o número.
  semNumero:
    'Altera a Lei Antidrogas para dispor sobre a obrigatoriedade da veiculação de campanhas ' +
    'permanentes de prevenção ao uso de drogas nos meios de comunicação social.',
}

describe('tocaOCorpus — o que entra', () => {
  it('reconhece a Lei 11.343 pelo número, mesmo com outra lei na frente', () => {
    expect(tocaOCorpus(EMENTAS.duasLeis).map((a) => a.leiId)).toEqual(['lei_11343_2006'])
  })

  it('reconhece o Código Penal em ementa que não fala de droga nenhuma', () => {
    // Se este teste cair, a rede da Câmara voltou a depender da palavra "droga"
    // e a vigília deixou de ver metade do que altera o CP.
    expect(tocaOCorpus(EMENTAS.oculos).map((a) => a.leiId)).toEqual(['dl_2848_1940'])
  })

  it('reconhece o CP com travessão e com parênteses', () => {
    expect(tocaOCorpus(EMENTAS.travessao).map((a) => a.leiId)).toEqual(['dl_2848_1940'])
  })

  it('reconhece a Lei de Drogas pelo apelido, sem número', () => {
    expect(tocaOCorpus(EMENTAS.semNumero).map((a) => a.leiId)).toEqual(['lei_11343_2006'])
  })

  it('devolve as duas leis quando a ementa altera as duas', () => {
    const ids = tocaOCorpus(
      'Altera o Decreto-Lei nº 2.848, de 1940 (Código Penal) e a Lei nº 11.343, de 2006.',
    ).map((a) => a.leiId)
    expect(ids).toContain('dl_2848_1940')
    expect(ids).toContain('lei_11343_2006')
  })

  it('reconhece o CPP pelo nome e pelo número', () => {
    expect(tocaOCorpus('Altera o Código de Processo Penal.').map((a) => a.leiId)).toEqual([
      'dl_3689_1941',
    ])
    expect(
      tocaOCorpus('Acrescenta artigo ao Decreto-Lei nº 3.689, de 3 de outubro de 1941.').map(
        (a) => a.leiId,
      ),
    ).toEqual(['dl_3689_1941'])
  })

  it('aceita os outros verbos de alteração, não só "altera"', () => {
    for (const v of [
      'Acrescenta o art. 33-A à Lei nº 11.343, de 2006.',
      'Revoga o § 4º do art. 33 da Lei nº 11.343, de 2006.',
      'Dá nova redação ao art. 33 da Lei nº 11.343, de 2006.',
      'Inclui inciso no art. 40 da Lei nº 11.343, de 2006.',
    ]) {
      expect(tocaOCorpus(v).map((a) => a.leiId), v).toEqual(['lei_11343_2006'])
    }
  })
})

describe('tocaOCorpus — o que fica de fora', () => {
  it('recusa menção sem alteração', () => {
    // Metade das ementas que citam a Lei 11.343 a citam como referência. Se
    // entrassem, a tela diria que a fotografia envelheceu sem nada ter mudado.
    expect(
      tocaOCorpus(
        'Dispõe sobre a política de prevenção ao uso de drogas, nos termos da Lei nº 11.343, de 2006.',
      ),
    ).toEqual([])
  })

  it('recusa o Código Penal Militar, que é outro decreto-lei', () => {
    // DL 1.001/1969, fora do banco. Sem esta exclusão, todo projeto sobre
    // justiça militar entraria como se mexesse no corpus.
    expect(tocaOCorpus('Altera o Código Penal Militar para tipificar nova conduta.')).toEqual([])
    expect(
      tocaOCorpus('Altera o Código de Processo Penal Militar quanto ao rito ordinário.'),
    ).toEqual([])
  })

  it('recusa número solto sem contexto de diploma legal', () => {
    expect(tocaOCorpus('Altera a dotação orçamentária em R$ 2.848,00 para custeio.')).toEqual([])
  })

  it('não confunde 2.848 com 12.848', () => {
    expect(tocaOCorpus('Altera a Lei nº 12.848, de 2013.')).toEqual([])
  })

  it('recusa ementa sobre droga que não toca lei nenhuma do corpus', () => {
    expect(
      tocaOCorpus('Institui campanha nacional de prevenção ao uso de drogas nas escolas.'),
    ).toEqual([])
  })
})

describe('depoisDoCorte', () => {
  it('descarta o que é anterior à fotografia — já está no corpus', () => {
    expect(depoisDoCorte('2024-11-30')).toBe(false)
    expect(depoisDoCorte(DATA_DE_CORTE)).toBe(false)
  })

  it('aceita o que veio depois', () => {
    expect(depoisDoCorte('2025-03-01')).toBe(true)
    expect(depoisDoCorte('2026-08-13')).toBe(true)
  })

  it('não descarta achado sem data — a dúvida não vira exclusão', () => {
    expect(depoisDoCorte('')).toBe(true)
  })
})

describe('virouNorma e extraiNorma', () => {
  it('reconhece as grafias das duas fontes', () => {
    // Câmara e Senado escrevem coisas diferentes, e nenhuma das duas tem um
    // booleano para isto.
    expect(virouNorma('Transformado em Norma Jurídica')).toBe(true)
    expect(virouNorma('TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL')).toBe(true)
    expect(virouNorma('Aguardando Parecer')).toBe(false)
    expect(virouNorma('AGUARDANDO DESPACHO')).toBe(false)
    expect(virouNorma(null)).toBe(false)
  })

  it('extrai o número da lei quando o texto o traz', () => {
    expect(extraiNorma('Transformado na Lei Ordinária nº 15.123/2026')).toBe('Lei 15.123/2026')
    expect(extraiNorma('Transformada na Lei nº 15.164 de 14/07/2025')).toBe('Lei 15.164/2025')
  })

  it('devolve null quando a situação não nomeia lei nenhuma', () => {
    // Inventar o número seria pior que não tê-lo: ele vai para a tela ao lado
    // de um aviso de que a data de corte furou.
    expect(extraiNorma('TRANSFORMADA EM NORMA JURÍDICA')).toBeNull()
    expect(extraiNorma('Aguardando Parecer')).toBeNull()
  })
})

describe('artigosDe — o vínculo com as teses', () => {
  it('extrai o artigo nomeado, inclusive em lista e com sufixo de letra', () => {
    expect(artigosDe('Altera o art. 64 do Decreto-Lei nº 2.848, de 1940 (Código Penal).', ALVOS.slice(1, 2))).toEqual(
      ['dl_2848_1940_art64'],
    )
    expect(
      artigosDe('Altera os arts. 59 e 68 do Decreto-Lei nº 2.848, de 1940 (Código Penal).', ALVOS.slice(1, 2)),
    ).toEqual(['dl_2848_1940_art59', 'dl_2848_1940_art68'])
    expect(
      artigosDe('Altera a redação dos arts. 359-A e 359-B do Decreto-Lei nº 2.848 (Código Penal).', ALVOS.slice(1, 2)),
    ).toEqual(['dl_2848_1940_art359-a', 'dl_2848_1940_art359-b'])
  })

  it('ignora o parágrafo e fica no artigo', () => {
    // `§ 4º do art. 33` é o dispositivo mais citado do projeto. O vínculo é por
    // artigo de propósito: a ementa raramente diz qual parágrafo muda.
    const e = 'Altera o § 4º do art. 33 da Lei nº 11.343, de 23 de agosto de 2006.'
    expect(artigosDe(e, tocaOCorpus(e))).toEqual(['lei_11343_2006_art33'])
  })

  seComCorpus('todo id gerado existe de verdade no corpus', () => {
    // A mesma trava de `citacao.test.ts`, pelo mesmo motivo: id que não abre
    // nada é pior que nenhum id. Confere contra `data/normalizado/`, que é o que
    // o seed escreve, para rodar no CI sem rede e sem segredo.
    const ementas = [
      'Altera o art. 33 da Lei nº 11.343, de 2006.',
      'Altera os arts. 59 e 68 do Decreto-Lei nº 2.848, de 1940 (Código Penal).',
      'Altera a redação dos arts. 359-A e 359-B do Decreto-Lei nº 2.848 (Código Penal).',
      'Altera o art. 42 da Lei nº 11.343, de 2006.',
      'Altera o art. 396-A do Decreto-Lei nº 3.689, de 1941 (Código de Processo Penal).',
    ]
    for (const e of ementas) {
      const ids = artigosDe(e, tocaOCorpus(e))
      expect(ids.length, e).toBeGreaterThan(0)
      for (const id of ids) expect(idsDoCorpus.has(id), `${id} não existe no corpus`).toBe(true)
    }
  })

  it('não atribui artigo quando há mais de um diploma numerado na ementa', () => {
    // O caso traiçoeiro: o art. 2º é da Lei 7.209, não da Lei de Drogas.
    // `lei_11343_2006_art2` existe no banco e apontaria para o artigo errado.
    const e = 'Altera o art. 2º da Lei nº 7.209, de 1984, e a Lei nº 11.343, de 2006.'
    expect(tocaOCorpus(e).map((a) => a.leiId)).toEqual(['lei_11343_2006'])
    expect(artigosDe(e, tocaOCorpus(e))).toEqual([])
  })

  it('não atribui artigo quando a ementa altera duas leis do corpus', () => {
    const e =
      'Altera o Decreto-Lei nº 2.848 (Código Penal) e o Decreto-Lei nº 3.689 (Código de Processo Penal), nos arts. 33 e 155.'
    expect(tocaOCorpus(e)).toHaveLength(2)
    expect(artigosDe(e, tocaOCorpus(e))).toEqual([])
  })

  it('devolve vazio quando a ementa não nomeia artigo — e isso não é falha', () => {
    const e = 'Altera o Decreto-Lei nº 2.848, de 1940 (Código Penal), para tipificar nova conduta.'
    expect(artigosDe(e, tocaOCorpus(e))).toEqual([])
  })
})

describe('soArtigo — o encontro entre a vigília e as teses', () => {
  it('reduz dispositivo a artigo, em todos os sufixos que a curadoria usa', () => {
    expect(soArtigo('lei_11343_2006_art33_p4')).toBe('lei_11343_2006_art33')
    expect(soArtigo('lei_11343_2006_art33_caput')).toBe('lei_11343_2006_art33')
    expect(soArtigo('lei_11343_2006_art40_inc1')).toBe('lei_11343_2006_art40')
    expect(soArtigo('dl_2848_1940_art359-a_caput')).toBe('dl_2848_1940_art359-a')
  })

  it('deixa passar o que já é id de artigo', () => {
    expect(soArtigo('dl_2848_1940_art59')).toBe('dl_2848_1940_art59')
  })

  seComCorpus('todo fundamento da curadoria reduz a um artigo que existe no corpus', () => {
    // Este é o teste que faz o vínculo valer alguma coisa. Se um sufixo novo
    // entrar na curadoria e `soArtigo` não o reconhecer, o id reduzido não casa
    // com nada e o "Impacto nas teses" silenciosamente vira zero — que é
    // indistinguível de "nenhuma tese é afetada".
    const yaml = readFileSync(join(process.cwd(), 'data', 'curadoria', 'teses.yaml'), 'utf8')
    const fundamentos = [...yaml.matchAll(/^\s+- ((?:lei|dl)_\w[\w-]*)$/gm)].map((m) => m[1]!)

    expect(fundamentos.length).toBeGreaterThan(0)
    for (const f of fundamentos) {
      expect(idsDoCorpus.has(soArtigo(f)), `${f} → ${soArtigo(f)} não existe no corpus`).toBe(true)
    }
  })
})

describe('curadoria compartilhada — a trava contra divergência', () => {
  /**
   * O filtro da vigília existe em dois runtimes: aqui e em `coletores/filtro.py`,
   * que faz o scraping e as fontes pesadas. Duas cópias da mesma regra divergem
   * na primeira correção, e divergir aqui significa a tela dizer que nada mudou
   * enquanto o coletor sabe que mudou.
   *
   * A saída não foi eliminar uma das duas — cada runtime faz o que o outro não
   * faz. Foi tornar as duas conferíveis contra `data/curadoria/vigilia.yaml`:
   * o Python o lê em tempo de execução, e este bloco falha se o TypeScript
   * divergir. Mesma escolha de `tests/citacao.test.ts`, que não elimina a
   * duplicação entre curadoria e banco — ele a tranca.
   */
  const curadoria = parseYaml(
    readFileSync(join(process.cwd(), 'data', 'curadoria', 'vigilia.yaml'), 'utf8'),
  ) as {
    data_de_corte: string
    alvos: { lei_id: string; rotulo: string; reconhece: string; planalto: string }[]
    verbos: string
    contexto_de_lei: string
  }

  it('a data de corte é a mesma nos dois lados', () => {
    expect(DATA_DE_CORTE).toBe(curadoria.data_de_corte)
  })

  it('os três alvos são os mesmos, na mesma ordem, com o mesmo padrão', () => {
    expect(ALVOS.map((a) => a.leiId)).toEqual(curadoria.alvos.map((a) => a.lei_id))
    expect(ALVOS.map((a) => a.rotulo)).toEqual(curadoria.alvos.map((a) => a.rotulo))

    // `source` e não `toString()`: o segundo traz as barras e os flags, e um
    // flag a mais de um lado é justamente o tipo de divergência a pegar.
    ALVOS.forEach((a, i) => {
      expect(a.reconhece.source, a.leiId).toBe(curadoria.alvos[i]!.reconhece)
    })
  })

  it('toda lei do corpus tem endereço no Planalto', () => {
    // Sem o endereço, o coletor mais importante dos cinco não roda para aquela
    // lei — e roda para as outras duas, o que faz a falha parecer "nada mudou
    // nessa lei" em vez de "essa lei não foi consultada".
    for (const a of curadoria.alvos) {
      expect(a.planalto, a.lei_id).toMatch(/^https:\/\/www\.planalto\.gov\.br\//)
    }
  })
})

describe('alvos e fontes', () => {
  it('cobre as três leis do corpus, e só elas', () => {
    expect(ALVOS.map((a) => a.leiId).sort()).toEqual([
      'dl_2848_1940',
      'dl_3689_1941',
      'lei_11343_2006',
    ])
  })

  it('todo id de alvo é o mesmo id que o banco usa em leis.id', () => {
    // Se divergirem, a tela agrupa por uma chave que não existe no corpus e o
    // link para a lei citada abre em nada.
    for (const a of ALVOS) expect(a.leiId).toMatch(/^(lei|dl)_\d+_\d{4}$/)
  })

  it('toda fonte declarada tem nome, descrição e origem visível', () => {
    // A origem aparece na tela: quem lê a linha pode conferir de onde ela veio.
    for (const f of FONTES) {
      expect(f.nome.length, f.id).toBeGreaterThan(0)
      expect(f.descricao.length, f.id).toBeGreaterThan(0)
      expect(f.origem, f.id).toMatch(/\./)
    }
  })

  it('as cinco fontes do desenho existem, e cada uma declara onde roda', () => {
    expect(FONTES.map((f) => f.id).sort()).toEqual([
      'camara',
      'datajud',
      'dou',
      'planalto',
      'senado',
      'stj',
    ])
    // O Planalto é scraping de 900 KB por lei e o DataJud é consulta
    // Elasticsearch: nenhum dos dois cabe numa função serverless que serve
    // tela. Se um deles virar 'vercel', alguém moveu trabalho pesado para o
    // caminho do usuário.
    expect(FONTES.filter((f) => f.motor === 'python').map((f) => f.id).sort()).toEqual([
      'datajud',
      'dou',
      'planalto',
      'stj',
    ])
  })

  it('fonte desconhecida devolve um objeto, não quebra a tela', () => {
    expect(fonte('lexml' as never).nome).toBe('lexml')
  })
})
