'use client'

// =============================================================================
// Navegação: sidebar principal + trilho estreito de ícones
//
// Cliente por um motivo só: `usePathname` para marcar o item ativo. Nenhum
// outro estado mora aqui.
//
// Itens fora do recorte (fila, processos, relatórios) continuam no menu porque
// o desenho previa um produto maior — mas levam a uma tela que diz por que não
// existem, em vez de a um `href="#"` morto. Ver components/ui.tsx, ForaDeEscopo.
// =============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icone, type NomeIcone } from '@/components/icones'

type Item = {
  rotulo: string
  href: string
  icone: NomeIcone
  /** false = tela existe e explica por que o recurso está fora do escopo */
  escopo?: boolean
}

const MENU: Item[] = [
  { rotulo: 'Painel', href: '/painel', icone: 'painel' },
  { rotulo: 'Agente Penal', href: '/agente', icone: 'martelo' },
  { rotulo: 'Busca na legislação', href: '/busca', icone: 'busca' },
  { rotulo: 'Legislação', href: '/leis', icone: 'livro' },
  { rotulo: 'Peças', href: '/pecas', icone: 'documento' },
  { rotulo: 'Jurisprudência', href: '/jurisprudencia', icone: 'balanca' },
]

const OUTROS: Item[] = [
  { rotulo: 'Fila de Análise', href: '/fila', icone: 'fila', escopo: false },
  { rotulo: 'Gestão de Processos', href: '/processos', icone: 'pasta_processo', escopo: false },
  { rotulo: 'Relatórios', href: '/relatorios', icone: 'grafico', escopo: false },
]

const RODAPE: Item[] = [
  { rotulo: 'Como funciona', href: '/suporte', icone: 'suporte' },
  { rotulo: 'Diagnóstico', href: '/configuracoes', icone: 'engrenagem' },
]

const ativoEm = (caminho: string, href: string) =>
  caminho === href || caminho.startsWith(`${href}/`)

function Grupo({ titulo, itens, caminho }: { titulo: string; itens: Item[]; caminho: string }) {
  return (
    <div>
      {titulo && (
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {titulo}
        </p>
      )}
      <ul className="space-y-0.5">
        {itens.map((i) => {
          const ativo = ativoEm(caminho, i.href)
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={ativo ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  ativo
                    ? 'bg-emerald-500/10 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
                    : i.escopo === false
                      ? 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                <Icone
                  nome={i.icone}
                  className={`size-[18px] shrink-0 ${
                    ativo ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                <span className="truncate">{i.rotulo}</span>
                {i.escopo === false && (
                  <Icone
                    nome="cadeado"
                    aria-hidden="true"
                    className="ml-auto size-3.5 shrink-0 text-slate-600"
                  />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SidebarPrincipal() {
  const caminho = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#0F172A] lg:flex">
      {/* marca */}
      <Link href="/" className="flex h-16 items-center gap-2.5 px-4">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Icone nome="balanca" className="size-[18px] text-slate-950" strokeWidth={2} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-slate-50">Jesbick</span>
        <span className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Penal
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        <Grupo titulo="Menu principal" itens={MENU} caminho={caminho} />
        <Grupo titulo="Fora do recorte" itens={OUTROS} caminho={caminho} />
      </nav>

      {/* Decisão nº 3 do projeto: a data de corte nunca sai da tela. Vive no
          shell, não na página, para não depender de quem escreve cada tela. */}
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
        <Grupo titulo="" itens={RODAPE} caminho={caminho} />
      </div>
    </aside>
  )
}

const TRILHO: Item[] = [
  { rotulo: 'Novo chat', href: '/agente', icone: 'novo_chat' },
  { rotulo: 'Buscar', href: '/busca', icone: 'busca' },
  { rotulo: 'Legislação', href: '/leis', icone: 'livro' },
  { rotulo: 'Painel', href: '/painel', icone: 'painel' },
]

export function Trilho() {
  const caminho = usePathname()

  return (
    <nav
      aria-label="Ações rápidas"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-[#0B1220] py-3"
    >
      <Link
        href="/"
        title="Página inicial"
        aria-label="Página inicial"
        className="mb-2 grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200 lg:text-slate-500"
      >
        <Icone nome="paineis" className="size-[18px]" />
      </Link>

      {TRILHO.map((t) => {
        const ativo = ativoEm(caminho, t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            title={t.rotulo}
            aria-label={t.rotulo}
            aria-current={ativo ? 'page' : undefined}
            className={`grid size-9 place-items-center rounded-lg transition-colors ${
              ativo
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
                : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'
            }`}
          >
            <Icone nome={t.icone} className="size-[18px]" />
          </Link>
        )
      })}

      <Link
        href="/suporte"
        title="Como funciona"
        aria-label="Como funciona"
        className="mt-auto grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
      >
        <Icone nome="faisca" className="size-[18px]" />
      </Link>
    </nav>
  )
}
