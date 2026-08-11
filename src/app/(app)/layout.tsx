// =============================================================================
// Casca do app — sidebar + trilho + área de conteúdo.
//
// `h-dvh` + `overflow-hidden`: a casca não rola. Quem rola é o conteúdo, dentro
// da <main> — do contrário a caixa de entrada do agente sai da tela numa
// consulta longa, e o cabeçalho some ao percorrer um artigo do CP.
//
// Tudo abaixo deste layout exige sessão. O porteiro é o middleware; a
// verificação repetida aqui não é redundância inútil: se o `matcher` do
// middleware deixar de casar uma rota nova, é este `redirect` que impede a
// página de renderizar para quem não entrou. Custa uma chamada por navegação e
// paga por si na primeira vez que o matcher errar.
// =============================================================================

import { redirect } from 'next/navigation'

import { ProvedorSessao } from '@/components/casca/sessao'
import { SidebarPrincipal, Trilho } from '@/components/casca/navegacao'
import { ROTA_LOGIN } from '@/lib/auth/rotas'
import { usuarioAtual } from '@/lib/auth/servidor'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual()
  if (!usuario) redirect(ROTA_LOGIN)

  return (
    <ProvedorSessao usuarioInicial={usuario}>
      <div className="flex h-dvh overflow-hidden bg-[#0B1220] text-slate-100">
        <SidebarPrincipal />
        <Trilho />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ProvedorSessao>
  )
}
