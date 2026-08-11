// =============================================================================
// Casca das telas de autenticação.
//
// Fora da casca do app de propósito: sidebar e trilho levam a rotas protegidas,
// e oferecer navegação para onde o visitante não pode entrar é convite a um
// redirect na cara dele. Aqui vale a mesma paleta do resto — mesmo fundo
// (#0B1220), mesmo cartão (#0F172A), mesma marca — só que num cartão centrado.
// =============================================================================

import Link from 'next/link'

import { Icone } from '@/components/icones'

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0B1220] text-slate-100">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mx-auto flex w-fit items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Icone nome="balanca" className="size-5 text-slate-950" strokeWidth={2} />
            </span>
            <span className="text-xl font-semibold tracking-tight text-slate-50">Jesbick</span>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              Penal
            </span>
          </Link>

          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0F172A] p-6 shadow-2xl shadow-black/40 sm:p-7">
            {children}
          </div>

          <p className="mt-6 text-center text-[11.5px] leading-relaxed text-slate-600">
            Consulta e geração de peças em tráfico de drogas. Base de legislação vigente em{' '}
            <strong className="font-medium text-slate-500">28/02/2025</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
