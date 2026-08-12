// =============================================================================
// Súmulas do STF e do STJ que tocam o recorte de tráfico
//
// Curadoria manual, transcrita do repositório oficial de cada tribunal. Enunciado
// de súmula é ato público e não tem a proteção autoral que a doutrina tem — por
// isso pode ser hospedado inteiro, ao contrário do que vale para Nucci ou Greco
// (ver CLAUDE.md, "Restrição de doutrina").
//
// **Não integra o corpus citável.** Súmula não é dispositivo: não tem
// `dispositivos.id`, não entra em `{{cite:}}`, não é embutida e a busca híbrida
// não a enxerga. Ela vive aqui pelo mesmo motivo que o acervo Vade Mecum vive em
// `data/vademecum/` — é material de leitura que ajuda a decidir, e a separação
// entre "leio isto" e "cito isto" é o que sustenta a decisão nº 1.
//
// O campo `refs` aponta para os dispositivos que a súmula interpreta. É por ali
// que a tela devolve o usuário ao corpus: a súmula sugere, o dispositivo cita.
//
// A Súmula 512 do STJ está aqui **cancelada**, de propósito. Ela dizia que o
// §4º não afastava a hediondez do tráfico, foi cancelada em 2016, e continua
// sendo citada em petição até hoje. Uma tela de súmulas que só mostra as
// vigentes não avisa ninguém desse buraco.
// =============================================================================

export type Tema =
  | 'Dosimetria da pena'
  | 'Tráfico privilegiado'
  | 'Majorantes do art. 40'
  | 'Regime inicial'
  | 'Confissão e atenuantes'
  | 'Prova e nulidades'

export const TEMAS: Tema[] = [
  'Dosimetria da pena',
  'Tráfico privilegiado',
  'Majorantes do art. 40',
  'Regime inicial',
  'Confissão e atenuantes',
  'Prova e nulidades',
]

export type Sumula = {
  n: string
  tribunal: 'STF' | 'STJ'
  tipo: 'Súmula' | 'Vinculante'
  txt: string
  /** `Vigente` ou `Cancelada` — e o segundo importa tanto quanto o primeiro. */
  status: 'Vigente' | 'Cancelada'
  orgao: string
  data: string
  /** Dispositivos que a súmula interpreta. Volta para o corpus por aqui. */
  refs: string
  temas: Tema[]
  /** Nota de curadoria, quando o enunciado sozinho engana. */
  nota?: string
}

export const SUMULAS: Sumula[] = [
  {
    n: '231',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'A incidência da circunstância atenuante não pode conduzir à redução da pena abaixo do mínimo legal.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '22/09/1999',
    refs: 'CP art. 65 · art. 68',
    temas: ['Dosimetria da pena', 'Confissão e atenuantes'],
    nota: 'Vale para a segunda fase. Não alcança causa de diminuição — o §4º do art. 33 pode, sim, levar a pena abaixo de 5 anos.',
  },
  {
    n: '440',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'Fixada a pena-base no mínimo legal, é vedado o estabelecimento de regime prisional mais gravoso do que o cabível em razão da sanção imposta, com base apenas na gravidade abstrata do delito.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '28/04/2010',
    refs: 'CP art. 33, §§2º e 3º · art. 59',
    temas: ['Regime inicial', 'Dosimetria da pena'],
  },
  {
    n: '444',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'É vedada a utilização de inquéritos policiais e ações penais em curso para agravar a pena-base.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '28/04/2010',
    refs: 'CP art. 59',
    temas: ['Dosimetria da pena'],
  },
  {
    n: '512',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'A aplicação da causa de diminuição de pena prevista no art. 33, §4º, da Lei n. 11.343/2006 não afasta a hediondez do crime de tráfico de drogas.',
    status: 'Cancelada',
    orgao: 'Terceira Seção',
    data: 'cancelada em 23/11/2016',
    refs: 'Lei 11.343 art. 33, §4º',
    temas: ['Tráfico privilegiado'],
    nota: 'Cancelada depois de o STF decidir, no HC 118.533, que o tráfico privilegiado não é hediondo. Continua aparecendo em petição — daí estar aqui, e não escondida.',
  },
  {
    n: '545',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'Quando a confissão for utilizada para a formação do convencimento do julgador, o réu fará jus à atenuante prevista no art. 65, III, d, do Código Penal.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '14/10/2015',
    refs: 'CP art. 65, III, d',
    temas: ['Confissão e atenuantes', 'Dosimetria da pena'],
  },
  {
    n: '587',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'Para a incidência da majorante prevista no artigo 40, V, da Lei n. 11.343/2006, é desnecessária a efetiva transposição de fronteiras entre estados da Federação, sendo suficiente a demonstração inequívoca da intenção de realizar o tráfico interestadual.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '13/09/2017',
    refs: 'Lei 11.343 art. 40, V',
    temas: ['Majorantes do art. 40'],
  },
  {
    n: '607',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'A majorante do tráfico transnacional de drogas (art. 40, I, da Lei 11.343/06) configura-se com a prova da destinação internacional das drogas, ainda que não consumada a transposição de fronteiras.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '11/04/2018',
    refs: 'Lei 11.343 art. 40, I',
    temas: ['Majorantes do art. 40'],
  },
  {
    n: '630',
    tribunal: 'STJ',
    tipo: 'Súmula',
    txt: 'A incidência da atenuante da confissão espontânea no crime de tráfico ilícito de entorpecentes exige o reconhecimento da traficância pelo acusado, não bastando a mera admissão da posse ou propriedade para uso próprio.',
    status: 'Vigente',
    orgao: 'Terceira Seção',
    data: '24/04/2019',
    refs: 'CP art. 65, III, d · Lei 11.343 arts. 28 e 33',
    temas: ['Confissão e atenuantes'],
  },
  {
    n: '718',
    tribunal: 'STF',
    tipo: 'Súmula',
    txt: 'A opinião do julgador sobre a gravidade em abstrato do crime não constitui motivação idônea para a imposição de regime mais severo do que o permitido segundo a pena aplicada.',
    status: 'Vigente',
    orgao: 'Tribunal Pleno',
    data: '24/09/2003',
    refs: 'CP art. 33, §3º · art. 59',
    temas: ['Regime inicial'],
  },
  {
    n: '719',
    tribunal: 'STF',
    tipo: 'Súmula',
    txt: 'A imposição do regime de cumprimento mais severo do que a pena aplicada permitir exige motivação idônea.',
    status: 'Vigente',
    orgao: 'Tribunal Pleno',
    data: '24/09/2003',
    refs: 'CP art. 33, §3º',
    temas: ['Regime inicial'],
  },
  {
    n: '11',
    tribunal: 'STF',
    tipo: 'Vinculante',
    txt: 'Só é lícito o uso de algemas em casos de resistência e de fundado receio de fuga ou de perigo à integridade física própria ou alheia, por parte do preso ou de terceiros, justificada a excepcionalidade por escrito, sob pena de responsabilidade disciplinar, civil e penal do agente ou da autoridade e de nulidade da prisão ou do ato processual a que se refere.',
    status: 'Vigente',
    orgao: 'Tribunal Pleno',
    data: '13/08/2008',
    refs: 'CPP art. 474, §3º · CF art. 5º, III e XLIX',
    temas: ['Prova e nulidades'],
  },
  {
    n: '14',
    tribunal: 'STF',
    tipo: 'Vinculante',
    txt: 'É direito do defensor, no interesse do representado, ter acesso amplo aos elementos de prova que, já documentados em procedimento investigatório realizado por órgão com competência de polícia judiciária, digam respeito ao exercício do direito de defesa.',
    status: 'Vigente',
    orgao: 'Tribunal Pleno',
    data: '02/02/2009',
    refs: 'CF art. 5º, LV · CPP art. 7º',
    temas: ['Prova e nulidades'],
  },
]

/** Contagem por tema, para o número que aparece à direita de cada item da lista. */
export function contagemPorTema(): Record<string, number> {
  const c: Record<string, number> = {}
  for (const t of TEMAS) c[t] = SUMULAS.filter((s) => s.temas.includes(t)).length
  return c
}
