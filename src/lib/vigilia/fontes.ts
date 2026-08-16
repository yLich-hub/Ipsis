// =============================================================================
// Vigília do corpus — as cinco fontes, e quem coleta cada uma
//
// O desenho do TOGA v2 põe cinco coletores em Python na tela: Planalto, DOU,
// Câmara, Senado e DataJud. As cinco existem, e três delas de fato rodam em
// Python — `coletores/`, no repositório. O que mudou em relação ao desenho não
// é a quantidade: é o que cada uma promete.
//
// **A coleta é de dois andares, e isso é decisão, não acidente:**
//
//   Vercel Cron (TypeScript)   Câmara e Senado, diariamente. São duas APIs
//                              REST/JSON sem chave; cabem numa função
//                              serverless e mantêm a tela viva sem depender de
//                              nada fora da Vercel.
//
//   GitHub Actions (Python)    As cinco, diariamente. O scraping do Planalto
//                              (900 KB de HTML por lei), a extração de página
//                              do DOU e a consulta Elasticsearch do DataJud não
//                              cabem — nem devem caber — no runtime que serve a
//                              tela. Ver `coletores/README.md`.
//
// Os dois andares compartilham `data/curadoria/vigilia.yaml`, que é a fonte
// única dos padrões de reconhecimento, e `tests/vigilia.test.ts` falha se
// `alvos.ts` divergir de qualquer linha dele. Duas implementações do mesmo
// filtro divergem na primeira correção; a saída não foi eliminar uma delas, foi
// torná-las conferíveis.
//
// **O que cada fonte NÃO faz.** Nenhuma escreve texto legal em lugar nenhum. O
// Planalto e o DOU servem texto de lei, e é tentador — o corpus vem do parser
// do Vade Mecum, com conferência humana no meio, e a decisão nº 1 diz que ele
// vem de uma fonte só. Raspagem avisa; não substitui.
// =============================================================================

import { MATIZ } from '@/lib/toga/tokens'
import type { FonteId } from '@/lib/vigilia/tipos'

export type Fonte = {
  id: FonteId
  nome: string
  /** O que ela é, em uma linha — sem prometer mais do que ela entrega. */
  descricao: string
  /** Endereço da API ou da página, exibido na tela: dá para conferir a origem. */
  origem: string
  /** Onde ela roda. A tela mostra, porque explica por que um card atualiza e outro não. */
  motor: 'vercel' | 'python'
  /** Cor do quadradinho do card. Ver `lib/toga/tokens.ts`. */
  matiz: string
}

export const FONTES: Fonte[] = [
  {
    id: 'planalto',
    nome: 'Planalto',
    // É a única fonte que enxerga alteração JÁ EM VIGOR. Câmara e Senado contam
    // o que foi proposto; só o texto compilado diz o que valeu.
    descricao: 'Texto compilado das três leis. Único que vê alteração já em vigor.',
    origem: 'planalto.gov.br/ccivil_03',
    motor: 'python',
    matiz: MATIZ.areia,
  },
  {
    id: 'camara',
    nome: 'Câmara',
    descricao: 'Proposições que declaram alterar o corpus, com a situação da tramitação.',
    origem: 'dadosabertos.camara.leg.br/api/v2',
    motor: 'vercel',
    matiz: MATIZ.gelo,
  },
  {
    id: 'senado',
    nome: 'Senado',
    descricao: 'Processos legislativos e a norma gerada, com data de publicação no DOU.',
    origem: 'legis.senado.leg.br/dadosabertos/processo',
    motor: 'vercel',
    matiz: MATIZ.sabia,
  },
  {
    id: 'dou',
    nome: 'DOU',
    descricao: 'Confirma a publicação da norma já identificada e guarda o endereço oficial.',
    origem: 'in.gov.br',
    motor: 'python',
    matiz: MATIZ.rosa,
  },
  {
    id: 'stj',
    nome: 'STJ',
    // Única fonte de jurisprudência do sistema, e a razão de ela ser esta:
    // precedente qualificado tem situação controlada. Ementa não tem.
    descricao: 'Precedentes qualificados, com a situação de cada tema. Avisa quando um deixa de valer.',
    origem: 'dadosabertos.web.stj.jus.br',
    motor: 'python',
    matiz: MATIZ.musgo,
  },
  {
    id: 'datajud',
    nome: 'DataJud',
    // A descrição diz o que ele NÃO traz porque o card do desenho promete
    // "metadados e ementas", e a metade das ementas não existe na API.
    descricao: 'Contagem de processos por assunto. Sem ementa — o CNJ não a publica.',
    origem: 'api-publica.datajud.cnj.jus.br',
    motor: 'python',
    matiz: MATIZ.lilas,
  },
]

/**
 * O que ficou de fora, e por quê. A tela mostra — a alternativa era sumir com a
 * pergunta "e o LexML?" em vez de respondê-la.
 */
export const RECUSADAS = [
  {
    nome: 'LexML',
    motivo:
      'O SRU/CQL responde atrás de verificação de segurança com JavaScript. Fonte que só funciona no navegador não serve para coleta.',
  },
  {
    nome: 'INLABS (edição completa do DOU)',
    motivo:
      'Exige cadastro e entrega ZIP diário. O Senado já informa data e veículo de publicação de graça, e é o que o coletor de DOU usa.',
  },
  {
    nome: 'Ementa de acórdão',
    motivo:
      'Nem STF nem STJ têm API pública de jurisprudência, e o DataJud não devolve ementa. Quem entrega em API é serviço pago.',
  },
] as const

export const fonte = (id: FonteId): Fonte =>
  FONTES.find((f) => f.id === id) ?? {
    id,
    nome: id,
    descricao: '',
    origem: '',
    motor: 'python',
    matiz: MATIZ.ardosia,
  }
