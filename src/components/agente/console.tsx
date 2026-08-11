'use client'

// =============================================================================
// Console do agente — a busca híbrida com cara de conversa.
//
// O que este componente NÃO faz: gerar texto. Ele classifica a intenção da
// pergunta (regras em TS, sem modelo), chama /api/busca e devolve os
// dispositivos lidos do banco. A moldura em volta das citações é escrita aqui,
// determinística, e está rotulada como tal — nenhuma frase do texto legal passa
// por um LLM em runtime. Ver CLAUDE.md, "Nenhuma chamada a LLM em runtime".
//
// Os dois seletores são funcionais: o primeiro vira `p_lei` na RPC, o segundo
// vira `p_qtd`. Preferi dois controles que fazem algo a cinco que só decoram.
// =============================================================================

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Aviso, CartaoCitacao, Selo } from '@/components/ui'
import type { RespostaBusca } from '@/lib/busca/consultar'
import { ROTULO_MOLDE } from '@/lib/busca/intencao'

const LEIS = [
  { id: 'todas', nome: 'Todas as leis', desc: 'Lei 11.343/2006 e Código Penal' },
  { id: 'lei_11343_2006', nome: 'Lei de Drogas', desc: 'Lei 11.343/2006, cobertura integral' },
  { id: 'dl_2848_1940', nome: 'Código Penal', desc: 'DL 2.848/1940, cobertura integral' },
]

const QUANTIDADES = [
  { id: '5', nome: '5 dispositivos', desc: 'resposta curta' },
  { id: '8', nome: '8 dispositivos', desc: 'equilíbrio entre recall e leitura' },
  { id: '12', nome: '12 dispositivos', desc: 'varredura ampla' },
]

type Atalho = { emoji: string; rotulo: string; prompt: string; nota: string }

const ATALHOS: Atalho[] = [
  {
    emoji: '⚖️',
    rotulo: 'Fixação da pena',
    prompt: 'fixação da pena',
    nota: 'rubrica oficial — match exato encabeça o resultado',
  },
  {
    emoji: '📜',
    rotulo: 'Art. 33 da Lei 11.343',
    prompt: 'art. 33 da Lei 11.343',
    nota: 'molde dispositivo — resolvido pelo id, sem passar pela busca',
  },
  {
    emoji: '💊',
    rotulo: 'Porte para consumo pessoal',
    prompt: 'porte de droga para consumo pessoal',
    nota: 'lexical + semântica sobre o art. 28',
  },
  {
    emoji: '🔎',
    rotulo: 'Descrição do caso',
    prompt: 'reduzir a pena de quem é primário e não integra organização criminosa',
    nota: 'paráfrase, sem termo técnico',
  },
  {
    emoji: '📚',
    rotulo: 'Doutrina',
    prompt: 'o que diz a doutrina sobre concurso de pessoas no roubo',
    nota: 'molde doutrina — obra protegida não é reproduzida',
  },
]

// -----------------------------------------------------------------------------

function Seletor({
  itens,
  valor,
  aoTrocar,
  icone,
}: {
  itens: { id: string; nome: string; desc: string }[]
  valor: string
  aoTrocar: (id: string) => void
  icone: 'painel' | 'fila'
}) {
  const [aberto, setAberto] = useState(false)
  const atual = itens.find((i) => i.id === valor) ?? itens[0]!

  return (
    <div className="relative">
      {aberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setAberto(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
      >
        <Icone nome={icone} className="size-3.5 text-slate-500" />
        <span className="max-w-[12rem] truncate">{atual.nome}</span>
        <Icone
          nome="chevron"
          className={`size-3.5 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <ul
          role="listbox"
          className="absolute bottom-full z-20 mb-1.5 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#1E293B] p-1 shadow-2xl shadow-black/50"
        >
          {itens.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                role="option"
                aria-selected={i.id === valor}
                onClick={() => {
                  aoTrocar(i.id)
                  setAberto(false)
                }}
                className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span
                  className={`block text-sm ${i.id === valor ? 'font-medium text-emerald-300' : 'text-slate-200'}`}
                >
                  {i.nome}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{i.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A moldura da resposta. É a única frase escrita pelo sistema, e ela muda só
 * com o molde da pergunta — nada aqui depende do conteúdo dos dispositivos.
 */
function moldura(r: RespostaBusca): string {
  const n = r.itens.length
  if (n === 0) return 'Nenhum dispositivo do corpus casou com essa consulta.'
  if (r.direta)
    return `O artigo foi resolvido pelo id, sem passar pela busca. Texto integral, ${n} dispositivo${n > 1 ? 's' : ''}:`
  switch (r.intencao.molde) {
    case 'dispositivo':
      return `Texto legal do dispositivo citado, lido do banco (${n} resultado${n > 1 ? 's' : ''}):`
    case 'tema':
      return `A rubrica bateu exatamente. O cluster sai ordenado por papel e peso (${n} dispositivos):`
    case 'processual':
      return `Dispositivos de rito que respondem à consulta (${n}):`
    case 'doutrina':
      return 'Doutrina é obra autoral protegida e não é reproduzida aqui. O que segue é o texto legal aplicável:'
    default:
      return `${n} dispositivo${n > 1 ? 's' : ''} do corpus, fundidos por rubrica, lexical e semântica:`
  }
}

type Turno = { pergunta: string; resposta: RespostaBusca | null; erro: string | null }

// -----------------------------------------------------------------------------

export function Console() {
  const [lei, setLei] = useState('todas')
  const [qtd, setQtd] = useState('8')
  const [texto, setTexto] = useState('')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [carregando, setCarregando] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fim = useRef<HTMLDivElement>(null)

  // Cresce com o conteúdo até um teto — consulta jurídica é longa, e rolar
  // dentro de uma caixa de duas linhas atrapalha revisar o que se escreveu.
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [texto])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnos, carregando])

  async function enviar(consulta?: string) {
    const q = (consulta ?? texto).trim()
    if (!q || carregando) return

    setTexto('')
    setCarregando(true)
    setTurnos((t) => [...t, { pergunta: q, resposta: null, erro: null }])

    try {
      const r = await fetch('/api/busca', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q, lei: lei === 'todas' ? null : lei, qtd: Number(qtd) }),
      })
      const json = (await r.json()) as RespostaBusca & { erro?: string | null }
      // Resultado vazio é resposta legítima; erro do banco não é. A rota devolve
      // 503 com `erro` preenchido quando a RPC falha — os dois casos precisam
      // aparecer diferentes na tela.
      const falhou = !Array.isArray(json.itens) || Boolean(json.erro)
      setTurnos((t) =>
        t.map((turno, i) =>
          i === t.length - 1
            ? falhou
              ? { ...turno, erro: json.erro ?? `HTTP ${r.status}` }
              : { ...turno, resposta: json }
            : turno,
        ),
      )
    } catch (e) {
      const causa = e instanceof Error ? e.message : String(e)
      setTurnos((t) =>
        t.map((turno, i) => (i === t.length - 1 ? { ...turno, erro: causa } : turno)),
      )
    } finally {
      setCarregando(false)
    }
  }

  const vazio = turnos.length === 0

  return (
    <>
      <Cabecalho titulo="Agente Penal" sub="consulta ao corpus · toda citação resolve para o banco">
        <Selo tom="esmeralda">busca híbrida</Selo>
        {!vazio && (
          <button
            type="button"
            onClick={() => setTurnos([])}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[12.5px] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
          >
            Nova consulta
          </button>
        )}
      </Cabecalho>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 ${vazio ? 'justify-center' : ''}`}
        >
          {vazio ? (
            <>
              <div className="mb-7 flex justify-center">
                <div className="relative size-24">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl" />
                  <div className="relative size-24 rounded-full bg-[radial-gradient(circle_at_32%_28%,#6EE7B7,#10B981_38%,#065F46_72%,#022C22)] shadow-2xl shadow-emerald-900/50 ring-1 ring-emerald-300/20" />
                </div>
              </div>

              <h2 className="text-center text-[26px] font-semibold tracking-tight text-slate-50 sm:text-[30px]">
                Como posso ajudar na sua pesquisa jurídica hoje?
              </h2>
              <p className="mx-auto mt-2.5 max-w-xl text-center text-[14px] leading-relaxed text-slate-400">
                Consulte a Lei 11.343/2006 e o Código Penal em segundos. Toda citação resolve para o
                texto do banco — nunca para texto gerado.
              </p>
            </>
          ) : (
            <div className="mb-6 space-y-6">
              {turnos.map((t, i) => (
                <div key={`${i}-${t.pergunta}`} className="space-y-4">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-500/15 px-4 py-2.5 text-[14px] leading-relaxed text-slate-100 ring-1 ring-inset ring-emerald-500/20">
                      {t.pergunta}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <span className="mt-0.5 size-7 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,#6EE7B7,#10B981_40%,#065F46)] ring-1 ring-emerald-300/20" />
                    <div className="min-w-0 flex-1">
                      {t.erro ? (
                        <Aviso tom="vermelho">
                          A busca não respondeu: <code>{t.erro}</code>
                        </Aviso>
                      ) : !t.resposta ? (
                        <div className="space-y-2" aria-live="polite">
                          <p className="text-[13px] text-slate-500">
                            classificando intenção, embutindo a consulta e fundindo as três pernas…
                          </p>
                          <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                            <Selo tom={t.resposta.intencao.molde === 'tema' ? 'esmeralda' : 'neutro'}>
                              {ROTULO_MOLDE[t.resposta.intencao.molde]}
                            </Selo>
                            <span>{t.resposta.intencao.sinal}</span>
                            <span className="tabular-nums">
                              · {t.resposta.ms} ms ·{' '}
                              {t.resposta.direta
                                ? 'leitura por id'
                                : t.resposta.vetor
                                  ? '3 pernas'
                                  : '2 pernas'}
                            </span>
                          </div>

                          {t.resposta.aviso && <Aviso className="mb-2">{t.resposta.aviso}</Aviso>}

                          <p className="text-[14px] leading-relaxed text-slate-300">
                            {moldura(t.resposta)}
                          </p>

                          <ul className="mt-3 space-y-3">
                            {t.resposta.itens.map((d) => (
                              <li key={d.dispositivo_id}>
                                <CartaoCitacao
                                  d={{
                                    id: d.dispositivo_id,
                                    citacao: d.citacao,
                                    texto: d.texto,
                                    rubrica: d.artigo_rubrica,
                                    contexto: d.capitulo,
                                    lei_apelido: d.lei_apelido,
                                    vigencia_ate: d.vigencia_ate,
                                    cobertura: d.cobertura,
                                    cobertura_nota: d.cobertura_nota,
                                    revogado: d.revogado,
                                    rubrica_termo: d.rubrica_termo,
                                    papel: d.papel,
                                  }}
                                  compacto
                                />
                              </li>
                            ))}
                          </ul>

                          {t.resposta.itens.length === 0 && (
                            <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                              As três pernas rodaram e nenhuma trouxe dispositivo. Termo de
                              instituto sem rubrica <em>curada</em> cai exatamente aqui — é o buraco
                              conhecido do incremento 2.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={fim} />
            </div>
          )}

          {/* ---------- caixa de entrada ---------- */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#1E293B] shadow-2xl shadow-black/40 transition-colors focus-within:border-emerald-500/40 focus-within:ring-1 focus-within:ring-emerald-500/20">
            <label htmlFor="consulta" className="sr-only">
              Sua consulta jurídica
            </label>
            <textarea
              id="consulta"
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void enviar()
                }
              }}
              placeholder="Descreva a tese, cite o artigo ou pergunte sobre o caso…"
              className="block max-h-[220px] w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[14.5px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
            />

            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <Seletor itens={LEIS} valor={lei} aoTrocar={setLei} icone="painel" />
              <Seletor itens={QUANTIDADES} valor={qtd} aoTrocar={setQtd} icone="fila" />

              <span className="ml-auto hidden pr-1 text-[11px] text-slate-600 sm:block">
                Enter envia · Shift+Enter quebra linha
              </span>

              <button
                type="button"
                onClick={() => void enviar()}
                disabled={!texto.trim() || carregando}
                aria-label="Enviar consulta"
                className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-slate-950 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                <Icone nome="seta_cima" className="size-[18px]" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {/* ---------- atalhos ---------- */}
          {vazio && (
            <>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {ATALHOS.map((a) => (
                  <button
                    key={a.rotulo}
                    type="button"
                    title={a.nota}
                    onClick={() => void enviar(a.prompt)}
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-slate-300 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.07] hover:text-slate-100"
                  >
                    <span aria-hidden="true">{a.emoji}</span>
                    {a.rotulo}
                  </button>
                ))}
              </div>

              <p className="mx-auto mt-4 max-w-xl text-center text-[11.5px] leading-relaxed text-slate-600">
                O agente não escreve texto legal: ele classifica a intenção por regras, busca no
                banco e devolve os dispositivos com vigência e cobertura. Para ler um artigo
                inteiro, use a{' '}
                <Link href="/leis" className="text-slate-500 hover:text-emerald-300">
                  legislação
                </Link>
                .
              </p>
            </>
          )}
        </div>

        <p className="shrink-0 pb-5 text-center text-[11.5px] text-slate-600">
          Confira o texto legal citado antes de protocolar. Redação vigente em 28/02/2025.
        </p>
      </div>
    </>
  )
}
