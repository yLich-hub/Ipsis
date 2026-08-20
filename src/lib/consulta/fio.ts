// =============================================================================
// O fio da conversa — o que uma troca deixa para a próxima
//
// Até aqui o array de mensagens mandado ao modelo era `[system, user]` e nada
// mais: cada pergunta chegava sozinha, sem nenhuma notícia da anterior. O efeito
// não era só o modelo esquecer — a BUSCA esquecia junto. "E se ele for
// reincidente?" ia crua para `busca_hibrida`, que devolvia o que encontrasse
// para a palavra "reincidente", e o assunto que o advogado tinha na cabeça
// (aquele § 4º da troca anterior) não estava em lugar nenhum do contexto.
//
// **Só duas coisas atravessam a troca: a PERGUNTA e os IDS citados.**
//
// A prosa gerada NÃO volta. Ela não passa por `valida()` de novo, e reinjetá-la
// deixaria uma afirmação da troca 1 sobreviver até a troca 3 sem âncora nenhuma
// — exatamente a fresta que a recusa de parágrafo sem citação existe para
// fechar, reaberta pela porta do histórico. Id é coisa que já foi validada
// contra o contexto recuperado; prosa não é.
//
// **A consulta da busca continua sendo o texto da pergunta, intocado**, e essa
// é a decisão que mais custou para chegar. O caminho óbvio — concatenar a
// pergunta anterior e mandar as duas para a RPC — envenena a perna de rubrica,
// que tem peso dominante e casa por termo contido a partir de 12 caracteres:
// depois de uma troca sobre "tráfico privilegiado", TODA pergunta seguinte
// carregaria esse termo para dentro da consulta e a rubrica encabeçaria o
// resultado de assuntos que não têm nada com ela. Seria o art. 149-A do
// CLAUDE.md de novo, agora disparado pela própria conversa.
//
// A continuidade vem então por herança de id: os dispositivos que a resposta
// anterior citou entram no contexto da seguinte, marcados como herdados. A
// busca da pergunta nova segue limpa, e o que ela recupera soma em vez de
// competir.
// =============================================================================

/** Uma troca já respondida: o que se perguntou e o que a resposta citou. */
export type Troca = {
  pergunta: string
  /** `dispositivos.id` (ou id de precedente) das fontes que a resposta exibiu. */
  ids: string[]
}

/**
 * Quantas trocas anteriores atravessam.
 *
 * Três, e não a conversa inteira, porque isto entra em toda chamada paga: o
 * bloco de perguntas é barato, mas os ids herdados viram texto de lei no
 * contexto. Três cobre o encadeamento real de uma consulta ("o que é" → "e os
 * requisitos" → "e se ele for reincidente") e para antes de a conversa de
 * meia hora empurrar o assunto de vinte minutos atrás para dentro da resposta.
 */
export const MAX_TROCAS = 3

/** Quantos ids se leem de cada troca. Igual ao teto de cartões de fonte. */
const MAX_IDS_POR_TROCA = 4

/**
 * Quantos dispositivos herdados entram no contexto, somadas todas as trocas.
 *
 * Menor que a soma possível (3 × 4) de propósito: herdado não passou pela fusão
 * desta pergunta, então ele é aposta, não recuperação. Cinco é o bastante para
 * o assunto continuar em cena e pouco para a herança dominar o contexto de uma
 * pergunta que mudou de assunto.
 */
export const MAX_HERDADOS = 5

const MAX_PERGUNTA = 300

/**
 * A forma dos ids do projeto (`lei_11343_2006_art33_p4`, `dl_2848_1940_art59`).
 * Isto vem do cliente e é entrada de usuário como qualquer outra — o que não
 * tem forma de id não chega a virar consulta ao banco.
 */
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{2,79}$/

/**
 * Sanea o fio que o cliente mandou.
 *
 * Descarta em silêncio o que não presta, em vez de recusar a requisição
 * inteira: fio é conforto, e uma troca malformada não pode custar a resposta.
 * É a mesma escolha do histórico, que vira lista vazia em toda falha.
 */
export function saneiaFio(bruto: unknown): Troca[] {
  if (!Array.isArray(bruto)) return []

  const trocas: Troca[] = []

  for (const item of bruto.slice(-MAX_TROCAS)) {
    if (!item || typeof item !== 'object') continue
    const o = item as { pergunta?: unknown; ids?: unknown }

    const pergunta =
      typeof o.pergunta === 'string' ? o.pergunta.trim().replace(/\s+/g, ' ').slice(0, MAX_PERGUNTA) : ''
    if (!pergunta) continue

    const ids = Array.isArray(o.ids)
      ? [...new Set(o.ids.filter((i): i is string => typeof i === 'string' && ID_VALIDO.test(i)))].slice(
          0,
          MAX_IDS_POR_TROCA,
        )
      : []

    trocas.push({ pergunta, ids })
  }

  return trocas
}

/**
 * O bloco de perguntas anteriores, como o modelo o vê.
 *
 * Dito com todas as letras que ele NÃO é fonte. Sem isso, a pergunta anterior
 * vira contexto de conteúdo e o modelo se apoia no que ele mesmo respondeu
 * antes — que é a memória do modelo com um passo a mais, e continua não sendo
 * conferível na tela. O que ele resolve é referência: a quem "ele" se refere,
 * o que é "nesse caso", qual crime está em discussão.
 */
export function montarFio(fio: Troca[]): string {
  if (fio.length === 0) return ''

  const linhas = fio.map((t, i) => `${i + 1}. ${t.pergunta}`).join('\n')

  return (
    '\n\nPerguntas anteriores desta mesma conversa, da mais antiga para a mais recente. ' +
    'Elas servem SÓ para resolver a referência da pergunta que vem agora — a quem "ele" se refere, ' +
    'o que é "nesse caso", de que crime se está falando. Elas NÃO são fonte: não repita como dado do ' +
    'acervo o que você respondeu antes, e não cite nada que não esteja nos blocos acima.\n\n' +
    linhas
  )
}

/**
 * Os ids a herdar, do mais recente para o mais antigo.
 *
 * `jaNoContexto` é o contexto DEPOIS do piso de fusão, e a ordem importa: um id
 * que a busca desta pergunta recuperou e o piso cortou volta pela herança, o
 * que é certo — a troca anterior o citou, então ele é assunto, não cauda.
 */
export function idsHerdados(fio: Troca[], jaNoContexto: string[]): string[] {
  const visto = new Set(jaNoContexto)
  const saida: string[] = []

  for (const troca of [...fio].reverse()) {
    for (const id of troca.ids) {
      if (visto.has(id)) continue
      visto.add(id)
      saida.push(id)
      if (saida.length >= MAX_HERDADOS) return saida
    }
  }

  return saida
}

/**
 * Reata, ao reabrir uma conversa do histórico, os dispositivos que a resposta
 * citou por herança.
 *
 * **O problema, que é consequência direta da herança.** O histórico guarda
 * `bruta` — a resposta da busca daquela pergunta — e nada mais, de propósito: o
 * resto é derivado. Mas as fontes de uma troca com fio podem apontar para
 * dispositivo que a busca DAQUELA pergunta não devolveu, e aí a lista de
 * achados da mensagem reaberta não o contém. O cartão de fonte procura o id
 * nela, não acha, e o painel abria o primeiro da lista: o usuário clica em
 * "art. 33, § 4º" e lê outro artigo, com o link "Abrir dispositivo" apontando
 * para o artigo errado junto.
 *
 * **Por que não é preciso guardar nada a mais.** Todo id herdado entrou em
 * alguma troca ANTERIOR da mesma conversa, e entrou nela pela busca — a herança
 * só repassa o que já foi recuperado uma vez. Descendo a cadeia, todo id citado
 * por herança está no `bruta.itens` de alguma troca da conversa. O pool é a
 * conversa inteira, e ele basta por construção. Guardar os herdados na linha do
 * banco seria gravar derivado, que é o que `conversa_trocas` evita.
 *
 * Genérico em `T` para ficar testável sem arrastar `Achado` — a única coisa que
 * importa aqui é a chave.
 */
export function religaHerdados<T extends { dispositivo_id: string }>(
  pool: T[],
  daTroca: T[],
  citados: string[],
): T[] {
  const jaTem = new Set(daTroca.map((a) => a.dispositivo_id))
  const faltando = new Set(citados.filter((id) => !jaTem.has(id)))
  if (faltando.size === 0) return []

  const saida: T[] = []
  for (const a of pool) {
    if (!faltando.has(a.dispositivo_id)) continue
    // Uma vez só: o pool tem a conversa inteira e o mesmo dispositivo pode
    // aparecer na busca de várias trocas.
    faltando.delete(a.dispositivo_id)
    saida.push(a)
  }
  return saida
}
