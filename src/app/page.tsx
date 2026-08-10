import Link from 'next/link'

// Placeholder do incremento 1. A busca entra no incremento 3 e o acabamento
// visual no 5 — ver "Ordem de trabalho" no CLAUDE.md.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Jesbick</h1>
      <p className="mt-2 text-slate-400">Consulta e geração de peças em tráfico de drogas.</p>

      {/* A data de corte é visível o tempo todo — decisão nº 3 do CLAUDE.md. */}
      <p className="mt-8 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-200/90">
        Redação vigente em <strong className="text-amber-100">28/02/2025</strong> (Vade Mecum Senado
        Federal, 1ª ed.). O CPP está no banco em cobertura parcial.
      </p>

      <Link
        href="/agente"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400"
      >
        Abrir o Agente Penal
        <span aria-hidden="true">→</span>
      </Link>
    </main>
  )
}
