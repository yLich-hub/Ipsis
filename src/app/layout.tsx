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
      {/* O tema do produto é escuro. Definir aqui evita que o overscroll do
          navegador revele uma faixa branca por trás das telas do agente. */}
      <body className="min-h-dvh bg-[#0B1220] text-slate-100 antialiased">{children}</body>
    </html>
  )
}
