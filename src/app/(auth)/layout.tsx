// =============================================================================
// Casca das telas de autenticação.
//
// Fora da casca do app de propósito: a lateral leva a rotas protegidas, e
// oferecer navegação para onde o visitante não pode entrar é convite a um
// redirect na cara dele. Aqui vale a mesma paleta do resto — mesmo fundo
// (#f7f8fa), mesmo cartão branco, mesma marca — só que num cartão centrado.
// =============================================================================

import { GRADIENTE_MARCA } from '@/lib/toga/tokens'
import { MARCA } from '@/lib/toga/marca'

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-tg-fundo text-tg-tinta">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          {/* Marca sem link: a raiz agora só desvia de volta para cá, e um
              logotipo clicável que recarrega a mesma tela é ruído. */}
          <div className="mx-auto flex w-fit items-center gap-2.5">
            <span
              className="grid size-9 place-items-center rounded-xl font-tg-serif text-[17px] font-semibold text-white shadow-[var(--tg-elev-marca)]"
              style={{ background: GRADIENTE_MARCA }}
            >
              {MARCA.inicial}
            </span>
            <span className="text-xl font-semibold -tracking-[0.01em] text-tg-tinta">{MARCA.nome}</span>
            <span className="rounded-full bg-tg-acento-fraco px-2 py-0.5 text-[10px] font-medium text-tg-acento-txt">
              {MARCA.ramo}
            </span>
          </div>

          <div className="mt-6 rounded-[22px] bg-white p-6 shadow-[var(--tg-elev-entrada)] sm:p-7">
            {children}
          </div>

          <p className="mt-6 text-center text-[11.5px] leading-relaxed text-tg-tenue-2">
            Consulta e geração de peças em tráfico de drogas. Base de legislação vigente em{' '}
            <strong className="font-medium text-tg-fraco-3">28/02/2025</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
