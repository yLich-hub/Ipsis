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

import { classifica } from '@/lib/busca/intencao'

import {
  LeitorDeTexto,
  PISO_DE_FUSAO,
  filtraContexto,
  filtraDecretos,
  montarContexto,
  montarDecretos,
  montarPrecedentes,
} from '@/lib/consulta/aovivo'
import { querDecretos } from '@/lib/decretos/porteiro'
import {
  MAX_HERDADOS,
  idsHerdados,
  montarFio,
  religaHerdados,
  saneiaFio,
} from '@/lib/consulta/fio'
import { fontesDeDoutrina } from '@/lib/consulta/doutrina'
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
    // Perfil real medido em 20/08/2026, DEPOIS de 0017: "tráfico privilegiado"
    // devolve o cluster de rubrica bem acima do piso e uma cauda em 1/61 e
    // abaixo. Os números de antes (topo em 0,025) eram os da rubrica valendo um
    // quarto do peso — ver o cabeçalho de `0017_peso_da_rubrica.sql`.
    const r = filtraContexto(oito([0.0569, 0.0599, 0.0476, 1 / 61, 0.0161, 0.0159, 0.0156, 0.0154]))
    expect(r.itens).toHaveLength(3)
    expect(r.fraco).toBe(false)
  })

  it('marca como fraca a recuperação em que nenhuma perna concordou', () => {
    // Perfil real de consulta FORA do corpus, remedido em 20/08/2026: as quatro
    // deram o MESMO topo, exatamente 1/61 — a assinatura de uma perna sozinha.
    // Este perfil não mudou com 0017, e não devia mesmo: sem rubrica que case,
    // o peso da rubrica é irrelevante.
    const r = filtraContexto(oito([1 / 61, 0.0161, 0.0159, 0.0156, 0.0154, 0.0152, 0.0149, 0.0147]))
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

  it('o cluster de rubrica passa folgado, e a cauda de uma perna só não passa', () => {
    // A distância entre os dois é o que 0017 devolveu. Com a rubrica valendo
    // 3/259 em vez de 3/61, "tráfico privilegiado" juntava DOIS itens acima do
    // piso, caía em `fraco`, e o modelo era instruído a dizer que o acervo não
    // cobre a pergunta mais central do projeto.
    //
    // **Nenhum teste desta suíte pega aquela regressão**, e é honesto dizer:
    // ela mora no SQL da RPC e só aparece contra o banco. O que se tranca aqui
    // é o outro lado — que o piso separa os dois perfis quando os scores
    // chegam certos. Para o lado do banco existe `npm run contexto`.
    const comRubrica = filtraContexto(oito([0.0569, 0.0599, 0.0476, 1 / 61, 0.0161, 0.0159, 0.0156, 0.0154]))
    const semNada = filtraContexto(oito([1 / 61, 0.0161, 0.0159, 0.0156, 0.0154, 0.0152, 0.0149, 0.0147]))
    expect(comRubrica.fraco).toBe(false)
    expect(semNada.fraco).toBe(true)
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

// --- doutrina: referência com origem -----------------------------------------
//
// A regra do projeto sempre teve duas metades — recusar a reprodução E apontar a
// fonte legítima. Por muito tempo só a primeira estava no código. Estas
// asserções trancam a segunda, e trancam sobretudo o que ela NÃO pode virar:
// um endereço montado por dedução, que é o que o acervo Vade Mecum proíbe.
describe('fontesDeDoutrina', () => {
  it('devolve o endereço de busca com o termo consultado', () => {
    const f = fontesDeDoutrina('tráfico privilegiado segundo a doutrina')
    expect(f).toHaveLength(1)
    expect(f[0]!.url).toContain('bdjur.stj.jus.br')
    expect(f[0]!.url).toContain(encodeURIComponent('tráfico privilegiado segundo a doutrina'))
  })

  it('mantém o escopo na coleção de Doutrina, não na base inteira', () => {
    // O uuid foi conferido contra a API de comunidades do BDJur. Sem ele a busca
    // devolve jurisprudência e legislação junto, que é o que o produto já tem.
    expect(fontesDeDoutrina('dolo eventual')[0]!.url).toContain(
      'scope=cdb150cd-70f0-497e-a395-ca7e869309de',
    )
  })

  it('consulta vazia não produz link', () => {
    // Link para uma busca sem termo abre uma página inútil. Vazio é resposta.
    expect(fontesDeDoutrina('   ')).toEqual([])
    expect(fontesDeDoutrina('')).toEqual([])
  })

  it('escapa o que quebraria a URL', () => {
    const url = fontesDeDoutrina('art. 33 & "tráfico" #1')[0]!.url
    expect(url).not.toContain(' ')
    expect(url).not.toContain('"')
    expect(url).not.toContain('#')
  })

  it('a classificação de doutrina é o que aciona o painel', () => {
    // A tela chama `classifica()` sobre a pergunta e só desenha o painel no
    // molde `doutrina`. Se a classificação deixar de reconhecer o termo, o
    // painel some sem nenhum erro — daí a asserção morar aqui junto.
    expect(classifica('o que diz a doutrina sobre o art. 33').molde).toBe('doutrina')
    expect(classifica('segundo Nucci, o tráfico privilegiado').molde).toBe('doutrina')
    expect(classifica('requisitos do tráfico privilegiado').molde).not.toBe('doutrina')
  })
})

describe('o fio da conversa', () => {
  const troca = (pergunta: string, ids: string[]) => ({ pergunta, ids })

  describe('saneamento do que a tela mandou', () => {
    it('entrada que não é lista vira fio vazio', () => {
      // Fio é conforto. Recusar a requisição por causa dele custaria a resposta,
      // que é o que o usuário veio buscar.
      expect(saneiaFio(undefined)).toEqual([])
      expect(saneiaFio('tráfico')).toEqual([])
      expect(saneiaFio({ pergunta: 'x' })).toEqual([])
    })

    it('guarda no máximo três trocas, e são as últimas', () => {
      const fio = saneiaFio([
        troca('primeira', []),
        troca('segunda', []),
        troca('terceira', []),
        troca('quarta', []),
      ])
      expect(fio.map((t) => t.pergunta)).toEqual(['segunda', 'terceira', 'quarta'])
    })

    it('descarta id que não tem forma de id', () => {
      // Isto vem do navegador. Um `id` com aspas, espaço ou barra não chega a
      // virar consulta ao banco — e o que sobra da troca continua valendo.
      //
      // **`stj:4200` mudou de lado, e a mudança é um conserto.** Esta asserção
      // exigia que ele fosse descartado, e com isso ELA AFIRMAVA O DEFEITO: o
      // dois-pontos não tem nada de perigoso — os ids vão parametrizados para o
      // PostgREST — e é a forma dos outros dois espaços de id do produto,
      // `stj:<sequencial>` e `decpr:<ano>:<numero>:<ordem>`. Enquanto ele caía
      // aqui, nenhum precedente e nenhum decreto sobrevivia a uma pergunta de
      // seguimento, e o comentário de `lerDispositivos` — que diz que o fio
      // carrega id de precedente — descrevia algo que o código impedia.
      const [t] = saneiaFio([
        troca('e o § 4º?', [
          'lei_11343_2006_art33_p4',
          'DROP TABLE dispositivos',
          '../../etc/passwd',
          'stj:4200',
        ]),
      ])
      expect(t?.ids).toEqual(['lei_11343_2006_art33_p4', 'stj:4200'])
    })

    it('não repete id dentro da mesma troca', () => {
      const [t] = saneiaFio([troca('x', ['dl_2848_1940_art59', 'dl_2848_1940_art59'])])
      expect(t?.ids).toHaveLength(1)
    })

    it('troca sem pergunta não entra, mesmo trazendo ids', () => {
      // Sem a pergunta o fio não resolve referência nenhuma, e os ids sozinhos
      // seriam herança sem motivo declarado.
      expect(saneiaFio([troca('   ', ['lei_11343_2006_art33'])])).toEqual([])
    })
  })

  describe('herança de id', () => {
    it('não repete o que a busca desta pergunta já trouxe', () => {
      const fio = [troca('o que é tráfico privilegiado', ['lei_11343_2006_art33_p4'])]
      expect(idsHerdados(fio, ['lei_11343_2006_art33_p4'])).toEqual([])
    })

    it('devolve o dispositivo que o piso cortou e a troca anterior citou', () => {
      // A dedução é contra o contexto JÁ FILTRADO, de propósito: se a fusão
      // desta pergunta empurrou para a cauda um artigo que a conversa já tratou
      // como assunto, ele volta. Herança existe justamente para isso.
      const fio = [troca('e os requisitos?', ['lei_11343_2006_art33_p4'])]
      expect(idsHerdados(fio, ['dl_2848_1940_art59'])).toEqual(['lei_11343_2006_art33_p4'])
    })

    it('começa pela troca mais recente', () => {
      const fio = [troca('antiga', ['a1']), troca('recente', ['b1'])]
      expect(idsHerdados(fio, [])).toEqual(['b1', 'a1'])
    })

    it('para no teto, para a herança não dominar o contexto', () => {
      // Herdado não passou pela fusão desta pergunta: é aposta, não recuperação.
      const fio = [
        troca('t1', ['a1', 'a2', 'a3', 'a4']),
        troca('t2', ['b1', 'b2', 'b3', 'b4']),
      ]
      expect(idsHerdados(fio, [])).toHaveLength(MAX_HERDADOS)
    })
  })

  describe('o bloco que o modelo lê', () => {
    it('sem fio, não acrescenta nada à mensagem', () => {
      expect(montarFio([])).toBe('')
    })

    it('diz com todas as letras que pergunta anterior não é fonte', () => {
      // Sem isto o modelo se apoia no que ele mesmo respondeu antes — a memória
      // do modelo com um passo a mais, e igualmente não conferível na tela.
      const b = montarFio([troca('o que é tráfico privilegiado', [])])
      expect(b).toContain('o que é tráfico privilegiado')
      expect(b).toContain('NÃO são fonte')
    })

    it('a prosa da resposta anterior nunca atravessa', () => {
      // A garantia de verdade é de tipo — `Troca` só tem pergunta e ids —, e
      // esta asserção é o lembrete de por quê: prosa gerada não passa por
      // `valida()` de novo.
      const fio = saneiaFio([
        { pergunta: 'e se ele for reincidente?', ids: ['lei_11343_2006_art33_p4'], resposta: 'A reincidência afasta o § 4º.' },
      ])
      expect(JSON.stringify(fio)).not.toContain('afasta')
    })
  })

  describe('o herdado tem de chegar inteiro à tela', () => {
    const achado = (id: string) =>
      ({
        dispositivo_id: id,
        citacao: `art. de ${id}`,
        texto: 'texto do dispositivo',
        revogado: false,
        cobertura: 'integral',
        vigencia_ate: '2025-02-28',
        lei_apelido: 'Lei 11.343',
        artigo_rubrica: null,
        rubrica_termo: null,
        papel: null,
      }) as never

    const dados = {
      paragraphs: [{ text: 'A reincidência afasta o benefício.', citations: [1] }],
      sources: [{ id: 1, doc_id: 'lei_11343_2006_art33_p4' }],
      confidence: 'alta' as const,
      followups: [],
    }

    it('fonte que não está na lista de achados some do cartão, sem erro', () => {
      // Esta é a armadilha, e ela está aqui como aviso: `valida()` aceita o
      // herdado (ele está em `recuperados`), e `enriquece` o descartaria por não
      // achar o id — deixando o parágrafo ancorado nos dados e órfão na tela.
      // É por isso que `gerarAoVivo` passa o CONTEXTO, herança incluída, e não
      // os achados crus da busca.
      const comp = enriquece(dados, [], [], [])
      expect(comp.fontes).toHaveLength(0)
      expect(comp.paras[0]!.cite).toBeNull()
    })

    it('com o herdado no contexto, o cartão e o superíndice aparecem', () => {
      const comp = enriquece(dados, [achado('lei_11343_2006_art33_p4')], [], [])
      expect(comp.fontes).toHaveLength(1)
      expect(comp.paras[0]!.cite).toBe('1')
    })
  })

  describe('a conversa reaberta reata o herdado', () => {
    const d = (id: string) => ({ dispositivo_id: id, texto: id })

    it('devolve a fonte citada que a busca daquela pergunta não trouxe', () => {
      // O histórico guarda só `bruta` de cada troca. A troca 2 citou o § 4º, que
      // veio por herança; o pool da conversa o tem, porque a troca 1 o buscou.
      const pool = [d('lei_11343_2006_art33_p4'), d('dl_2848_1940_art44')]
      const daTroca2 = [d('dl_2848_1940_art44')]
      const r = religaHerdados(pool, daTroca2, ['dl_2848_1940_art44', 'lei_11343_2006_art33_p4'])
      expect(r.map((x) => x.dispositivo_id)).toEqual(['lei_11343_2006_art33_p4'])
    })

    it('não devolve o que a troca já tem', () => {
      const pool = [d('a'), d('b')]
      expect(religaHerdados(pool, [d('a'), d('b')], ['a', 'b'])).toEqual([])
    })

    it('não repete quando o pool traz o mesmo dispositivo em várias trocas', () => {
      // Duas perguntas seguidas sobre o mesmo assunto recuperam o mesmo artigo,
      // e o pool é a concatenação das buscas.
      const pool = [d('a'), d('a'), d('a')]
      expect(religaHerdados(pool, [], ['a'])).toHaveLength(1)
    })

    it('id de precedente não resolve, e não estraga o resto', () => {
      // `comp.fontes` mistura dispositivo e tema do STJ; o tema nunca esteve em
      // `bruta.itens` e não tem por que estar.
      const pool = [d('lei_11343_2006_art33_p4')]
      const r = religaHerdados(pool, [], ['stj:4200', 'lei_11343_2006_art33_p4'])
      expect(r.map((x) => x.dispositivo_id)).toEqual(['lei_11343_2006_art33_p4'])
    })
  })

  describe('o herdado se declara no contexto', () => {
    const ach = (id: string) =>
      ({
        dispositivo_id: id,
        citacao: `Citação de ${id}`,
        texto: 'texto do dispositivo',
        artigo_rubrica: null,
        rubrica_termo: null,
        papel: null,
      }) as never

    it('marca a origem só no que veio do fio', () => {
      // O modelo precisa saber que aquele dispositivo é o assunto arrastado da
      // troca anterior, e não algo que o acervo devolveu para o que se acabou
      // de perguntar. Sem a marca, uma pergunta que mudou de assunto receberia
      // os dois com o mesmo peso.
      const bloco = montarContexto(
        [ach('novo'), ach('velho')],
        new Set(['velho']),
      )
      const [primeiro, segundo] = bloco.split('\n\n')
      expect(primeiro).not.toContain('origem:')
      expect(segundo).toContain('pergunta anterior desta conversa')
    })

    it('sem herança, o contexto sai como sempre saiu', () => {
      expect(montarContexto([ach('novo')])).not.toContain('origem:')
    })
  })
})


// --- o acervo estadual no contexto -------------------------------------------

describe('porteiro do acervo de decretos do Paraná', () => {
  it('abre quando a pergunta fala em decreto', () => {
    expect(querDecretos('o que diz o decreto 8812 do Paraná?').abre).toBe(true)
    expect(querDecretos('tem algum decreto estadual sobre polícia penal?').abre).toBe(true)
  })

  it('abre por marca do Executivo estadual', () => {
    expect(querDecretos('legislação estadual sobre conselho de drogas').abre).toBe(true)
    expect(querDecretos('o que o governo do estado regulamentou sobre isso').abre).toBe(true)
  })

  it('NÃO abre para decreto-lei, e essa é a armadilha central', () => {
    // O Código Penal é o Decreto-Lei 2.848/1940 e o CPP é o 3.689/1941: as duas
    // leis mais citadas do produto têm a palavra "decreto" dentro do nome. Sem a
    // exclusão, a pergunta mais central do projeto arrastaria para o contexto um
    // corpus que não tem nada a ver com ela.
    expect(querDecretos('o que diz o decreto-lei 3.689 sobre flagrante?').abre).toBe(false)
    expect(querDecretos('decreto lei 2848, art. 59').abre).toBe(false)
  })

  it('fica fechado na consulta comum, que é a esmagadora maioria', () => {
    expect(querDecretos('requisitos do tráfico privilegiado').abre).toBe(false)
    expect(querDecretos('cabe absolvição sumária no art. 33?').abre).toBe(false)
    expect(querDecretos('').abre).toBe(false)
  })

  it('diz o que abriu a porta, para a regra ser auditável', () => {
    expect(querDecretos('decreto do paraná').sinal).toContain('decreto')
    expect(querDecretos('norma estadual sobre drogas').sinal).toContain('estadual')
  })
})

describe('decretos no contexto do modelo', () => {
  const dec = (id: string, score: number, extra: Record<string, unknown> = {}) =>
    ({
      bloco_id: id,
      decreto_id: id.split(':').slice(0, 3).join(':'),
      numero: '8812',
      ano: 2025,
      epigrafe: 'Decreto 8812 - 31 de Janeiro de 2025',
      sumula: 'Regulamenta a alteração do regime de trabalho dos professores.',
      publicado_em: '2025-01-31',
      conferido_em: '2026-08-21',
      versao: 'compilado',
      url: 'https://www.legislacao.pr.gov.br/x?codAto=351933',
      ordem: 1,
      rotulo: 'Art. 1º',
      texto: 'A alteração de regime de trabalho será efetivada conforme este Decreto.',
      score,
      via_sumula: true,
      ...extra,
    }) as never

  it('usa tag própria, nunca <dispositivo>', () => {
    // São hierarquias normativas diferentes. Sem a distinção na marcação, o
    // modelo escreveria "a norma determina que…" sobre regulamento
    // administrativo estadual no meio de uma resposta sobre crime.
    const bloco = montarDecretos([dec('decpr:2025:8812:1', 0.05)])
    expect(bloco).toContain('<decreto doc_id="decpr:2025:8812:1"')
    expect(bloco).not.toContain('<dispositivo')
  })

  it('declara a data de leitura e nega a vigência', () => {
    // O acervo não tem coluna de vigência, e o contexto não pode deixar o
    // modelo supor que tem — ver o cabeçalho da migration 0018.
    const bloco = montarDecretos([dec('decpr:2025:8812:1', 0.05)])
    expect(bloco).toContain('lido_em="2026-08-21"')
    expect(bloco).toMatch(/vigência destes atos NÃO/i)
    expect(bloco).toMatch(/não é fundamento de peça criminal/i)
  })

  it('leva a ementa do ato junto do dispositivo', () => {
    // Um `§ 2º` de decreto isolado não diz de que decreto é — mesmo argumento
    // de `texto_embed`, aplicado ao contexto.
    const bloco = montarDecretos([dec('decpr:2025:8812:3', 0.05, { rotulo: '§ 2º' })])
    expect(bloco).toContain('Regulamenta a alteração do regime de trabalho')
    expect(bloco).toContain('dispositivo: § 2º')
  })

  it('some inteiro quando não há decreto', () => {
    expect(montarDecretos([])).toBe('')
  })
})

describe('piso do acervo estadual', () => {
  const dec = (score: number, i: number) =>
    ({ bloco_id: `decpr:2025:88${i}:1`, score }) as never

  it('deixa passar sem ressalva o que teve concordância entre pernas', () => {
    // `1/61` é o teto de uma perna sozinha na melhor posição. Acima disso, ou a
    // súmula bateu (peso 2) ou duas pernas concordaram.
    const r = filtraDecretos([dec(0.0328, 1), dec(1 / 61, 2), dec(0.0154, 3)])
    expect(r.itens).toHaveLength(1)
    expect(r.fraco).toBe(false)
  })

  it('tem teto de quatro blocos quando não é fraco', () => {
    const r = filtraDecretos([0.05, 0.049, 0.048, 0.047, 0.046].map((s, i) => dec(s, i)))
    expect(r.itens).toHaveLength(4)
    expect(r.fraco).toBe(false)
  })

  it('não zera quando nada passa: marca como fraco e manda dois', () => {
    // Medido em 22/08/2026: com só a perna semântica viva — o que acontece em
    // toda pergunta em forma de pergunta, porque `websearch_to_tsquery` exige
    // todas as palavras —, o acerto e o erro têm EXATAMENTE o mesmo topo de
    // 0,016393. Cortar pelo piso jogaria fora o decreto certo junto com o
    // errado; deixar passar calado poria um decreto de bacias hidrográficas
    // como fonte. Manda-se o pouco, marcado, como faz `filtraContexto`.
    const r = filtraDecretos([dec(1 / 61, 1), dec(0.0161, 2), dec(0.0159, 3)])
    expect(r.fraco).toBe(true)
    expect(r.itens).toHaveLength(2)
  })

  it('a marca de fraqueza chega ao modelo em palavras', () => {
    const bloco = montarDecretos(
      [
        {
          bloco_id: 'decpr:2023:81:1',
          numero: '81',
          ano: 2023,
          sumula: 'Cria a Superintendência Geral das Bacias Hidrográficas e Pesca.',
          conferido_em: '2026-08-21',
          versao: 'compilado',
          rotulo: 'Art. 1º',
          texto: 'Fica criada a Superintendência.',
        } as never,
      ],
      true,
    )
    expect(bloco).toMatch(/proximidade semântica/i)
    expect(bloco).toMatch(/NÃO construa argumento sobre eles/i)
  })

  it('sem fraqueza, não diz que a busca falhou', () => {
    const bloco = montarDecretos([{ bloco_id: 'x', numero: '1', ano: 2025, sumula: 's', conferido_em: '2026-08-21', versao: 'compilado', rotulo: '', texto: 't' } as never])
    expect(bloco).not.toMatch(/proximidade semântica/i)
  })
})


describe('o fio carrega os três espaços de id do produto', () => {
  it('não descarta precedente do STJ nem bloco de decreto', () => {
    // Defeito silencioso e anterior ao acervo estadual: `ID_VALIDO` não aceitava
    // dois-pontos, e os ids do STJ (`stj:1234`) e dos decretos
    // (`decpr:2023:475:1`) eram jogados fora aqui, sem erro e sem rastro. O
    // efeito só aparecia uma troca depois — a pergunta de seguimento perdia o
    // tema do STJ ou o decreto que a resposta anterior tinha citado.
    const fio = saneiaFio([
      {
        pergunta: 'decreto do Paraná sobre o conselho de políticas sobre drogas',
        ids: ['lei_11343_2006_art8-e_caput', 'stj:1234', 'decpr:2023:475:1'],
      },
    ])
    expect(fio[0]?.ids).toEqual([
      'lei_11343_2006_art8-e_caput',
      'stj:1234',
      'decpr:2023:475:1',
    ])
  })

  it('continua recusando o que não tem forma de id', () => {
    const fio = saneiaFio([
      { pergunta: 'x', ids: ['../etc/passwd', 'SELECT 1', '', 'ab', 'ok_1'] },
    ])
    expect(fio[0]?.ids).toEqual(['ok_1'])
  })

  it('a herança separa os decretos dos dispositivos', () => {
    // É o que a rota faz para mandar cada id à sua tabela: bloco de decreto em
    // `decretos_pr_blocos`, o resto em `v_dispositivo`. Sem a separação o
    // decreto sumiria numa consulta ao corpus, que não o conhece.
    const fio = saneiaFio([
      { pergunta: 'p', ids: ['lei_11343_2006_art33_p4', 'decpr:2023:475:1', 'stj:9'] },
    ])
    const herdar = idsHerdados(fio, [])
    expect(herdar.filter((i) => i.startsWith('decpr:'))).toEqual(['decpr:2023:475:1'])
    expect(herdar.filter((i) => !i.startsWith('decpr:'))).toEqual([
      'lei_11343_2006_art33_p4',
      'stj:9',
    ])
  })

  it('o decreto herdado entra marcado, e a marca o separa do recuperado', () => {
    const bloco = montarDecretos(
      [
        { bloco_id: 'decpr:2023:475:1', numero: '475', ano: 2023, sumula: 's', conferido_em: '2026-08-21', versao: 'compilado', rotulo: 'Art. 1º', texto: 'a' } as never,
        { bloco_id: 'decpr:2025:8812:1', numero: '8812', ano: 2025, sumula: 's', conferido_em: '2026-08-21', versao: 'compilado', rotulo: 'Art. 1º', texto: 'b' } as never,
      ],
      false,
      new Set(['decpr:2023:475:1']),
    )
    const partes = bloco.split('<decreto ')
    expect(partes[1]).toContain('origem: citado numa pergunta anterior')
    expect(partes[2]).not.toContain('origem:')
  })
})
