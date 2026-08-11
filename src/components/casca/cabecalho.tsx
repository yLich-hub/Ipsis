// =============================================================================
// Cabeçalho de tela — altura fixa, igual em todas as páginas.
//
// Continua sendo componente de servidor: envelope e sino seguem decorativos
// (mensagens e notificações estão fora do escopo) e não valem uma ilha de
// cliente. A única ilha é `<Conta />`, que precisa do estado de sessão do
// navegador para reagir a logout sem esperar uma navegação.
// =============================================================================

import type { ReactNode } from 'react'

import { Conta } from '@/components/casca/conta'
import { Icone, type NomeIcone } from '@/components/icones'

export function Cabecalho({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub?: string
  children?: ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold text-slate-100">{titulo}</h1>
        {sub && <p className="truncate text-[12px] text-slate-500">{sub}</p>}
      </div>

      {children && <div className="ml-3 hidden min-w-0 items-center gap-2 sm:flex">{children}</div>}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {(['envelope', 'sino'] as NomeIcone[]).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={n === 'sino' ? 'Notificações' : 'Mensagens'}
            title="Decorativo: mensagens e notificações estão fora do escopo do projeto"
            className="hidden size-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-white/[0.05] hover:text-slate-300 sm:grid"
          >
            <Icone nome={n} className="size-[18px]" />
          </button>
        ))}
        <Conta />
      </div>
    </header>
  )
}
