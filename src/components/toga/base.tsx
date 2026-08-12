// =============================================================================
// TOGA v2 — primitivos
//
// As formas que o documento de design repete de tela em tela, cada uma escrita
// uma vez. O critério para algo entrar aqui é aparecer em duas telas ou mais;
// forma que só existe numa tela mora na tela, para não inflar este arquivo com
// abstração de um uso só.
//
// Vários destes são desenhados com borda em vez de SVG — o visto, o cursor, a
// seta do botão de envio. É assim no documento, e é a escolha certa: um `check`
// de 5×2,5px feito de duas bordas rotacionadas fica nítido em qualquer densidade
// de tela, enquanto um SVG desse tamanho vira borrão em 1×.
// =============================================================================

import type { ReactNode } from 'react'

// --- selos e pílulas ---------------------------------------------------------

const TONS = {
  /** Vigência confirmada. É o selo mais comum do produto e o único verde. */
  verde: 'bg-tg-verde-fundo text-tg-verde-txt',
  /** Redação alterada, cobertura parcial — tudo que pede conferência. */
  ambar: 'bg-tg-ambar-fundo text-tg-ambar-txt',
  /** Marcação do próprio produto: rubrica, tema, trecho citado. */
  acento: 'bg-tg-acento-fraco text-tg-acento-txt',
  /** Sigla de tribunal e afins — máximo contraste, uso escasso. */
  escuro: 'bg-tg-acento text-white',
  neutro: 'bg-tg-preenche text-tg-corpo',
} as const

export type Tom = keyof typeof TONS

/**
 * Etiqueta estática. `shrink-0` por padrão porque quase todo selo vive numa
 * linha com texto elipsado ao lado — sem isso é o selo que encolhe, e um selo
 * de vigência cortado no meio é pior que nenhum.
 */
export function Selo({
  tom = 'neutro',
  children,
  className = '',
  title,
}: {
  tom?: Tom
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-full px-[9px] py-[3px] text-[10.5px] font-medium ${TONS[tom]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Pílula clicável — aba, filtro ativo, sugestão, modo de busca.
 *
 * É `<button>` e não `<span class="tgb">` como no documento: o protótipo não
 * precisa ser navegável por teclado, o produto precisa. O visual é idêntico.
 */
export function Pilula({
  ativa = false,
  onClick,
  children,
  className = '',
  title,
  type = 'button',
}: {
  ativa?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={onClick ? ativa : undefined}
      title={title}
      className={`tgb inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-medium ${
        ativa
          ? 'bg-tg-acento-fraco text-tg-acento-txt hover:bg-tg-acento-fraco-3'
          : 'bg-tg-preenche text-tg-corpo hover:bg-tg-preenche-alto'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Superfície branca padrão: raio 18px, elevação de repouso, sem borda. */
export function Cartao({
  children,
  className = '',
  flutua = false,
}: {
  children: ReactNode
  className?: string
  /** Liga o levantar-no-hover. Só para cartão que é alvo de clique. */
  flutua?: boolean
}) {
  return (
    <div
      className={`rounded-[18px] bg-white shadow-[var(--tg-elev-1)] ${flutua ? 'tgc' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// --- sinais de estado --------------------------------------------------------

/**
 * Visto. Duas bordas de um retângulo de 5×2,5px, giradas 45°.
 *
 * O `translate(0,-1px)` do documento corrige o deslocamento que a rotação
 * introduz — sem ele o visto assenta baixo demais dentro do círculo.
 */
export function Visto({ espessura = 1.6, cor = '#fff' }: { espessura?: number; cor?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 5,
        height: 2.5,
        borderLeft: `${espessura}px solid ${cor}`,
        borderBottom: `${espessura}px solid ${cor}`,
        transform: 'rotate(-45deg) translate(0,-1px)',
      }}
    />
  )
}

/**
 * Anel de carregamento. Track e cabeça separados: sobre fundo escuro o track é
 * branco translúcido, sobre fundo claro é cinza sólido.
 */
export function Girador({
  tamanho = 12,
  espessura = 1.8,
  trilho = '#dcdde4',
  cabeca = 'var(--color-tg-acento-medio)',
  className = '',
}: {
  tamanho?: number
  espessura?: number
  trilho?: string
  cabeca?: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`tg-gira shrink-0 rounded-full ${className}`}
      style={{
        width: tamanho,
        height: tamanho,
        border: `${espessura}px solid ${trilho}`,
        borderTopColor: cabeca,
      }}
    />
  )
}

/** Ponto de status. Pulsa quando o que ele indica está vivo agora. */
export function Ponto({
  cor = 'var(--color-tg-verde)',
  tamanho = 6,
  pulsa = false,
}: {
  cor?: string
  tamanho?: number
  pulsa?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded-full ${pulsa ? 'tg-pulsa' : ''}`}
      style={{ width: tamanho, height: tamanho, background: cor }}
    />
  )
}

/** Retângulo de carregamento. A animação de varredura mora em `.tgsk`. */
export function Esqueleto({ className = '', style }: { className?: string; style?: object }) {
  return <span aria-hidden="true" className={`tgsk block ${className}`} style={style} />
}

/** Divisória vertical entre metadados numa mesma linha. */
export function Barrinha() {
  return <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[#e2e4ea]" />
}

// --- controles ---------------------------------------------------------------

/**
 * Interruptor. 38×22 com botão de 18 que anda 16px.
 *
 * O `<button role="switch">` cobre a linha inteira em quem chama (dosimetria):
 * alvo de clique de 38px de largura é pequeno demais para o dedo, e a linha
 * toda já é o rótulo do interruptor.
 */
export function Chave({ ligada }: { ligada: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
        ligada ? 'bg-tg-acento' : 'bg-tg-caixa'
      }`}
    >
      <span
        className="absolute top-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(18_20_30_/_0.3)] transition-[left] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ left: ligada ? 18 : 2 }}
      />
    </span>
  )
}

/**
 * Caixa de marcação dos filtros — 15×15, raio 5, visto branco quando ligada.
 */
export function Caixinha({ marcada }: { marcada: boolean }) {
  return (
    <span
      className={`grid size-[15px] shrink-0 place-items-center rounded-[5px] transition-colors ${
        marcada ? 'bg-tg-acento' : 'bg-tg-caixa'
      }`}
    >
      {marcada && <Visto espessura={1.7} />}
    </span>
  )
}

/**
 * Seletor segmentado dentro de uma pílula cinza. Usado pelos oito vetores do
 * art. 59; a opção ativa é uma pílula branca com sombra, que é o que dá a
 * impressão de "pastilha deslizando" sem precisar animar posição.
 */
export function Segmentado<T extends string>({
  valor,
  opcoes,
  aoTrocar,
  rotulo,
}: {
  valor: T
  opcoes: { v: T; t: string }[]
  aoTrocar: (v: T) => void
  rotulo: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="flex flex-1 gap-1 rounded-full bg-tg-preenche p-[3px]"
    >
      {opcoes.map((o) => {
        const ativa = valor === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => aoTrocar(o.v)}
            className={`tgb flex-1 rounded-full px-1 py-1.5 text-center text-[11.5px] font-medium ${
              ativa
                ? 'bg-white text-tg-tinta shadow-[0_1px_3px_rgb(18_20_30_/_0.16)]'
                : 'text-tg-fraco-2 hover:text-tg-corpo'
            }`}
          >
            {o.t}
          </button>
        )
      })}
    </div>
  )
}

// --- cabeçalho de tela -------------------------------------------------------

/**
 * O par título serifado + linha de apoio que abre Súmulas, Dosimetria, Vade
 * Mecum e Fontes. Existe para as quatro não divergirem em 1px de `margin-top`.
 */
export function TituloTela({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-end gap-4">
      <div className="min-w-0">
        <h1 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
          {titulo}
        </h1>
        <p className="mt-1.5 text-[13px] text-tg-fraco-2">{sub}</p>
      </div>
      <span className="flex-1" />
      {children}
    </div>
  )
}

/**
 * Botão de ação primária: pílula do acento, texto branco, sombra colorida.
 * A sombra é do próprio roxo e não preta — é o que faz o botão parecer
 * assentado sobre o fundo claro em vez de recortado nele.
 */
export function BotaoAcento({
  children,
  onClick,
  className = '',
  type = 'button',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`tgb inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-tg-acento px-3.5 py-2 text-[12px] font-medium text-white shadow-[var(--tg-elev-acento-forte)] disabled:cursor-not-allowed disabled:bg-tg-acento-claro ${className}`}
    >
      {children}
    </button>
  )
}

/** Botão secundário: pílula branca sobre o fundo cinza. */
export function BotaoClaro({
  children,
  onClick,
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`tgb inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-[12px] font-medium text-tg-corpo shadow-[var(--tg-elev-1f)] hover:shadow-[var(--tg-elev-3)] ${className}`}
    >
      {children}
    </button>
  )
}
