// =============================================================================
// Conjunto de ícones — SVG inline, traço de 1.6
//
// Escrito à mão em vez de puxar uma biblioteca: são 22 ícones, o bundle fica em
// zero e o traço é consistente com o resto da interface. Trocar por lucide-react
// depois é substituir este arquivo, nada mais.
// =============================================================================

import type { ReactNode, SVGProps } from 'react'

export type NomeIcone = keyof typeof CAMINHOS

const CAMINHOS = {
  balanca: (
    <>
      <path d="M12 3v18M8 21h8M3 7h18M3 7l3 7M3 14h6M6 7l-3 7M18 7l3 7M15 14h6M21 7l-3 7" />
      <path d="M9 7 12 4l3 3" />
    </>
  ),
  painel: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  martelo: (
    <>
      <path d="m14 13-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10" />
      <path d="m14.5 4.5 5 5M12 7l5 5M17 2l5 5M9.5 12.5l2 2" />
    </>
  ),
  livro: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3v5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  fila: (
    <>
      <path d="M3 12h5l2 3h4l2-3h5" />
      <path d="M4.5 6h15M6 18h12" />
    </>
  ),
  pasta_processo: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 12h6M9 15h4" />
    </>
  ),
  grafico: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  suporte: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m9.5 9.5-3-3M14.5 9.5l3-3M9.5 14.5l-3 3M14.5 14.5l3 3" />
    </>
  ),
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  novo_chat: (
    <>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  historico: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4M12 7.5V12l3 2" />
    </>
  ),
  pasta: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  clipe: (
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L11 17a2 2 0 0 1-3-3l7.5-7.5" />
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  seta_cima: <path d="M12 19V5M5 12l7-7 7 7" />,
  sino: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </>
  ),
  envelope: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  faisca: (
    <>
      <path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18l-1.8-5.4L5 10.8 10.2 9z" />
      <path d="M19 3v3M20.5 4.5h-3" />
    </>
  ),
  paineis: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 4v16" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4.5 2.8 20h18.4z" />
      <path d="M12 10v4M12 17.2v.1" />
    </>
  ),
  link_externo: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  seta_direita: <path d="M5 12h14M13 5l7 7-7 7" />,
  seta_esquerda: <path d="M19 12H5M11 19l-7-7 7-7" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  xis: <path d="M6 6l12 12M18 6 6 18" />,
  banco: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  filtro: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
} satisfies Record<string, ReactNode>

export function Icone({
  nome,
  ...props
}: { nome: NomeIcone } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {CAMINHOS[nome]}
    </svg>
  )
}
