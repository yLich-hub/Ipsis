import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jesbick — consulta e peças em tráfico de drogas',
  description:
    'Consulta à Lei 11.343/2006, ao Código Penal e a um subconjunto curado do CPP, ' +
    'com geração de resposta à acusação. Toda citação resolve para o texto do banco.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
