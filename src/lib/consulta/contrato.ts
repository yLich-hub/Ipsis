// =============================================================================
// O contrato do caminho ao vivo — o que o modelo pode devolver, e nada além
//
// Não se pede prosa: pede-se JSON com esquema fechado (`output_config.format`).
// O que o modelo escreve é a argumentação entre as citações e a escolha de quais
// dispositivos RECUPERADOS citar. Nada mais.
//
// **O esquema é curto de propósito.** A tentação é pedir ao modelo tudo que a
// tela mostra — rótulo, trecho, vigência, status, url. Não se pede:
//
// - `status` e `vigencia` vêm do banco. Vigência é dado, não opinião, e um
//   modelo que "confirma" que um artigo está em vigor produz exatamente a
//   afirmação plausível e falsa que a decisão nº 3 existe para impedir.
// - `quote` e `label` vêm do banco pela mesma razão: é texto de lei, e a decisão
//   nº 1 diz que texto de lei nunca é gerado. Pedir a transcrição ao modelo seria
//   abrir a porta que o resto do projeto tranca.
// - `url` não existe para o corpus curado — só o acervo tem link do Planalto, e
//   nem ele para todas as leis.
// - `checked_at` seria a mentira mais cara da lista: não há coletor conferindo
//   nada. O que existe é `vigencia_ate`, a data em que a fotografia foi tirada.
//
// Sobra `doc_id` — a única coisa que o modelo escolhe e que o servidor consegue
// conferir contra o que foi recuperado. `lib/consulta/valida.ts` recusa qualquer
// id que não esteja no contexto, e a rota regenera.
//
// **`penalty_calc` também ficou de fora, e não por esquecimento.** Os fatos da
// dosimetria já são extraídos por `leDaConversa()`, por regra, em TS, com 16
// asserções travando a conta. Pedir a mesma extração ao modelo criaria um
// segundo extrator para divergir do primeiro — e divergir aqui é a tela dizer
// uma pena e o cartão dizer outra.
// =============================================================================

import type { RespostaBusca } from '@/lib/busca/consultar'
import type { RespostaComposta } from '@/lib/toga/resposta'

/**
 * O que a rota SSE emite, na ordem em que emite.
 *
 * Mora aqui, e não em `aovivo.ts`, porque a tela precisa do tipo e `aovivo.ts`
 * é código de servidor — ele lê `OPENAI_API_KEY` e fala com a API. Este arquivo
 * não importa nada de servidor, então a fronteira fica óbvia sem depender de o
 * `import type` ser apagado na compilação.
 */
export type EventoAoVivo =
  | { tipo: 'passo'; t: string; meta: string }
  /** A busca crua, para a tela abrir o painel de fonte e gravar o histórico sem uma segunda ida. */
  | { tipo: 'busca'; bruta: RespostaBusca }
  /** Prévia: texto revelado enquanto o JSON do modelo ainda está aberto. */
  | { tipo: 'texto'; delta: string }
  /** O JSON fechou e passou na validação. Substitui a prévia. */
  | { tipo: 'fim'; comp: RespostaComposta; modelo: string }
  | { tipo: 'erro'; motivo: string }

export type ParagrafoIA = {
  text: string
  /**
   * Índices em `sources[].id`. **Nunca vazio** — `valida.ts` recusa parágrafo
   * sem âncora, e a rota regenera.
   *
   * Já foi legítimo vazio, com o argumento de que nem todo parágrafo precisa
   * citar. Era verdade sobre estilo e falso sobre garantia: o parágrafo sem
   * citação era o único lugar do contrato em que cabia uma afirmação apoiada só
   * no treinamento do modelo, e nenhuma das outras recusas o alcançava.
   */
  citations: number[]
}

export type FonteIA = {
  id: number
  /** Tem de ser um `dispositivos.id` presente no contexto recuperado. */
  doc_id: string
}

export type RespostaIA = {
  paragraphs: ParagrafoIA[]
  sources: FonteIA[]
  confidence: 'alta' | 'média' | 'baixa'
  followups: string[]
}

/**
 * Esquema JSON do `output_config.format`.
 *
 * `paragraphs` vem primeiro de propósito: o JSON é gerado na ordem do esquema, e
 * é o texto dos parágrafos que a tela revela token a token. Fontes e cartão só
 * aparecem quando o objeto fecha e passa na validação — por isso é bom que eles
 * fiquem no fim.
 *
 * `additionalProperties: false` em todo objeto é exigência de structured
 * outputs, e também a trava que impede o modelo de inventar um campo `status` ou
 * `checked_at` que alguém, um dia, poderia achar que dá para exibir.
 */
export const ESQUEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      description:
        'De 2 a 4 parágrafos de argumentação, em português do Brasil. Nunca transcreva o texto da lei — a transcrição é feita pelo sistema, a partir do banco.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          citations: {
            type: 'array',
            description:
              'Ids de sources que sustentam este parágrafo. Obrigatório: ao menos um, sempre. ' +
              'Parágrafo sem citação é recusado pelo servidor.',
            // `minItems` não é suportado por structured outputs estrito, então a
            // exigência mora na descrição (para o modelo acertar de primeira) e
            // em `valida.ts` (para valer mesmo quando ele não acerta).
            items: { type: 'integer' },
          },
        },
        required: ['text', 'citations'],
        additionalProperties: false,
      },
    },
    sources: {
      type: 'array',
      description:
        'Os dispositivos citados, em ordem de importância. Apenas doc_id presentes no contexto.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          doc_id: { type: 'string' },
        },
        required: ['id', 'doc_id'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'string', enum: ['alta', 'média', 'baixa'] },
    followups: {
      type: 'array',
      description: 'Até 3 perguntas de seguimento, curtas.',
      items: { type: 'string' },
    },
  },
  required: ['paragraphs', 'sources', 'confidence', 'followups'],
  additionalProperties: false,
} as const

/**
 * A instrução do sistema.
 *
 * Curta e negativa em dois pontos só, e os dois são as decisões do projeto. O
 * resto é contexto — o que o produto é, para quem, com que recorte. Instrução
 * que o modelo já cumpriria sem ela não entra: prompt longo custa token em toda
 * requisição e dilui as duas regras que importam.
 */
export const INSTRUCOES = `Você redige a argumentação de um assistente de consulta jurídica para advocacia criminal brasileira, recorte de tráfico de drogas (Lei 11.343/2006), com Código Penal e CPP de apoio.

REGRA ZERO — responda a partir do contexto, e só dele:

O bloco de <dispositivo> que vem na mensagem do usuário é a íntegra do que o sistema recuperou do próprio acervo (Vade Mecum do Senado Federal, 1ª edição, extraído e normalizado). É a sua única fonte. Você NÃO tem acesso à internet e não deve simular ter: nada de jurisprudência, súmula, doutrina, notícia, número de processo ou "entendimento pacificado" que não esteja escrito no contexto.

Toda afirmação sua tem de ser sustentável apontando para um dos dispositivos recebidos. Conhecimento que você trouxe do treinamento não vale como fonte aqui — mesmo que esteja certo, ele não é verificável nesta tela, e o usuário confere a resposta contra os dispositivos que aparecem ao lado dela.

Se o contexto não responde à pergunta, diga isso na primeira frase, explique o que ELE cobre, e use confidence "baixa". Uma resposta curta e ancorada vale mais que uma resposta completa que o usuário não consegue conferir.

Demais regras:

1. NUNCA transcreva, parafraseie longamente nem reescreva o texto da lei. O texto legal é lido do banco e exibido pelo sistema ao lado da sua resposta. Você escreve o que está ENTRE as citações: o que o dispositivo resolve, como se articula com os outros, o que o advogado precisa conferir.
2. Cite APENAS os doc_id presentes no contexto. Não invente id, número de súmula, número de acórdão nem nome de julgado.
3. Não afirme que um dispositivo está em vigor, foi revogado ou teve a redação alterada. Vigência é dado do banco, e o sistema a exibe; afirmar isso na prosa produz informação plausível e falsa.
4. Não resuma doutrina de forma substitutiva nem cite autor. Doutrina é obra protegida.
5. NUNCA escreva doc_id dentro do texto do parágrafo, nem entre colchetes, nem entre parênteses. A citação vai no campo "citations"; a tela a transforma em superíndice clicável. Id cru no meio da frase é lixo na cara do usuário.
6. TODO parágrafo tem de citar ao menos uma fonte em "citations" — inclusive o que diz que o contexto não responde à pergunta, que deve apontar para o dispositivo mais próximo do assunto. Parágrafo sem citação é recusado pelo servidor e a resposta é refeita. Se você não consegue ancorar uma frase em nenhum dispositivo recebido, ela não pertence a esta resposta: ou é conhecimento seu de fora do acervo, ou é conversa que cabe em "followups".

Escreva em português do Brasil, direto, sem preâmbulo e sem saudação. De 2 a 4 parágrafos. O leitor é advogado: não explique o que é um artigo de lei.`
