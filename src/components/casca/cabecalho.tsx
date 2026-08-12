// =============================================================================
// Cabeçalho de tela — o título serifado, dentro do conteúdo.
//
// Não é o topo do app. O topo (60px, com busca e conta) é único e mora em
// `components/toga/casca.tsx`; ele já mostra o nome da tela em Inter Tight, do
// mesmo jeito em todas as rotas.
//
// Este aqui é o outro título, o de dentro — 26px em Source Serif 4, com a linha
// de contexto embaixo e as ações à direita. A repetição é do documento de
// design e é intencional: o do topo diz *onde você está* enquanto você navega, e
// o de dentro abre a leitura da página. Um é rótulo de navegação, o outro é
// primeira linha de documento.
//
// Continua sendo componente de servidor: não tem estado nenhum.
// =============================================================================

import type { ReactNode } from 'react'

export function Cabecalho({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-end gap-4 px-5 pb-1 pt-6 sm:px-7">
      <div className="min-w-0">
        <h1 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
          {titulo}
        </h1>
        {sub && <p className="mt-1.5 text-[13px] text-tg-fraco-2">{sub}</p>}
      </div>
      <span className="flex-1" />
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
