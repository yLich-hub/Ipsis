import type { Metadata } from 'next'

import { Console } from '@/components/agente/console'

export const metadata: Metadata = {
  title: 'Agente Penal — Jesbick',
  description:
    'Consulta à Lei 11.343/2006 e ao Código Penal, com toda citação resolvendo para o texto do banco.',
}

export default function AgentePage() {
  return <Console />
}
