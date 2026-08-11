// =============================================================================
// Cabeçalho e rodapé comuns aos quatro formulários de autenticação.
//
// Existe para que título, subtítulo e a linha de links tenham exatamente o
// mesmo espaçamento nas quatro telas: o usuário navega entre elas em sequência
// (login → esqueci → redefinir → login) e desalinhamento entre passos do mesmo
// fluxo lê como tela de phishing.
// =============================================================================

import Link from 'next/link'
import type { ReactNode } from 'react'

export function Moldura({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <h1 className="text-[17px] font-semibold tracking-tight text-slate-50">{titulo}</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{sub}</p>
      <div className="mt-6">{children}</div>
    </>
  )
}

export function LinkAuth({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded text-[12.5px] text-slate-400 underline-offset-4 transition-colors hover:text-emerald-300 hover:underline"
    >
      {children}
    </Link>
  )
}
