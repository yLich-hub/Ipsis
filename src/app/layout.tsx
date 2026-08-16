import type { Metadata } from 'next'
import './globals.css'
import { MARCA } from '@/lib/toga/marca'

export const metadata: Metadata = {
  title: `${MARCA.nome} — ${MARCA.descricao}`,
  description:
    'Consulta à Lei 11.343/2006, ao Código Penal e a um subconjunto curado do CPP, ' +
    'com geração de resposta à acusação. Toda citação resolve para o texto do banco.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/*
          Duas famílias, e cada uma tem um trabalho: Inter Tight é a voz da
          interface (rótulo, botão, metadado) e Source Serif 4 é a voz do texto
          jurídico (lei, ementa, resposta do assistente). A divisão é do
          documento de design e não é decorativa — ela separa, sem precisar de
          moldura, o que o produto afirma do que o produto cita.

          Carregadas por <link> e não por `next/font/google` de propósito:
          `next/font` baixa o arquivo em tempo de build, e este projeto tem de
          buildar em máquina sem rede. `display=swap` mostra a fallback antes,
          e as duas fallbacks declaradas em `--font-tg` têm métrica próxima o
          bastante para a troca não empurrar o layout.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* A regra `no-page-custom-font` existe para o Pages Router, onde uma
            fonte declarada numa página só carrega naquela página. Aqui o link
            está no layout raiz do App Router, então vale para o app inteiro —
            que é justamente o que a regra pede. A troca por `next/font` está
            recusada de propósito: ela baixa a fonte em tempo de build e
            impediria buildar sem rede. Ver o comentário acima. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Inter+Tight:wght@400;500;600&display=swap"
        />
      </head>
      {/* O tema do produto é claro. Definir a cor aqui evita que o overscroll do
          navegador revele uma faixa branca por trás do fundo #f7f8fa. */}
      <body className="min-h-dvh bg-tg-fundo font-tg text-tg-tinta antialiased">{children}</body>
    </html>
  )
}
