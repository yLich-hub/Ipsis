'use client'

// =============================================================================
// Barra do leitor — busca dentro da lei + tamanho do texto.
//
// A busca usa a CSS Custom Highlight API: os trechos achados viram Range e o
// destaque sai por `::highlight()`, sem tocar no DOM. Envolver ocorrência em
// <mark> num documento de 831 KB (a Constituição) obrigaria o navegador a
// remontar a árvore inteira a cada tecla — e quebraria as âncoras do sumário,
// que dependem dos ids gravados nos headings.
//
// Onde a API não existe, a barra se apaga e manda usar o Ctrl+F: a lei inteira
// está numa página só justamente para o Ctrl+F funcionar.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

import { Icone } from '@/components/icones'
import { semAcento } from '@/lib/formato'

const TAMANHOS = [
  { rotulo: 'Compacto', px: '13px' },
  { rotulo: 'Normal', px: '14.5px' },
  { rotulo: 'Ampliado', px: '16.5px' },
] as const

const CHAVE_TAMANHO = 'jesbick:vademecum:tamanho'

/** Teto de ocorrências: além disso o termo é curto demais para ajudar alguém. */
const TETO = 2000

type RegistroDestaque = {
  set: (nome: string, destaque: unknown) => void
  delete: (nome: string) => void
}

/** `CSS.highlights` e `Highlight` só entraram no lib.dom recentemente. */
const registro = (): RegistroDestaque | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS
    ? (CSS as unknown as { highlights: RegistroDestaque }).highlights
    : null

const novoDestaque = (ranges: Range[]): unknown =>
  new (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight(...ranges)

export function BarraLeitura({ idTexto }: { idTexto: string }) {
  const [termo, setTermo] = useState('')
  const [total, setTotal] = useState(0)
  const [atual, setAtual] = useState(0)
  const [suportado, setSuportado] = useState(true)
  const [tamanho, setTamanho] = useState(1)
  const achados = useRef<Range[]>([])

  useEffect(() => {
    setSuportado(registro() !== null && typeof (window as { Highlight?: unknown }).Highlight === 'function')

    const salvo = Number(localStorage.getItem(CHAVE_TAMANHO))
    if (Number.isInteger(salvo) && salvo >= 0 && salvo < TAMANHOS.length) setTamanho(salvo)
  }, [])

  // O tamanho vai como variável CSS no próprio artigo: uma propriedade herdada
  // muda parágrafo, inciso e alínea de uma vez, sem reflow de layout.
  useEffect(() => {
    const px = TAMANHOS[tamanho]?.px
    if (px) document.getElementById(idTexto)?.style.setProperty('--corpo', px)
  }, [tamanho, idTexto])

  const trocaTamanho = (i: number) => {
    setTamanho(i)
    try {
      localStorage.setItem(CHAVE_TAMANHO, String(i))
    } catch {
      /* sem persistência; a sessão atual continua valendo */
    }
  }

  const rolaAte = useCallback((i: number) => {
    const r = achados.current[i]
    if (!r) return
    const reg = registro()
    reg?.set('acervo-atual', novoDestaque([r]))
    // O Range não tem scrollIntoView; o elemento que o contém tem.
    const alvo = r.startContainer.parentElement
    alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  // Debounce: a varredura percorre todo o texto da lei, e disparar a cada tecla
  // deixaria a digitação travada nos códigos grandes.
  useEffect(() => {
    const reg = registro()
    if (!reg) return

    const relogio = setTimeout(() => {
      const alvo = semAcento(termo.trim())
      reg.delete('acervo-busca')
      reg.delete('acervo-atual')
      achados.current = []
      setTotal(0)
      setAtual(0)

      // Menos de 3 letras casa quase todo parágrafo: só ruído.
      const raiz = document.getElementById(idTexto)
      if (!raiz || alvo.length < 3) return

      const passeio = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
      const ranges: Range[] = []
      let no = passeio.nextNode()

      while (no && ranges.length < TETO) {
        // Compara sem acento mas recorta no texto original: as duas versões têm
        // o mesmo comprimento porque NFD+strip preserva a contagem de letras.
        const texto = semAcento(no.nodeValue ?? '')
        let de = texto.indexOf(alvo)
        while (de !== -1 && ranges.length < TETO) {
          const r = document.createRange()
          r.setStart(no, de)
          r.setEnd(no, de + alvo.length)
          ranges.push(r)
          de = texto.indexOf(alvo, de + alvo.length)
        }
        no = passeio.nextNode()
      }

      achados.current = ranges
      setTotal(ranges.length)
      if (ranges.length) {
        reg.set('acervo-busca', novoDestaque(ranges))
        setAtual(0)
        rolaAte(0)
      }
    }, 220)

    return () => clearTimeout(relogio)
  }, [termo, idTexto, rolaAte])

  // Sair da lei tem que limpar o destaque: o registro é global da página.
  useEffect(() => {
    const reg = registro()
    return () => {
      reg?.delete('acervo-busca')
      reg?.delete('acervo-atual')
    }
  }, [])

  const anda = (passo: number) => {
    if (!total) return
    const i = (atual + passo + total) % total
    setAtual(i)
    rolaAte(i)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {suportado ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-tg-linha bg-white px-3 py-2 focus-within:border-tg-acento-palido">
          <Icone nome="busca" className="size-4 shrink-0 text-tg-fraco-3" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                anda(e.shiftKey ? -1 : 1)
              }
            }}
            placeholder="Buscar nesta lei… (Enter para a próxima)"
            aria-label="Buscar dentro desta lei"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tg-tinta outline-none placeholder:text-tg-fraco-3"
          />

          {termo.trim().length >= 3 && (
            <span
              aria-live="polite"
              className={`shrink-0 text-[11.5px] tabular-nums ${total ? 'text-tg-corpo' : 'text-tg-ambar-txt'}`}
            >
              {total ? `${atual + 1} / ${total}${total === TETO ? '+' : ''}` : 'nada'}
            </span>
          )}

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => anda(-1)}
              disabled={!total}
              aria-label="Ocorrência anterior"
              className="grid size-6 place-items-center rounded text-tg-fraco-3 hover:text-tg-tinta-2 disabled:opacity-30"
            >
              <Icone nome="chevron" className="size-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => anda(1)}
              disabled={!total}
              aria-label="Próxima ocorrência"
              className="grid size-6 place-items-center rounded text-tg-fraco-3 hover:text-tg-tinta-2 disabled:opacity-30"
            >
              <Icone nome="chevron" className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <p className="flex-1 text-[12px] text-tg-fraco-3">
          Este navegador não destaca busca na página — a lei está inteira aqui, use o{' '}
          <kbd className="rounded border border-tg-linha px-1 text-[11px]">Ctrl</kbd>+
          <kbd className="rounded border border-tg-linha px-1 text-[11px]">F</kbd>.
        </p>
      )}

      <div
        role="group"
        aria-label="Tamanho do texto"
        className="flex shrink-0 items-center rounded-xl border border-tg-linha p-0.5"
      >
        {TAMANHOS.map((t, i) => (
          <button
            key={t.rotulo}
            type="button"
            onClick={() => trocaTamanho(i)}
            aria-pressed={i === tamanho}
            title={`Texto ${t.rotulo.toLowerCase()}`}
            className={`rounded-lg px-2 py-1.5 transition-colors ${
              i === tamanho ? 'bg-white/[0.08] text-tg-tinta-2' : 'text-tg-tenue-2 hover:text-tg-tinta-4'
            }`}
          >
            <Icone nome="texto_alinhado" className="size-4" style={{ scale: 0.8 + i * 0.15 }} />
            <span className="sr-only">{t.rotulo}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
