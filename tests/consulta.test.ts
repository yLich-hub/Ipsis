// =============================================================================
// O contrato do caminho ao vivo — validação e leitura incremental.
//
// Estas são as duas peças que decidem se uma resposta gerada por modelo pode
// chegar à tela. Ambas são puras: não chamam modelo, não tocam banco, e por isso
// rodam offline no CI, sem segredo — a mesma separação que existe entre
// `lib/peca/resolver.ts` e `lib/peca/montar.ts`.
//
// O que está trancado aqui:
//
// - citação para `doc_id` fora do contexto recuperado é RECUSADA. É a regra que
//   elimina a alucinação de número de súmula e de artigo, e é o motivo de a
//   validação existir no servidor em vez de na confiança do prompt;
// - marcador que aponta para fonte inexistente é recusado;
// - parágrafo que transcreve o texto da lei é recusado — a decisão nº 1 diz que
//   texto legal nunca é gerado, e "gerar" inclui copiar do contexto para a prosa;
// - o leitor incremental devolve exatamente o texto dos parágrafos, e nada da
//   estrutura JSON em volta, mesmo com o JSON partido em pedaços arbitrários.
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  LeitorDeTexto,
  PISO_DE_FUSAO,
  filtraContexto,
  montarPrecedentes,
} from '@/lib/consulta/aovivo'
import { enriquece } from '@/lib/consulta/enriquece'
import { recado, transcreveuLei, valida, type Recuperado } from '@/lib/consulta/valida'

const CONTEXTO: Recuperado[] = [
  {
    docId: 'lei_11343_2006_art33_p4',
    texto:
      'Nos delitos definidos no caput e no § 1º deste artigo, as penas poderão ser reduzidas de um sexto a dois terços, desde que o agente seja primário, de bons antecedentes, não se dedique às atividades criminosas nem integre organização criminosa.',
  },
  {
    docId: 'lei_11343_2006_art42',
    texto:
      'O juiz, na fixação das penas, considerará, com preponderância sobre o previsto no art. 59 do Código Penal, a natureza e a quantidade da substância ou do produto, a personalidade e a conduta social do agente.',
  },
]

/** Uma resposta válida mínima, sobre a qual cada teste estraga uma coisa só. */
const boa = () => ({
  paragraphs: [
    { text: 'A redução do § 4º depende de quatro requisitos cumulativos, e a acusação costuma atacar o último deles.', citations: [1] },
    { text: 'Na primeira fase, a natureza e a quantidade preponderam sobre os vetores genéricos.', citations: [2] },
  ],
  sources: [
    { id: 1, doc_id: 'lei_11343_2006_art33_p4' },
    { id: 2, doc_id: 'lei_11343_2006_art42' },
  ],
  confidence: 'alta' as const,
  followups: ['Requisitos do tráfico privilegiado'],
})

describe('validação da resposta ao vivo', () => {
  it('aceita a resposta que respeita o contrato', () => {
    const v = valida(boa(), CONTEXTO)
    expect(v.ok).toBe(true)
  })

  it('recusa parágrafo sem nenhuma citação', () => {
    // A fresta que as outras quatro recusas não alcançavam: um parágrafo sem
    // citação passava por todas, e é exatamente nele que caberia uma afirmação
    // inteira apoiada no treinamento do modelo — "o porte ilegal é punido com
    // reclusão de 2 a 4 anos". Curta, correta no mundo, e impossível de conferir
    // nesta tela, que é o que este projeto existe para não produzir.
    const r = boa()
    r.paragraphs.push({
      text: 'O porte ilegal de arma de fogo é punido com reclusão de dois a quatro anos e multa.',
      citations: [],
    })

    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.violacoes.some((x) => x.codigo === 'paragrafo_sem_ancora')).toBe(true)
  })

  it('não cobra âncora de parágrafo sem texto', () => {
    // A regra nova confere sobre os parágrafos COM texto. Um parágrafo em
    // branco não afirma nada, então não há o que ancorar — e acusá-lo encheria
    // a mensagem de correção com ruído que atrapalha a segunda tentativa.
    // Sozinho ele seria pego pela regra da resposta vazia; ao lado de
    // parágrafos válidos, é só sujeira de formatação e não derruba a resposta.
    const r = boa()
    r.paragraphs.push({ text: '   ', citations: [] })

    expect(valida(r, CONTEXTO).ok).toBe(true)
  })

  it('a recusa por falta de âncora vira instrução de correção nomeando o parágrafo', () => {
    // A regeneração só ajuda se o recado disser o que consertar. Se este teste
    // cair, a segunda tentativa vira um tiro no escuro que custa o dobro do
    // tempo para chegar ao mesmo lugar.
    const r = boa()
    r.paragraphs.push({ text: 'Uma afirmação solta, sem fonte nenhuma para sustentá-la.', citations: [] })

    const v = valida(r, CONTEXTO)
    if (v.ok) throw new Error('deveria ter sido recusada')
    expect(recado(v.violacoes)).toMatch(/parágrafo 3/)
  })

  it('recusa doc_id que não veio da busca — mesmo que exista no banco', () => {
    const r = boa()
    r.sources[1]!.doc_id = 'dl_2848_1940_art157'
    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.violacoes.some((x) => x.codigo === 'doc_id_fora_do_contexto')).toBe(true)
      expect(v.violacoes[0]!.detalhe).toContain('dl_2848_1940_art157')
    }
  })

  it('recusa marcador que aponta para fonte inexistente', () => {
    const r = boa()
    r.paragraphs[0]!.citations = [7]
    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violacoes.some((x) => x.codigo === 'citacao_orfa')).toBe(true)
  })

  it('recusa parágrafo que transcreve o texto da lei', () => {
    const r = boa()
    r.paragraphs[0]!.text =
      'Vale lembrar que as penas poderão ser reduzidas de um sexto a dois terços, desde que o agente seja primário, de bons antecedentes, não se dedique às atividades criminosas.'
    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violacoes.some((x) => x.codigo === 'transcreveu_lei')).toBe(true)
  })

  it('não confunde o apelido do instituto com transcrição', () => {
    // Nome de tese, expressão consagrada e citação curta continuam permitidos —
    // recusá-los tornaria a validação inútil na prática.
    expect(transcreveuLei('Trata-se do chamado tráfico privilegiado.', CONTEXTO)).toBeNull()
    expect(transcreveuLei('A natureza e a quantidade preponderam.', CONTEXTO)).toBeNull()
  })

  it('pega a transcrição mesmo com acento e pontuação trocados', () => {
    const copia =
      'as penas poderao ser reduzidas de um sexto a dois tercos desde que o agente seja primario de bons antecedentes'
    expect(transcreveuLei(copia, CONTEXTO)).toBe('lei_11343_2006_art33_p4')
  })

  it('recusa o que não tem a forma do esquema', () => {
    expect(valida(null, CONTEXTO).ok).toBe(false)
    expect(valida({ paragraphs: 'texto' }, CONTEXTO).ok).toBe(false)
    const semConfianca = { ...boa(), confidence: 'altíssima' }
    expect(valida(semConfianca, CONTEXTO).ok).toBe(false)
  })

  it('recusa resposta sem nenhum parágrafo com texto', () => {
    const r = { ...boa(), paragraphs: [{ text: '   ', citations: [] }] }
    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violacoes.some((x) => x.codigo === 'vazia')).toBe(true)
  })
})

describe('alfabeto', () => {
  it('recusa letra fora do alfabeto latino', () => {
    // Observado numa geração real: devanágari no lugar de "crime", no meio de
    // uma frase correta. Nenhuma das outras recusas alcança isso — o parágrafo
    // cita, não transcreve e tem a forma certa.
    const r = boa()
    r.paragraphs[0]!.text = 'O tráfico privilegiado não é um अपराधo autônomo.'
    const v = valida(r, CONTEXTO)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violacoes.some((x) => x.codigo === 'fora_do_alfabeto')).toBe(true)
  })

  it('não confunde português com alfabeto estranho', () => {
    // A regra é allowlist por ESCRITA, e só sobre letras: acento, cedilha e
    // ordinal são latinos; pontuação e símbolo nem sequer são letra. Se este
    // teste cair, a recusa passa a derrubar resposta legítima — que é pior que
    // o defeito que ela conserta.
    const r = boa()
    r.paragraphs[0]!.text =
      'A ação penal exige atenção: o § 4º do art. 33 reduz a pena em até ⅔ — mas não é automática, e a majorante de 1/6 incide sobre 100% da base.'
    expect(valida(r, CONTEXTO).ok).toBe(true)
  })
})

describe('corte dos cartões de fonte', () => {
  it('a fonte citada sobrevive ao corte, mesmo além do quarto lugar', () => {
    // O corte em quatro cartões continua certo; cortar pelo FIM é que estava
    // errado. Um parágrafo que citava a quinta fonte perdia o superíndice, e a
    // resposta ficava ancorada nos dados e órfã na tela — justamente depois de
    // a âncora virar obrigatória.
    const contexto: Recuperado[] = Array.from({ length: 6 }, (_, i) => ({
      docId: `d${i + 1}`,
      texto: `texto ${i + 1}`,
    }))
    const achados = contexto.map((c, i) => ({
      dispositivo_id: c.docId,
      citacao: `art. ${i + 1}`,
      texto: c.texto,
      revogado: false,
      cobertura: 'integral',
      vigencia_ate: '2025-02-28',
      lei_apelido: 'Lei',
      artigo_rubrica: null,
      rubrica_termo: null,
      papel: null,
    })) as never[]

    const dados = {
      // o único parágrafo cita a SEXTA fonte
      paragraphs: [{ text: 'Um parágrafo ancorado na última fonte da lista.', citations: [6] }],
      sources: contexto.map((c, i) => ({ id: i + 1, doc_id: c.docId })),
      confidence: 'alta' as const,
      followups: [],
    }

    const comp = enriquece(dados, achados, [])
    expect(comp.fontes).toHaveLength(4)
    // sobreviveu ao corte…
    expect(comp.fontes.some((f) => f.id === 'd6')).toBe(true)
    // …e o parágrafo tem marcador
    expect(comp.paras[0]!.cite).not.toBeNull()
  })

  it('salva a primeira citação de CADA parágrafo, mesmo com tudo citado', () => {
    // O caso real que derrubou a primeira tentativa de conserto: o modelo
    // devolveu oito fontes e citou `[[1], [2,3,4,5,6], [7,8]]`. Como TODAS
    // estavam citadas, priorizar "as citadas" não decidia nada e o corte
    // continuava caindo nas quatro primeiras — deixando o terceiro parágrafo,
    // que aponta para a sétima, sem superíndice.
    const contexto: Recuperado[] = Array.from({ length: 8 }, (_, i) => ({
      docId: `d${i + 1}`,
      texto: `texto ${i + 1}`,
    }))
    const achados = contexto.map((c, i) => ({
      dispositivo_id: c.docId,
      citacao: `art. ${i + 1}`,
      texto: c.texto,
      revogado: false,
      cobertura: 'integral',
      vigencia_ate: '2025-02-28',
      lei_apelido: 'Lei',
      artigo_rubrica: null,
      rubrica_termo: null,
      papel: null,
    })) as never[]

    const comp = enriquece(
      {
        paragraphs: [
          { text: 'Primeiro.', citations: [1] },
          { text: 'Segundo.', citations: [2, 3, 4, 5, 6] },
          { text: 'Terceiro.', citations: [7, 8] },
        ],
        sources: contexto.map((c, i) => ({ id: i + 1, doc_id: c.docId })),
        confidence: 'alta' as const,
        followups: [],
      },
      achados,
      [],
    )

    // Nenhum parágrafo fica sem marcador…
    expect(comp.paras.map((p) => p.cite).filter((c) => c === null)).toHaveLength(0)
    // …e a fonte 7, que só aparece como primeira citação do 3º parágrafo,
    // entrou no lugar da 4ª, que não é primeira de ninguém.
    expect(comp.fontes.map((f) => f.id)).toEqual(['d1', 'd2', 'd3', 'd7'])
  })

  it('mantém a ordem que o modelo escolheu entre os sobreviventes', () => {
    // A ordem das fontes é a única decisão do modelo sobre a lista. Salvar a
    // citada não pode virar reordenar tudo.
    const contexto: Recuperado[] = Array.from({ length: 5 }, (_, i) => ({
      docId: `d${i + 1}`,
      texto: `texto ${i + 1}`,
    }))
    const achados = contexto.map((c, i) => ({
      dispositivo_id: c.docId,
      citacao: `art. ${i + 1}`,
      texto: c.texto,
      revogado: false,
      cobertura: 'integral',
      vigencia_ate: '2025-02-28',
      lei_apelido: 'Lei',
      artigo_rubrica: null,
      rubrica_termo: null,
      papel: null,
    })) as never[]

    const comp = enriquece(
      {
        paragraphs: [{ text: 'Cita a quinta.', citations: [5] }],
        sources: contexto.map((c, i) => ({ id: i + 1, doc_id: c.docId })),
        confidence: 'alta' as const,
        followups: [],
      },
      achados,
      [],
    )

    // d5 entrou no lugar de d4, mas d1..d3 continuam na frente e na ordem.
    expect(comp.fontes.map((f) => f.id)).toEqual(['d1', 'd2', 'd3', 'd5'])
  })
})

describe('piso de fusão — o que o modelo pode citar', () => {
  /** Um achado mínimo; só `score` importa aqui. */
  const ach = (id: string, score: number) =>
    ({ dispositivo_id: id, score, texto: 'x', citacao: 'x' }) as never

  const oito = (scores: number[]) => scores.map((s, i) => ach(`d${i}`, s))

  it('corta o rabo quando a fusão concordou em alguns itens', () => {
    // Perfil real de consulta dentro do recorte, medido em 14/08/2026: topo em
    // 0,025 e cauda abaixo do piso.
    const r = filtraContexto(oito([0.025, 0.022, 0.019, 0.017, 0.0159, 0.0155, 0.0152, 0.0149]))
    expect(r.itens).toHaveLength(4)
    expect(r.fraco).toBe(false)
  })

  it('marca como fraca a recuperação em que nenhuma perna concordou', () => {
    // Perfil real de consulta FORA do corpus: todas as quatro medidas deram o
    // mesmo topo, 1/61 — a assinatura de uma perna sozinha.
    const r = filtraContexto(oito([0.0164, 0.0161, 0.0159, 0.0156, 0.0154, 0.0152, 0.0149, 0.0147]))
    expect(r.fraco).toBe(true)
    // Não zera: a resposta gerada para pergunta fora do corpus é boa, e ela
    // precisa de algo para apontar ao dizer o que o acervo cobre.
    expect(r.itens).toHaveLength(3)
  })

  it('NÃO aplica o piso a endereço direto', () => {
    // `resolveDireto` responde "art. 33 da Lei de Drogas" lendo o artigo pelo
    // id, sem fusão, e grava score 0 em tudo. Se este teste cair, a consulta
    // mais literal do produto volta a chegar vazia ao modelo.
    const r = filtraContexto(oito([0, 0, 0, 0, 0, 0, 0, 0]), true)
    expect(r.itens).toHaveLength(8)
    expect(r.fraco).toBe(false)
  })

  it('o piso é derivado dos parâmetros da RPC, não escolhido a olho', () => {
    // `p_k = 60`, menor peso 1.0 → 1/61. Se a migration mudar, isto tem de
    // mudar junto, e é por isso que o número não mora solto no código.
    expect(PISO_DE_FUSAO).toBeCloseTo(1 / 61, 10)
  })

  it('não mexe em recuperação já curta', () => {
    const r = filtraContexto(oito([0.0164, 0.0159, 0.0154]))
    expect(r.itens).toHaveLength(3)
    expect(r.fraco).toBe(false)
  })
})

describe('leitura incremental do JSON', () => {
  const JSON_EXEMPLO = JSON.stringify({
    paragraphs: [
      { text: 'Primeiro parágrafo com "aspas" e\nquebra.', citations: [1] },
      { text: 'Segundo parágrafo.', citations: [] },
    ],
    sources: [{ id: 1, doc_id: 'lei_11343_2006_art33_p4' }],
    confidence: 'alta',
    followups: ['Uma sugestão'],
  })

  /** Fatiar em pedaços de tamanho fixo simula a chegada por rede. */
  const emPedacos = (s: string, n: number) => s.match(new RegExp(`.{1,${n}}`, 'gs')) ?? []

  it('devolve só o texto dos parágrafos, não a estrutura em volta', () => {
    const leitor = new LeitorDeTexto()
    const saida = emPedacos(JSON_EXEMPLO, 7).map((p) => leitor.empurra(p)).join('')

    expect(saida).toContain('Primeiro parágrafo com "aspas" e\nquebra.')
    expect(saida).toContain('Segundo parágrafo.')
    // Nada da estrutura vaza para a tela.
    expect(saida).not.toContain('doc_id')
    expect(saida).not.toContain('citations')
    expect(saida).not.toContain('lei_11343_2006_art33_p4')
    expect(saida).not.toContain('alta')
  })

  it('dá o mesmo resultado com qualquer corte de pedaço', () => {
    const inteiro = new LeitorDeTexto().empurra(JSON_EXEMPLO)
    for (const n of [1, 2, 3, 13, 64]) {
      const leitor = new LeitorDeTexto()
      const partido = emPedacos(JSON_EXEMPLO, n).map((p) => leitor.empurra(p)).join('')
      expect(partido, `pedaços de ${n}`).toBe(inteiro)
    }
  })

  it('decodifica escape unicode partido entre dois pedaços', () => {
    const cru = '{"paragraphs":[{"text":"caf\\u00e9 e p\\u00e3o","citations":[]}]}'
    const leitor = new LeitorDeTexto()
    // O corte cai no meio de `é` de propósito.
    const saida = ['{"paragraphs":[{"text":"caf\\u00', 'e9 e p\\u00e3o","citations":[]}]}']
      .map((p) => leitor.empurra(p))
      .join('')
    expect(saida.trim()).toBe('café e pão')
    expect(new LeitorDeTexto().empurra(cru).trim()).toBe('café e pão')
  })
})

describe('precedentes no contexto', () => {
  const CITAVEL = [
    {
      docId: 'stj:4200',
      rotulo: 'Tema 1139',
      situacao: 'Trânsito em Julgado',
      tese: 'É vedada a utilização de inquéritos e ações penais em curso para afastar o § 4º.',
      artigos: ['lei_11343_2006_art33'],
    },
  ]

  it('marca o precedente com tag própria, não como dispositivo', () => {
    // São duas autoridades: o dispositivo diz o que a lei escreve, o precedente
    // diz como o STJ a lê. Sem a distinção na marcação, o modelo escreve sobre
    // a tese com o peso do texto legal — e a resposta afirma como lei o que é
    // interpretação.
    const b = montarPrecedentes(CITAVEL)
    expect(b).toContain('<precedente doc_id="stj:4200"')
    expect(b).not.toContain('<dispositivo')
    expect(b).toContain('NÃO texto de lei')
  })

  it('leva a situação para o contexto', () => {
    expect(montarPrecedentes(CITAVEL)).toContain('situacao="Trânsito em Julgado"')
  })

  it('sem precedente, não acrescenta nada ao contexto', () => {
    expect(montarPrecedentes([])).toBe('')
  })

  it('o precedente vira cartão com a situação como selo', () => {
    // O selo do dispositivo vem da vigência; o do precedente, da situação no
    // STJ. São o mesmo papel: dizer se aquilo ainda vale.
    const comp = enriquece(
      {
        paragraphs: [{ text: 'O STJ firmou entendimento sobre o ponto.', citations: [1] }],
        sources: [{ id: 1, doc_id: 'stj:4200' }],
        confidence: 'alta' as const,
        followups: [],
      },
      [],
      [],
      CITAVEL,
    )

    expect(comp.fontes).toHaveLength(1)
    expect(comp.fontes[0]!.selo).toBe('Trânsito em Julgado')
    expect(comp.fontes[0]!.titulo).toContain('Tema 1139')
    expect(comp.paras[0]!.cite).toBe('1')
  })

  it('a data de corte continua saindo do corpus, nunca do precedente', () => {
    // Precedente tem situação, não vigência. Se a data do rodapé passasse a sair
    // dele, a resposta seria carimbada com uma data que não é a do corpus.
    const achado = {
      dispositivo_id: 'lei_11343_2006_art33_p4',
      citacao: 'art. 33, § 4º',
      texto: 'x',
      revogado: false,
      cobertura: 'integral',
      vigencia_ate: '2025-02-28',
      lei_apelido: 'Lei 11.343',
      artigo_rubrica: null,
      rubrica_termo: null,
      papel: null,
    } as never

    const comp = enriquece(
      {
        paragraphs: [{ text: 'Um parágrafo.', citations: [1] }],
        // o precedente vem PRIMEIRO na lista, e mesmo assim não define a data
        sources: [
          { id: 1, doc_id: 'stj:4200' },
          { id: 2, doc_id: 'lei_11343_2006_art33_p4' },
        ],
        confidence: 'alta' as const,
        followups: [],
      },
      [achado],
      [],
      CITAVEL,
    )

    expect(comp.vigencia).toBe('28/02/2025')
  })
})
