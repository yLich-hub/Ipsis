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
// - A digitação é animação pura, 7 caracteres a cada 16 ms, exatamente como o
//   documento. O texto já chegou inteiro; ele é revelado, não gerado.
// - Os cartões de fonte e o painel lateral são dados do banco, sem uma segunda
//   ida à rede: `Achado` já traz texto, citação, vigência e cobertura, e clicar
//   numa fonte não deveria custar uma requisição.
//
// Por que a prosa não é gerada por modelo: ver o cabeçalho de `lib/toga/resposta.ts`.
// =============================================================================

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Girador, Selo, Visto } from '@/components/toga/base'
import { EVENTO_NOVA } from '@/components/toga/casca'
import type { Achado, RespostaBusca } from '@/lib/busca/consultar'
import type { EventoAoVivo } from '@/lib/consulta/contrato'
import { calcula, leDaConversa, meses } from '@/lib/toga/dosimetria'
import { busca, registra } from '@/lib/toga/historico'
import { comporResposta, type Fonte, type RespostaComposta } from '@/lib/toga/resposta'
import { ACENTO, ACENTO_CLARO, GRADIENTE_MARCA, GRADIENTE_RESULTADO } from '@/lib/toga/tokens'

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

/** Escopos de busca. Os dois últimos existem desligados, e o motivo está no `title`. */
const ESCOPOS = [
  { id: 'lei_11343_2006', t: 'Lei de Drogas', vivo: true, nota: 'Lei 11.343/2006 · cobertura integral' },
  { id: 'dl_2848_1940', t: 'Código Penal', vivo: true, nota: 'DL 2.848/1940 · cobertura integral' },
  { id: 'dl_3689_1941', t: 'CPP', vivo: true, nota: 'DL 3.689/1941 · subconjunto curado' },
  {
    id: 'juris',
    t: 'Jurisprudência',
    vivo: false,
    nota: 'Fora do corpus citável: o produto indexa lei, não acórdão.',
  },
  {
    id: 'doutrina',
    t: 'Doutrina',
    vivo: false,
    nota: 'Obra autoral protegida. O projeto não hospeda, não indexa e não resume doutrina.',
  },
] as const

const ATALHOS = [
  { tag: 'Rubrica', t: 'O que caracteriza o tráfico privilegiado do art. 33, §4º?' },
  { tag: 'Dosimetria', t: 'Como a natureza e a quantidade da droga entram na fixação da pena?' },
  { tag: 'Processual', t: 'Requisitos da busca domiciliar sem mandado judicial' },
  { tag: 'Penal', t: 'Associação para o tráfico e concurso de pessoas: qual a diferença?' },
]

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

type MsgAssistente = {
  papel: 'assistente'
  /** A pergunta que a originou. O cartão de dosimetria lê os fatos dela. */
  pergunta: string
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

const vazia = (pergunta: string): MsgAssistente => ({
  papel: 'assistente',
  pergunta,
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
          body: JSON.stringify({ q: alvo.pergunta }),
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
        return
      }
      mutar((x) => ({ digitado: Math.min(x.total, x.digitado + CHARS_POR_QUADRO) }))
    }, MS_POR_QUADRO)
  }, [mutar, pararRelogios])

  const enviar = useCallback(
    async (texto: string) => {
      const q = texto.trim()
      if (!q || ocupado) return

      pararRelogios()
      setRascunho('')
      setOcupado(true)
      setPainel(null)
      setMsgs((ms) => ms.concat([{ papel: 'usuario', texto: q }, vazia(q)]))

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

      try {
        const res = await fetch('/api/consulta/aovivo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q, lei: escopo }),
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
              if (!vivo.current) return

              if (e.tipo === 'passo') {
                mutar((m) => ({
                  passos: [...m.passos, { t: e.t, meta: e.meta }],
                }))
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
        motivo = e instanceof Error ? e.message : 'falha de rede'
      }

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
    [digitar, escopo, mutar, ocupado, pararRelogios, qtd],
  )

  // Conversa que veio na URL (?c=…) — é como a lateral devolve o usuário a um
  // chat anterior. Reconstrói as mensagens a partir das trocas gravadas, já
  // "prontas": reanimar a digitação de uma resposta que o usuário já leu seria
  // fazê-lo esperar de novo por algo que ele veio reler.
  const jaCarregou = useRef(false)
  useEffect(() => {
    if (jaCarregou.current || !conversaInicial) return
    jaCarregou.current = true

    void busca(conversaInicial).then((c) => {
      // Conversa apagada, de outro usuário, ou banco fora: começa vazia. Não é
      // erro de tela — é o histórico não estar disponível.
      if (!c || !vivo.current) return

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
  }, [conversaInicial])

  // Pergunta que veio na URL (?p=…) — é como a lateral, a paleta do ⌘K e os
  // atalhos de outras telas chegam aqui. Dispara uma vez só.
  const jaDisparou = useRef(false)
  useEffect(() => {
    if (jaDisparou.current || !perguntaInicial || conversaInicial) return
    jaDisparou.current = true
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
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs])

  const abrirFonte = useCallback((achados: Achado[], id: string) => {
    setPainel({ achados, id })
  }, [])

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-1.5 pt-[30px] sm:px-[34px]">
          <div className="mx-auto flex max-w-[690px] flex-col gap-[26px]">
            {msgs.length === 0 && <Abertura saudacao={saudacao} aoEscolher={enviar} />}

            {msgs.map((m, i) =>
              m.papel === 'usuario' ? (
                <div key={i} className="tg-entra flex justify-end">
                  <p className="max-w-[76%] rounded-[20px_20px_6px_20px] bg-tg-acento px-[17px] py-3 text-[14px] leading-[1.55] text-[#f3f3f8] shadow-[0_6px_18px_-10px_rgb(58_57_96_/_0.75)]">
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

function Abertura({
  saudacao,
  aoEscolher,
}: {
  saudacao: string
  aoEscolher: (t: string) => void
}) {
  return (
    <div className="tg-sobe-lento pb-[18px] pt-16">
      <h1 className="font-tg-serif text-[30px] leading-[1.25] -tracking-[0.01em] text-tg-tinta">
        {saudacao}
      </h1>
      <p className="mt-2 max-w-[440px] text-[15px] leading-[1.6] text-tg-fraco">
        Pergunte em linguagem natural. Eu leio o corpus curado — Lei 11.343, Código Penal e o
        recorte do CPP —, mostro de onde tirei cada citação e digo a data da redação.
      </p>
      <div className="mt-[26px] grid gap-2.5 sm:grid-cols-2">
        {ATALHOS.map((a) => (
          <button
            key={a.t}
            type="button"
            onClick={() => aoEscolher(a.t)}
            className="tgb tgc rounded-2xl bg-white px-4 py-3.5 text-left shadow-[var(--tg-elev-1)]"
          >
            <span className="mb-1.5 block text-[10.5px] font-medium text-tg-acento-claro">
              {a.tag}
            </span>
            <span className="block text-[13.5px] leading-[1.5] text-tg-tinta-3">{a.t}</span>
          </button>
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
          className="grid size-7 shrink-0 place-items-center rounded-[10px] font-tg-serif text-[12px] font-semibold text-white shadow-[0_3px_10px_-4px_rgb(58_57_96_/_0.6)]"
          style={{ background: GRADIENTE_MARCA }}
        >
          T
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
                <span aria-live="polite" className="text-[12.5px] font-medium text-tg-suave">
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
              <div className="mb-2 flex items-center gap-2">
                <Girador tamanho={11} />
                <span className="text-[11.5px] font-medium text-tg-acento-txt">
                  Redigindo com o contexto recuperado · claude-opus-5
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
                <p
                  key={j}
                  className="mb-[13px] font-tg-serif text-[15px] leading-[1.72] text-tg-tinta-2"
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
function CartaoDosimetria({ pergunta }: { pergunta: string }) {
  const [aberto, setAberto] = useState(false)
  const { entrada, chips } = useMemo(() => leDaConversa(pergunta), [pergunta])
  const c = useMemo(() => calcula(entrada), [entrada])

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
        <Selo tom="acento">art. 33 · 5 a 15 anos</Selo>
        <span className="flex-1" />
        <span className="text-[12.5px] tabular-nums text-tg-acento-txt">{meses(c.definitiva)}</span>
        <span aria-hidden="true" className={`text-[11px] text-tg-fraco-3 transition-transform ${aberto ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {aberto && (
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
              Nada de dosimetria foi reconhecido nesta pergunta — o cálculo abaixo usa o cenário
              padrão. Escreva fatos como “réu primário”, “confessou”, “reincidente” ou “grande
              quantidade” para o cartão lê-los.
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
      )}
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
}: {
  rascunho: string
  aoDigitar: (v: string) => void
  aoEnviar: (t: string) => void
  ocupado: boolean
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
                disabled={!e.vivo}
                onClick={() => aoTrocarEscopo(ativo ? null : e.id)}
                aria-pressed={e.vivo ? ativo : undefined}
                className={`tgb flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1.5 text-[11.5px] font-medium shadow-[var(--tg-elev-1)] ${
                  ativo
                    ? 'bg-tg-acento-fraco text-tg-acento-txt'
                    : e.vivo
                      ? 'bg-white text-tg-suave'
                      : 'cursor-not-allowed bg-white text-tg-tenue-2'
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
              title="Quantos dispositivos a busca devolve"
              className="tgb rounded-full bg-tg-preenche px-[11px] py-1.5 text-[11.5px] text-tg-suave hover:bg-tg-preenche-alto"
            >
              {qtd} resultados
            </button>
            <span
              title="Os JSONs são uma fotografia do Vade Mecum do Senado Federal, 1ª ed."
              className="hidden rounded-full bg-tg-preenche px-[11px] py-1.5 text-[11.5px] text-tg-suave sm:block"
            >
              Corte 28/02/2025
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
            <button
              type="submit"
              disabled={ocupado}
              aria-label="Enviar consulta"
              className="tgb grid size-[34px] shrink-0 place-items-center rounded-full shadow-[var(--tg-elev-acento)] disabled:cursor-not-allowed"
              style={{ background: ocupado ? ACENTO_CLARO : ACENTO }}
            >
              {ocupado ? (
                <Girador tamanho={13} espessura={2} trilho="rgba(255,255,255,.4)" cabeca="#fff" />
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
                chave: '28/02/2025',
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
