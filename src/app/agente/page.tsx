import type { Metadata } from 'next'

import { Console } from '@/components/agente/console'
import { SidebarPrincipal, Trilho } from '@/components/agente/navegacao'

export const metadata: Metadata = {
  title: 'Agente Penal — LexAI',
  description:
    'Consulta ao Código Penal, à Lei 11.343/2006 e à LEP, com toda citação resolvendo para o texto do banco.',
}

// `h-dvh` + `overflow-hidden`: o shell não rola. Quem rola é a conversa, dentro
// do console — do contrário a caixa de entrada sai da tela numa consulta longa.
export default function AgentePage() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#0B1220] text-slate-100">
      <SidebarPrincipal />
      <Trilho />
      <Console />
    </div>
  )
}
