// =============================================================================
// Navegação: sidebar principal + trilho estreito de ícones
//
// Componentes de servidor — não têm estado. O que precisa de interação mora em
// console.tsx, para não arrastar a navegação inteira para o cliente.
// =============================================================================

import { Icone, type NomeIcone } from './icones'

type Item = { rotulo: string; icone: NomeIcone; ativo?: boolean; atalho?: string }

const MENU: Item[] = [
  { rotulo: 'Dashboard', icone: 'painel' },
  { rotulo: 'Agente Penal', icone: 'martelo', ativo: true },
  { rotulo: 'Jurisprudência', icone: 'balanca' },
  { rotulo: 'Documentos', icone: 'documento' },
]

const OUTROS: Item[] = [
  { rotulo: 'Fila de Análise', icone: 'fila', atalho: '3' },
  { rotulo: 'Gestão de Processos', icone: 'pasta_processo' },
  { rotulo: 'Relatórios', icone: 'grafico' },
]

const RODAPE: Item[] = [
  { rotulo: 'Suporte', icone: 'suporte' },
  { rotulo: 'Configurações', icone: 'engrenagem' },
]

function Grupo({ titulo, itens }: { titulo: string; itens: Item[] }) {
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {titulo}
      </p>
      <ul className="space-y-0.5">
        {itens.map((i) => (
          <li key={i.rotulo}>
            <a
              href="#"
              aria-current={i.ativo ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                i.ativo
                  ? 'bg-emerald-500/10 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
              }`}
            >
              <Icone
                nome={i.icone}
                className={`size-[18px] shrink-0 ${i.ativo ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}
              />
              <span className="truncate">{i.rotulo}</span>
              {i.atalho && (
                <span className="ml-auto rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-300">
                  {i.atalho}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SidebarPrincipal() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#0F172A] lg:flex">
      {/* marca */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Icone nome="balanca" className="size-[18px] text-slate-950" strokeWidth={2} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-slate-50">LexAI</span>
        <span className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Penal
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        <Grupo titulo="Menu principal" itens={MENU} />
        <Grupo titulo="Outros" itens={OUTROS} />
      </nav>

      {/* aviso de vigência — decisão nº 3 do projeto: a data de corte nunca sai
          da tela. Aqui vive no shell, não na página, para não depender de quem
          escreve cada tela lembrar de exibi-la. */}
      <div className="mx-3 mb-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-amber-300/90">
          <Icone nome="alerta" className="size-3.5" />
          Redação vigente
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Base atualizada até <strong className="text-slate-300">28/02/2025</strong>. CPP em
          cobertura parcial.
        </p>
      </div>

      <div className="border-t border-white/[0.06] px-3 py-3">
        <Grupo titulo="" itens={RODAPE} />
      </div>
    </aside>
  )
}

const TRILHO: { rotulo: string; icone: NomeIcone; ativo?: boolean }[] = [
  { rotulo: 'Novo chat', icone: 'novo_chat', ativo: true },
  { rotulo: 'Buscar', icone: 'busca' },
  { rotulo: 'Histórico', icone: 'historico' },
  { rotulo: 'Pastas', icone: 'pasta' },
]

export function Trilho() {
  return (
    <nav
      aria-label="Ações rápidas"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-[#0B1220] py-3"
    >
      <button
        type="button"
        aria-label="Recolher navegação"
        className="mb-2 grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
      >
        <Icone nome="paineis" className="size-[18px]" />
      </button>

      {TRILHO.map((t) => (
        <button
          key={t.rotulo}
          type="button"
          title={t.rotulo}
          aria-label={t.rotulo}
          aria-pressed={t.ativo}
          className={`grid size-9 place-items-center rounded-lg transition-colors ${
            t.ativo
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
              : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'
          }`}
        >
          <Icone nome={t.icone} className="size-[18px]" />
        </button>
      ))}

      <button
        type="button"
        title="Novidades"
        aria-label="Novidades"
        className="mt-auto grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
      >
        <Icone nome="faisca" className="size-[18px]" />
      </button>
    </nav>
  )
}
