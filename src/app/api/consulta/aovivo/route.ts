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

import { consultar } from '@/lib/busca/consultar'
import { filtraContexto, gerarAoVivo, temChave, type EventoAoVivo } from '@/lib/consulta/aovivo'
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

  let corpo: { q?: unknown; lei?: unknown; qtd?: unknown }
  try {
    corpo = (await req.json()) as { q?: unknown; lei?: unknown; qtd?: unknown }
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

        const busca = await consultar({ q, lei, qtd })

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
        const precedentes = await precedentesPara([
          ...new Set(itens.map((i) => soArtigo(i.dispositivo_id))),
        ])

        for await (const evento of gerarAoVivo({
          pergunta: q,
          achados: busca.itens,
          precedentes,
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
