// =============================================================================
// Cabeçalho de tela — altura fixa, igual em todas as páginas.
//
// Componente de servidor: os botões da direita são decorativos (não há
// autenticação nem notificações no escopo) e não valem uma ilha de cliente.
// =============================================================================

import type { ReactNode } from 'react'

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
            title="Decorativo: o projeto não tem autenticação nem multiusuário (fora de escopo)"
            className="hidden size-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-white/[0.05] hover:text-slate-300 sm:grid"
          >
            <Icone nome={n} className="size-[18px]" />
          </button>
        ))}
        <span
          title="Demonstração de portfólio — sessão única, sem login"
          className="ml-1 grid size-8 place-items-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10"
        >
          LM
        </span>
      </div>
    </header>
  )
}
