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

import Link from 'next/link'
import type { ReactNode } from 'react'

import { Icone } from '@/components/icones'

/**
 * Para onde a tela volta, quando ela tem um "acima".
 *
 * **O voltar já existia no leitor do acervo e não servia**, e o motivo é de
 * posição, não de ausência: ele morava dentro do `overflow-y-auto`, junto do
 * botão de favorito. A Constituição chega com 831 KB de HTML numa página só —
 * na primeira rolagem o link sai da tela e não volta, e a saída passa a ser o
 * botão do navegador.
 *
 * Aqui ele vive no `Cabecalho`, que é `shrink-0` e mora FORA da caixa que rola
 * em todas as telas que o usam. Some da tela nunca.
 *
 * Não vale para `/artigo/[id]` nem `/dispositivo/[id]`: essas são o alvo dos
 * links de citação e se chega nelas da Consulta, de uma lei ou de uma peça.
 * "Voltar" para um pai fixo seria afirmar um caminho que o usuário não fez.
 */
export type Voltar = { href: string; rotulo: string }

export function Cabecalho({
  titulo,
  sub,
  voltar,
  children,
}: {
  titulo: string
  sub?: ReactNode
  voltar?: Voltar
  children?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-end gap-4 px-5 pb-1 pt-6 sm:px-7">
      <div className="min-w-0">
        {voltar && (
          <Link
            href={voltar.href}
            className="tgb -ml-1 mb-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12.5px] text-tg-fraco-3 transition-colors hover:bg-tg-preenche hover:text-tg-tinta-2"
          >
            <Icone nome="seta_esquerda" className="size-3.5" />
            {voltar.rotulo}
          </Link>
        )}
        <h1 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
          {titulo}
        </h1>
        {/* `corpo-2` e não `fraco-2`: esta linha diz o que a tela é — "resposta
            à acusação · art. 396-A do CPP", "vigília sobre a data de corte" — e
            estava em 2.76:1, ilegível para quem enxerga pouco. Ela é conteúdo,
            não decoração de cabeçalho. */}
        {sub && <p className="mt-1.5 text-[13px] text-tg-corpo-2">{sub}</p>}
      </div>
      <span className="flex-1" />
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
