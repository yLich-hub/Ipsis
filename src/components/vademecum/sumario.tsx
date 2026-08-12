'use client'

// =============================================================================
// Sumário do acervo — navegação por Livro/Título/Capítulo.
//
// As âncoras não são montadas aqui: os ids já vêm gravados nos headings pelo
// scripts/vademecum.ts, em build. O cliente só liga o clique e acompanha onde
// a leitura está.
//
// O realce usa IntersectionObserver com `root` explícito, porque quem rola não
// é a janela — é a <div> de conteúdo dentro da casca (ver (app)/layout.tsx,
// que trava a rolagem do documento com h-dvh + overflow-hidden). Com o root
// padrão o observador nunca dispararia.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'

import { Icone } from '@/components/icones'
import { semAcento } from '@/lib/formato'
import type { TopicoSumario } from '@/lib/tipos'

const RECUO = ['pl-0', 'pl-3', 'pl-6', 'pl-9']

export function Sumario({
  topicos,
  idRolagem,
}: {
  topicos: TopicoSumario[]
  /** id do contêiner que rola — é ele o `root` do observador */
  idRolagem: string
}) {
  const [ativo, setAtivo] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    const raiz = document.getElementById(idRolagem)
    const alvos = topicos
      .map((t) => document.getElementById(t.id))
      .filter((e): e is HTMLElement => Boolean(e))
    if (!raiz || alvos.length === 0) return

    // `visiveis` guarda o que está em tela agora. O ativo é o primeiro deles na
    // ordem do documento — sem isso, rolar para cima faria o realce pular para
    // o último heading que entrou na viewport, que é o de baixo.
    const visiveis = new Set<string>()
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id)
          else visiveis.delete(e.target.id)
        }
        const primeiro = topicos.find((t) => visiveis.has(t.id))
        if (primeiro) setAtivo(primeiro.id)
      },
      // A faixa alta e estreita no topo faz o realce trocar quando o heading
      // chega ao começo da leitura, não quando cruza o meio da tela.
      { root: raiz, rootMargin: '0px 0px -75% 0px', threshold: 0 },
    )

    for (const a of alvos) observador.observe(a)
    return () => observador.disconnect()
  }, [topicos, idRolagem])

  const visiveis = useMemo(() => {
    const alvo = semAcento(filtro.trim())
    if (!alvo) return topicos
    return topicos.filter((t) => semAcento(t.titulo).includes(alvo))
  }, [topicos, filtro])

  if (topicos.length === 0) return null

  return (
    <nav aria-label="Sumário da lei" className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-4">
        <div className="flex items-center gap-2 rounded-lg border border-tg-linha bg-white px-2.5 py-1.5 focus-within:border-tg-acento-palido">
          <Icone nome="lista" className="size-3.5 shrink-0 text-tg-fraco-3" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar sumário…"
            aria-label="Filtrar o sumário"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-tg-tinta-2 outline-none placeholder:text-tg-tenue-2"
          />
          {filtro && (
            <button
              type="button"
              onClick={() => setFiltro('')}
              aria-label="Limpar filtro do sumário"
              className="shrink-0 text-tg-fraco-3 hover:text-tg-tinta-2"
            >
              <Icone nome="xis" className="size-3.5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10.5px] tabular-nums text-tg-tenue-2">
          {visiveis.length} de {topicos.length} seções
        </p>
      </div>

      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {visiveis.map((t) => {
          const atual = t.id === ativo
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                aria-current={atual ? 'true' : undefined}
                className={`block truncate rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                  RECUO[Math.min(t.nivel - 1, RECUO.length - 1)]
                } ${
                  atual
                    ? 'bg-tg-acento-fraco font-medium text-tg-acento-txt'
                    : t.nivel === 1
                      ? 'text-tg-tinta-4 hover:bg-tg-preenche'
                      : 'text-tg-fraco-3 hover:bg-tg-preenche hover:text-tg-tinta-4'
                }`}
                title={t.titulo}
              >
                {t.titulo}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
