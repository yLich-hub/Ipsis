// =============================================================================
// PecaMontada → .docx
//
// Só formatação: nenhuma decisão sobre conteúdo mora aqui. O texto legal já veio
// resolvido do banco por `montar.ts`, e a argumentação já veio da curadoria.
//
// Layout de peça forense brasileira: A4, margens de 3 cm à esquerda e 2 cm à
// direita, corpo em 12 pt com entrelinha 1,5 e recuo de primeira linha, e a
// citação legal em bloco recuado de 4 cm em 10 pt — que é como se cita
// transcrição em peça, e é o que faz o juiz distinguir num relance o que a
// defesa afirma do que a lei diz.
//
// Roda em Node, nunca no Edge: a rota que chama isto declara
// `export const runtime = 'nodejs'` (CLAUDE.md, "Deploy").
// =============================================================================

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

import type { PecaMontada, TeseMontada } from '@/lib/peca/resolver'

const CM = 567 // 1 cm em twips (1440 / 2.54)

const CORPO = { size: 24, font: 'Times New Roman' } // 12 pt
const MIUDO = { size: 20, font: 'Times New Roman' } // 10 pt

/**
 * A mais ANTIGA das conferências que a minuta transcreve.
 *
 * O rodapé afirma até quando o texto transcrito foi conferido, e a única data
 * que cobre todos os artigos citados é a menor delas. Imprimir a mais recente
 * afirmaria sobre um artigo uma conferência que só outro teve — que é a mesma
 * classe de erro que carimbar a data da fotografia sobre um texto novo.
 */
const conferenciaMaisAntiga = (peca: PecaMontada) =>
  peca.conferidos.map((c) => c.conferidoEm).sort()[0] ?? ''

const paragrafo = (texto: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 120 }, // 1,5 de entrelinha
    indent: { firstLine: CM * 1.25 },
    children: [new TextRun({ text: texto, ...CORPO })],
  })

/** Transcrição de dispositivo: recuo de 4 cm, corpo menor, sem recuo de 1ª linha. */
const transcricao = (citacao: string, texto: string, revogado: boolean) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 276, before: 120, after: 160 },
    indent: { left: CM * 4 },
    children: [
      new TextRun({ text: `${citacao}${revogado ? ' [REVOGADO]' : ''}: `, bold: true, ...MIUDO }),
      new TextRun({ text: `“${texto}”`, ...MIUDO }),
    ],
  })

const titulo = (texto: string, nivel: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({
    heading: nivel,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text: texto, bold: true, ...CORPO })],
  })

const centrado = (texto: string, negrito = false) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: texto, bold: negrito, ...CORPO })],
  })

function blocosDaTese(t: TeseMontada, n: number): Paragraph[] {
  const out: Paragraph[] = [titulo(`${n}. ${t.nome}`, HeadingLevel.HEADING_2)]

  for (const tr of t.trechos) {
    if (tr.tipo === 'citacao') {
      out.push(transcricao(tr.d.citacao, tr.d.texto, tr.d.revogado))
    } else {
      // O template é escrito em parágrafos separados por linha em branco.
      for (const p of tr.texto.split(/\n{2,}/)) {
        const limpo = p.replace(/\s*\n\s*/g, ' ').trim()
        if (limpo) out.push(paragrafo(limpo))
      }
    }
  }

  if (t.jurisprudencia.length) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 200 },
        indent: { left: CM * 1.25 },
        children: [
          new TextRun({ text: 'Entendimento consolidado: ', bold: true, ...MIUDO }),
          new TextRun({
            text: t.jurisprudencia
              .map((j) => [j.tribunal, j.classe, j.numero].filter(Boolean).join(' '))
              .join(' · '),
            ...MIUDO,
          }),
        ],
      }),
    )
  }

  return out
}

export async function pecaEmDocx(peca: PecaMontada): Promise<Buffer> {
  const corpo: Paragraph[] = [
    centrado('EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ª VARA CRIMINAL', true),
    new Paragraph({ spacing: { after: 480 }, children: [] }),

    // Autos e qualificação ficam como campos a preencher: os casos do banco são
    // anonimizados de propósito, e inventar nome e número de processo seria
    // exatamente o dado plausível e falso que este projeto existe para não
    // produzir.
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 480 },
      children: [new TextRun({ text: 'Autos nº ____________________', ...CORPO })],
    }),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 320 },
      indent: { firstLine: CM * 1.25 },
      children: [
        new TextRun({ text: '____________________', ...CORPO }),
        new TextRun({
          text:
            ', já qualificado(a) nos autos em epígrafe, por seu advogado que esta subscreve, ' +
            'vem, respeitosamente, à presença de Vossa Excelência, apresentar',
          ...CORPO,
        }),
      ],
    }),

    centrado('RESPOSTA À ACUSAÇÃO', true),
    centrado('(art. 396-A do Código de Processo Penal)'),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, before: 320, after: 320 },
      indent: { firstLine: CM * 1.25 },
      children: [
        new TextRun({ text: 'pelas razões de fato e de direito a seguir expostas.', ...CORPO }),
      ],
    }),

    titulo('I — DOS FATOS', HeadingLevel.HEADING_1),
    paragrafo(peca.caso.narrativa),
  ]

  if (peca.caso.imputacao.length) {
    corpo.push(
      paragrafo(
        peca.caso.imputacao.length === 1
          ? 'A denúncia imputa ao acusado a conduta descrita no dispositivo a seguir transcrito.'
          : 'A denúncia imputa ao acusado as condutas descritas nos dispositivos a seguir transcritos.',
      ),
    )
  }

  corpo.push(titulo('II — DAS TESES DEFENSIVAS', HeadingLevel.HEADING_1))

  if (!peca.teses.length) {
    corpo.push(
      paragrafo(
        'Nenhuma das teses curadas foi acionada pelos fatos deste caso. ' +
          'A minuta não apresenta tese que os fatos não sustentem.',
      ),
    )
  } else {
    peca.teses.forEach((t, i) => corpo.push(...blocosDaTese(t, i + 1)))
  }

  corpo.push(
    titulo('III — DOS PEDIDOS', HeadingLevel.HEADING_1),
    paragrafo('Ante o exposto, requer a defesa:'),
    paragrafo(
      'a) o recebimento e a apreciação da presente resposta, com o acolhimento das teses ' +
        'acima deduzidas;',
    ),
    paragrafo(
      'b) a produção das provas requeridas, com a intimação das testemunhas arroladas ao final;',
    ),
    paragrafo('c) a intimação de todos os atos processuais em nome do subscritor.'),
    new Paragraph({ spacing: { after: 320 }, children: [] }),
    paragrafo('Nesses termos, pede deferimento.'),
    new Paragraph({ spacing: { after: 480 }, children: [] }),
    centrado('____________________, ___ de ______________ de ______.'),
    new Paragraph({ spacing: { after: 480 }, children: [] }),
    centrado('____________________________________'),
    centrado('Advogado(a) — OAB/__ nº ______'),
  )

  const doc = new Document({
    creator: 'Toga',
    title: `Resposta à acusação — ${peca.caso.titulo}`,
    description: 'Minuta gerada a partir de teses curadas, com citações lidas do banco.',
    sections: [
      {
        properties: {
          page: {
            margin: { top: CM * 2.5, right: CM * 2, bottom: CM * 2.5, left: CM * 3 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  // A data de corte vai impressa na peça, não só na tela: quem
                  // abrir o arquivo daqui a seis meses precisa saber de quando é
                  // a redação transcrita. É a decisão nº 3 sobrevivendo ao
                  // download.
                  new TextRun({
                    text:
                      `Texto legal conforme redação vigente em ${peca.vigenciaAte} ` +
                      `(Vade Mecum Senado Federal, 1ª ed.). ${peca.citados.length} dispositivos transcritos do banco.` +
                      // Uma data só no rodapé passou a ser insuficiente quando o
                      // corpus ganhou artigos em redação mais nova que a
                      // fotografia. Omitir esta frase faria a peça carimbar
                      // fevereiro de 2025 sobre um texto de 2026 — o mesmo erro
                      // que a decisão nº 3 existe para impedir, agora dentro do
                      // arquivo protocolado.
                      (peca.conferidos.length
                        ? ` Destes, ${peca.conferidos.length} em redação posterior à data de corte, ` +
                          `conferida contra o texto compilado do Planalto em ${conferenciaMaisAntiga(peca)} ` +
                          `(${[...new Set(peca.conferidos.flatMap((c) => c.alteradoPor))].join(', ')}).`
                        : '') +
                      ' — ',
                    size: 16,
                    font: 'Times New Roman',
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Times New Roman' }),
                ],
              }),
            ],
          }),
        },
        children: corpo,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
