// Placeholder do incremento 1. A busca entra no incremento 3 e o acabamento
// visual no 5 — ver "Ordem de trabalho" no CLAUDE.md.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Jesbick</h1>
      <p className="mt-2 text-neutral-600">
        Consulta e geração de peças em tráfico de drogas.
      </p>

      {/* A data de corte é visível o tempo todo — decisão nº 3 do CLAUDE.md.
          Aqui já como componente de layout, para não virar remendo depois. */}
      <p className="mt-8 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Redação vigente em <strong>28/02/2025</strong> (Vade Mecum Senado Federal, 1ª ed.).
        O CPP está no banco em cobertura parcial.
      </p>
    </main>
  )
}
