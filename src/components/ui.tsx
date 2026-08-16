// =============================================================================
// Peças de interface compartilhadas pelas telas que vieram antes do TOGA v2.
//
// O que sobrou aqui é o que as telas de autenticação e as de corpus (`/leis`,
// `/artigo`, `/dispositivo`, `/pecas`) ainda importam: `Selo`, `Cartao`, `Campo`
// e `Botao`. Os primitivos do desenho novo moram em `components/toga/base.tsx`;
// os estados de exceção, em `components/toga/estados.tsx` — daqui eles são só
// reexportados, para não existirem duas implementações da mesma tela de banco
// fora do ar.
//
// `CartaoCitacao` e `Metrica` saíram junto com as telas que as usavam. Quem
// exibe texto legal hoje é `components/artigo.tsx` e o painel de fonte da
// Consulta, e os dois carregam vigência e cobertura por construção — a decisão
// nº 3 continua sem caminho para ser esquecida.
// =============================================================================

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

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

// `Metrica` — cartão de número grande com rótulo e nota — foi escrita para o
// `/painel` de diagnóstico, que saiu da navegação. As telas que hoje mostram
// número (Fontes, Configurações, Vade Mecum) o fazem dentro dos próprios cartões
// do TOGA v2, com tipografia diferente desta.

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
//
// `CartaoCitacao` e o tipo `Citavel` que o alimentava saíram: eram do console
// anterior (`/agente`, hoje um redirect para `/consulta`) e do `/busca`, e
// nenhuma das sete telas os importava. O cartão de fonte do TOGA v2 mora em
// `components/toga/consulta.tsx`, lê o `Achado` direto e mostra outra coisa —
// entre elas o `score`, que este imprimia com cinco casas na cara do usuário.
//
// Não é duplicação a trancar como a de `tests/vigilia.test.ts`: era uma segunda
// implementação sem ninguém do outro lado.

