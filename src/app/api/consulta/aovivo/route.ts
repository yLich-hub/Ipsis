// =============================================================================
// POST /api/consulta/aovivo — a resposta do chat gerada ao vivo, por SSE
//
// `runtime = 'nodejs'`: o SDK da Anthropic não roda no Edge.
//
// A rota não é pública (não está em `lib/auth/rotas.ts`), e isso é o primeiro
// dos três freios. Sem ele, uma rota que chama a API do Claude seria superfície
// de gasto anônima — que é a razão original de o CLAUDE.md ter proibido LLM em
// runtime. Os outros dois são o limite por IP e o teto mensal no banco.
//
// **Os passos que a tela anima são os eventos reais deste pipeline**, emitidos
// enquanto acontecem: classificação da intenção (regra em TS, sem rede), fusão
// dos três rankings (RPC única), leitura do texto e conferência de vigência.
// Nada é inventado para a animação — a animação é a espera de verdade.
//
// Ordem de emissão, e é a do contrato: passos enquanto rodam, texto token a
// token enquanto o JSON abre, fontes e cartão só depois de o objeto fechar e
// passar na validação.
// =============================================================================

import { NextResponse } from 'next/server'

import { consultar, embuteConsulta, lerDispositivos } from '@/lib/busca/consultar'
import {
  filtraContexto,
  filtraDecretos,
  gerarAoVivo,
  temChave,
  type EventoAoVivo,
} from '@/lib/consulta/aovivo'
import { buscaDecretos, lerBlocos } from '@/lib/decretos/leitura'
import { consultaDoAcervo, querDecretos } from '@/lib/decretos/porteiro'
import { idsHerdados, saneiaFio } from '@/lib/consulta/fio'
import { precedentesPara } from '@/lib/vigilia/precedentes'
import { soArtigo } from '@/lib/vigilia/alvos'
import { supabase } from '@/lib/supabase'
import { passosDa } from '@/lib/toga/resposta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Quantos dispositivos entram no contexto do modelo.
 *
 * `QTD_PADRAO` era o número fixo desta rota, e o botão de 4/8/12 da Consulta não
 * o alcançava: a tela mandava `qtd` só na chamada de `/api/busca`, que é a rede
 * de segurança. No caminho padrão — este — o botão não mudava nada, e o chip
 * "12 resultados" na caixa afirmava algo que o servidor ignorava.
 *
 * O teto é baixo de propósito, e não é o mesmo de `/api/busca`: lá o custo de um
 * `qtd` grande é uma lista comprida na tela; aqui cada dispositivo a mais é
 * texto de lei inteiro dentro de uma chamada paga. A tela não oferece mais que
 * 12, então acima disso é chamada montada à mão — e ela é aparada, não obedecida.
 */
const QTD_PADRAO = 8
const QTD_MAX = 12

/**
 * Mesma regra de `/api/busca`, e pelo mesmo motivo: `Number('abc')` é `NaN`, e
 * `NaN` atravessa `Math.min` e `Array.slice` sem reclamar — `slice(0, NaN)`
 * devolve lista vazia. Contexto vazio faz `gerarAoVivo` recusar e a Consulta
 * cair para a resposta composta, que é uma queda silenciosa por entrada malformada.
 *
 * Ausente é diferente de inválido, e os dois querem o padrão: `Number(null)` e
 * `Number('')` são 0, não NaN, e sem o primeiro teste uma chamada sem `qtd`
 * mandaria um dispositivo só ao modelo.
 */
function saneiaQtd(bruto: unknown): number {
  if (bruto === null || bruto === undefined || bruto === '') return QTD_PADRAO
  const n = Math.trunc(Number(bruto))
  if (!Number.isFinite(n) || n <= 0) return QTD_PADRAO
  return Math.min(n, QTD_MAX)
}

/**
 * Limite por IP, na memória do processo.
 *
 * É um quebra-molas, não um portão: em serverless cada instância tem o próprio
 * mapa, e uma instância nova nasce com ele vazio. O portão de verdade é o teto
 * mensal, que mora no banco e vale para todas as instâncias. Este mapa existe
 * para o caso barato e comum — alguém segurando o botão.
 */
const JANELA_MS = 60_000
const POR_JANELA = 5
const visitas = new Map<string, number[]>()

function excedeu(ip: string): boolean {
  const agora = Date.now()
  const recentes = (visitas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS)
  recentes.push(agora)
  visitas.set(ip, recentes)
  // O mapa não cresce sem fim: chaves sem visita recente saem quando cruzam o
  // caminho da limpeza. Sem isto, um processo longo acumularia um IP por
  // visitante para sempre.
  if (visitas.size > 500) {
    for (const [k, v] of visitas) if (v.every((t) => agora - t >= JANELA_MS)) visitas.delete(k)
  }
  return recentes.length > POR_JANELA
}

const sse = (evento: EventoAoVivo) => `data: ${JSON.stringify(evento)}\n\n`

export async function POST(req: Request) {
  if (!temChave()) {
    // O nome da variável vem de `temChave()`, que é quem a lê. Escrevê-lo à mão
    // aqui já custou caro uma vez: a mensagem dizia ANTHROPIC_API_KEY muito
    // depois da troca de provedor, e mandava quem lia o 503 procurar uma chave
    // que o projeto não usa. Era o mesmo defeito do nome do modelo escrito à
    // mão na prévia da Consulta, que dizia `claude-opus-5` durante toda a
    // geração — de lá o nome saiu, e quem nomeia é o aviso do fim.
    return NextResponse.json({ erro: 'OPENAI_API_KEY ausente no servidor' }, { status: 503 })
  }

  let corpo: { q?: unknown; lei?: unknown; qtd?: unknown; fio?: unknown }
  try {
    corpo = (await req.json()) as { q?: unknown; lei?: unknown; qtd?: unknown; fio?: unknown }
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  const q = typeof corpo.q === 'string' ? corpo.q.trim().slice(0, 500) : ''
  if (!q) return NextResponse.json({ erro: 'consulta vazia' }, { status: 400 })

  // O escopo escolhido nas pílulas da tela. Vale a mesma lista de leis do
  // corpus; qualquer outra coisa vira busca sem filtro.
  const lei = typeof corpo.lei === 'string' && corpo.lei ? corpo.lei : null

  // Quantos dispositivos a busca devolve, escolhido no botão da caixa de
  // consulta. Saneado aqui porque isto é entrada de usuário como qualquer outra.
  const qtd = saneiaQtd(corpo.qtd)

  // As trocas anteriores desta conversa, mandadas pela tela — que é quem as tem.
  // O servidor não pode lê-las do banco: `conversas` tem RLS por `auth.uid()` e
  // o cliente desta rota não carrega a sessão do usuário. Entrada de usuário
  // como qualquer outra, e `saneiaFio` a trata assim.
  const fio = saneiaFio(corpo.fio)

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'desconhecido'

  if (excedeu(ip)) {
    return NextResponse.json({ erro: 'muitas gerações seguidas — espere um minuto' }, { status: 429 })
  }

  // Teto mensal. A função decide e escreve na mesma instrução (migration 0010),
  // então duas requisições simultâneas não passam juntas pela última vaga.
  const { data, error } = await supabase.rpc('consome_uso_llm')
  const cota = (Array.isArray(data) ? data[0] : data) as
    | { permitido: boolean; chamadas: number; teto: number }
    | undefined

  if (error || !cota) {
    return NextResponse.json({ erro: 'não foi possível conferir o teto mensal' }, { status: 503 })
  }
  if (!cota.permitido) {
    return NextResponse.json(
      { erro: `teto mensal de ${cota.teto} gerações atingido`, teto: cota.teto },
      { status: 429 },
    )
  }

  const fluxo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const cod = new TextEncoder()
      const manda = (e: EventoAoVivo) => controlador.enqueue(cod.encode(sse(e)))

      try {
        // Passo 1 — a classificação roda em TS, sem rede. Emitido antes da busca
        // porque é o que de fato acontece primeiro.
        manda({ tipo: 'passo', t: 'Classificando a intenção da consulta', meta: 'regra em TS' })

        // O acervo estadual só é consultado quando a pergunta o chama — ver
        // `lib/decretos/porteiro.ts`. A porta fechada não custa requisição
        // nenhuma, que é o ponto: a esmagadora maioria das consultas deste
        // produto é sobre crime, e não tem o que fazer com decreto estadual.
        const porta = querDecretos(q)

        // Em paralelo: são duas RPCs independentes, em corpora separados. A
        // latência é a maior das duas, não a soma — que é o que torna aceitável
        // não fundir os dois numa chamada só. Fundir reabriria a classe de erro
        // que a migration 0017 fechou; ver o cabeçalho da 0018.
        const [busca, doAcervo] = await Promise.all([
          consultar({ q, lei, qtd }),
          porta.abre
            ? (async () => {
                // A consulta que vai ao acervo não é a pergunta crua: sai dela
                // o que abriu a porta, que não discrimina nada num corpus em
                // que todo ato é um decreto do Executivo do Paraná. Ver
                // `consultaDoAcervo`.
                const c = consultaDoAcervo(q)
                return buscaDecretos({ consulta: c, embedding: await embuteConsulta(c), qtd: 8 })
              })()
            : Promise.resolve({ ok: true as const, dados: [] }),
        ])

        // Falha do acervo estadual NÃO derruba a consulta: ela é acréscimo, e o
        // corpus responde sozinho. Mesma escolha do histórico e dos precedentes
        // — perder o secundário é degradação, não pane.
        const decretos = filtraDecretos(doAcervo.ok ? doAcervo.dados : [])

        if (porta.abre) {
          manda({
            tipo: 'passo',
            t: 'Consultando o acervo de decretos do Paraná',
            meta: decretos.itens.length
              ? `${decretos.itens.length} bloco(s)${decretos.fraco ? ', sem concordância' : ''} · ${porta.sinal}`
              : `nada no acervo · ${porta.sinal}`,
          })
        }

        // A busca crua vai para a tela antes da geração: é o que alimenta o
        // painel de fonte, o histórico e — se a geração falhar daqui em diante —
        // a resposta composta. Uma requisição só para as duas coisas.
        manda({ tipo: 'busca', bruta: busca })

        if (busca.erro) {
          manda({ tipo: 'erro', motivo: `a busca falhou: ${busca.erro}` })
          controlador.close()
          return
        }

        // Os passos reais, com o número que cada um produziu. `passosDa` é a
        // mesma função que o caminho composto usa — se divergissem, a animação
        // do ao vivo contaria uma história diferente da do padrão.
        for (const p of passosDa(busca).slice(1)) manda({ tipo: 'passo', ...p })
        // O nome do modelo NÃO é escrito aqui: ele vem no evento `fim`, do
        // servidor. Este passo já anunciou 'claude-opus-5' muito depois da troca
        // de provedor — o mesmo defeito que o CLAUDE.md descreve para o nome
        // fixo no JSX, repetido num lugar em que ninguém foi procurar.
        manda({ tipo: 'passo', t: 'Redigindo com o contexto recuperado', meta: 'modelo do servidor' })

        // Os precedentes são alcançados pelos ARTIGOS dos dispositivos que
        // sobreviveram ao piso de fusão — não pelos oito brutos. Passar a busca
        // inteira faria um dispositivo de cauda arrastar um precedente para a
        // resposta, que é o mesmo ruído que o piso existe para cortar.
        const { itens } = filtraContexto(busca.itens, busca.direta)

        // O que a resposta anterior citou e esta busca não trouxe. A dedução é
        // contra `itens` (o contexto já filtrado) e não contra a busca crua: um
        // dispositivo que o piso cortou e a troca anterior citou VOLTA por aqui,
        // e volta com razão — a conversa já o tratou como assunto.
        // A herança do fio carrega os três espaços de id do produto, e cada um
        // é lido na sua tabela. `lerDispositivos` ignora o que não é do corpus,
        // então separar antes não é otimização: é o que faz o bloco de decreto
        // chegar a `lerBlocos` em vez de sumir numa consulta a `v_dispositivo`.
        const aHerdar = idsHerdados(fio, [
          ...itens.map((i) => i.dispositivo_id),
          ...decretos.itens.map((d) => d.bloco_id),
        ])

        const [herdados, decretosHerdados] = await Promise.all([
          lerDispositivos(aHerdar.filter((id) => !id.startsWith('decpr:'))),
          // **A herança é o que mantém o decreto vivo na pergunta seguinte.**
          // "E o que ele diz sobre a composição?" não tem a palavra "decreto",
          // então o porteiro fecha — e sem herança o assunto que a conversa
          // acabou de tratar sumiria entre uma troca e outra.
          lerBlocos(aHerdar.filter((id) => id.startsWith('decpr:')).slice(0, 3)),
        ])

        // Herdado entra DEPOIS do piso, pelo mesmo motivo do corpus: ele não
        // passou pela fusão desta pergunta, e o piso o cortaria inteiro. Ele vai
        // MARCADO — ver `montarDecretos` —, e a marca é o que impede o aviso de
        // recuperação fraca desta pergunta de cair sobre um decreto que a
        // conversa já tratou.
        const contextoEstadual = {
          itens: [...decretos.itens, ...decretosHerdados],
          // Sem nada recuperado nesta pergunta, não há recuperação fraca a
          // anunciar: o que está no contexto veio inteiro da conversa.
          fraco: decretos.itens.length > 0 && decretos.fraco,
          herdados: decretosHerdados.map((d) => d.bloco_id),
        }

        // Os precedentes olham os artigos do contexto inteiro, herança incluída:
        // numa pergunta de seguimento o artigo em discussão vem pelo fio, e sem
        // isto a segunda troca sobre o mesmo assunto perderia o tema do STJ que
        // a primeira teve.
        const precedentes = await precedentesPara([
          ...new Set([...itens, ...herdados].map((i) => soArtigo(i.dispositivo_id))),
        ])

        for await (const evento of gerarAoVivo({
          pergunta: q,
          achados: busca.itens,
          precedentes,
          decretos: contextoEstadual,
          fio,
          herdados,
          // Endereço explícito não passou pela fusão e tem score 0 — o piso de
          // contexto tem de saber disso, ou zeraria a consulta mais literal.
          direta: busca.direta,
          passos: passosDa(busca),
        })) {
          manda(evento)
        }
      } catch (e) {
        manda({ tipo: 'erro', motivo: e instanceof Error ? e.message : 'falha inesperada' })
      } finally {
        controlador.close()
      }
    },
  })

  return new Response(fluxo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // A Vercel embute buffer em proxy; sem isto o SSE chega em bloco no fim,
      // e um stream que só entrega no fim não é um stream.
      'X-Accel-Buffering': 'no',
    },
  })
}
