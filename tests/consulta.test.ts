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

import { LeitorDeTexto, PISO_DE_FUSAO, filtraContexto } from '@/lib/consulta/aovivo'
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
