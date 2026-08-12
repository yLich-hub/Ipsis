// =============================================================================
// TOGA v2 — estados de exceção
//
// Banco fora do ar, lista vazia, recurso que existe no menu e não existe no
// produto. Três telas que ninguém desenha com carinho e que são justamente as
// que aparecem no pior momento.
//
// O documento de design não desenha nenhuma das três — protótipo não tem banco
// para cair. A forma aqui é a do resto do sistema: cartão branco, raio 18 a 20,
// elevação de repouso, serifada só no que for texto longo.
// =============================================================================

import Link from 'next/link'
import type { HTMLAttributes, ReactNode } from 'react'

import { Icone, type NomeIcone } from '@/components/icones'

/**
 * `esmeralda` é sinônimo de `verde` e existe só por compatibilidade: era o nome
 * do tom no tema escuro anterior, e está espalhado pelas telas de autenticação.
 * Renomear em quinze lugares para não ganhar nada seria churn.
 */
const TONS_AVISO = {
  ambar: ['bg-tg-ambar-fundo text-tg-ambar-txt', 'border-tg-ambar-borda'],
  vermelho: ['bg-tg-supressao-fundo text-tg-supressao-txt', 'border-tg-supressao-txt'],
  neutro: ['bg-tg-preenche text-tg-suave', 'border-tg-tenue'],
  verde: ['bg-tg-verde-fundo text-tg-verde-txt', 'border-tg-verde'],
  esmeralda: ['bg-tg-verde-fundo text-tg-verde-txt', 'border-tg-verde'],
} as const

export function Aviso({
  tom = 'ambar',
  children,
  className = '',
  ...resto
}: {
  tom?: keyof typeof TONS_AVISO
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const [estilo, borda] = TONS_AVISO[tom]

  return (
    <div
      className={`flex items-start gap-[9px] rounded-[13px] px-3.5 py-2.5 text-[12.5px] leading-[1.55] ${estilo} ${className}`}
      {...resto}
    >
      <span
        aria-hidden="true"
        className={`mt-px grid size-[15px] shrink-0 place-items-center rounded-full border-[1.4px] text-[10px] font-semibold ${borda}`}
      >
        {tom === 'verde' || tom === 'esmeralda' ? '✓' : '!'}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * O banco não respondeu.
 *
 * O texto diz por que isso acontece neste projeto em vez de mostrar "erro
 * inesperado": o plano gratuito do Supabase pausa por inatividade, e um
 * portfólio é justamente um link clicado semanas depois. Quem abre a tela e lê
 * isso entende que é a hospedagem, não o código.
 */
export function ErroBanco({ erro }: { erro: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[20px] bg-white px-6 py-6 shadow-[var(--tg-elev-1)]">
      <Aviso tom="vermelho">
        <strong className="font-semibold">A base não respondeu.</strong> O projeto roda no plano
        gratuito do Supabase, que pausa por inatividade — o cron diário em{' '}
        <code className="font-tg">/api/health</code> existe justamente para evitar isso.
      </Aviso>
      <p className="mt-3.5 text-[12px] leading-[1.6] text-tg-fraco-2">
        Detalhe técnico: <code className="text-tg-corpo">{erro}</code>
      </p>
      <p className="mt-2 text-[12px] leading-[1.6] text-tg-fraco-2">
        O{' '}
        <Link href="/vademecum" className="text-tg-acento-txt hover:underline">
          acervo Vade Mecum
        </Link>{' '}
        continua inteiro: ele lê do disco, não do banco. É a parte do produto que sobrevive à
        pausa, e é de propósito.
      </p>
    </div>
  )
}

export function Vazio({
  icone,
  titulo,
  children,
}: {
  /** Opcional: as telas anteriores ao TOGA v2 passam um ícone; as novas, não. */
  icone?: NomeIcone
  titulo: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg rounded-[20px] bg-white px-6 py-10 text-center shadow-[var(--tg-elev-1)]">
      {icone && (
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-[14px] bg-tg-acento-fraco text-tg-acento-txt">
          <Icone nome={icone} className="size-5" />
        </span>
      )}
      <h3 className="text-[14.5px] font-medium text-tg-tinta-2">{titulo}</h3>
      <div className="mt-2 text-[12.5px] leading-[1.6] text-tg-fraco-2">{children}</div>
    </div>
  )
}

/**
 * Tela de item que existe no desenho e **não** existe no produto.
 *
 * O escopo é estreito de propósito — só tráfico de drogas, uma peça: 30% do
 * escopo com 100% de acabamento. Dizer isso na cara é melhor que uma tela falsa
 * cheia de números inventados, e é o que separa recorte deliberado de projeto
 * abandonado pela metade.
 */
export function ForaDeEscopo({
  titulo,
  porque,
  emVezDisso,
}: {
  titulo: string
  porque: ReactNode
  emVezDisso: { href: string; rotulo: string; nota: string }[]
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h2 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
        {titulo}
      </h2>
      <div className="mt-2.5 text-[13.5px] leading-[1.65] text-tg-suave">{porque}</div>

      <p className="mt-8 text-[11px] font-medium text-tg-fraco-3">O que está de pé</p>
      <ul className="mt-2 space-y-2">
        {emVezDisso.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="tgb tgc flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 shadow-[var(--tg-elev-1)]"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-tg-tinta-2">{a.rotulo}</span>
                <span className="block text-[12.5px] text-tg-fraco-2">{a.nota}</span>
              </span>
              <span aria-hidden="true" className="ml-auto shrink-0 text-[15px] text-tg-tenue-2">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
