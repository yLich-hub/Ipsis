// =============================================================================
// Peças de interface compartilhadas por todas as telas.
//
// O cartão de citação é a única forma de exibir texto legal no produto. Ele
// carrega vigência e cobertura por construção: quem escreve uma tela nova não
// tem como esquecer de mostrar a data de corte, porque não existe caminho para
// renderizar o texto sem ela. Ver CLAUDE.md, decisão nº 3.
// =============================================================================

import Link from 'next/link'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

import { Icone, type NomeIcone } from '@/components/icones'
import { dataBR } from '@/lib/formato'

// --- básicos -----------------------------------------------------------------

const TONS = {
  neutro: 'bg-slate-700/60 text-slate-300',
  esmeralda: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
  ambar: 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/25',
  vermelho: 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/25',
} as const

export function Selo({
  tom = 'neutro',
  children,
  title,
}: {
  tom?: keyof typeof TONS
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-[#0F172A] ${className}`}>{children}</div>
  )
}

export function Metrica({
  rotulo,
  valor,
  nota,
  tom = 'neutro',
}: {
  rotulo: string
  valor: ReactNode
  nota?: ReactNode
  tom?: 'neutro' | 'esmeralda' | 'ambar'
}) {
  const cor =
    tom === 'esmeralda' ? 'text-emerald-300' : tom === 'ambar' ? 'text-amber-300' : 'text-slate-100'
  return (
    <Cartao className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{rotulo}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${cor}`}>{valor}</p>
      {nota && <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{nota}</p>}
    </Cartao>
  )
}

export function Aviso({
  tom = 'ambar',
  children,
  className = '',
  ...resto
}: {
  tom?: 'ambar' | 'vermelho' | 'neutro' | 'esmeralda'
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const estilo =
    tom === 'vermelho'
      ? 'border-red-500/25 bg-red-500/[0.06] text-red-200/90'
      : tom === 'neutro'
        ? 'border-white/10 bg-white/[0.03] text-slate-400'
        : tom === 'esmeralda'
          ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200/90'
          : 'border-amber-400/20 bg-amber-400/[0.06] text-amber-200/90'
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${estilo} ${className}`}
      {...resto}
    >
      <Icone nome={tom === 'esmeralda' ? 'check' : 'alerta'} className="mt-px size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// --- formulário --------------------------------------------------------------

/**
 * Campo de texto com rótulo e erro no mesmo lugar.
 *
 * O erro é `aria-describedby` + `aria-invalid`, não só cor: leitor de tela e
 * daltônico precisam saber qual dos quatro campos reprovou. `noValidate` nos
 * formulários desliga o balão nativo do navegador — ele aparece em inglês na
 * metade dos casos e some ao trocar de aba.
 */
export function Campo({
  id,
  rotulo,
  erro,
  dica,
  className = '',
  ...resto
}: {
  id: string
  rotulo: string
  erro?: string | null
  dica?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
    className?: string
  }) {
  const idErro = `${id}-erro`
  const idDica = `${id}-dica`
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-wider text-slate-500"
      >
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : dica ? idDica : undefined}
        className={`mt-1.5 block w-full rounded-xl border bg-[#1E293B] px-3 py-2.5 text-[14px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60 ${
          erro
            ? 'border-red-500/40 focus:border-red-500/60'
            : 'border-white/10 focus:border-emerald-500/40'
        }`}
        {...resto}
      />
      {erro ? (
        <p id={idErro} className="mt-1.5 text-[12px] text-red-300">
          {erro}
        </p>
      ) : dica ? (
        <p id={idDica} className="mt-1.5 text-[12px] text-slate-500">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Botão de envio com estado de carregando embutido.
 *
 * `disabled` sai de `carregando` aqui dentro em vez de ficar por conta de quem
 * chama: submit duplicado em cadastro cria duas requisições de conta, e a
 * defesa não pode depender de cada tela lembrar de escrever a mesma linha.
 */
export function Botao({
  carregando = false,
  variante = 'primario',
  children,
  className = '',
  disabled,
  ...resto
}: {
  carregando?: boolean
  variante?: 'primario' | 'secundario'
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    className?: string
  }) {
  const estilo =
    variante === 'secundario'
      ? 'border border-white/10 text-slate-300 hover:bg-white/[0.06] hover:text-slate-100 disabled:text-slate-600'
      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500'
  return (
    <button
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed ${estilo} ${className}`}
      {...resto}
    >
      {carregando && (
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}

// --- citação -----------------------------------------------------------------

/**
 * O mínimo que a UI precisa para exibir um dispositivo. `busca_hibrida` e
 * `v_dispositivo` devolvem os mesmos campos com nomes ligeiramente diferentes;
 * a normalização acontece em quem chama, não aqui.
 */
export type Citavel = {
  id: string
  citacao: string
  texto: string
  rubrica: string | null
  contexto: string | null
  lei_apelido: string
  vigencia_ate: string
  cobertura: 'integral' | 'parcial'
  cobertura_nota: string | null
  revogado: boolean
  rubrica_termo?: string | null
  papel?: string | null
  score?: number | null
}

export function CartaoCitacao({ d, compacto = false }: { d: Citavel; compacto?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#0F172A]">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <Link
          href={`/dispositivo/${d.id}`}
          className="text-[13px] font-medium text-emerald-300 underline-offset-4 hover:underline"
        >
          {d.citacao}
        </Link>
        {d.rubrica && <Selo>{d.rubrica}</Selo>}
        {d.revogado && <Selo tom="vermelho">revogado</Selo>}
        {d.rubrica_termo && (
          <Selo tom="esmeralda" title={`Match exato de rubrica${d.papel ? ` · ${d.papel}` : ''}`}>
            ◆ rubrica “{d.rubrica_termo}”
          </Selo>
        )}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          <Icone nome="alerta" className="size-3" />
          vigente em {dataBR(d.vigencia_ate)}
        </span>
      </figcaption>

      <blockquote
        className={`px-4 py-3 text-[13.5px] leading-relaxed text-slate-300 ${compacto ? 'line-clamp-4' : ''}`}
      >
        {d.texto}
      </blockquote>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] px-4 py-2 text-[11.5px] text-slate-500">
        <Link
          href={`/dispositivo/${d.id}`}
          className="flex items-center gap-1.5 text-slate-400 transition-colors hover:text-emerald-300"
        >
          Abrir dispositivo
          <Icone nome="link_externo" className="size-3" />
        </Link>
        <span>
          {d.lei_apelido} ·{' '}
          {d.cobertura === 'parcial' ? (
            <span className="text-amber-300/80" title={d.cobertura_nota ?? undefined}>
              cobertura parcial
            </span>
          ) : (
            'cobertura integral'
          )}
        </span>
        {d.contexto && <span className="truncate text-slate-600">{d.contexto}</span>}
        {typeof d.score === 'number' && (
          <span className="ml-auto tabular-nums text-slate-600">score {d.score.toFixed(5)}</span>
        )}
      </div>
    </figure>
  )
}

// --- estados -----------------------------------------------------------------

export function Vazio({
  icone = 'busca',
  titulo,
  children,
}: {
  icone?: NomeIcone
  titulo: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-white/[0.04] text-slate-500">
        <Icone nome={icone} className="size-5" />
      </span>
      <h3 className="mt-3 text-[15px] font-medium text-slate-200">{titulo}</h3>
      <div className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{children}</div>
    </div>
  )
}

/**
 * Tela de item de menu que existe no desenho e **não** existe no produto.
 *
 * O escopo é estreito de propósito (só tráfico de drogas, uma peça, sem
 * autenticação): 30% do escopo com 100% de acabamento. Dizer isso na cara é
 * melhor que uma tela falsa cheia de números inventados — e é o que separa
 * recorte deliberado de projeto abandonado pela metade.
 */
export function ForaDeEscopo({
  titulo,
  porque,
  emVezDisso,
}: {
  titulo: string
  porque: ReactNode
  emVezDisso: { href: string; rotulo: string; nota: string }[]
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <span className="grid size-11 place-items-center rounded-xl bg-white/[0.04] text-slate-500">
        <Icone nome="cadeado" className="size-5" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-100">{titulo}</h2>
      <div className="mt-2 text-[13.5px] leading-relaxed text-slate-400">{porque}</div>

      <p className="mt-8 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        O que está de pé
      </p>
      <ul className="mt-2 space-y-2">
        {emVezDisso.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0F172A] px-4 py-3 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-slate-200">{a.rotulo}</span>
                <span className="block text-[12.5px] text-slate-500">{a.nota}</span>
              </span>
              <Icone
                nome="seta_direita"
                className="ml-auto size-4 shrink-0 text-slate-600 transition-colors group-hover:text-emerald-400"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ErroBanco({ erro }: { erro: string }) {
  return (
    <Aviso tom="vermelho" className="mx-auto max-w-2xl">
      <strong className="font-medium">A base não respondeu.</strong> O projeto roda no plano
      gratuito do Supabase, que pausa por inatividade — o cron diário em <code>/api/health</code>{' '}
      existe justamente para evitar isso. Detalhe técnico: <code>{erro}</code>
    </Aviso>
  )
}
