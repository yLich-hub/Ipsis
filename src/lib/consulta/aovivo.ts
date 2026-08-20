// =============================================================================
// A resposta do chat: structured output validado no servidor
//
// Este é o único lugar do projeto onde um modelo de linguagem é chamado em
// runtime, e agora ele é o **caminho padrão da Consulta** — o usuário pergunta
// sobre o § 4º e recebe uma resposta sobre o § 4º. Antes a prosa era composta
// por `lib/toga/resposta.ts` a partir de fatos sobre a busca: honesto, mas
// respondia sempre a mesma coisa, qualquer que fosse a pergunta. Explicar o
// próprio pipeline é bom como rodapé; não serve como resposta.
//
// **A composta não foi apagada — virou a rede.** Sem chave, sem rede, teto
// estourado, modelo recusando ou validação recusando duas vezes: em todos os
// casos `comporResposta()` assume e o chat continua respondendo. É a razão de
// ela não ter sido removida junto: um fallback que nunca falha e não custa nada
// vale mais do que um segundo modelo de reserva.
//
// O que o modelo faz: escreve a argumentação ENTRE as citações e escolhe quais
// dispositivos recuperados citar. O que ele não faz: texto de lei, rótulo,
// vigência, cobertura, número de súmula, cálculo de pena. Ver `contrato.ts` para
// a lista e o porquê de cada exclusão.
//
// **Provedor: OpenAI, por `fetch` cru.** É a chave que o projeto já tem, e é o
// mesmo padrão de `embutir()` em `lib/busca/consultar.ts` — que usa `fetch` em
// vez do SDK justamente para não carregar dependência no runtime serverless. O
// modelo sai de `OPENAI_MODEL`, porque trocar de modelo não deveria pedir deploy.
// =============================================================================

import type { Achado } from '@/lib/busca/consultar'
import type { Citavel } from '@/lib/vigilia/precedentes'
import { ESQUEMA, INSTRUCOES, type EventoAoVivo, type RespostaIA } from '@/lib/consulta/contrato'
import { enriquece } from '@/lib/consulta/enriquece'
import { montarFio, type Troca } from '@/lib/consulta/fio'
import { recado, valida, type Recuperado } from '@/lib/consulta/valida'
import type { Passo } from '@/lib/toga/resposta'

/**
 * O modelo. Configurável porque a família muda de nome mais rápido que este
 * arquivo — trocar de modelo não deveria pedir deploy de código.
 */
const MODELO = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini'

/** Teto por resposta. Generoso: o limite cobre raciocínio + texto juntos. */
const MAX_TOKENS = 4_000


// --- leitor incremental ------------------------------------------------------

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/',
}

/**
 * Extrai, de um JSON que ainda está chegando, o conteúdo dos campos `"text"`.
 *
 * É o que permite a promessa do desenho — texto revelado token a token, fontes
 * só quando o objeto fecha — sem abrir mão do structured output. O modelo emite
 * JSON; a tela não pode mostrar JSON; então o servidor lê o JSON parcial e
 * manda só o texto.
 *
 * **A prévia nunca é a resposta.** Ela é descartada quando o `fim` chega com o
 * objeto validado — é o padrão acumula-e-reconcilia. Um erro aqui atrasa ou
 * suja a animação; não pode contaminar o que vai para o histórico, porque o que
 * vai para o histórico é o objeto validado.
 *
 * Só o campo `text` do esquema se chama `text`, então procurar a chave no
 * documento inteiro é seguro e dispensa rastrear profundidade de array.
 */
export class LeitorDeTexto {
  private acc = ''
  private i = 0
  private dentro = false
  private escapando = false

  empurra(pedaco: string): string {
    this.acc += pedaco
    let saida = ''

    while (this.i < this.acc.length) {
      if (this.dentro) {
        const c = this.acc[this.i]!

        if (this.escapando) {
          if (c === 'u') {
            // `\uXXXX` pode estar partido entre dois pedaços: espera os 4 dígitos.
            if (this.i + 5 > this.acc.length) break
            saida += String.fromCharCode(parseInt(this.acc.slice(this.i + 1, this.i + 5), 16))
            this.i += 5
          } else {
            saida += ESCAPES[c] ?? c
            this.i += 1
          }
          this.escapando = false
          continue
        }

        if (c === '\\') {
          this.escapando = true
          this.i += 1
          continue
        }
        if (c === '"') {
          this.dentro = false
          this.i += 1
          // Separador entre parágrafos. Some junto com a prévia no `fim`.
          saida += '\n\n'
          continue
        }
        saida += c
        this.i += 1
        continue
      }

      const marca = this.acc.indexOf('"text"', this.i)
      if (marca < 0) {
        // Não achou: avança, mas guarda a cauda — a chave pode estar partida
        // entre este pedaço e o próximo.
        this.i = Math.max(this.i, this.acc.length - '"text"'.length)
        break
      }

      let j = marca + '"text"'.length
      while (j < this.acc.length && /\s/.test(this.acc[j]!)) j++
      if (j >= this.acc.length) {
        this.i = marca
        break
      }
      if (this.acc[j] !== ':') {
        this.i = marca + '"text"'.length
        continue
      }
      j++
      while (j < this.acc.length && /\s/.test(this.acc[j]!)) j++
      if (j >= this.acc.length) {
        this.i = marca
        break
      }
      if (this.acc[j] !== '"') {
        this.i = marca + '"text"'.length
        continue
      }

      this.i = j + 1
      this.dentro = true
    }

    return saida
  }
}

// --- contexto ----------------------------------------------------------------

/**
 * O contexto recuperado, como o modelo o vê.
 *
 * Texto integral do dispositivo, com o id de citação ao lado. É este bloco que
 * define o universo do que pode ser citado — `valida.ts` recusa qualquer
 * `doc_id` que não esteja aqui.
 *
 * `herdados` são os que vieram do fio da conversa, não da busca desta pergunta
 * (ver `lib/consulta/fio.ts`). Entram com `origem` declarada, e a distinção não
 * é decorativa: o modelo precisa saber que aquele dispositivo é o assunto que
 * se arrastou da troca anterior, e não algo que o acervo devolveu para o que se
 * acabou de perguntar. Sem a marca, uma pergunta que mudou de assunto receberia
 * o dispositivo antigo com o mesmo peso do recém-recuperado.
 */
export function montarContexto(achados: Achado[], herdados = new Set<string>()): string {
  return achados
    .map((a) =>
      [
        `<dispositivo doc_id="${a.dispositivo_id}">`,
        `citação: ${a.citacao.replace(/\s+/g, ' ').trim()}`,
        a.artigo_rubrica ? `rubrica: ${a.artigo_rubrica}` : null,
        a.rubrica_termo ? `tema: ${a.rubrica_termo}${a.papel ? ` (${a.papel})` : ''}` : null,
        herdados.has(a.dispositivo_id)
          ? 'origem: citado numa pergunta anterior desta conversa, não recuperado por esta'
          : null,
        `texto: ${a.texto}`,
        '</dispositivo>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
}

/**
 * Os precedentes, como o modelo os vê.
 *
 * Tag própria — `<precedente>`, não `<dispositivo>` — e é a parte que não se
 * negocia. São duas autoridades diferentes: o dispositivo diz o que a lei
 * escreve, o precedente diz como o STJ a lê. Sem a distinção na marcação, o
 * modelo escreveria sobre a tese com o mesmo peso do texto legal, e a resposta
 * passaria a afirmar como lei algo que é interpretação.
 *
 * A situação vai no atributo e hoje é sempre "Trânsito em Julgado" — nada mais
 * entra no contexto, ver `CITAVEL` em `lib/vigilia/precedentes.ts`. Ela aparece
 * assim mesmo para o modelo poder dizê-la, e para o dia em que a regra afrouxar
 * não haver um lugar em que a situação simplesmente não existia.
 */
export function montarPrecedentes(ps: Citavel[]): string {
  if (ps.length === 0) return ''

  const blocos = ps
    .map((p) =>
      [
        `<precedente doc_id="${p.docId}" situacao="${p.situacao}">`,
        `identificação: ${p.rotulo} do STJ`,
        `tese firmada: ${p.tese}`,
        '</precedente>',
      ].join('\n'),
    )
    .join('\n\n')

  return `\n\nPrecedentes qualificados do STJ que tocam os mesmos artigos (jurisprudência, NÃO texto de lei):\n\n${blocos}`
}

const recuperadosDe = (achados: Achado[]): Recuperado[] =>
  achados.map((a) => ({ docId: a.dispositivo_id, texto: a.texto }))

// --- piso de fusão -----------------------------------------------------------

/**
 * Os mesmos parâmetros de `busca_hibrida` (migration 0003). Repetidos aqui
 * porque o piso é derivado deles, e um número solto seria chute com cara de
 * cálculo. Se a RPC mudar `p_k` ou os pesos, isto tem de mudar junto.
 */
const K_RRF = 60
const PESO_MENOR = 1.0

/**
 * Score máximo que UMA perna sozinha alcança: `peso / (k + 1)`, com a perna na
 * melhor posição possível. Hoje, `1 / 61 = 0,016393`.
 *
 * Acima disso, ou duas pernas concordaram sobre o mesmo dispositivo, ou a
 * rubrica entrou (peso 3×). Os dois são sinal de relevância; abaixo, o
 * dispositivo foi visto por uma perna só e nem sempre no topo dela.
 */
export const PISO_DE_FUSAO = PESO_MENOR / (K_RRF + 1)

/**
 * Nunca se manda menos que isto ao modelo, mesmo quando nada passa do piso.
 *
 * Zerar o contexto faria `gerarAoVivo` recusar e a Consulta cair para a
 * resposta composta — e a resposta gerada para uma pergunta fora do corpus é
 * BOA: ela diz que o acervo não cobre o assunto e nomeia o que ele cobre.
 * Perder isso para ganhar silêncio seria trocar uma resposta útil por uma
 * explicação do pipeline.
 */
const MINIMO = 3

export type Contexto = { itens: Achado[]; fraco: boolean }

/**
 * Corta o rabo da recuperação antes de o modelo ver.
 *
 * **O problema que isto resolve, medido:** numa pergunta sobre porte de arma —
 * assunto que o corpus não tem — a busca devolvia oito dispositivos, entre eles
 * o art. 146 do CP (constrangimento *ilegal*), recuperado por coincidência
 * léxica com a palavra "ilegal". O modelo então construía um parágrafo em cima
 * dele. A busca errou e a prosa deu verniz ao erro.
 *
 * **Por que um piso absoluto e não relativo.** Remedido em 20/08/2026, depois de
 * `0017_peso_da_rubrica.sql`, sobre dez consultas:
 *
 *   consulta com rubrica  topo 0,060–0,064   razão último/topo 0,24–0,26   3–4/8 acima
 *   duas pernas de acordo topo 0,030         razão 0,84                    8/8 acima
 *   fora do corpus        topo 0,0164        razão 0,90                    0/8 acima
 *
 * As quatro consultas de fora deram o MESMO topo, exatamente `1/61` — a
 * assinatura de uma perna sozinha sem ninguém concordando. A razão entre o
 * último e o primeiro anda na direção contrária da qualidade: 0,90 fora do
 * corpus e 0,24 dentro. Um piso relativo cortaria justamente as consultas boas
 * e deixaria as ruins passar inteiras.
 *
 * **Os números de antes eram 0,021–0,028 no topo, e eram o defeito.** A perna de
 * rubrica valia 3/259 em vez de 3/61 — ver `0017_peso_da_rubrica.sql`. Com ela
 * consertada a separação triplicou, e a consulta mais central do projeto
 * ("tráfico privilegiado") deixou de ser marcada `fraco`.
 *
 * **`direta` desliga o piso, e essa é a parte que quase quebrou tudo.**
 * `resolveDireto` responde "art. 33 da Lei de Drogas" lendo o artigo pelo id,
 * sem passar pela fusão — e grava `score: 0` em todos os itens. Aplicar o piso
 * ali zeraria a consulta mais literal e mais correta do produto. Só foi
 * percebido porque a medição incluiu um endereço explícito.
 *
 * A tela continua mostrando tudo: o painel de fonte é alimentado pelo evento
 * `busca`, com a resposta crua. O que encolhe é o que o modelo pode citar.
 */
export function filtraContexto(achados: Achado[], direta = false): Contexto {
  if (direta || achados.length <= MINIMO) return { itens: achados, fraco: false }

  const acima = achados.filter((a) => a.score > PISO_DE_FUSAO)
  if (acima.length >= MINIMO) return { itens: acima, fraco: false }

  // Nada (ou quase nada) passou: a recuperação é fraca e o modelo precisa
  // saber disso. Manda-se o mínimo, marcado — ver o aviso em `gerarAoVivo`.
  return { itens: achados.slice(0, MINIMO), fraco: true }
}

// --- geração -----------------------------------------------------------------

export const temChave = () => !!process.env.OPENAI_API_KEY

type Mensagem = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Uma passada pelo modelo, em streaming.
 *
 * Devolve o JSON cru e vai emitindo o texto já legível pelo callback — quem
 * chama decide se mostra (só a primeira tentativa mostra). `refusal` é o campo
 * que a API preenche quando o modelo se recusa sob structured output: nesse caso
 * não há JSON para validar, e a resposta composta assume.
 */
async function umaPassada(
  mensagens: Mensagem[],
  aoTexto: ((delta: string) => void) | null,
): Promise<{ cru: string; recusa: string | null }> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELO,
      max_completion_tokens: MAX_TOKENS,
      // Latência é o que o usuário sente num chat, e a tarefa não é difícil: o
      // contexto já está recuperado e conferido, e o que se pede é redação.
      reasoning_effort: 'low',
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'resposta_consulta', strict: true, schema: ESQUEMA },
      },
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(90_000),
    cache: 'no-store',
  })

  if (!r.ok || !r.body) {
    const detalhe = await r.text().catch(() => '')
    throw new Error(`a API respondeu ${r.status}${detalhe ? ` — ${detalhe.slice(0, 200)}` : ''}`)
  }

  const leitorJson = new LeitorDeTexto()
  const dec = new TextDecoder()
  const fluxo = r.body.getReader()
  let resto = ''
  let cru = ''
  let recusa: string | null = null

  for (;;) {
    const { value, done } = await fluxo.read()
    if (done) break
    resto += dec.decode(value, { stream: true })

    const partes = resto.split('\n\n')
    resto = partes.pop() ?? ''

    for (const parte of partes) {
      const linha = parte.split('\n').find((l) => l.startsWith('data: '))
      if (!linha) continue
      const carga = linha.slice(6).trim()
      if (carga === '[DONE]') continue

      let evento: {
        choices?: { delta?: { content?: string | null; refusal?: string | null } }[]
      }
      try {
        evento = JSON.parse(carga)
      } catch {
        continue
      }

      const delta = evento.choices?.[0]?.delta
      if (delta?.refusal) recusa = (recusa ?? '') + delta.refusal
      if (typeof delta?.content !== 'string' || delta.content === '') continue

      cru += delta.content
      if (aoTexto) {
        const visivel = leitorJson.empurra(delta.content)
        if (visivel) aoTexto(visivel)
      }
    }
  }

  return { cru, recusa }
}

/**
 * Gera a resposta, emitindo eventos conforme acontecem.
 *
 * Uma regeneração no máximo: se a validação recusar, a violação volta ao modelo
 * como instrução e ele tenta de novo. Recusado duas vezes, emite `erro` e quem
 * chama cai para a resposta composta — sem terceira tentativa, porque a terceira
 * custa o dobro do tempo para um caso que já se mostrou ruim.
 */
export async function* gerarAoVivo({
  pergunta,
  achados,
  direta = false,
  precedentes = [],
  fio = [],
  herdados = [],
  passos,
}: {
  pergunta: string
  achados: Achado[]
  /** Veio de `resolveDireto`? Então não houve fusão, e o piso não se aplica. */
  direta?: boolean
  /**
   * Precedentes do STJ alcançados pelos artigos do contexto. Sempre em trânsito
   * em julgado — ver `lib/vigilia/precedentes.ts`. Vazio é o normal.
   */
  precedentes?: Citavel[]
  /**
   * As trocas anteriores desta conversa — perguntas e ids, nunca a prosa. Ver
   * `lib/consulta/fio.ts`. Vazio é o normal: primeira pergunta.
   */
  fio?: Troca[]
  /**
   * Os dispositivos que as respostas anteriores citaram, já lidos do banco.
   * Entram no contexto DEPOIS do piso, porque não passaram pela fusão desta
   * pergunta e o piso os cortaria inteiros.
   */
  herdados?: Achado[]
  passos: Passo[]
}): AsyncGenerator<EventoAoVivo> {
  // O modelo argumenta sobre o que sobreviveu ao piso; a tela continua
  // mostrando a busca inteira, pelo evento `busca`.
  const { itens, fraco } = filtraContexto(achados, direta)

  // A herança vai para o fim: o que a busca desta pergunta trouxe vem primeiro,
  // e o assunto que se arrastou da troca anterior fica atrás. Ordem é sinal
  // barato e o modelo lê de cima para baixo.
  const doContexto = [...itens, ...herdados]
  const idsHerdados = new Set(herdados.map((h) => h.dispositivo_id))

  // A guarda olha o contexto montado, não a busca crua: com fio, uma pergunta
  // puramente anafórica ("e nesse caso?") pode não recuperar nada sozinha e
  // ainda assim ter o que citar.
  if (doContexto.length === 0) {
    yield { tipo: 'erro', motivo: 'a busca não recuperou nenhum dispositivo para citar' }
    return
  }

  const contexto = montarContexto(doContexto, idsHerdados) + montarPrecedentes(precedentes)

  // O universo do que pode ser citado. Precedente entra aqui para `valida()`
  // aceitar o `doc_id` dele — e entra COM o texto da tese, o que faz a recusa
  // de transcrição valer para ele também: o modelo argumenta sobre a tese, não
  // a copia. A tela mostra o texto no cartão, como faz com o dispositivo.
  const recuperados = [
    ...recuperadosDe(doContexto),
    ...precedentes.map((p) => ({ docId: p.docId, texto: p.tese })),
  ]

  /**
   * Dito ao modelo só quando a recuperação é fraca de fato.
   *
   * Sem isto, a âncora obrigatória empurra na direção errada: o modelo PRECISA
   * citar, então agarra o dispositivo menos ruim e constrói argumento em cima
   * dele. Nomear a fraqueza é o que transforma "cite o que der" em "diga que
   * não tem".
   */
  const semFio =
    '\n\nATENÇÃO: nenhum dispositivo recuperado teve concordância entre as pernas da busca — ' +
    'é sinal forte de que o acervo não cobre esta pergunta. Diga isso na primeira frase, ' +
    'use confidence "baixa" e não construa tese sobre os dispositivos abaixo; eles servem ' +
    'apenas para mostrar o que o acervo de fato alcança.'

  /**
   * Com fio, a recuperação fraca tem uma segunda explicação — e quem pode
   * distinguir as duas é o modelo, não este arquivo.
   *
   * `fraco` mede uma coisa só: os TERMOS desta pergunta não acharam concordância
   * no corpus. Sem conversa atrás, isso quer dizer "o acervo não cobre o
   * assunto". Com conversa atrás, quer dizer isso OU que a pergunta não tem
   * termo próprio para casar — "e nesse caso?" não tem o que achar em lugar
   * nenhum, e ainda assim é respondível. Afirmar a primeira leitura nos dois
   * casos faria o chat negar um assunto que ele acabou de cobrir; suprimir o
   * aviso faria o contrário, que é pior. Diz-se então o que de fato se mediu, e
   * a decisão fica com quem tem as duas metades na frente.
   */
  const comFio =
    '\n\nATENÇÃO: a busca feita com o texto desta pergunta sozinha não teve concordância entre ' +
    'as pernas — o que acontece tanto quando o acervo não cobre o assunto quanto quando a pergunta ' +
    'se apoia na anterior ("e nesse caso?", "e se ele for reincidente?"). Os dispositivos com ' +
    '`origem` declarada vieram das perguntas anteriores e provavelmente são o assunto. Se eles ' +
    'responderem, responda a partir deles; se não responderem, diga que o acervo não cobre esta ' +
    'pergunta e use confidence "baixa".'

  const aviso = !fraco ? '' : fio.length > 0 ? comFio : semFio

  const mensagens: Mensagem[] = [
    { role: 'system', content: INSTRUCOES },
    {
      role: 'user',
      content:
        `Contexto recuperado do corpus curado (única fonte citável):\n\n${contexto}` +
        `${montarFio(fio)}${aviso}\n\nPergunta do advogado: ${pergunta}`,
    },
  ]

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let cru = ''

    // O gerador não pode emitir de dentro de um callback, então o texto que
    // chega durante a passada é enfileirado e drenado logo depois. Na prática a
    // fila esvazia a cada pedaço de rede, e é isso que mantém a revelação
    // contínua na tela.
    const fila: string[] = []

    try {
      const passada = umaPassada(mensagens, tentativa === 1 ? (d) => fila.push(d) : null)

      // Drena enquanto a passada corre. `Promise.race` com um respiro curto:
      // sem ele, o `await` da passada seguraria a fila até o fim do stream.
      let terminou = false
      const promessa = passada.then((x) => {
        terminou = true
        return x
      })

      while (!terminou) {
        await Promise.race([promessa, new Promise((r) => setTimeout(r, 40))])
        while (fila.length) yield { tipo: 'texto', delta: fila.shift()! }
      }
      while (fila.length) yield { tipo: 'texto', delta: fila.shift()! }

      const { cru: texto, recusa } = await promessa

      if (recusa) {
        yield { tipo: 'erro', motivo: `o modelo recusou responder: ${recusa.slice(0, 160)}` }
        return
      }
      cru = texto
    } catch (e) {
      yield { tipo: 'erro', motivo: e instanceof Error ? e.message : 'falha ao chamar o modelo' }
      return
    }

    let bruto: unknown
    try {
      bruto = JSON.parse(cru)
    } catch {
      bruto = null
    }

    const veredito = valida(bruto, recuperados)

    if (veredito.ok) {
      yield {
        tipo: 'fim',
        herdados,
        // `doContexto`, e não `achados`: o herdado tem de estar aqui ou some do
        // cartão sem erro nenhum. `valida()` já o aceitou (ele está em
        // `recuperados`), então a citação é legítima — e `enriquece` a
        // descartaria por não achar o id, deixando o parágrafo ancorado nos
        // dados e órfão na tela. É o mesmo modo de falha do corte de fontes
        // pelo fim, que o comentário de `enriquece` descreve.
        comp: enriquece(veredito.dados, doContexto, passos, precedentes),
        modelo: MODELO,
      }
      return
    }

    if (tentativa === 2) {
      yield {
        tipo: 'erro',
        motivo: `resposta recusada pela validação: ${veredito.violacoes.map((v) => v.detalhe).join('; ')}`,
      }
      return
    }

    // Regenera com a violação nomeada. O que o modelo escreveu volta como turno
    // de assistente para ele ver o que foi recusado.
    mensagens.push({ role: 'assistant', content: cru || '{}' })
    mensagens.push({ role: 'user', content: recado(veredito.violacoes) })
  }
}

export type { EventoAoVivo, RespostaIA }
