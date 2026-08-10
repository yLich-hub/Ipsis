'use client'

// =============================================================================
// Console do agente — cabeçalho, estado vazio, caixa de entrada e atalhos
//
// É o único componente cliente da tela. Toda a navegação continua no servidor.
//
// A resposta exibida ao enviar é ESTÁTICA e está rotulada como exemplo: serve
// para mostrar o formato da citação, que é o ponto do produto — texto legal lido
// do banco, com id resolvido, data de corte e link para o dispositivo. O agente
// de verdade entra no incremento 3.
// =============================================================================

import { useEffect, useRef, useState } from 'react'

import { Icone, type NomeIcone } from './icones'

const PERFIS = [
  { id: 'penal', nome: 'Assistente Penal Especializado', desc: 'Código Penal e Lei 11.343' },
  { id: 'lep', nome: 'Execução Penal (LEP)', desc: 'Progressão, livramento, agravo' },
  { id: 'juri', nome: 'Tribunal do Júri', desc: 'Crimes dolosos contra a vida' },
]

const MODELOS = [
  { id: 'v1', nome: 'JusModel v1.0', desc: 'Equilíbrio entre precisão e velocidade' },
  { id: 'v1-pro', nome: 'JusModel v1.0 Pro', desc: 'Raciocínio estendido para teses complexas' },
  { id: 'rascunho', nome: 'Rascunho rápido', desc: 'Respostas curtas, sem fundamentação longa' },
]

type Atalho = {
  emoji: string
  rotulo: string
  prompt: string
  /** Doutrina é obra autoral protegida: a resposta vem de jurisprudência. */
  doutrina?: boolean
}

const ATALHOS: Atalho[] = [
  {
    emoji: '⚖️',
    rotulo: 'Roubo & Furto (Arts. 155/157 CP)',
    prompt:
      'Compare os elementos do furto (art. 155) e do roubo (art. 157) do Código Penal, com as causas de aumento de cada um.',
  },
  {
    emoji: '💊',
    rotulo: 'Tráfico de Drogas (Lei 11.343)',
    prompt:
      'Quais os requisitos do tráfico privilegiado (art. 33, § 4º, da Lei 11.343/2006) e como a jurisprudência trata a dedicação a atividades criminosas?',
  },
  {
    emoji: '📜',
    rotulo: 'LEP & Agravo em Execução',
    prompt:
      'Prazo e cabimento do agravo em execução, e quais decisões do juízo da execução são atacáveis por ele.',
  },
  {
    emoji: '📚',
    rotulo: 'Doutrina: Estupro de Vulnerável',
    prompt:
      'Entendimento consolidado sobre o estupro de vulnerável (art. 217-A do CP): presunção de violência e irrelevância do consentimento.',
    doutrina: true,
  },
  {
    emoji: '👥',
    rotulo: 'Doutrina: Roubo Majorado & Concurso',
    prompt:
      'Roubo majorado pelo concurso de pessoas: entendimento consolidado sobre a necessidade de identificação dos comparsas.',
    doutrina: true,
  },
]

// -----------------------------------------------------------------------------

function Seletor({
  itens,
  valor,
  aoTrocar,
  compacto,
}: {
  itens: { id: string; nome: string; desc: string }[]
  valor: string
  aoTrocar: (id: string) => void
  compacto?: boolean
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
        className={`flex items-center gap-1.5 rounded-lg text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100 ${
          compacto
            ? 'px-2 py-1 text-[13px]'
            : 'border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm'
        }`}
      >
        {compacto && <Icone nome="painel" className="size-3.5 text-slate-500" />}
        <span className="max-w-[15rem] truncate">{atual.nome}</span>
        <Icone
          nome="chevron"
          className={`size-3.5 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#1E293B] p-1 shadow-2xl shadow-black/50"
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

// -----------------------------------------------------------------------------

/**
 * Cartão de citação: o formato que define o produto. O texto vem do banco por
 * `dispositivos.id`, nunca do modelo — e a vigência viaja junto com ele.
 */
function CartaoCitacao() {
  return (
    <figure className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0F172A]">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span className="text-[13px] font-medium text-emerald-300">
          art. 33, § 4º, da Lei nº 11.343/2006
        </span>
        <span className="rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
          Tráfico privilegiado
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          <Icone nome="alerta" className="size-3" />
          vigente em 28/02/2025
        </span>
      </figcaption>
      <blockquote className="px-4 py-3 text-[13.5px] leading-relaxed text-slate-300">
        Nos delitos definidos no caput e no § 1º deste artigo, as penas poderão ser reduzidas de um
        sexto a dois terços, desde que o agente seja primário, de bons antecedentes, não se dedique
        às atividades criminosas nem integre organização criminosa.
      </blockquote>
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2">
        <a
          href="#"
          className="flex items-center gap-1.5 text-[12px] text-slate-400 transition-colors hover:text-emerald-300"
        >
          Abrir dispositivo
          <Icone nome="link_externo" className="size-3" />
        </a>
        <span className="text-[12px] text-slate-600">Lei de Drogas · cobertura integral</span>
      </div>
    </figure>
  )
}

// -----------------------------------------------------------------------------

export function Console() {
  const [perfil, setPerfil] = useState('penal')
  const [modelo, setModelo] = useState('v1')
  const [texto, setTexto] = useState('')
  const [pergunta, setPergunta] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  // Cresce com o conteúdo até um teto — consulta jurídica é longa, e rolar
  // dentro de uma caixa de duas linhas atrapalha revisar o que se escreveu.
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [texto])

  const usar = (a: Atalho) => {
    setTexto(a.prompt)
    campo.current?.focus()
  }

  const enviar = () => {
    const t = texto.trim()
    if (!t) return
    setPergunta(t)
    setTexto('')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* ---------- cabeçalho ---------- */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 sm:px-6">
        <h1 className="text-[15px] font-semibold text-slate-100">Agente Penal</h1>
        <span className="hidden h-4 w-px bg-white/10 sm:block" />
        <div className="hidden sm:block">
          <Seletor itens={PERFIS} valor={perfil} aoTrocar={setPerfil} compacto />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setPergunta(null)
              setTexto('')
            }}
            className="mr-1 hidden rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100 sm:block"
          >
            Nova consulta
          </button>
          {(['envelope', 'sino'] as NomeIcone[]).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={n === 'sino' ? 'Notificações' : 'Mensagens'}
              className="grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
            >
              <Icone nome={n} className="size-[18px]" />
            </button>
          ))}
          <span className="ml-1 grid size-8 place-items-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10">
            LM
          </span>
        </div>
      </header>

      {/* ---------- corpo ---------- */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
          {pergunta === null ? (
            <>
              {/* orbe */}
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
                Consulte o Código Penal, a LEP e entendimento consolidado em segundos. Toda citação
                resolve para o texto do banco — nunca para texto gerado.
              </p>
            </>
          ) : (
            <div className="mb-6 space-y-5">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-500/15 px-4 py-2.5 text-[14px] leading-relaxed text-slate-100 ring-1 ring-inset ring-emerald-500/20">
                  {pergunta}
                </p>
              </div>

              <div className="flex gap-3">
                <span className="mt-0.5 size-7 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,#6EE7B7,#10B981_40%,#065F46)] ring-1 ring-emerald-300/20" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[11px] text-amber-300/90">
                    <Icone nome="alerta" className="size-3" />
                    Resposta de exemplo — o agente entra no incremento 3
                  </div>
                  <p className="text-[14px] leading-relaxed text-slate-300">
                    A causa de diminuição exige quatro requisitos cumulativos: primariedade, bons
                    antecedentes, não dedicação a atividades criminosas e não integração a
                    organização criminosa. Ausente qualquer um, a redução é afastada.
                  </p>
                  <CartaoCitacao />
                  <p className="text-[14px] leading-relaxed text-slate-300">
                    O patamar de redução é fixado conforme as circunstâncias do art. 42 da Lei de
                    Drogas, que tem preponderância sobre o art. 59 do Código Penal.
                  </p>
                </div>
              </div>
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
                  enviar()
                }
              }}
              placeholder="Descreva a tese, cite o artigo ou pergunte sobre o caso…"
              className="block max-h-[220px] w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[14.5px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
            />

            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <button
                type="button"
                aria-label="Anexar documento"
                title="Anexar peça ou decisão"
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
              >
                <Icone nome="mais" className="size-[18px]" />
              </button>
              <button
                type="button"
                aria-label="Anexar arquivo"
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
              >
                <Icone nome="clipe" className="size-[18px]" />
              </button>

              <div className="ml-1">
                <Seletor itens={MODELOS} valor={modelo} aoTrocar={setModelo} compacto />
              </div>

              <span className="ml-auto hidden pr-1 text-[11px] text-slate-600 sm:block">
                Enter envia · Shift+Enter quebra linha
              </span>

              <button
                type="button"
                onClick={enviar}
                disabled={!texto.trim()}
                aria-label="Enviar consulta"
                className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-slate-950 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                <Icone nome="seta_cima" className="size-[18px]" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {/* ---------- atalhos ---------- */}
          {pergunta === null && (
            <>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {ATALHOS.map((a) => (
                  <button
                    key={a.rotulo}
                    type="button"
                    onClick={() => usar(a)}
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-slate-300 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.07] hover:text-slate-100"
                  >
                    <span aria-hidden="true">{a.emoji}</span>
                    {a.rotulo}
                    {a.doutrina && (
                      <span
                        title="Doutrina é obra protegida: a resposta traz entendimento consolidado de jurisprudência e link para fonte legítima."
                        className="rounded bg-slate-700/70 px-1 py-px text-[10px] font-medium text-slate-400 group-hover:text-slate-300"
                      >
                        juris.
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-center text-[11.5px] leading-relaxed text-slate-600">
                Os atalhos marcados <span className="text-slate-500">juris.</span> respondem com
                entendimento consolidado extraído de acórdãos e link para a fonte — doutrina é obra
                autoral protegida e não é reproduzida aqui.
              </p>
            </>
          )}
        </div>

        <p className="shrink-0 pb-5 text-center text-[11.5px] text-slate-600">
          O LexAI pode errar. Confira o texto legal citado antes de protocolar.
        </p>
      </div>
    </div>
  )
}
