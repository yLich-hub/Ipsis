// =============================================================================
// Peças de interface compartilhadas pelas telas que vieram antes do TOGA v2.
//
// O cartão de citação é a única forma de exibir texto legal no produto. Ele
// carrega vigência e cobertura por construção: quem escreve uma tela nova não
// tem como esquecer de mostrar a data de corte, porque não existe caminho para
// renderizar o texto sem ela. Ver CLAUDE.md, decisão nº 3.
//
// Migrado para a paleta clara do TOGA v2 sem mudar a API: as telas que já
// importavam `Selo`, `Cartao`, `Campo` e companhia continuam funcionando. Os
// primitivos novos, desenhados a partir do documento, moram em
// `components/toga/base.tsx`; os estados de exceção, em `components/toga/estados.tsx`
// — daqui eles são só reexportados, para não existirem duas implementações da
// mesma tela de banco fora do ar.
// =============================================================================

import Link from 'next/link'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

import { Icone } from '@/components/icones'
import { dataBR } from '@/lib/formato'

export { Aviso, ErroBanco, ForaDeEscopo, Vazio } from '@/components/toga/estados'

// --- básicos -----------------------------------------------------------------

const TONS = {
  neutro: 'bg-tg-preenche text-tg-corpo',
  esmeralda: 'bg-tg-verde-fundo text-tg-verde-txt',
  ambar: 'bg-tg-ambar-fundo text-tg-ambar-txt',
  vermelho: 'bg-tg-supressao-fundo text-tg-supressao-txt',
  acento: 'bg-tg-acento-fraco text-tg-acento-txt',
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-[9px] py-[3px] text-[10.5px] font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] bg-white shadow-[var(--tg-elev-1)] ${className}`}>
      {children}
    </div>
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
    tom === 'esmeralda' ? 'text-tg-verde-txt' : tom === 'ambar' ? 'text-tg-ambar-txt' : 'text-tg-acento'
  return (
    <Cartao className="p-4">
      <p className="text-[11px] font-medium text-tg-fraco-3">{rotulo}</p>
      {/* Serifada e grande: o número é o conteúdo do cartão, e a serifa é a voz
          que o documento de design reserva para o que se lê, não para o que se
          clica. */}
      <p className={`mt-1 font-tg-serif text-[28px] leading-none -tracking-[0.01em] ${cor}`}>
        {valor}
      </p>
      {nota && <p className="mt-2 text-[12px] leading-[1.5] text-tg-fraco-2">{nota}</p>}
    </Cartao>
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
      <label htmlFor={id} className="block text-[11px] font-medium text-tg-fraco-3">
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : dica ? idDica : undefined}
        className={`mt-1.5 block w-full rounded-xl border bg-tg-preenche px-3.5 py-2.5 text-[14px] text-tg-tinta outline-none transition-colors placeholder:text-tg-tenue-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          erro
            ? 'border-tg-supressao-txt/50 focus:border-tg-supressao-txt'
            : 'border-transparent focus:border-tg-acento-palido focus:bg-white'
        }`}
        {...resto}
      />
      {erro ? (
        <p id={idErro} className="mt-1.5 text-[12px] text-tg-supressao-txt">
          {erro}
        </p>
      ) : dica ? (
        <p id={idDica} className="mt-1.5 text-[12px] text-tg-fraco-2">
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
      ? 'bg-tg-preenche text-tg-corpo hover:bg-tg-preenche-alto disabled:text-tg-tenue-2'
      : 'bg-tg-acento text-white shadow-[var(--tg-elev-acento)] hover:brightness-110 disabled:bg-tg-acento-claro disabled:shadow-none'
  return (
    <button
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`tgb inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium disabled:cursor-not-allowed ${estilo} ${className}`}
      {...resto}
    >
      {carregando && (
        <span
          aria-hidden="true"
          className="tg-gira size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent"
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
    <figure className="overflow-hidden rounded-[18px] bg-white shadow-[var(--tg-elev-1)]">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-tg-linha-fraca px-4 py-2.5">
        <Link
          href={`/dispositivo/${d.id}`}
          className="text-[13px] font-medium text-tg-acento-txt underline-offset-4 hover:underline"
        >
          {d.citacao}
        </Link>
        {d.rubrica && <Selo>{d.rubrica}</Selo>}
        {d.revogado && <Selo tom="vermelho">revogado</Selo>}
        {d.rubrica_termo && (
          <Selo tom="acento" title={`Match exato de rubrica${d.papel ? ` · ${d.papel}` : ''}`}>
            ◆ rubrica “{d.rubrica_termo}”
          </Selo>
        )}
        <span className="ml-auto text-[11px] text-tg-fraco-3">
          vigente em {dataBR(d.vigencia_ate)}
        </span>
      </figcaption>

      {/* Serifada: é texto de lei, a única voz do produto que a Source Serif
          carrega. Ver o cabeçalho de globals.css. */}
      <blockquote
        className={`px-4 py-3.5 font-tg-serif text-[14px] leading-[1.75] text-tg-tinta-4 ${
          compacto ? 'line-clamp-4' : ''
        }`}
      >
        {d.texto}
      </blockquote>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-tg-linha-fraca px-4 py-2 text-[11.5px] text-tg-fraco-3">
        <Link
          href={`/dispositivo/${d.id}`}
          className="flex items-center gap-1.5 text-tg-corpo transition-colors hover:text-tg-acento-txt"
        >
          Abrir dispositivo
          <Icone nome="link_externo" className="size-3" />
        </Link>
        <span>
          {d.lei_apelido} ·{' '}
          {d.cobertura === 'parcial' ? (
            <span className="text-tg-ambar-txt" title={d.cobertura_nota ?? undefined}>
              cobertura parcial
            </span>
          ) : (
            'cobertura integral'
          )}
        </span>
        {d.contexto && <span className="truncate text-tg-tenue-2">{d.contexto}</span>}
        {typeof d.score === 'number' && (
          <span className="ml-auto tabular-nums text-tg-tenue-2">score {d.score.toFixed(5)}</span>
        )}
      </div>
    </figure>
  )
}
