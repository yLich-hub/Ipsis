// =============================================================================
// Casca do app — sidebar + trilho + área de conteúdo.
//
// `h-dvh` + `overflow-hidden`: a casca não rola. Quem rola é o conteúdo, dentro
// da <main> — do contrário a caixa de entrada do agente sai da tela numa
// consulta longa, e o cabeçalho some ao percorrer um artigo do CP.
// =============================================================================

import { SidebarPrincipal, Trilho } from '@/components/casca/navegacao'

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0B1220] text-slate-100">
      <SidebarPrincipal />
      <Trilho />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
