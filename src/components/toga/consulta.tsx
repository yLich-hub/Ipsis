'use client'

// =============================================================================
// TOGA v2 — tela de Consulta (chat)
//
// A tela mais viva do documento de design, e a que mais precisa de cuidado para
// não virar teatro. O que é animação e o que é verdade:
//
// - Os quatro passos ("Classificando a intenção…", "Fundindo rubrica, léxico e
//   vetor…") são os passos reais do pipeline. Aparecem em cadência fixa de
//   620 ms porque a busca inteira leva menos que isso e um progresso que pisca e
//   some não informa nada — mas o `meta` de cada passo é o número que aquele
//   passo produziu de verdade, não enfeite.
// - A digitação tem dois regimes, e os dois são honestos: no caminho composto
//   ela é animação pura (7 caracteres a cada 16 ms, como o documento) porque o
//   texto já chegou inteiro; no caminho ao vivo é revelação real, token a token,
//   enquanto o JSON do modelo ainda está abrindo.
// - Os cartões de fonte e o painel lateral são dados do banco, sem uma segunda
//   ida à rede: `Achado` já traz texto, citação, vigência e cobertura, e clicar
//   numa fonte não deveria custar uma requisição.
//
// **A prosa É gerada por modelo**, em `/api/consulta/aovivo` — ver "O contrato da
// geração" no CLAUDE.md. `comporResposta()`, em `lib/toga/resposta.ts`, deixou de
// ser o caminho padrão e virou a rede de segurança: é ela que responde quando
// falta chave, falta rede, o teto estoura ou a validação recusa duas vezes. As
// duas produzem o mesmo `RespostaComposta`, e é isso que permite um renderizador
// só e uma queda sem pulo de layout.
// =============================================================================

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Esqueleto, Girador, Selo, Visto } from '@/components/toga/base'
import { EVENTO_NOVA } from '@/components/toga/casca'
import type { Achado, RespostaBusca } from '@/lib/busca/consultar'
import { classifica } from '@/lib/busca/intencao'
import type { EventoAoVivo } from '@/lib/consulta/contrato'
import { fontesDeDoutrina } from '@/lib/consulta/doutrina'
import { dataBR } from '@/lib/formato'
import { calcula, dosavel, leDaConversa, meses } from '@/lib/toga/dosimetria'
import { busca, registra } from '@/lib/toga/historico'
import { MARCA } from '@/lib/toga/marca'
import { comporResposta, type Fonte, type RespostaComposta } from '@/lib/toga/resposta'
import { ACENTO_CLARO, GRADIENTE_MARCA, GRADIENTE_RESULTADO } from '@/lib/toga/tokens'
import { DATA_DE_CORTE } from '@/lib/vigilia/alvos'

// --- constantes de animação (todas do documento de design) -------------------

const MS_POR_PASSO = 620
const MS_POR_QUADRO = 16
const CHARS_POR_QUADRO = 7

/**
 * Os passos exibidos enquanto a resposta não chegou.
 *
 * Existem porque o pipeline é conhecido de antemão — classificação em TS, RPC
 * única, leitura, conferência —, então dá para mostrar o roteiro certo antes de
 * ter os números. Quando a resposta chega, `comporResposta` devolve a mesma
 * lista com o `meta` preenchido e a troca é invisível.
 */
const PASSOS_PROVISORIOS = [
  { t: 'Classificando a intenção da consulta', meta: '' },
  { t: 'Fundindo rubrica, léxico e vetor', meta: '' },
  { t: 'Lendo o texto dos dispositivos', meta: '' },
  { t: 'Conferindo vigência e cobertura', meta: '' },
]

/**
 * Escopo da busca: qual lei do corpus filtrar. O `id` vai direto em `lei` na
 * chamada, e as três são as três de `LEIS_CONHECIDAS`.
 *
 * **Havia mais duas, desligadas — "Jurisprudência" e "Doutrina" — e as duas
 * saíram.** Não eram escopo: esta fileira escolhe *lei*, e nenhuma das duas é
 * uma. Um botão permanentemente morto numa fileira de filtros ensina que o
 * filtro não funciona.
 *
 * A de Jurisprudência ainda dizia "o produto indexa lei, não acórdão", e isso
 * passou a subestimar o produto quando os precedentes qualificados entraram: o
 * chat traz temas do STJ como fonte numerada, com a situação no lugar da
 * vigência, e há uma tela inteira deles. O que continua verdade — precedente não
 * é fundamento de peça — já está dito onde importa: no subtítulo do próprio
 * cartão de fonte ("jurisprudência, não texto de lei").
 *
 * A de Doutrina dizia a verdade, mas era a sexta vez que o produto a dizia — e a
 * mais fraca. A restrição está na pílula "Sem doutrina" logo abaixo, num bloco
 * próprio em `/jurisprudencia`, nas garantias de `/configuracoes`, na regra 4 da
 * instrução do modelo e, o que de fato a sustenta, na recusa em runtime:
 * `classifica()` reconhece o molde `doutrina` e a resposta se nega a atribuir
 * nada ao autor. O que segura a regra é o código, não o botão cinza.
 */
const ESCOPOS = [
  { id: 'lei_11343_2006', t: 'Lei de Drogas', nota: 'Lei 11.343/2006 · cobertura integral' },
  { id: 'dl_2848_1940', t: 'Código Penal', nota: 'DL 2.848/1940 · cobertura integral' },
  { id: 'dl_3689_1941', t: 'CPP', nota: 'DL 3.689/1941 · cobertura integral' },
] as const

// --- modelo da conversa ------------------------------------------------------

type MsgUsuario = { papel: 'usuario'; texto: string }

/**
 * Estado do caminho "gerar ao vivo", quando o usuário o aciona.
 *
 * `previa` é o texto que chega token a token enquanto o JSON do modelo ainda
 * está aberto. Ela é **descartada** quando o objeto fecha e passa na validação:
 * o que fica é o `comp` reconstruído a partir do JSON validado. Prévia é
 * animação; resposta é o que sobreviveu à validação.
 */
type AoVivo = {
  estado: 'gerando' | 'pronto' | 'falhou'
  previa: string
  erro: string | null
  /** Qual modelo redigiu. Vem do servidor: a tela não pode adivinhar. */
  modelo: string | null
}

/**
 * Com que parâmetros esta resposta foi buscada.
 *
 * Fica na mensagem, e não no estado da tela, porque "Gerar de novo" tem de
 * repetir a busca que produziu AQUELA resposta. Lendo o estado atual, quem
 * trocasse a pílula de escopo ou o botão de resultados depois de perguntar veria
 * a regeneração responder outra coisa — e ela se apresenta como a mesma resposta,
 * refeita.
 *
 * `qtd` é anulável porque conversa reaberta do histórico não guarda o número
 * pedido, só os itens que voltaram. Nulo é "o padrão do servidor", que é o que
 * essa rota já fazia antes de a tela mandar qualquer coisa.
 */
type Parametros = { lei: string | null; qtd: number | null }

type MsgAssistente = {
  papel: 'assistente'
  /** A pergunta que a originou. O cartão de dosimetria lê os fatos dela. */
  pergunta: string
  /** Escopo e quantidade com que ela foi buscada. Ver `Parametros`. */
  params: Parametros
  comp: RespostaComposta | null
  achados: Achado[]
  passos: { t: string; meta: string }[]
  passo: number
  digitado: number
  total: number
  pronto: boolean
  aoVivo: AoVivo | null
}

type Msg = MsgUsuario | MsgAssistente

const vazia = (pergunta: string, params: Parametros): MsgAssistente => ({
  papel: 'assistente',
  pergunta,
  params,
  comp: null,
  achados: [],
  passos: PASSOS_PROVISORIOS,
  passo: 0,
  digitado: 0,
  total: 0,
  pronto: false,
  aoVivo: null,
})

// --- tela --------------------------------------------------------------------

export function Consulta({
  saudacao,
  perguntaInicial,
  conversaInicial,
}: {
  saudacao: string
  perguntaInicial?: string
  /** `?c=` — id da conversa a reabrir. Ver `lib/toga/historico.ts`. */
  conversaInicial?: string
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [rascunho, setRascunho] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [qtd, setQtd] = useState(8)
  const [escopo, setEscopo] = useState<string | null>(null)
  const [painel, setPainel] = useState<{ achados: Achado[]; id: string } | null>(null)
  /** O que a região viva diz. Só para leitor de tela — ver `anunciarPronto`. */
  const [anuncio, setAnuncio] = useState('')

  // Id da conversa em curso. Ref e não estado: muda fora do ciclo de render
  // (em "Nova consulta" e ao gravar) e nada na tela depende dele.
  const conversaRef = useRef<string | null>(null)

  const msgsRef = useRef<Msg[]>(msgs)
  msgsRef.current = msgs

  const passoT = useRef<ReturnType<typeof setInterval> | null>(null)
  const digitaT = useRef<ReturnType<typeof setInterval> | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  /**
   * A espera entre o fim dos passos e o início da digitação.
   *
   * Precisa de ref como os intervalos: sem isso, sair da tela enquanto a
   * resposta chega deixava o timeout pendente disparar depois do desmonte,
   * chamando `digitar()` — que abria um intervalo novo, já fora do alcance da
   * limpeza, tiquetaqueando a cada 16 ms pelo resto da sessão.
   */
  const esperaT = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Falso depois do desmonte: nenhum relógio deve ressuscitar a partir daí. */
  const vivo = useRef(true)
  /** A consulta em curso, para o botão de parar. `null` quando não há nenhuma. */
  const aborto = useRef<AbortController | null>(null)
  /** Ligada por `parar`: quem estiver no meio do fluxo desiste sem tocar na tela. */
  const cancelado = useRef(false)
  /** A pergunta em curso, para o `parar` devolvê-la à caixa. */
  const perguntaEmCurso = useRef('')

  const pararRelogios = useCallback(() => {
    if (passoT.current) clearInterval(passoT.current)
    if (digitaT.current) clearInterval(digitaT.current)
    if (esperaT.current) clearTimeout(esperaT.current)
    passoT.current = null
    digitaT.current = null
    esperaT.current = null
  }, [])

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      pararRelogios()
    }
  }, [pararRelogios])

  /** Aplica uma mudança a uma mensagem qualquer, pelo índice. */
  const mutarEm = useCallback(
    (i: number, fn: (m: MsgAssistente) => Partial<MsgAssistente>) => {
      setMsgs((ms) => {
        const m = ms[i]
        if (!m || m.papel !== 'assistente') return ms
        const copia = ms.slice()
        copia[i] = { ...m, ...fn(m) }
        return copia
      })
    },
    [],
  )

  /** Aplica uma mudança à última mensagem, que é sempre a do assistente em curso. */
  const mutar = useCallback((fn: (m: MsgAssistente) => Partial<MsgAssistente>) => {
    setMsgs((ms) => {
      const i = ms.length - 1
      const m = ms[i]
      if (!m || m.papel !== 'assistente') return ms
      const copia = ms.slice()
      copia[i] = { ...m, ...fn(m) }
      return copia
    })
  }, [])

  /**
   * "Gerar ao vivo" — o único caminho do produto que chama um modelo em runtime.
   *
   * A resposta composta continua na tela até o JSON do modelo fechar e passar na
   * validação do servidor. Se qualquer coisa falhar — teto do mês, rede,
   * validação recusada duas vezes —, o que estava lá continua lá e a tela diz
   * por quê. **O demo nunca depende deste caminho funcionar**, e é isso que essa
   * ordem garante.
   */
  const gerarAoVivo = useCallback(
    async (i: number) => {
      const alvo = msgsRef.current[i]
      if (!alvo || alvo.papel !== 'assistente' || alvo.aoVivo?.estado === 'gerando') return

      mutarEm(i, () => ({ aoVivo: { estado: 'gerando', previa: '', erro: null, modelo: null } }))

      const falhar = (motivo: string) =>
        mutarEm(i, (m) => ({
          aoVivo: { estado: 'falhou', previa: '', erro: motivo, modelo: null },
          // A resposta composta permanece intacta — não se apaga o que funciona
          // porque o opcional falhou.
          comp: m.comp,
        }))

      try {
        const r = await fetch('/api/consulta/aovivo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Escopo e quantidade saem da mensagem, não do estado da tela: esta é
          // a mesma pergunta sendo refeita, e refazê-la com outro filtro
          // devolveria outra resposta no lugar da que o usuário mandou repetir.
          body: JSON.stringify({ q: alvo.pergunta, lei: alvo.params.lei, qtd: alvo.params.qtd }),
        })

        if (!r.ok || !r.body) {
          const j = (await r.json().catch(() => null)) as { erro?: string } | null
          return falhar(j?.erro ?? `o servidor respondeu ${r.status}`)
        }

        const leitor = r.body.getReader()
        const dec = new TextDecoder()
        let resto = ''

        for (;;) {
          const { value, done } = await leitor.read()
          if (done) break
          resto += dec.decode(value, { stream: true })

          // SSE separa eventos por linha em branco; o último pedaço pode estar
          // partido, e volta para o buffer.
          const partes = resto.split('\n\n')
          resto = partes.pop() ?? ''

          for (const parte of partes) {
            const linha = parte.split('\n').find((l) => l.startsWith('data: '))
            if (!linha) continue

            let e: EventoAoVivo
            try {
              e = JSON.parse(linha.slice(6)) as EventoAoVivo
            } catch {
              continue
            }
            if (!vivo.current) return

            if (e.tipo === 'passo') {
              mutarEm(i, (m) => ({
                passos: [...m.passos, { t: e.t, meta: e.meta }],
                passo: m.passos.length + 1,
              }))
            } else if (e.tipo === 'texto') {
              mutarEm(i, (m) => ({
                aoVivo: m.aoVivo
                  ? { ...m.aoVivo, previa: m.aoVivo.previa + e.delta }
                  : { estado: 'gerando', previa: e.delta, erro: null, modelo: null },
              }))
            } else if (e.tipo === 'fim') {
              // O objeto validado substitui a prévia. Nada do que foi revelado
              // token a token sobrevive a este ponto — ele era animação.
              const total = e.comp.paras.reduce((a, p) => a + p.t.length, 0)
              mutarEm(i, () => ({
                comp: e.comp,
                passos: e.comp.passos,
                passo: e.comp.passos.length,
                digitado: total,
                total,
                pronto: true,
                aoVivo: { estado: 'pronto', previa: '', erro: null, modelo: e.modelo },
              }))
            } else if (e.tipo === 'erro') {
              return falhar(e.motivo)
            }
          }
        }
      } catch (err) {
        falhar(err instanceof Error ? err.message : 'falha de rede')
      }
    },
    [mutarEm],
  )

  /**
   * Diz, para quem não está olhando, que a resposta terminou.
   *
   * A única região viva da tela dizia "Consultando o corpus curado" enquanto se
   * esperava e ficava VAZIA quando a resposta chegava — o texto entra fora de
   * região viva, então nada era anunciado. Quem usa leitor de tela ficava com a
   * última frase sendo a da espera, sem saber que a espera acabou.
   *
   * Anuncia o tamanho e as fontes em vez do texto inteiro: a resposta está ali
   * para ser lida no ritmo de quem lê, e despejá-la numa região viva atropela a
   * navegação por parágrafo que o leitor de tela já oferece.
   */
  const anunciarPronto = useCallback((m: MsgAssistente) => {
    const paras = m.comp?.paras.length ?? 0
    const fontes = m.comp?.fontes.length ?? 0
    setAnuncio(
      `Resposta pronta: ${paras} ${paras === 1 ? 'parágrafo' : 'parágrafos'}, ` +
        `${fontes} ${fontes === 1 ? 'fonte citada' : 'fontes citadas'}.`,
    )
  }, [])

  /**
   * Desiste da consulta em curso.
   *
   * Faz as duas coisas aqui, e não espera o `fetch` reclamar: derruba a
   * requisição E arruma a tela na hora.
   *
   * A primeira versão só chamava `abort()` e deixava o `catch` do envio cuidar
   * do resto, esperando um `AbortError`. Medido no navegador: a requisição
   * morre mesmo — `net::ERR_ABORTED` no painel de rede —, mas o
   * `await leitor.read()` do laço de streaming fica pendurado sem resolver nem
   * rejeitar, então o `catch` nunca roda e a tela congelava com "Consultando o
   * corpus curado…" para sempre. Botão de parar que não para é pior que botão
   * nenhum.
   *
   * `cancelado` é o mesmo desenho de `vivo.current`, que este arquivo já usa
   * para o desmonte: quem estiver no meio do fluxo confere a bandeira e sai sem
   * tocar em estado nenhum.
   */
  const parar = useCallback(() => {
    cancelado.current = true
    aborto.current?.abort()
    aborto.current = null
    pararRelogios()
    // As DUAS mensagens: a pergunta e a resposta que ia respondê-la. Tirar só a
    // resposta deixaria a pergunta na tela para sempre sem nada embaixo, que é
    // pior que o estado anterior a ela.
    setMsgs((ms) => ms.slice(0, -2))
    // E a pergunta volta para a caixa. Quem cancela quase sempre cancela porque
    // perguntou errado; devolver o texto é a diferença entre corrigir uma
    // palavra e digitar tudo de novo.
    setRascunho(perguntaEmCurso.current)
    setOcupado(false)
    setAnuncio('Consulta cancelada. A pergunta voltou para a caixa.')
  }, [pararRelogios])

  const digitar = useCallback(() => {
    if (!vivo.current) return
    if (digitaT.current) clearInterval(digitaT.current)
    digitaT.current = setInterval(() => {
      const m = msgsRef.current[msgsRef.current.length - 1]
      if (!m || m.papel !== 'assistente') return pararRelogios()
      if (m.digitado >= m.total) {
        pararRelogios()
        mutar(() => ({ pronto: true }))
        setOcupado(false)
        anunciarPronto(m)
        return
      }
      mutar((x) => ({ digitado: Math.min(x.total, x.digitado + CHARS_POR_QUADRO) }))
    }, MS_POR_QUADRO)
  }, [anunciarPronto, mutar, pararRelogios])

  const enviar = useCallback(
    async (texto: string) => {
      const q = texto.trim()
      if (!q || ocupado) return

      pararRelogios()
      setRascunho('')
      setOcupado(true)
      setPainel(null)
      setAnuncio('Consultando o corpus curado…')
      cancelado.current = false
      perguntaEmCurso.current = q
      setMsgs((ms) =>
        ms.concat([{ papel: 'usuario', texto: q }, vazia(q, { lei: escopo, qtd })]),
      )

      // O relógio dos passos anda sozinho; ele para no último passo e espera a
      // resposta, em vez de correr até o fim e deixar a tela parada.
      passoT.current = setInterval(() => {
        const m = msgsRef.current[msgsRef.current.length - 1]
        if (!m || m.papel !== 'assistente') return pararRelogios()
        if (m.passo >= m.passos.length) return
        mutar((x) => ({ passo: x.passo + 1 }))
      }, MS_POR_PASSO)

      // --- caminho padrão: geração com o contexto recuperado -----------------
      //
      // Uma requisição só. A rota devolve, no mesmo fluxo, os passos reais, a
      // busca crua (para o painel de fonte e o histórico) e a resposta redigida
      // a partir dos dispositivos recuperados. Antes daqui a prosa era composta
      // de fatos sobre a busca — verdadeira, mas igual para toda pergunta.
      let bruta: RespostaBusca | null = null
      let gerada: RespostaComposta | null = null
      let modelo: string | null = null
      let motivo: string | null = null
      /** Já chegou algum passo do servidor? Ver o `tipo === 'passo'`, abaixo. */
      let reais = false

      try {
        // Uma consulta leva ~9 s, e não havia como desistir dela: nem tecla, nem
        // botão. Quem percebeu que perguntou errado esperava a resposta inteira
        // para poder perguntar de novo. O `signal` é o que torna "parar" uma
        // ação de verdade — sem ele, um botão só esconderia o fluxo, e o
        // servidor continuaria gerando (e cobrando) do outro lado.
        aborto.current = new AbortController()
        const res = await fetch('/api/consulta/aovivo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q, lei: escopo, qtd }),
          signal: aborto.current.signal,
        })

        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { erro?: string } | null
          motivo = j?.erro ?? `o servidor respondeu ${res.status}`
        } else {
          const leitor = res.body.getReader()
          const dec = new TextDecoder()
          let resto = ''

          for (;;) {
            const { value, done } = await leitor.read()
            if (done) break
            resto += dec.decode(value, { stream: true })

            // SSE separa eventos por linha em branco; o último pedaço pode
            // estar partido, e volta para o buffer.
            const partes = resto.split('\n\n')
            resto = partes.pop() ?? ''

            for (const parte of partes) {
              const linha = parte.split('\n').find((l) => l.startsWith('data: '))
              if (!linha) continue

              let e: EventoAoVivo
              try {
                e = JSON.parse(linha.slice(6)) as EventoAoVivo
              } catch {
                continue
              }
              // A mesma guarda do desmonte, agora também para a desistência:
              // `parar` já arrumou a tela, e qualquer escrita daqui a
              // desarrumaria de novo.
              if (!vivo.current || cancelado.current) return

              if (e.tipo === 'passo') {
                // O PRIMEIRO passo real substitui a lista provisória; os
                // seguintes se acumulam.
                //
                // Concatenar os dois desde o começo punha "Classificando a
                // intenção da consulta" duas vezes na tela: uma como terceiro
                // provisório e outra como quinto item, depois de "Conferindo
                // vigência e cobertura" — repetido e fora de ordem, porque a
                // lista provisória adivinha a mesma sequência que o servidor
                // depois anuncia de verdade.
                //
                // Os provisórios existem para a tela não ficar parada até o
                // servidor falar. Assim que ele fala, quem manda é ele.
                //
                // A decisão é tomada AQUI, fora do updater, e não dentro dele.
                // Escrever `reais = true` lá dentro parece natural e está
                // errado: updater de estado tem de ser puro, o StrictMode do
                // desenvolvimento o invoca duas vezes de propósito para expor
                // exatamente isso, e a segunda passagem já encontrava
                // `reais = true` — voltando a concatenar, que é o defeito que
                // este trecho existe para consertar. Conferido no navegador:
                // com o efeito colateral dentro, os quatro provisórios e o
                // primeiro real continuavam aparecendo juntos.
                const primeiro = !reais
                reais = true
                const novo = { t: e.t, meta: e.meta }
                // O contador anda junto com a lista, e é o mesmo que o outro
                // caminho ao vivo deste arquivo já faz. Passo real é evento que
                // aconteceu: ele aparece quando chega, sem esperar relógio.
                //
                // Deixar o contador parado em 1 escondia tudo menos o primeiro
                // passo — o relógio dos provisórios é desligado no evento
                // `busca`, e nada mais o avançava. O e2e pegou: "Fundindo
                // rubrica, léxico e vetor" nunca chegava à tela.
                mutar((m) =>
                  primeiro
                    ? { passos: [novo], passo: 1 }
                    : { passos: [...m.passos, novo], passo: m.passos.length + 1 },
                )
              } else if (e.tipo === 'busca') {
                bruta = e.bruta
                mutar(() => ({ achados: e.bruta.itens }))
                // Os passos provisórios saem de cena assim que os reais chegam.
                if (passoT.current) clearInterval(passoT.current)
                passoT.current = null
                mutar((m) => ({ passo: m.passos.length }))
              } else if (e.tipo === 'texto') {
                mutar((m) => ({
                  aoVivo: {
                    estado: 'gerando',
                    previa: (m.aoVivo?.previa ?? '') + e.delta,
                    erro: null,
                    modelo: null,
                  },
                }))
              } else if (e.tipo === 'fim') {
                gerada = e.comp
                modelo = e.modelo
              } else if (e.tipo === 'erro') {
                motivo = e.motivo
              }
            }
          }
        }
      } catch (e) {
        // Se foi desistência, a tela já foi arrumada por `parar` e não há nada a
        // relatar. O `catch` continua existindo para a falha de verdade.
        if (cancelado.current) return
        motivo = e instanceof Error ? e.message : 'falha de rede'
      } finally {
        aborto.current = null
      }

      // Desistência não pode cair na rede de segurança logo abaixo: ir buscar e
      // compor uma resposta seria entregar exatamente o que quem cancelou disse
      // não querer mais. E o laço de streaming pode nem ter reclamado — ver o
      // comentário de `parar`.
      if (cancelado.current) return

      // --- rede de segurança: a resposta composta ----------------------------
      //
      // Chega aqui quem não gerou: sem chave, teto do mês estourado, rede fora,
      // modelo recusando, validação recusando duas vezes. A composta não
      // depende de modelo nenhum e não pode falhar — é por isso que ela não foi
      // removida quando a geração virou o padrão.
      if (!gerada && !bruta) {
        try {
          const res = await fetch('/api/busca', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ q, lei: escopo, qtd }),
          })
          bruta = (await res.json()) as RespostaBusca
        } catch (e) {
          bruta = {
            consulta: q,
            lei: escopo,
            intencao: { molde: 'aberta', sinal: 'rede' },
            itens: [],
            direta: false,
            vetor: false,
            aviso: null,
            erro: e instanceof Error ? e.message : 'falha de rede',
            ms: 0,
          }
        }
      }

      const crua = bruta!
      const comp = gerada ?? comporResposta(crua)
      const total = comp.paras.reduce((a, p) => a + p.t.length, 0)

      // Guarda a troca assim que a resposta chega, e não quando a digitação
      // termina: quem fecha a aba no meio da animação não deve perder a
      // pergunta. Guarda a busca crua E a prosa gerada — a composta é derivada e
      // se reconstrói igual, mas a gerada não: reabrir a conversa e encontrar
      // outro texto seria pior que não ter histórico.
      void registra(conversaRef.current, { pergunta: q, bruta: crua, gerada }).then((id) => {
        if (id) conversaRef.current = id
      })

      if (gerada) {
        // O texto já foi revelado enquanto chegava. A prévia sai de cena e dá
        // lugar ao objeto validado, com os superíndices e as fontes.
        pararRelogios()
        mutar(() => ({
          comp,
          achados: crua.itens,
          passos: comp.passos,
          passo: comp.passos.length,
          digitado: total,
          total,
          pronto: true,
          aoVivo: { estado: 'pronto', previa: '', erro: null, modelo },
        }))
        setOcupado(false)
        // No caminho gerado o texto já foi revelado enquanto chegava, então não
        // há digitação para esperar: o anúncio é aqui, e não em `digitar`.
        anunciarPronto({ ...vazia(q, { lei: escopo, qtd }), comp })
        return
      }

      mutar(() => ({
        comp,
        achados: crua.itens,
        passos: comp.passos,
        total,
        aoVivo: motivo ? { estado: 'falhou', previa: '', erro: motivo, modelo: null } : null,
      }))

      // Deixa os passos terminarem de aparecer antes de começar a digitar — a
      // sobreposição das duas animações é o que faz a tela parecer atropelada.
      // O último passo pode não ser da assistente se a tela foi limpa no meio;
      // sem o `?? 0` a subtração vira NaN e o `setTimeout` dispara na hora.
      const ultima = msgsRef.current[msgsRef.current.length - 1]
      const passoAtual = ultima?.papel === 'assistente' ? ultima.passo : 0
      const restantes = Math.max(0, comp.passos.length - passoAtual)

      esperaT.current = setTimeout(() => {
        esperaT.current = null
        if (!vivo.current) return
        if (passoT.current) clearInterval(passoT.current)
        passoT.current = null
        mutar((x) => ({ passo: x.passos.length }))
        digitar()
      }, restantes * MS_POR_PASSO)
    },
    [anunciarPronto, digitar, escopo, mutar, ocupado, pararRelogios, qtd],
  )

  // Conversa que veio na URL (?c=…) — é como a lateral devolve o usuário a um
  // chat anterior. Reconstrói as mensagens a partir das trocas gravadas, já
  // "prontas": reanimar a digitação de uma resposta que o usuário já leu seria
  // fazê-lo esperar de novo por algo que ele veio reler.
  //
  // **O guarda é o id pedido, e não um booleano.** Era `jaCarregou`, ligado na
  // primeira leitura e nunca mais desligado — e trocar de conversa na lateral
  // navega de `?c=A` para `?c=B` sem desmontar esta tela: o prop muda, o efeito
  // roda de novo e caía fora na primeira linha. O usuário clicava em qualquer
  // item do histórico e continuava lendo o primeiro que abriu, sem erro nenhum
  // na tela dizendo o contrário.
  const carregada = useRef<string | null>(null)
  useEffect(() => {
    // "Nova consulta" tira o `?c=` da URL. Soltar o guarda aqui é o que permite
    // reabrir depois a MESMA conversa que estava aberta antes.
    if (!conversaInicial) {
      carregada.current = null
      return
    }
    if (carregada.current === conversaInicial) return
    carregada.current = conversaInicial

    // Trocar de conversa no meio de uma resposta: derruba a requisição e os
    // relógios antes de trocar a tela, senão a digitação da conversa velha
    // segue correndo sobre as mensagens da nova. Não é `parar()`: aquele
    // devolve a pergunta à caixa e tira as duas últimas mensagens, que é o
    // certo para quem desiste e o errado para quem só mudou de conversa.
    cancelado.current = true
    aborto.current?.abort()
    aborto.current = null
    pararRelogios()
    setOcupado(false)
    setPainel(null)
    // A tela esvazia agora, e não quando a leitura voltar: se ela falhar, o que
    // fica é um chat vazio, e não a conversa anterior fingindo ser a pedida.
    setMsgs([])
    // Solto também, pelo mesmo motivo: com o id velho aqui, a próxima pergunta
    // seria gravada como continuação da conversa que o usuário acabou de deixar.
    conversaRef.current = null

    void busca(conversaInicial).then((c) => {
      // Conversa apagada, de outro usuário, ou banco fora: começa vazia. Não é
      // erro de tela — é o histórico não estar disponível.
      if (!c || !vivo.current) return
      // Dois cliques seguidos no histórico: a leitura que volta por último pode
      // ser a da conversa que já não é a pedida. Quem manda é o guarda.
      if (carregada.current !== conversaInicial) return

      conversaRef.current = c.id
      setMsgs(
        c.conteudo.flatMap((t): Msg[] => {
          const comp = t.gerada ?? comporResposta(t.bruta)
          const total = comp.paras.reduce((a, p) => a + p.t.length, 0)
          return [
            { papel: 'usuario', texto: t.pergunta },
            {
              papel: 'assistente',
              pergunta: t.pergunta,
              // O escopo está gravado na busca crua; a quantidade pedida não —
              // o histórico guarda os itens que voltaram, que podem ser menos.
              // Nulo devolve a regeneração ao padrão do servidor, em vez de
              // inventar um número a partir do tamanho da lista.
              params: { lei: t.bruta.lei, qtd: null },
              comp,
              achados: t.bruta.itens,
              passos: comp.passos,
              passo: comp.passos.length,
              digitado: total,
              total,
              pronto: true,
              aoVivo: t.gerada ? { estado: 'pronto', previa: '', erro: null, modelo: null } : null,
            },
          ]
        }),
      )
    })
  }, [conversaInicial, pararRelogios])

  // Pergunta que veio na URL (?p=…) — é como a lateral, a paleta do ⌘K e os
  // atalhos de outras telas chegam aqui. Dispara uma vez só.
  // Guarda pela pergunta, pelo mesmo motivo do `?c=` acima: com um booleano,
  // ir de `?p=furto` para `?p=roubo` — dois cliques em rubricas diferentes —
  // não disparava a segunda.
  const disparada = useRef<string | null>(null)
  useEffect(() => {
    if (!perguntaInicial || conversaInicial) return
    if (disparada.current === perguntaInicial) return
    disparada.current = perguntaInicial
    void enviar(perguntaInicial)
  }, [conversaInicial, enviar, perguntaInicial])

  // "Nova consulta" da lateral funciona mesmo já estando nesta tela.
  useEffect(() => {
    const limpar = () => {
      pararRelogios()
      setMsgs([])
      setOcupado(false)
      setPainel(null)
      setRascunho('')
      // Conversa nova de verdade: solta o id. A próxima resposta cria uma
      // conversa no banco; sem isto, ela seria gravada como continuação do chat
      // que o usuário acabou de fechar.
      conversaRef.current = null
    }
    window.addEventListener(EVENTO_NOVA, limpar)
    return () => window.removeEventListener(EVENTO_NOVA, limpar)
  }, [pararRelogios])

  // Rolagem acompanha a digitação. `block: 'end'` e não `scrollIntoView()` seco:
  // o segundo centraliza e faz a conversa pular para o meio da tela.
  //
  // Só com conversa na tela. Sem a guarda, a tela de abertura também era rolada
  // até o fim ao abrir: numa janela de 320px ela é mais alta que a área, e a
  // Consulta nascia com `scrollTop = 315` de 321 — o "Boa tarde." em
  // `top: -161`, fora da vista, e as sugestões de primeira pergunta com ele.
  // Quem abria o produto no celular pequeno chegava no rodapé da tela inicial.
  //
  // Reabrir conversa pelo `?c=` continua descendo, que é o certo: ali o fim é
  // onde a leitura para.
  useEffect(() => {
    if (msgs.length === 0) return
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs])

  const abrirFonte = useCallback((achados: Achado[], id: string) => {
    setPainel({ achados, id })
  }, [])

  return (
    <div className="flex min-h-0 flex-1">
      {/*
        A região viva da tela, e a única. Fica montada sempre, vazia quase
        sempre: região viva que nasce e morre com o estado que anuncia não
        anuncia nada — o navegador precisa dela já presente para notar que o
        conteúdo mudou. Era esse o defeito: o "Consultando o corpus curado"
        vivia dentro do bloco de espera e sumia junto com ele, e a chegada da
        resposta passava em silêncio.

        `role="status"` em vez de `aria-live="assertive"`: a resposta não
        interrompe o que a pessoa estiver lendo, entra na primeira folga.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-1.5 pt-[30px] sm:px-[34px]">
          <div className="mx-auto flex max-w-[690px] flex-col gap-[26px]">
            {msgs.length === 0 && <Abertura saudacao={saudacao} />}

            {msgs.map((m, i) =>
              m.papel === 'usuario' ? (
                <div key={i} className="tg-entra flex justify-end">
                  <p className="max-w-[76%] rounded-[20px_20px_6px_20px] bg-tg-acento px-[17px] py-3 text-[14px] leading-[1.55] text-[#fdf2f3] shadow-[0_6px_18px_-10px_rgb(179_20_31_/_0.75)]">
                    {m.texto}
                  </p>
                </div>
              ) : (
                <Resposta
                  key={i}
                  m={m}
                  aoAbrirFonte={abrirFonte}
                  aoSugerir={enviar}
                  aoGerarAoVivo={() => void gerarAoVivo(i)}
                />
              ),
            )}

            <div ref={fim} className="h-1.5" />
          </div>
        </div>

        <Entrada
          rascunho={rascunho}
          aoDigitar={setRascunho}
          aoEnviar={enviar}
          ocupado={ocupado}
          escopo={escopo}
          aoTrocarEscopo={setEscopo}
          qtd={qtd}
          aoTrocarQtd={setQtd}
          aoParar={parar}
        />
      </div>

      {painel && (
        <PainelFonte
          achados={painel.achados}
          id={painel.id}
          aoTrocar={(id) => setPainel((p) => (p ? { ...p, id } : p))}
          aoFechar={() => setPainel(null)}
        />
      )}
    </div>
  )
}

// --- abertura ----------------------------------------------------------------

function Abertura({ saudacao }: { saudacao: string }) {
  return (
    <div className="tg-sobe-lento pb-[18px] pt-16">
      <h1 className="font-tg-serif text-[30px] leading-[1.25] -tracking-[0.01em] text-tg-tinta">
        {saudacao}
      </h1>
      <p className="mt-2 max-w-[440px] text-[15px] leading-[1.6] text-tg-fraco">
        Pergunte em linguagem natural. Eu leio o corpus curado — Lei 11.343, Código Penal e Código
        de Processo Penal —, mostro de onde tirei cada citação e digo a data da redação.
      </p>
    </div>
  )
}

/**
 * Esqueleto da resposta, enquanto os passos correm.
 *
 * Vale a regra da tela de Fontes — esqueleto só onde a espera existe —, e aqui
 * ela existe: entre a pergunta e o primeiro parágrafo há a busca, e no caminho
 * ao vivo há a geração inteira. Os passos já diziam o que estava acontecendo,
 * mas ocupavam a altura de cinco linhas e deixavam o resto da coluna em branco:
 * o olho não tinha onde pousar, e branco parado passa por travado.
 *
 * A forma é a da resposta que vem, como em `Esqueletos` da Jurisprudência — as
 * quatro barras têm a altura de linha do parágrafo em serifa, e os dois blocos
 * de baixo têm o raio, o fundo e a sombra do cartão de fonte. É essa imitação
 * que faz o texto parecer chegando em vez de barras cinzas piscando.
 *
 * **Não promete quantidade.** Duas fontes desenhadas não são previsão de duas
 * fontes recuperadas — quem conta é o passo "Lendo o texto dos dispositivos",
 * com o número que a busca devolveu. `aria-hidden` porque não há o que ler
 * aqui: quem anuncia a chegada é a região viva fixa, que sobrevive às duas
 * pontas da espera.
 */
function EsqueletoDaResposta() {
  return (
    <div aria-hidden="true" className="tg-entra mt-[18px]">
      <div className="flex flex-col gap-[9px]">
        <Esqueleto className="h-[13px]" />
        <Esqueleto className="h-[13px] w-[95%]" />
        <Esqueleto className="h-[13px] w-[88%]" />
        <Esqueleto className="h-[13px] w-[54%]" />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-[11px] rounded-[14px] bg-white px-[13px] py-[11px] shadow-[var(--tg-elev-1)]"
          >
            <Esqueleto className="size-[19px] shrink-0 rounded-[7px]" />
            <Esqueleto className="h-[11px] w-[92px] shrink-0" />
            <Esqueleto className="h-[11px] w-[136px]" />
            <span className="flex-1" />
            <Esqueleto className="h-[17px] w-[58px] shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// --- resposta ----------------------------------------------------------------

function Resposta({
  m,
  aoAbrirFonte,
  aoSugerir,
  aoGerarAoVivo,
}: {
  m: MsgAssistente
  aoAbrirFonte: (achados: Achado[], id: string) => void
  aoSugerir: (t: string) => void
  aoGerarAoVivo: () => void
}) {
  const pensando = m.passo > 0 && m.digitado === 0

  // Fatia os parágrafos pelo total já "digitado", como no documento: o texto é
  // um só fluxo, e o cursor cai onde a contagem parou.
  const paras = useMemo(() => {
    if (!m.comp) return []
    let resto = m.digitado
    const saida: { texto: string; cite: string | null; cursor: boolean }[] = []
    for (const p of m.comp.paras) {
      const visivel = Math.max(0, Math.min(p.t.length, resto))
      resto -= p.t.length
      if (visivel > 0) {
        saida.push({
          texto: p.t.slice(0, visivel),
          cite: p.cite && visivel === p.t.length ? p.cite : null,
          cursor: !m.pronto && visivel < p.t.length,
        })
      }
    }
    return saida
  }, [m.comp, m.digitado, m.pronto])

  return (
    <div className="tg-entra">
      <div className="flex gap-[13px]">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-[10px] font-tg-serif text-[10px] font-semibold tracking-[0.01em] text-white shadow-[0_3px_10px_-4px_rgb(179_20_31_/_0.6)]"
          style={{ background: GRADIENTE_MARCA }}
        >
          {MARCA.inicial}
        </span>

        <div className="min-w-0 flex-1">
          {pensando && (
            <div className="pt-1">
              <div className="mb-[13px] flex items-center gap-[9px]">
                <span aria-hidden="true" className="flex gap-[3px]">
                  {[0, 0.15, 0.3].map((d) => (
                    <span
                      key={d}
                      className="size-[5px] rounded-full bg-tg-acento-medio"
                      style={{ animation: `tgDot 1.1s ${d}s infinite` }}
                    />
                  ))}
                </span>
                {/* Sem `aria-live` aqui: este nó nasce com a espera e morre com
                    ela, e região viva que desmonta não anuncia o fim de nada —
                    era exatamente por isso que a chegada da resposta passava em
                    silêncio. Quem anuncia é a região fixa lá embaixo, que
                    sobrevive às duas pontas. */}
                <span className="text-[12.5px] font-medium text-tg-suave">
                  Consultando o corpus curado
                </span>
              </div>

              <div className="flex flex-col gap-[9px]">
                {m.passos.slice(0, m.passo).map((s, j) => {
                  const feito = j < m.passo - 1
                  return (
                    <div key={s.t} className="tg-sobe flex items-center gap-2.5">
                      <span
                        className="grid size-4 shrink-0 place-items-center rounded-full"
                        style={{ background: feito ? 'var(--color-tg-verde)' : ACENTO_CLARO }}
                      >
                        {feito ? (
                          <Visto />
                        ) : (
                          <Girador
                            tamanho={9}
                            espessura={1.6}
                            trilho="rgba(255,255,255,.45)"
                            cabeca="#fff"
                          />
                        )}
                      </span>
                      <span className="text-[12.5px] text-tg-corpo-2">{s.t}</span>
                      <span className="text-[11.5px] text-tg-tenue">{s.meta}</span>
                    </div>
                  )
                })}
              </div>

              {/* Some no primeiro token do caminho ao vivo: dali em diante quem
                  ocupa a coluna é a prévia de verdade, logo abaixo, e esqueleto
                  ao lado de texto que já chegou é espera anunciada duas vezes. */}
              {!m.aoVivo?.previa && <EsqueletoDaResposta />}
            </div>
          )}

          {/*
            Prévia do caminho ao vivo. Fica no lugar da resposta enquanto o JSON
            do modelo não fechou — e some inteira quando ele fecha e passa na
            validação, substituída pelo objeto validado. Sem superíndice: um
            marcador de citação antes de a validação confirmar que a fonte existe
            é exatamente o que este projeto não faz.
          */}
          {m.aoVivo?.estado === 'gerando' && (
            <div className="tg-entra">
              {/*
                Sem o nome do modelo, e é a mesma decisão que já tinha tirado o
                nome fixo do aviso de origem — aplicada onde ela não tinha
                chegado. Esta linha dizia `claude-opus-5` escrito à mão, e
                continuou dizendo depois da troca de provedor: durante os nove
                segundos de geração a tela nomeava um modelo enquanto quem
                redigia era o de `OPENAI_MODEL`. Quem nomeia é o aviso do fim,
                com o valor que veio no evento `fim`.

                Nomear aqui exigiria o servidor mandar o modelo num evento
                anterior — `aoVivo.modelo` só existe em `pronto`, de propósito,
                porque é o fim que sabe qual modelo respondeu. Não vale um
                evento novo: o passo já diz o que está acontecendo, e a resposta
                inteira leva o nome logo abaixo.
              */}
              <div className="mb-2 flex items-center gap-2">
                <Girador tamanho={11} />
                <span className="text-[11.5px] font-medium text-tg-acento-txt">
                  Redigindo com o contexto recuperado
                </span>
              </div>
              {m.aoVivo.previa
                .split('\n\n')
                .filter((t) => t.trim())
                .map((t, j) => (
                  <p
                    key={j}
                    className="mb-[13px] font-tg-serif text-[15px] leading-[1.72] text-tg-tinta-2"
                  >
                    {t}
                  </p>
                ))}
              <span
                aria-hidden="true"
                className="tg-cursor inline-block h-4 w-0.5 translate-y-[3px] bg-tg-acento-medio"
              />
            </div>
          )}

          {paras.length > 0 && m.aoVivo?.estado !== 'gerando' && (
            <div>
              {paras.map((p, j) => (
                /* `tg-chega`: aqui a prévia do streaming é descartada e o objeto
                   validado entra de uma vez. Sem o desfoque que zera em 500ms, a
                   troca é um pisco. O atraso escalonado dos três primeiros é o
                   ritmo da leitura, não o tempo da rede — do quarto em diante
                   todos usam o mesmo, senão o fim de uma resposta longa chegaria
                   depois de o usuário já ter começado a ler. */
                <p
                  key={j}
                  className={`${['tg-chega', 'tg-chega-2', 'tg-chega-3'][Math.min(j, 2)]} mb-[13px] font-tg-serif text-[15px] leading-[1.72] text-tg-tinta-2`}
                >
                  {p.texto}
                  {p.cite && (
                    <span className="tg-pipoca ml-[5px] inline-flex h-[17px] min-w-[17px] translate-y-[2px] items-center justify-center rounded-md bg-tg-acento-fraco text-[10px] font-semibold leading-none text-tg-acento-txt">
                      {p.cite}
                    </span>
                  )}
                  {p.cursor && (
                    <span
                      aria-hidden="true"
                      className="tg-cursor ml-0.5 inline-block h-4 w-0.5 translate-y-[3px] bg-tg-acento-medio"
                    />
                  )}
                </p>
              ))}
            </div>
          )}

          {m.pronto && m.comp && (
            <Rodape
              m={m}
              comp={m.comp}
              aoAbrirFonte={aoAbrirFonte}
              aoSugerir={aoSugerir}
              aoGerarAoVivo={aoGerarAoVivo}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Dosimetria estimada a partir da conversa.
 *
 * Fica recolhido por padrão e disponível em TODA resposta, porque a pergunta que
 * o advogado faz raramente diz "calcule a pena" — ele pergunta sobre o § 4º e a
 * pena é a consequência que ele quer ver. Um cartão que só aparecesse quando a
 * pergunta contivesse a palavra certa erraria justamente nesses casos.
 *
 * A conta vem de `lib/toga/dosimetria.ts`, a MESMA que a tela de Dosimetria usa.
 * Os chips mostram o que foi reconhecido no texto — e o que não foi reconhecido
 * não vira suposição: fica no padrão, e o rodapé diz que é estimativa.
 */
/**
 * Onde ler a doutrina, quando a pergunta pede doutrina.
 *
 * O molde vem de `classifica()`, chamado aqui sobre a pergunta — a mesma função
 * que o servidor usa, e pela mesma razão que `CartaoDosimetria` lê os fatos da
 * conversa: é regra pura em TS, determinística, e roda igual dos dois lados.
 * Guardar o molde na mensagem seria um segundo estado para divergir do primeiro.
 *
 * Aparece SÓ no molde `doutrina`, e não é enfeite: é a metade da regra do
 * projeto que nunca tinha sido implementada — recusar a reprodução e **apontar a
 * fonte**. O link não colhe nem guarda nada; abre a busca no repositório.
 */
function PainelDeDoutrina({ pergunta }: { pergunta: string }) {
  const fontes = useMemo(() => {
    if (classifica(pergunta).molde !== 'doutrina') return []
    return fontesDeDoutrina(pergunta)
  }, [pergunta])

  if (fontes.length === 0) return null

  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-tg-linha bg-white">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
        <span className="text-[13px] font-medium text-tg-tinta">Onde ler a doutrina</span>
        <Selo tom="neutro">fora do acervo</Selo>
      </div>
      <p className="px-4 pb-3 text-[12px] leading-[1.55] text-tg-fraco-2">
        Livro e artigo são obra protegida, e este produto não os hospeda nem os resume. O
        endereço abaixo abre a busca pelo seu termo no repositório, na fonte.
      </p>
      <ul className="border-t border-tg-linha-tenue">
        {fontes.map((f) => (
          <li key={f.url} className="border-b border-tg-linha-tenue last:border-0">
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="tgb flex flex-col gap-0.5 px-4 py-3 hover:bg-tg-preenche"
            >
              <span className="text-[13px] font-medium text-tg-acento-txt underline decoration-tg-acento-palido underline-offset-2">
                {f.nome} ↗
              </span>
              <span className="text-[11.5px] text-tg-fraco-2">{f.nota}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A dosimetria da resposta.
 *
 * Aparece em toda pergunta **de tráfico**, e não só nas que pedem cálculo: o
 * advogado pergunta pelo § 4º e quer ver a pena que sai dali. O que mudou é o
 * "de tráfico" — a calculadora dosa o art. 33 e mais nada, e sob uma resposta
 * sobre o art. 217-A ou o art. 157 ela exibia o selo "art. 33 · 5 a 15 anos"
 * com uma pena que não é a do crime perguntado. Ver `dosavel`.
 */
function CartaoDosimetria({ pergunta }: { pergunta: string }) {
  const [aberto, setAberto] = useState(false)
  const { entrada, chips, crime } = useMemo(() => leDaConversa(pergunta), [pergunta])
  const c = useMemo(() => calcula(entrada, crime), [entrada, crime])

  if (!dosavel(pergunta)) return null

  const fases = [
    { k: '1ª fase', nome: 'Pena-base', v: meses(c.base), d: `${c.negativos} circunstância${c.negativos === 1 ? '' : 's'} desfavorável${c.negativos === 1 ? '' : 'eis'}` },
    { k: '2ª fase', nome: 'Provisória', v: meses(c.provisoria), d: 'agravantes e atenuantes' },
    { k: '3ª fase', nome: 'Definitiva', v: meses(c.definitiva), d: 'causas de aumento e diminuição' },
  ]

  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-tg-linha bg-white">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="tgb flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-tg-preenche"
      >
        <span className="text-[13px] font-medium text-tg-tinta">Dosimetria estimada</span>
        {/* O selo sempre nomeou o artigo; o que mudou é ele dizer a verdade
            quando a pergunta é de associação ou de financiamento, em vez de
            carimbar o art. 33 sobre a pena de outro crime. */}
        <Selo tom="acento">
          {crime.citacao} · {crime.minimo / 12} a {crime.maximo / 12} anos
        </Selo>
        <span className="flex-1" />
        <span className="text-[12.5px] tabular-nums text-tg-acento-txt">{meses(c.definitiva)}</span>
        <span aria-hidden="true" className={`text-[11px] text-tg-fraco-3 transition-transform ${aberto ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {/*
        Abre com a altura real, por `grid-template-rows: 0fr → 1fr`. Antes o
        conteúdo era montado e desmontado, e o cartão saltava de 48px para 300px
        num quadro só — o que empurra a conversa inteira para baixo sem que o
        olho acompanhe. `max-height` chutado alto faria o fechamento parecer
        lento; a grade mede sozinha.

        `inert` quando fechado é o que impede o conteúdo escondido de continuar
        no caminho do Tab e na leitura do leitor de tela. Sem ele, animar em vez
        de desmontar seria trocar um salto visual por um defeito de acesso.
      */}
      <div className="tg-abre" data-aberto={aberto ? 'sim' : 'nao'}>
        <div inert={!aberto}>
          <div className="border-t border-tg-linha-fraca px-4 pb-4 pt-3">
            {chips.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {chips.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-tg-acento-fraco px-2 py-0.5 text-[11.5px] text-tg-acento-txt"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-[12px] leading-relaxed text-tg-fraco-3">
                Nada de dosimetria foi reconhecido nesta pergunta — abaixo está o mínimo do caput,
                sem atenuante nem causa de diminuição suposta. Escreva fatos como “réu primário”,
                “confessou”, “reincidente” ou “grande quantidade” para o cartão lê-los.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {fases.map((f) => (
                <div key={f.k} className="rounded-lg bg-tg-preenche px-3 py-2.5">
                  <p className="text-[10.5px] uppercase tracking-wider text-tg-fraco-3">{f.k}</p>
                  <p className="mt-0.5 text-[15px] font-medium tabular-nums text-tg-tinta">{f.v}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-tg-fraco-3">{f.d}</p>
                </div>
              ))}
            </div>

            <div
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3"
              style={{ background: GRADIENTE_RESULTADO }}
            >
              <span className="font-tg-serif text-[20px] leading-none text-white">
                {meses(c.definitiva)}
              </span>
              <span className="text-[11.5px] text-white/70">
                regime inicial {c.regime}
                {c.abaixoDoMinimo ? ' · abaixo do mínimo pelo § 4º' : ''}
              </span>
              <span className="flex-1" />
              <Link
                href="/dosimetria"
                className="rounded-lg bg-white/95 px-2.5 py-1.5 text-[11.5px] font-medium text-tg-acento-txt hover:bg-white"
              >
                Abrir na ferramenta →
              </Link>
            </div>

            <p className="mt-2.5 text-[11px] leading-relaxed text-tg-tenue-2">
              Estimativa, não parecer. Usa as frações majoritárias (1/8 do intervalo por
              circunstância, art. 42 com peso dobrado) e respeita a Súmula 231 na segunda fase. O
              regime sai das faixas do art. 33, § 2º, do CP, sem a fundamentação concreta que as
              Súmulas 440/STJ e 719/STF exigem.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Rodape({
  m,
  comp,
  aoAbrirFonte,
  aoSugerir,
  aoGerarAoVivo,
}: {
  m: MsgAssistente
  comp: RespostaComposta
  aoAbrirFonte: (achados: Achado[], id: string) => void
  aoSugerir: (t: string) => void
  aoGerarAoVivo: () => void
}) {
  return (
    <div className="tg-sobe">
      {comp.fontes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {comp.fontes.map((f) => (
            <CartaoFonte key={f.id} f={f} aoAbrir={() => aoAbrirFonte(m.achados, f.id)} />
          ))}
        </div>
      )}

      <CartaoDosimetria pergunta={m.pergunta} />
      <PainelDeDoutrina pergunta={m.pergunta} />

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Confianca n={comp.primarias} />
        <span aria-hidden="true" className="h-3.5 w-px bg-[#e2e4ea]" />
        {comp.vigencia && (
          <span className="text-[11.5px] text-tg-fraco-3">Redação de {comp.vigencia}</span>
        )}
        <span className="flex-1" />
        <Link
          href="/pecas"
          title="A minuta em DOCX é gerada na tela de Peças, a partir das teses curadas."
          className="tgb rounded-full bg-white px-3.5 py-[7px] text-[12px] font-medium text-tg-corpo shadow-[var(--tg-elev-1f)] hover:shadow-[var(--tg-elev-3)]"
        >
          Exportar .docx
        </Link>
        <Link
          href="/dosimetria"
          className="tgb rounded-full bg-tg-acento px-3.5 py-[7px] text-[12px] font-medium text-white shadow-[var(--tg-elev-acento)]"
        >
          Calcular dosimetria
        </Link>
      </div>

      {/*
        No documento este aviso diz "Resposta gerada por IA". Aqui ele diz qual
        dos dois caminhos produziu ESTA resposta — e é por isso que ele tem duas
        redações. Manter a frase "nenhum parágrafo foi escrito por modelo" numa
        resposta gerada ao vivo seria mentir na única linha da tela que existe
        para não mentir.
      */}
      <div className="mt-3.5 flex items-start gap-[9px] rounded-[13px] bg-tg-preenche px-3.5 py-2.5">
        <span
          aria-hidden="true"
          className="mt-px grid size-[15px] shrink-0 place-items-center rounded-full border-[1.4px] border-tg-ambar-borda text-[10px] font-semibold text-tg-ambar-txt"
        >
          !
        </span>
        <p className="text-[11.5px] leading-[1.5] text-tg-fraco">
          {m.aoVivo?.estado === 'pronto' ? (
            <>
              A argumentação acima foi escrita{' '}
              {m.aoVivo.modelo && (
                <>
                  por <strong className="font-medium">{m.aoVivo.modelo}</strong>{' '}
                </>
              )}
              a partir dos {m.achados.length} dispositivos que a busca recuperou do acervo —{' '}
              <strong className="font-medium">sem consultar a internet</strong>. O modelo não tem
              acesso à rede nesta rota: ele recebe o texto extraído do Vade Mecum do Senado, e o
              servidor recusa a resposta se ela citar id que não veio da busca. Texto legal,
              vigência e cobertura continuam vindo do banco. Confira o inteiro teor antes de
              peticionar.
            </>
          ) : (
            <>
              Nenhum parágrafo acima foi escrito por modelo — são fatos sobre a busca. O texto legal
              vem do banco, sem intermediário. Confira o inteiro teor antes de peticionar.
            </>
          )}
        </p>
      </div>

      {/*
        O botão opcional que o CLAUDE.md sempre previu. Fica no fim, discreto, e
        o produto funciona inteiro sem ele: a resposta que está na tela já é a
        resposta. Falha aqui não apaga nada — só escreve o motivo ao lado.
      */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={aoGerarAoVivo}
          disabled={m.aoVivo?.estado === 'gerando'}
          title="Reescreve a argumentação com o Claude, usando só os dispositivos já recuperados. Limitado por teto mensal."
          className="tgb inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-[6px] text-[11.5px] font-medium text-tg-corpo shadow-[var(--tg-elev-1f)] hover:shadow-[var(--tg-elev-3)] disabled:cursor-not-allowed disabled:text-tg-tenue"
        >
          {m.aoVivo?.estado === 'gerando' ? (
            <>
              <Girador tamanho={10} /> Gerando…
            </>
          ) : m.aoVivo?.estado === 'pronto' ? (
            'Gerar de novo'
          ) : (
            'Gerar ao vivo'
          )}
        </button>

        {m.aoVivo?.estado === 'falhou' && (
          <span className="text-[11.5px] leading-[1.45] text-tg-ambar-txt">
            Não foi possível gerar ao vivo ({m.aoVivo.erro}). A resposta acima é a composta, e ela
            não depende de modelo nenhum.
          </span>
        )}
      </div>

      {comp.sugestoes.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-[7px]">
          {comp.sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => aoSugerir(s)}
              className="tgb rounded-full bg-tg-acento-fraco px-3.5 py-[7px] text-[12px] text-tg-acento-txt hover:bg-tg-acento-fraco-3"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CartaoFonte({ f, aoAbrir }: { f: Fonte; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="tgb flex items-center gap-[11px] rounded-[14px] bg-white px-[13px] py-[11px] text-left shadow-[var(--tg-elev-1)] hover:shadow-[var(--tg-elev-3)]"
    >
      <span className="grid size-[19px] shrink-0 place-items-center rounded-[7px] bg-tg-acento-fraco text-[10px] font-semibold text-tg-acento-txt">
        {f.n}
      </span>
      <span className="shrink-0 text-[13px] font-medium text-tg-tinta-2">{f.titulo}</span>
      <span className="truncate text-[12px] text-tg-fraco-2">{f.sub}</span>
      <span className="flex-1" />
      <Selo tom={f.tom}>{f.selo}</Selo>
      <span aria-hidden="true" className="shrink-0 text-[13px] text-tg-tenue-2">
        ›
      </span>
    </button>
  )
}

/** Medidor de quatro traços. Cheio = quantas fontes vieram sem ressalva. */
function Confianca({ n }: { n: number }) {
  const cheios = Math.min(4, n)
  return (
    <span className="flex items-center gap-[7px]">
      <span aria-hidden="true" className="flex gap-[2.5px]">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 w-3.5 rounded-sm"
            style={{ background: i < cheios ? 'var(--color-tg-acento-medio)' : '#dcdde4' }}
          />
        ))}
      </span>
      <span className="text-[11.5px] font-medium text-tg-suave">
        {cheios === 0
          ? 'Sem fonte primária'
          : `${cheios} ${cheios === 1 ? 'fonte primária' : 'fontes primárias'} do corpus`}
      </span>
    </span>
  )
}

// --- entrada -----------------------------------------------------------------

function Entrada({
  rascunho,
  aoDigitar,
  aoEnviar,
  ocupado,
  escopo,
  aoTrocarEscopo,
  qtd,
  aoTrocarQtd,
  aoParar,
}: {
  rascunho: string
  aoDigitar: (v: string) => void
  aoEnviar: (t: string) => void
  ocupado: boolean
  /** Desiste da consulta em curso. Ver `parar`, na tela. */
  aoParar: () => void
  escopo: string | null
  aoTrocarEscopo: (v: string | null) => void
  qtd: number
  aoTrocarQtd: (n: number) => void
}) {
  return (
    <div className="shrink-0 bg-gradient-to-b from-transparent to-tg-fundo to-[42%] px-5 pb-[22px] pt-3 sm:px-[34px]">
      <div className="mx-auto max-w-[690px]">
        <div className="mb-[9px] flex flex-wrap gap-1.5">
          {ESCOPOS.map((e) => {
            const ativo = escopo === e.id
            return (
              <button
                key={e.id}
                type="button"
                title={e.nota}
                onClick={() => aoTrocarEscopo(ativo ? null : e.id)}
                aria-pressed={ativo}
                className={`tgb flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1.5 text-[11.5px] font-medium shadow-[var(--tg-elev-1)] ${
                  ativo ? 'bg-tg-acento-fraco text-tg-acento-txt' : 'bg-white text-tg-suave'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: ativo ? ACENTO_CLARO : '#d5d7de' }}
                />
                {e.t}
              </button>
            )
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            aoEnviar(rascunho)
          }}
          className="rounded-[22px] bg-white px-4 pb-[11px] pt-3.5 shadow-[var(--tg-elev-entrada)]"
        >
          <input
            value={rascunho}
            onChange={(e) => aoDigitar(e.target.value)}
            placeholder="Pergunte pelo apelido do instituto, pelo artigo ou cole um trecho da denúncia…"
            aria-label="Sua consulta"
            className="w-full bg-transparent text-[14.5px] leading-[1.5] text-tg-tinta outline-none placeholder:text-tg-tenue-2"
          />

          <div className="mt-[13px] flex items-center gap-[7px]">
            <button
              type="button"
              onClick={() => aoTrocarQtd(qtd === 4 ? 8 : qtd === 8 ? 12 : 4)}
              title="Quantos dispositivos a busca devolve ao modelo — a resposta cita no máximo quatro"
              className="tgb rounded-full bg-tg-preenche px-[11px] py-1.5 text-[11.5px] text-tg-suave hover:bg-tg-preenche-alto"
            >
              {qtd} resultados
            </button>
            <span
              title="Os JSONs são uma fotografia do Vade Mecum do Senado Federal, 1ª ed."
              className="hidden rounded-full bg-tg-preenche px-[11px] py-1.5 text-[11.5px] text-tg-suave sm:block"
            >
              Corte {dataBR(DATA_DE_CORTE)}
            </span>
            <span
              title="Doutrina é obra autoral protegida — ver a restrição no CLAUDE.md do projeto."
              className="hidden rounded-full bg-tg-preenche px-[11px] py-1.5 text-[11.5px] text-tg-tenue-2 md:block"
            >
              Sem doutrina
            </span>
            <span className="flex-1" />
            <span className="text-[11px] text-tg-tenue-2">
              {ocupado ? 'consultando…' : 'Enter para enviar'}
            </span>
            {/*
              Enquanto consulta, o botão de enviar vira botão de parar — e não um
              disco desabilitado com um girador dentro.

              A consulta leva ~9 s e não havia como desistir dela: nem tecla, nem
              botão. Quem percebia que tinha perguntado errado esperava a resposta
              inteira antes de poder perguntar de novo. Ele fica no MESMO lugar
              porque é o mesmo gesto — o dedo já está ali, e um segundo botão ao
              lado obrigaria a escolher entre dois discos vermelhos parecidos.

              O girador saiu do botão e não da tela: quem diz que há trabalho em
              curso continua sendo o "consultando…" ao lado e os passos acima.
            */}
            <button
              // `type="button"` SEMPRE, e o envio por clique passa a ser
              // explícito. Alternar para `submit` quando ocioso parece natural e
              // é uma armadilha: o clique em "parar" muda `ocupado` para falso,
              // o React reescreve o `type` para `submit` ainda dentro do
              // despacho do evento, e o navegador então executa a ação padrão do
              // botão que encontra AGORA — submetendo o formulário. Como `parar`
              // acabou de devolver a pergunta à caixa, ele reenviava exatamente
              // a consulta que o usuário mandou cancelar.
              //
              // Medido com sonda no render: depois do clique o estado ia para
              // `ocupado=false, msgs=0` (certo) e voltava para `ocupado=true,
              // msgs=2` no quadro seguinte. Parecia que o cancelamento não
              // funcionava; ele funcionava e era desfeito.
              //
              // O Enter continua enviando: quem cuida disso é o `onSubmit` do
              // formulário, que não depende deste botão.
              type="button"
              onClick={ocupado ? aoParar : () => aoEnviar(rascunho)}
              aria-label={ocupado ? 'Parar a consulta' : 'Enviar consulta'}
              className="tgb grid size-[34px] shrink-0 place-items-center rounded-full shadow-[var(--tg-elev-acento)]"
              style={{ background: ocupado ? ACENTO_CLARO : GRADIENTE_MARCA }}
            >
              {ocupado ? (
                <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-white" />
              ) : (
                <span
                  aria-hidden="true"
                  className="mb-0.5 size-2 rotate-[-45deg] border-r-2 border-t-2 border-white"
                />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- painel da fonte ---------------------------------------------------------

/**
 * Painel de 420px que desliza da direita.
 *
 * Não faz requisição: o `Achado` que veio da busca já traz texto, citação,
 * contexto, vigência e cobertura. Clicar numa fonte para ler o dispositivo é o
 * gesto mais frequente da tela, e ele tem de ser instantâneo.
 *
 * Onde o documento põe "Linha do tempo do dispositivo" com três redações, aqui
 * vai a procedência: de onde o texto saiu, que cobertura tem a lei e qual é o id
 * de citação. O produto não guarda redações anteriores — inventar uma linha do
 * tempo seria exatamente o tipo de dado plausível e falso que a decisão nº 3
 * existe para impedir.
 */
function PainelFonte({
  achados,
  id,
  aoTrocar,
  aoFechar,
}: {
  achados: Achado[]
  id: string
  aoTrocar: (id: string) => void
  aoFechar: () => void
}) {
  const atual = achados.find((a) => a.dispositivo_id === id) ?? achados[0]

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  if (!atual) return null

  return (
    <aside
      aria-label="Fonte citada"
      className="tg-desliza hidden w-[420px] shrink-0 flex-col border-l border-tg-linha bg-white xl:flex"
    >
      <div className="shrink-0 px-5 pt-4">
        <div className="mb-3.5 flex items-center gap-[9px]">
          <span className="text-[12px] font-medium text-tg-fraco-3">Fonte citada</span>
          <span className="flex-1" />
          <Link
            href={`/dispositivo/${atual.dispositivo_id}`}
            className="tgb text-[12px] font-medium text-tg-acento-txt"
          >
            Abrir dispositivo ↗
          </Link>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar painel"
            className="tgb grid size-6 place-items-center rounded-lg bg-tg-preenche text-tg-fraco-3 hover:bg-tg-hover"
          >
            ✕
          </button>
        </div>

        {achados.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-3.5">
            {achados.slice(0, 4).map((a) => {
              const ativo = a.dispositivo_id === atual.dispositivo_id
              return (
                <button
                  key={a.dispositivo_id}
                  type="button"
                  onClick={() => aoTrocar(a.dispositivo_id)}
                  className={`tgb shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium ${
                    ativo ? 'bg-tg-acento text-white' : 'bg-tg-preenche text-tg-corpo'
                  }`}
                >
                  {a.citacao}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto border-t border-tg-linha-fraca px-5 pb-6 pt-1">
        <div className="my-3.5 flex flex-wrap items-center gap-[7px]">
          <Selo tom={atual.revogado ? 'ambar' : 'verde'}>
            {atual.revogado ? 'Revogado' : 'Em vigor'}
          </Selo>
          {atual.cobertura === 'parcial' && (
            <Selo tom="ambar" title={atual.cobertura_nota ?? undefined}>
              Cobertura parcial
            </Selo>
          )}
          {atual.via_rubrica && atual.rubrica_termo && (
            <Selo tom="acento">rubrica “{atual.rubrica_termo}”</Selo>
          )}
          <span className="text-[11.5px] text-tg-tenue">{atual.lei_apelido}</span>
        </div>

        <h3 className="font-tg-serif text-[20px] leading-[1.3] text-tg-tinta">
          {atual.artigo_rubrica ?? atual.citacao}
        </h3>
        <p className="mb-[18px] mt-[5px] text-[12px] text-tg-fraco-3">
          {atual.citacao}
          {atual.capitulo ? ` · ${atual.capitulo}` : ''}
        </p>

        <div className="flex flex-col gap-3 font-tg-serif text-[14px] leading-[1.78] text-tg-tinta-4">
          <div
            className={`rounded-[14px] ${
              atual.via_rubrica ? 'bg-tg-acento-fraco px-[15px] py-[13px] text-tg-tinta-2' : ''
            }`}
          >
            <p>{atual.texto}</p>
            {atual.via_rubrica && atual.rubrica_termo && (
              <div className="mt-[9px] flex items-center gap-2">
                <span className="rounded-full bg-tg-acento-fraco-2 px-2 py-[3px] font-tg text-[10px] font-semibold text-tg-acento-txt">
                  Trecho citado
                </span>
                <span className="font-tg text-[11.5px] text-tg-fraco-2">
                  match exato de rubrica{atual.papel ? ` · ${atual.papel}` : ''}
                </span>
              </div>
            )}
          </div>

          {atual.capitulo && (
            <div className="rounded-[14px] bg-tg-fundo px-[15px] py-[13px]">
              <span className="font-tg text-[11px] font-medium text-tg-fraco-3">Contexto</span>
              <p className="mt-1">{atual.capitulo}</p>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl bg-tg-fundo px-4 py-[15px]">
          <p className="mb-3 text-[12px] font-medium text-tg-suave">Procedência do texto</p>
          <div className="flex flex-col gap-3">
            {[
              {
                // A data sai do próprio dispositivo, não de um literal: o painel
                // já tem o registro em mãos, e `vigencia_ate` é o que a decisão
                // nº 3 manda mostrar. Um `28/02/2025` escrito aqui continuaria
                // impresso sobre um artigo em redação posterior.
                chave: dataBR(atual.vigencia_ate),
                txt: 'Fotografia do Vade Mecum do Senado Federal, 1ª edição. É a data de corte do corpus inteiro.',
              },
              {
                chave: atual.cobertura === 'parcial' ? 'Parcial' : 'Integral',
                txt:
                  atual.cobertura === 'parcial'
                    ? (atual.cobertura_nota ??
                      'Só o subconjunto curado desta lei está no banco; a ausência de um artigo não significa que ele não exista.')
                    : 'Todos os artigos desta lei estão no banco, inclusive os revogados.',
              },
              {
                chave: 'id',
                txt: `${atual.dispositivo_id} — chave de citação estável, nunca renumerada.`,
              },
            ].map((l) => (
              <div key={l.chave} className="flex items-start gap-[11px]">
                <span className="w-[66px] shrink-0 text-[11px] font-medium text-tg-fraco-3">
                  {l.chave}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 size-[7px] shrink-0 rounded-full bg-tg-acento-palido"
                />
                <span className="text-[12.5px] leading-[1.5] text-tg-corpo">{l.txt}</span>
              </div>
            ))}
          </div>

          <Link
            href={`/dispositivo/${atual.dispositivo_id}`}
            className="tgb mt-3.5 block text-[12px] font-medium text-tg-acento-txt"
          >
            Ver o dispositivo com o texto bruto do parser →
          </Link>
        </div>
      </div>
    </aside>
  )
}
