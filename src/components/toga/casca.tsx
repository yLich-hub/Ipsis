'use client'

// =============================================================================
// TOGA v2 — casca: lateral de 246px e topo de 60px
//
// Cliente por três motivos, todos irredutíveis: `usePathname` marca o item
// ativo, os atalhos de teclado (⌘K, ⌘N) precisam de listener, e o menu da conta
// tem estado aberto/fechado. Nada além disso mora aqui — cada tela cuida do
// próprio estado.
//
// A lateral tem largura fixa. Não é preguiça de fazer responsivo: os painéis do
// documento de design (420px no chat, 352px na dosimetria, 404px no Vade Mecum)
// foram medidos contra estes 246px, e deixar a lateral respirar desalinharia
// todos eles. Abaixo de `lg` a lateral sai de cena inteira, e o topo ganha o
// botão que a traz de volta.
//
// **Colapso não contradiz isso.** São dois valores fixos — 246px e 64px —, e não
// uma lateral fluida: o conteúdo continua encontrando uma das duas medidas, nunca
// uma intermediária. Só vale a partir de `lg`; abaixo disso a lateral já é uma
// gaveta que entra e sai inteira, e recolher uma gaveta não significa nada.
//
// O que some na trilha: rótulos, histórico, busca e o cartão de base. O que
// fica: a marca, "Nova consulta", os sete quadradinhos coloridos com `title`, e
// o ponto vivo da data de corte — este último porque a decisão nº 3 diz que a
// data é visível o tempo todo, e "recolhi o menu" não é motivo para ela sumir.
// =============================================================================

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useUsuario, marcarSaidaDeliberada } from '@/components/casca/sessao'
import { Icone } from '@/components/icones'
import { Selo } from '@/components/toga/base'
import { supabaseNavegador } from '@/lib/auth/navegador'
import {
  EVENTO_HISTORICO,
  type Conversa,
  agrupa as agrupaConversas,
  lista as listaConversas,
  procura as procuraConversas,
  remove as removeConversa,
} from '@/lib/toga/historico'
import { carrega as carregaPerfil, iniciais, usePerfil } from '@/lib/toga/perfil'
import {
  EVENTO_PREFERENCIAS,
  aplicaMovimento,
  gravaColapso,
  leColapso,
  leMovimentoReduzido,
} from '@/lib/toga/preferencias'
import { GRADIENTE_CONTA, GRADIENTE_MARCA, MATIZ } from '@/lib/toga/tokens'
import { MARCA } from '@/lib/toga/marca'

// --- mapa de telas -----------------------------------------------------------

/**
 * As telas do produto, na ordem do documento. `matiz` é só a cor do quadradinho
 * de 18px que faz as vezes de ícone — ver `lib/toga/tokens.ts`.
 *
 * São seis: as cinco do documento que sobreviveram mais Fontes, que voltou como
 * vigília. **Configurações saiu da lateral a pedido** — ela agora se alcança
 * pelo botão da conta, no rodapé, que é onde se procura por ajuste de conta em
 * qualquer produto. Continua na paleta do ⌘K, como Legislação e Peças.
 */
const TELAS = [
  { href: '/consulta', rotulo: 'Consulta em chat', matiz: MATIZ.lavanda },
  { href: '/jurisprudencia', rotulo: 'Jurisprudência', matiz: MATIZ.gelo },
  { href: '/dosimetria', rotulo: 'Dosimetria', matiz: MATIZ.sabia },
  { href: '/vademecum', rotulo: 'Vade Mecum', matiz: MATIZ.rosa },
  { href: '/clientes', rotulo: 'Clientes', matiz: MATIZ.lilas },
  // Fontes voltou à lateral, mas como vigília e não como painel de coletor: ela
  // é o lugar em que a decisão nº 3 vira uma pergunta respondível — "a
  // fotografia de 28/02/2025 ainda vale?". Fica antes de Configurações porque é
  // tela de trabalho, não de ajuste.
  { href: '/fontes', rotulo: 'Fontes e atualizações', matiz: MATIZ.areia },
] as const

/**
 * Título e linha de apoio do topo, por rota.
 *
 * Fica aqui e não em cada `page.tsx` porque o topo é um componente só: se cada
 * tela escrevesse o próprio, a primeira que esquecesse deixaria o cabeçalho da
 * tela anterior no lugar durante a navegação.
 */
const CABECALHOS: Record<string, [string, string]> = {
  '/consulta': ['Consulta', 'assistente com fontes rastreáveis'],
  '/jurisprudencia': ['Jurisprudência', 'entendimento consolidado por tema'],
  '/dosimetria': ['Dosimetria', 'cálculo trifásico ao vivo'],
  '/vademecum': ['Vade Mecum', 'acervo de leitura, por ramo'],
  '/leis': ['Legislação', 'corpus curado e citável'],
  '/pecas': ['Peças', 'resposta à acusação'],
  '/clientes': ['Clientes', 'cadastro do escritório'],
  '/fontes': ['Fontes', 'vigília sobre a data de corte'],
  '/configuracoes': ['Configurações', 'conta, fontes e aparência'],
}

/**
 * As duas telas de apoio, hoje só na paleta do ⌘K.
 *
 * Legislação e Peças ficam fora da lateral por serem destino, não ponto de
 * partida: chega-se a elas por uma citação ou pelo fim de um fluxo. Elas moravam
 * também atrás de um `⌄` ao lado da marca, e o `⌄` saiu a pedido — um menu de
 * dois itens que ninguém abria, ocupando o canto mais nobre da lateral.
 *
 * **Nenhuma das duas ficou órfã:** conferido antes de remover, `/leis` é
 * alcançável pela migalha do artigo, por `/fontes`, pelas Configurações, pelo
 * link cruzado do Vade Mecum e pela página de 404; `/pecas`, pelo rodapé de toda
 * resposta da Consulta. A paleta continua listando as duas.
 */
const OUTRAS = [
  { href: '/leis', rotulo: 'Legislação curada', nota: 'Lei 11.343, Código Penal e CPP' },
  { href: '/pecas', rotulo: 'Peças', nota: 'resposta à acusação, art. 396-A' },
  { href: '/configuracoes', rotulo: 'Configurações', nota: 'conta, fontes e aparência' },
]

/**
 * Perguntas de partida, exibidas só enquanto não há histórico.
 *
 * Antes esta lista ERA a lista de "Recentes", e isso a tornava uma promessa
 * falsa: nada ali tinha sido consultado por ninguém. Agora ela é o que é —
 * sugestão de primeira pergunta — e sai de cena assim que existe conversa real.
 */
const SUGESTOES = [
  'Tráfico privilegiado, art. 33 §4º',
  'Dosimetria da pena na Lei de Drogas',
  'Busca domiciliar sem mandado',
  'Associação para o tráfico',
  'Natureza e quantidade da droga',
]

/**
 * O que conta como parada de foco dentro da gaveta.
 *
 * `getClientRects()` filtra o que está com `display:none` — a lateral tem
 * botões que só existem a partir de `lg` (recolher) e outros que só existem
 * abaixo (fechar), e uma armadilha de foco que mirasse um botão invisível
 * mandaria o Tab para o vazio.
 */
const FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

const paradas = (caixa: HTMLElement): HTMLElement[] =>
  [...caixa.querySelectorAll<HTMLElement>(FOCAVEL)].filter((n) => n.getClientRects().length > 0)

/**
 * A janela está abaixo de `lg` — isto é, a lateral é gaveta e não moldura?
 *
 * Precisa ser JavaScript, e não classe utilitária: `inert`, `role="dialog"` e
 * armadilha de foco não existem em CSS, e o elemento é o MESMO nos dois modos.
 * Aplicá-los sem esta pergunta inertizaria a lateral fixa do desktop.
 *
 * Nasce `false` para o primeiro render bater com o do servidor, que não tem
 * janela para medir; o valor real chega no efeito, como as preferências.
 * `1023.98px` é o `lg` do Tailwind (64rem) por baixo.
 */
function useEstreito(): boolean {
  const [estreito, setEstreito] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)')
    const ler = () => setEstreito(mq.matches)
    ler()
    mq.addEventListener('change', ler)
    return () => mq.removeEventListener('change', ler)
  }, [])

  return estreito
}

const ativoEm = (caminho: string, href: string) =>
  caminho === href || caminho.startsWith(`${href}/`)

/** Link para o chat já com a pergunta na URL. Ver `consulta/pergunta.ts`. */
export const perguntar = (q: string) => `/consulta?p=${encodeURIComponent(q)}`

/**
 * "Nova consulta" precisa limpar o chat mesmo quando já se está nele — e nesse
 * caso `router.push('/consulta')` não remonta nada. O evento resolve sem
 * inventar um store global para um botão.
 */
export const EVENTO_NOVA = 'toga:nova-consulta'

// --- lateral -----------------------------------------------------------------

export function Lateral({
  aberta,
  aoFechar,
  colapsada,
  aoAlternar,
  estreito,
}: {
  aberta: boolean
  aoFechar: () => void
  /**
   * Só vale a partir de `lg`. Abaixo disso a lateral já é uma gaveta que entra e
   * sai inteira, e colapsar uma gaveta não significa nada.
   */
  colapsada: boolean
  aoAlternar: () => void
  /** Abaixo de `lg`, onde esta mesma `aside` deixa de ser moldura e vira gaveta. */
  estreito: boolean
}) {
  const caminho = usePathname()
  const params = useSearchParams()
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [busca, setBusca] = useState('')
  const router = useRouter()
  const gaveta = useRef<HTMLElement>(null)

  /**
   * Está por cima da tela, cobrindo o conteúdo com o véu — e não encostada ao
   * lado dele. É esta pergunta, e não `aberta`, que decide as obrigações de
   * diálogo modal: em `lg` a lateral está sempre "aberta" e não é diálogo de
   * coisa nenhuma.
   */
  const modal = aberta && estreito

  /** Qual conversa está aberta agora, para marcá-la na lista. */
  const conversaAtiva = caminho === '/consulta' ? params.get('c') : null

  // O histórico só é lido depois de montar: a consulta precisa da sessão, que
  // no servidor não existe, e listar no primeiro render faria o HTML divergir.
  //
  // A busca é debounced: cada tecla dispararia duas consultas ao banco, e o
  // resultado da penúltima chegaria depois da última em rede lenta.
  useEffect(() => {
    // Assíncrono: a lista vem do banco. Falha vira lista vazia dentro do próprio
    // módulo, então não há caso de erro a tratar aqui.
    const reler = () => {
      void (busca.trim() ? procuraConversas(busca) : listaConversas()).then(setConversas)
    }

    const t = setTimeout(reler, busca.trim() ? 220 : 0)
    window.addEventListener(EVENTO_HISTORICO, reler)
    return () => {
      clearTimeout(t)
      window.removeEventListener(EVENTO_HISTORICO, reler)
    }
  }, [busca])

  const grupos = useMemo(() => agrupaConversas(conversas), [conversas])

  const apagar = useCallback(
    (id: string) => {
      void removeConversa(id)
      // Apagar a conversa aberta deixaria a tela mostrando algo que já não está
      // no histórico. Sai para um chat novo.
      if (conversaAtiva === id) {
        window.dispatchEvent(new CustomEvent(EVENTO_NOVA))
        router.push('/consulta')
      }
    },
    [conversaAtiva, router],
  )

  const novaConsulta = useCallback(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_NOVA))
    router.push('/consulta')
    aoFechar()
  }, [router, aoFechar])

  // A etiqueta ⌘N saiu do botão a pedido; o atalho ficou. Quem some é o
  // anúncio, não o comportamento — e o `title` do modo trilha continua dizendo.
  //
  // ⌘N / Ctrl+N. O navegador reserva ⌘N para janela nova e não devolve o
  // evento em todos os casos; onde devolve, `preventDefault` segura.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        novaConsulta()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [novaConsulta])

  // Gaveta aberta é diálogo modal, e diálogo modal tem quatro obrigações que
  // esta lateral não cumpria nenhuma: fechar no Esc, levar o foco para dentro,
  // não deixar o Tab escapar para a tela de trás e devolver o foco a quem a
  // abriu. As três primeiras estão aqui; a devolução mora na `Casca`, que é
  // quem tem o botão em mãos.
  //
  // O que se media antes, num celular: abrir a gaveta não movia o foco, e eram
  // ONZE paradas de Tab pelo conteúdo coberto pelo véu antes de alcançar o
  // primeiro item do menu. Esc não fazia nada. Fechar deixava o foco no
  // `<body>`.
  //
  // O foco vai para a própria `aside`, e não para o primeiro link: assim o
  // leitor de tela anuncia o rótulo do diálogo antes da primeira parada, e
  // quem entrou pelo Tab não começa já dentro de "Nova consulta".
  //
  // O menu da conta e a paleta do ⌘K já faziam tudo isto — o que faltava era
  // a gaveta, que é justamente a única das três que só aparece no toque.
  useEffect(() => {
    const caixa = gaveta.current
    if (!modal || !caixa) return

    caixa.focus()

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        aoFechar()
        return
      }
      if (e.key !== 'Tab') return

      const fim = paradas(caixa)
      const primeiro = fim[0]
      const ultimo = fim[fim.length - 1]
      if (!primeiro || !ultimo) return

      const ativo = document.activeElement

      // A `aside` conta como "antes do primeiro": é onde o foco começa, e um
      // Shift+Tab dali tem de dar a volta para o fim, não sair pela frente.
      if (e.shiftKey && (ativo === primeiro || ativo === caixa)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [modal, aoFechar])

  return (
    <>
      {/* Véu do modo estreito. Em `lg` a lateral é fixa e o véu não existe. */}
      {aberta && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={aoFechar}
          className="fixed inset-0 z-30 bg-[rgb(18_20_30_/_0.35)] lg:hidden"
        />
      )}

      {/*
        A largura continua fixa, e continua sendo por medida: os painéis do
        documento (420px no chat, 352px na dosimetria, 404px no Vade Mecum) foram
        desenhados contra 246px. Colapsar não fere isso — são dois valores fixos,
        246 e 64, e não uma lateral fluida.

        `transition-[width]` junto de `transition-transform` porque em `lg` o que
        muda é a largura, e abaixo dela é a posição.
      */}
      <aside
        ref={gaveta}
        id="lateral"
        // Fechada no modo estreito, a lateral continua montada e apenas
        // deslizada para fora por `-translate-x-full` — que esconde do olho e
        // não do Tab. Eram dez e tantas paradas de foco em `x = -234`, fora da
        // tela, antes de o conteúdo começar. `inert` é o que a tira do caminho
        // sem desmontá-la, e é a mesma peça que o cartão de dosimetria usa; o
        // que faltava aqui era a pergunta `estreito`, porque em `lg` esta mesma
        // `aside` é a moldura do app e inertizá-la desligaria a navegação.
        inert={estreito && !aberta}
        tabIndex={modal ? -1 : undefined}
        role={modal ? 'dialog' : undefined}
        aria-modal={modal ? true : undefined}
        aria-label={modal ? 'Menu' : undefined}
        // A rolagem é da lateral inteira, e não só da lista de conversas. Antes
        // o único trecho rolável era o histórico: a roda do mouse sobre os sete
        // itens de menu não fazia nada, e para alcançar o fim da lista era
        // preciso encontrar a faixa certa da coluna. Agora marca, navegação,
        // busca, histórico e o cartão da data de corte andam juntos.
        className={`fixed inset-y-0 left-0 z-40 flex w-[246px] shrink-0 flex-col border-r border-tg-linha bg-tg-lateral pb-3.5 pt-[18px] outline-none transition-[transform,width,padding] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:static lg:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        } ${colapsada ? 'px-3 lg:w-[64px] lg:px-2' : 'px-3'}`}
      >
        {/*
          O miolo rola inteiro — marca, "Nova consulta", navegação, busca e
          histórico andam juntos. Antes o único trecho rolável era a lista de
          conversas: a roda do mouse sobre os sete itens de menu não fazia nada.

          A rolagem fica AQUI e não na `aside` por causa do rodapé: `overflow-y`
          recorta também na horizontal, e o menu da conta — 230px — saa cortado
          na trilha de 64px. Conferido no navegador antes de mover.
        */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* marca */}
        <div
          className={`relative flex items-center pb-5 pt-0.5 ${
            colapsada ? 'lg:flex-col lg:gap-2 lg:px-0' : 'gap-2.5 px-2'
          }`}
        >
          <Link
            href="/consulta"
            className="flex min-w-0 items-center gap-2.5"
            onClick={aoFechar}
            aria-label={`${MARCA.nome} — início`}
            title={colapsada ? MARCA.nome : undefined}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[11px] font-tg-serif text-[12.5px] font-semibold tracking-[0.01em] text-white shadow-[var(--tg-elev-marca)]"
              style={{ background: GRADIENTE_MARCA }}
            >
              {MARCA.inicial}
            </span>
            {/* Só o nome. A linha de apoio saiu a pedido: ela era mais
                larga que a marca e truncava ("Advocacia crimi…"), que é pior que
                não estar lá — e o ramo já é dito pela pílula das telas de
                entrada e pela própria lateral. */}
            <span
              className={`block min-w-0 text-[15.5px] font-semibold leading-[1.1] -tracking-[0.01em] text-tg-tinta ${
                colapsada ? 'lg:hidden' : ''
              }`}
            >
              {MARCA.nome}
            </span>
          </Link>

          <span className={`flex-1 ${colapsada ? 'lg:hidden' : ''}`} />

          {/* Recolher/expandir. Só existe a partir de `lg`: abaixo disso a
              lateral é uma gaveta, e recolher uma gaveta não quer dizer nada. */}
          <button
            type="button"
            onClick={aoAlternar}
            aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
            title={`${colapsada ? 'Expandir' : 'Recolher'} menu  ⌘B`}
            className="tgb hidden size-6 shrink-0 place-items-center rounded-lg text-tg-fraco-2 hover:bg-tg-caixa lg:grid"
          >
            <span
              aria-hidden="true"
              className={`text-[13px] leading-none transition-transform ${
                colapsada ? '' : 'rotate-180'
              }`}
            >
              ›
            </span>
          </button>

        </div>

        {/* nova consulta */}
        <button
          type="button"
          onClick={novaConsulta}
          title={colapsada ? 'Nova consulta  ⌘N' : undefined}
          className={`tgb mb-4 flex items-center rounded-xl bg-white text-[13px] font-medium shadow-[var(--tg-elev-1f)] hover:shadow-[var(--tg-elev-2)] ${
            colapsada ? 'gap-[9px] px-3 py-[9px] lg:justify-center lg:px-0' : 'gap-[9px] px-3 py-[9px]'
          }`}
        >
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-tg-acento text-[12px] font-medium leading-none text-white">
            +
          </span>
          <span className={colapsada ? 'lg:hidden' : ''}>Nova consulta</span>
        </button>

        {/* as sete telas */}
        <nav aria-label="Telas" className="flex flex-col gap-0.5">
          {TELAS.map((t) => {
            const ativo = ativoEm(caminho, t.href)
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={aoFechar}
                aria-current={ativo ? 'page' : undefined}
                // Na trilha o rótulo some, então o `title` passa a ser a única
                // forma de saber o que o quadradinho colorido significa.
                title={colapsada ? t.rotulo : undefined}
                className={`tgb relative flex items-center gap-2.5 rounded-[11px] py-2 text-[13px] font-medium ${
                  colapsada ? 'px-[11px] lg:justify-center lg:px-0' : 'px-[11px]'
                } ${ativo ? 'text-tg-tinta' : 'text-tg-corpo hover:bg-tg-hover'}`}
              >
                {ativo && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[11px] bg-white shadow-[0_1px_2px_rgb(18_20_30_/_0.07)]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="relative size-[18px] shrink-0 rounded-md"
                  style={{ background: t.matiz }}
                />
                <span className={`relative truncate ${colapsada ? 'lg:hidden' : ''}`}>
                  {t.rotulo}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* histórico — não cabe na trilha, e uma lista de títulos truncados a
            64px não seria histórico, seria enfeite. */}
        <div className={`mt-[22px] flex flex-col ${colapsada ? 'lg:hidden' : ''}`}>
          {/* O campo só aparece quando há o que procurar. Uma caixa de busca
              sobre uma lista vazia é convite para o usuário achar que existe
              histórico escondido. */}
          {(conversas.length > 0 || busca) && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-[10px] bg-tg-caixa px-2.5 py-1.5 focus-within:bg-white">
              <span aria-hidden="true" className="text-[11px] text-tg-fraco-3">
                ⌕
              </span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nas conversas…"
                aria-label="Buscar no histórico"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-tg-tinta outline-none placeholder:text-tg-fraco-3"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="shrink-0 rounded px-1 text-[12px] leading-none text-tg-tenue-2 hover:text-tg-tinta-4"
                >
                  ×
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-px">
            {conversas.length === 0 && !busca ? (
              <>
                <p className="px-3 pb-2 pt-1.5 text-[11px] font-medium text-tg-fraco-3">
                  Para começar
                </p>
                {/* Sem histórico ainda, a lista vira ponto de partida. Some assim
                    que houver conversa real. */}
                {SUGESTOES.map((r) => (
                  <Link
                    key={r}
                    href={perguntar(r)}
                    onClick={aoFechar}
                    className="tgb flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-[10px] px-3 py-[7px] text-[12.5px] text-tg-suave hover:bg-tg-hover hover:text-tg-tinta"
                  >
                    <span aria-hidden="true" className="size-[5px] shrink-0 rounded-full bg-[#c6c9d2]" />
                    <span className="truncate">{r}</span>
                  </Link>
                ))}
              </>
            ) : conversas.length === 0 ? (
              <p className="px-3 py-2 text-[12px] leading-relaxed text-tg-fraco-3">
                Nenhuma conversa com “{busca}”. A busca procura no título e nas perguntas.
              </p>
            ) : (
              grupos.map((g) => (
                <div key={g.rotulo}>
                  <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium text-tg-fraco-3">
                    {g.rotulo}
                  </p>
                  {g.itens.map((c) => (
                    <div key={c.id} className="group relative flex items-center">
                      <Link
                        href={`/consulta?c=${encodeURIComponent(c.id)}`}
                        onClick={aoFechar}
                        title={`${c.titulo} · ${c.trocas} ${c.trocas === 1 ? 'pergunta' : 'perguntas'}`}
                        className={`tgb flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-[10px] py-[7px] pl-3 pr-7 text-[12.5px] hover:bg-tg-hover hover:text-tg-tinta ${
                          conversaAtiva === c.id ? 'bg-tg-hover text-tg-tinta' : 'text-tg-suave'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-[5px] shrink-0 rounded-full bg-[#c6c9d2]"
                        />
                        <span className="truncate">{c.titulo}</span>
                      </Link>
                      {/* Aparece no hover e no foco de teclado — só no hover, quem
                          navega por Tab nunca alcançaria o botão. */}
                      <button
                        type="button"
                        onClick={() => apagar(c.id)}
                        aria-label={`Apagar conversa "${c.titulo}"`}
                        className="absolute right-1 rounded-md px-1.5 py-1 text-[13px] leading-none text-tg-tenue-2 opacity-0 transition-opacity hover:bg-tg-caixa hover:text-tg-tinta-4 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/*
          Cartão de base. No documento ele anuncia sincronização em tempo real;
          aqui ele carrega a data de corte, que é a decisão nº 3 do projeto —
          citar redação revogada em peça criminal é grave, e o aviso não pode
          depender de a tela da vez lembrar de mostrá-lo.

          Deixou de ser link quando `/fontes` saiu da navegação. O cartão fica:
          o que importava nele nunca foi o destino, era a data. Link que não
          leva a lugar nenhum seria pior que texto.
        */}
        </div>

        {/*
          O rodapé da lateral: aqui morava o cartão "Base conferida", e agora
          mora a conta — a pedido. Fica FORA do miolo rolável: sair da sessão é a
          única ação que precisa estar sempre alcançável, e um `overflow` em volta
          dele cortaria o menu de 230px na trilha de 64.
        */}
        <div className="shrink-0 pt-2">
          <Conta rodape colapsada={colapsada} />
        </div>
      </aside>
    </>
  )
}

// --- topo --------------------------------------------------------------------

/**
 * Dá para voltar sem sair do produto?
 *
 * **É voltar HISTÓRICO, não hierárquico, e a diferença decide o desenho.** O
 * "← Acervo" do `Cabecalho` sobe um nível, para um pai fixo — só existe onde há
 * pai. As sete telas da lateral são irmãs: `/consulta` não fica "dentro" de
 * nada, e um voltar hierárquico ali não teria destino. O que serve para todas é
 * devolver o usuário de onde ele veio.
 *
 * A regra é comparar com o ponto de entrada, e não contar passos. Contador
 * precisa acertar a conta no `popstate` — o botão do navegador, que dispara sem
 * dizer se foi para trás ou para frente — e errar a conta ali significa oferecer
 * um voltar que **sai do produto**, caindo no site anterior ou na tela de login.
 *
 * Comparando com a entrada isso não pode acontecer: enquanto o caminho for
 * diferente daquele em que a casca montou, existe ao menos uma navegação interna
 * atrás. Quem abre uma URL direto no navegador não vê botão nenhum, que é o
 * correto — não há para onde voltar dentro do sistema.
 *
 * O preço é conhecido e barato: em A → B → A o botão some no segundo A, embora
 * houvesse história. Ele erra escondendo, nunca oferecendo saída para fora.
 */
function usePodeVoltar(caminho: string): boolean {
  // A casca é layout do App Router: não remonta a cada navegação, então este ref
  // guarda de fato a primeira tela da sessão de navegação.
  const entrada = useRef(caminho)
  return caminho !== entrada.current
}

export function Topo({
  aoAbrirMenu,
  menuAberto,
  botaoMenu,
}: {
  aoAbrirMenu: () => void
  /** Para o botão dizer o que fez, e para o ⌘K não abrir atrás da gaveta. */
  menuAberto: boolean
  botaoMenu: React.RefObject<HTMLButtonElement | null>
}) {
  const caminho = usePathname()
  const router = useRouter()
  const podeVoltar = usePodeVoltar(caminho)
  const [busca, setBusca] = useState(false)

  const [titulo, sub] = useMemo(() => {
    const exato = CABECALHOS[caminho]
    if (exato) return exato
    const prefixo = Object.keys(CABECALHOS).find((k) => caminho.startsWith(`${k}/`))
    return prefixo ? CABECALHOS[prefixo]! : [MARCA.nome, '']
  }, [caminho])

  // Com a gaveta aberta o topo inteiro está `inert`, e o atalho continuaria
  // funcionando — ouvinte de janela não é interação de usuário e o `inert` não
  // o alcança. Abriria uma paleta dentro da região inerte: visível, sem foco e
  // sem clique. Dois diálogos abertos ao mesmo tempo também não é estado que
  // esta casca queira ter.
  useEffect(() => {
    if (menuAberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBusca(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [menuAberto])

  return (
    // `relative z-20` não é enfeite: `backdrop-blur` cria contexto de
    // empilhamento, então o `z-20` do menu da conta ficava PRESO dentro do
    // header, e a área de conteúdo — que vem depois no DOM — pintava por cima
    // de toda a camada. Como ela é transparente, o menu aparecia na tela e o
    // clique morria nela. Medido com `elementFromPoint` no centro do item:
    // devolvia a div de conteúdo, não o item do menu.
    //
    // Fica em 20 e não em 30 de propósito: acima do conteúdo, abaixo do fundo
    // da gaveta (30), da própria gaveta (40) e da paleta de busca (50), que
    // precisam continuar cobrindo o topo.
    <header className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-tg-linha-media bg-white/70 px-4 backdrop-blur-[14px] sm:px-[22px]">
      {/* O quadrado pintado continua com os 32px do desenho. Quem cresce é só
          a área que recebe o toque, por um `::after` de `-inset-1.5`: 32 + 6 de
          cada lado = 44, que é o alvo mínimo. Crescer o botão em vez do pseudo
          levaria o `hover:bg` junto e pintaria um quadrado de 44. */}
      <button
        ref={botaoMenu}
        type="button"
        onClick={aoAbrirMenu}
        aria-label="Abrir menu"
        aria-expanded={menuAberto}
        aria-controls="lateral"
        className="tgb relative -ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-tg-fraco-3 after:absolute after:-inset-1.5 after:content-[''] hover:bg-tg-campo lg:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
        </span>
      </button>

      {/* Voltar. Some quando não há navegação interna atrás — ver
          `usePodeVoltar`. A área de toque cresce pelo `::after`, como no botão
          do menu ao lado: o alvo vai a 44px sem o `hover:bg` pintar um quadrado
          desse tamanho. */}
      {podeVoltar && (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Voltar"
          title="Voltar"
          className="tgb relative -ml-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-tg-fraco-3 after:absolute after:-inset-1.5 after:content-[''] hover:bg-tg-campo hover:text-tg-tinta-2"
        >
          <Icone nome="seta_esquerda" className="size-[17px]" />
        </button>
      )}

      <h2 className="shrink-0 text-[15px] font-semibold -tracking-[0.01em] text-tg-tinta">
        {titulo}
      </h2>
      <p className="hidden truncate text-[12.5px] text-tg-fraco-3 sm:block">{sub}</p>
      <span className="flex-1" />

      <button
        type="button"
        onClick={() => setBusca(true)}
        className="tgb hidden h-[34px] w-[270px] items-center gap-2 rounded-full bg-tg-campo px-[13px] hover:bg-tg-hover md:flex"
      >
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full border-[1.6px] border-tg-fraco-3"
        />
        <span className="text-[12.5px] text-tg-fraco-3">Buscar leis, rubricas, dispositivos…</span>
        <span className="flex-1" />
      </button>

      {busca && <Paleta aoFechar={() => setBusca(false)} />}
    </header>
  )
}

/**
 * Avatar da conta. No documento é decorativo ("MR"); aqui abre o menu de
 * sessão, porque sair tem de caber em algum lugar e este é o lugar onde
 * qualquer pessoa vai procurar. O visual é o mesmo círculo de 32px.
 */
function Conta({ rodape = false, colapsada = false }: { rodape?: boolean; colapsada?: boolean }) {
  const usuario = useUsuario()
  const perfil = usePerfil()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    // Fechar ao clicar fora é ouvinte no documento, e não uma sobreposição
    // `fixed inset-0` como no resto do arquivo. O `backdrop-filter` do header
    // faz dele o bloco de contenção dos descendentes `fixed`, então a
    // sobreposição não media a tela: media o próprio header. Conferido —
    // 1034×59 num viewport de 1280×720. Clique fora do topo não fechava nada.
    const aoApontar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    window.addEventListener('keydown', aoTeclar)
    document.addEventListener('pointerdown', aoApontar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('pointerdown', aoApontar)
    }
  }, [aberto])

  if (!usuario?.email) return null
  const email = usuario.email

  async function sair() {
    if (saindo) return
    setSaindo(true)
    marcarSaidaDeliberada()
    const { error } = await supabaseNavegador().auth.signOut()
    if (error) {
      // Sessão já inválida no servidor devolve erro — e mesmo assim o cookie
      // local foi limpo. Insistir com a tela travada em "Saindo…" seria pior
      // que seguir para o login.
      setSaindo(false)
      setAberto(false)
    }
  }

  const avatar = (
    <span
      aria-hidden="true"
      // O círculo continua com os 32px do documento; quem cresce para os 44 do
      // alvo mínimo é o `::after` do botão, como na gaveta. Este é o único
      // caminho para sair da sessão, e errar o toque nele no celular abre o
      // menu de outra coisa.
      className="grid size-8 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold text-white shadow-[0_3px_10px_-4px_rgb(28_26_36_/_0.7)]"
      style={{ background: GRADIENTE_CONTA }}
    >
      {iniciais(perfil.nome, email)}
    </span>
  )

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={perfil.nome.trim() ? `${perfil.nome.trim()} · ${email}` : email}
        className={
          rodape
            ? `tgb flex w-full items-center gap-2.5 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[var(--tg-elev-1)] ${colapsada ? 'lg:justify-center lg:px-0' : ''}`
            : "tgb relative after:absolute after:-inset-1.5 after:content-['']"
        }
      >
        {avatar}
        {rodape && (
          <span className={`min-w-0 flex-1 ${colapsada ? 'lg:hidden' : ''}`}>
            <span className="block truncate text-[12px] font-medium text-tg-tinta-2">
              {perfil.nome.trim() || 'Minha conta'}
            </span>
            <span className="block truncate text-[11px] text-tg-fraco-3">{email}</span>
          </span>
        )}
        <span className="sr-only">Conta de {email}</span>
      </button>

      {aberto && (
        <div
          role="menu"
          // No rodapé o menu sobe e acompanha a largura da lateral: `top-full`
          // o jogaria para fora da tela, e os 256px do `w-64` não cabem numa
          // coluna de 246 — a rolagem da lateral o cortaria pela direita.
          className={`absolute z-20 overflow-hidden rounded-[14px] bg-white p-1 shadow-[0_1px_2px_rgb(18_20_30_/_0.06),0_18px_40px_-16px_rgb(18_20_30_/_0.4)] ${
            rodape ? 'bottom-full left-0 mb-2 w-[230px]' : 'right-0 top-full mt-2 w-64'
          }`}
        >
          <div className="px-3 py-2.5">
            <p className="text-[10.5px] font-medium text-tg-fraco-3">Sessão ativa</p>
            {perfil.nome.trim() && (
              <p className="mt-0.5 truncate text-[12.5px] font-medium text-tg-tinta-2">
                {perfil.nome.trim()}
              </p>
            )}
            <p className="mt-0.5 truncate text-[12.5px] text-tg-fraco-2" title={email}>
              {email}
            </p>
          </div>
          <div className="my-1 border-t border-tg-linha-tenue" />
          {/* O caminho curto para os ajustes é o avatar — é onde se procura. */}
          <Link
            href="/configuracoes"
            role="menuitem"
            onClick={() => setAberto(false)}
            className="block rounded-[10px] px-3 py-2 text-[12.5px] text-tg-corpo transition-colors hover:bg-tg-preenche"
          >
            Configurações
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void sair()}
            disabled={saindo}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12.5px] text-tg-corpo transition-colors hover:bg-tg-preenche disabled:cursor-not-allowed disabled:text-tg-tenue"
          >
            {saindo && (
              <span
                aria-hidden="true"
                className="tg-gira size-3 shrink-0 rounded-full border-[1.6px] border-current border-t-transparent"
              />
            )}
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Paleta do ⌘K.
 *
 * O documento desenha a caixa de busca do topo sem comportamento — é protótipo,
 * e ali ela só precisa existir. Num produto, um campo de busca que não busca é
 * pior que nenhum. Esta versão não tenta ser um buscador paralelo: ela navega.
 * Texto livre vai para o chat, que é onde a busca híbrida de verdade acontece.
 */
function Paleta({ aoFechar }: { aoFechar: () => void }) {
  const [q, setQ] = useState('')
  const router = useRouter()
  const campo = useRef<HTMLInputElement>(null)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    campo.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    // Fechar ao clicar fora é ouvinte no documento, e não a sobreposição
    // `fixed inset-0` que estava aqui — pelo mesmo motivo já anotado no menu da
    // conta: o `backdrop-filter` do header faz dele o bloco de contenção dos
    // descendentes `fixed`, então a sobreposição media o próprio header, 60px
    // de altura. Clicar em qualquer ponto abaixo do topo não fechava nada.
    const aoApontar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    document.addEventListener('pointerdown', aoApontar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('pointerdown', aoApontar)
    }
  }, [aoFechar])

  const alvo = q.trim().toLowerCase()
  const telas = TELAS.filter((t) => !alvo || t.rotulo.toLowerCase().includes(alvo))

  function ir(href: string) {
    aoFechar()
    router.push(href)
  }

  return (
    // Sem véu cinza: a caixa flutua sobre a tela como ela está. O botão de
    // fechar continua cobrindo tudo, agora transparente — clicar fora fecha do
    // mesmo jeito, e essa é a razão de ele não ter saído junto com a cor.
    //
    // A sombra da caixa é quem separa do fundo agora, e ela já fazia esse
    // trabalho: 90px de espalhamento a 50% de opacidade.
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-2">
      <div
        ref={caixa}
        role="dialog"
        aria-label="Busca"
        className="tg-sobe relative w-full max-w-[560px] overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgb(18_20_30_/_0.06),0_40px_90px_-40px_rgb(18_20_30_/_0.5)]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim()) ir(perguntar(q.trim()))
          }}
          className="flex items-center gap-2.5 border-b border-tg-linha-fraca px-4 py-3.5"
        >
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 rounded-full border-[1.6px] border-tg-fraco-3"
          />
          <input
            ref={campo}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar leis, rubricas, dispositivos…"
            className="w-full bg-transparent text-[14.5px] text-tg-tinta outline-none placeholder:text-tg-tenue-2"
          />
          <span aria-hidden="true" className="shrink-0 text-[11px] text-tg-tenue-2">
            esc
          </span>
        </form>

        <div className="max-h-[46vh] overflow-auto p-1.5">
          {q.trim() && (
            <button
              type="button"
              onClick={() => ir(perguntar(q.trim()))}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-tg-preenche"
            >
              <Selo tom="acento">Perguntar</Selo>
              <span className="min-w-0 flex-1 truncate text-[13px] text-tg-tinta-2">
                “{q.trim()}” — buscar no corpus curado
              </span>
              <span aria-hidden="true" className="text-[13px] text-tg-tenue-2">
                ↵
              </span>
            </button>
          )}

          {telas.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-[10.5px] font-medium text-tg-fraco-3">Ir para</p>
          )}
          {telas.map((t) => (
            <button
              key={t.href}
              type="button"
              onClick={() => ir(t.href)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-tg-preenche"
            >
              <span
                aria-hidden="true"
                className="size-[18px] shrink-0 rounded-md"
                style={{ background: t.matiz }}
              />
              <span className="flex-1 truncate text-[13px] text-tg-tinta-2">{t.rotulo}</span>
              <span className="text-[11.5px] text-tg-tenue-2">{t.href}</span>
            </button>
          ))}

          {!q.trim() && (
            <>
              <p className="px-3 pb-1 pt-3 text-[10.5px] font-medium text-tg-fraco-3">
                Outras telas
              </p>
              {OUTRAS.map((o) => (
                <button
                  key={o.href}
                  type="button"
                  onClick={() => ir(o.href)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-tg-preenche"
                >
                  <span className="flex-1 truncate text-[13px] text-tg-tinta-2">{o.rotulo}</span>
                  <span className="truncate text-[11.5px] text-tg-tenue-2">{o.nota}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- casca completa ----------------------------------------------------------

export function Casca({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false)
  const [colapsada, setColapsada] = useState(false)
  const caminho = usePathname()
  const estreito = useEstreito()
  const botaoMenu = useRef<HTMLButtonElement>(null)
  const abriu = useRef(false)

  /** A gaveta está por cima do conteúdo — ver `modal`, na `Lateral`. */
  const gavetaModal = menu && estreito

  // Navegou: fecha a lateral do modo estreito. Sem isto ela fica por cima da
  // tela que acabou de abrir.
  useEffect(() => setMenu(false), [caminho])

  // Alargar a janela com a gaveta aberta a transforma na moldura fixa do
  // desktop — e deixaria o conteúdo inerte, sem véu e sem nada por perto para
  // fechar. Estado de gaveta só existe enquanto existe gaveta.
  useEffect(() => {
    if (!estreito) setMenu(false)
  }, [estreito])

  // Devolve o foco a quem abriu. Fica aqui, e não na `Lateral`, porque o botão
  // é do topo — e é do topo que ele tem de continuar sendo: mandar o foco para
  // o `<body>`, que era o que acontecia, custa ao teclado percorrer a tela
  // inteira de novo depois de cada abre-e-fecha.
  //
  // O `inert` do conteúdo sai no mesmo commit que fecha a gaveta, e efeito roda
  // depois do commit: quando esta linha executa, o botão já é focável.
  //
  // Vale também quando quem fechou foi a navegação por um item do menu. O foco
  // no botão é lugar previsível e é a mesma tecla de volta ao menu; o que não
  // pode é ele se perder, que é o estado de hoje.
  useEffect(() => {
    if (gavetaModal) {
      abriu.current = true
      return
    }
    if (!abriu.current) return
    abriu.current = false
    botaoMenu.current?.focus()
  }, [gavetaModal])

  // As preferências são lidas depois de montar: `localStorage` não existe no
  // servidor, e usá-las no primeiro render faria o HTML divergir. O custo é a
  // lateral nascer aberta e encolher — preferível a um erro de hidratação.
  //
  // O listener é o que faz o interruptor de `/configuracoes` mexer na lateral na
  // hora: o ajuste mora em outra árvore de componentes, e sem o evento a escolha
  // só apareceria no próximo carregamento.
  useEffect(() => {
    const reler = () => {
      setColapsada(leColapso())
      aplicaMovimento(leMovimentoReduzido())
    }
    reler()
    window.addEventListener(EVENTO_PREFERENCIAS, reler)
    window.addEventListener('storage', reler)
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIAS, reler)
      window.removeEventListener('storage', reler)
    }
  }, [])

  // O perfil vem do banco (migration 0008), mas o avatar não espera por ele: o
  // cache local pinta na hora e esta leitura corrige depois, avisando pelo mesmo
  // evento. Uma vez por montagem da casca, não por navegação — o `[]` é o ponto.
  useEffect(() => {
    void carregaPerfil()
  }, [])

  // Escreve e deixa o listener acima devolver o valor — assim o botão da lateral
  // e o interruptor dos ajustes passam pelo mesmo caminho, e não há dois donos
  // da mesma preferência.
  const alternar = useCallback(() => gravaColapso(!leColapso()), [])

  // Estável de propósito: a `Lateral` usa este callback na dependência do efeito
  // que prende o foco, e uma função nova a cada render faria o efeito remontar
  // sempre — devolvendo o foco à `aside` no meio de quem estivesse tabulando.
  const fecharMenu = useCallback(() => setMenu(false), [])

  // ⌘B / Ctrl+B, como em qualquer editor. Fica aqui e não na `Lateral` porque o
  // atalho tem de funcionar com o foco em qualquer lugar da tela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [alternar])

  return (
    // **No celular quem rola é o documento; no desktop, a casca.**
    // Até aqui a casca era `h-dvh overflow-hidden` em toda largura, e cada tela
    // rolava por dentro. Medido em 390px: `document.scrollHeight` era igual à
    // janela em TODAS as rotas — o documento nunca rolava. Num telefone isso
    // significa que o dedo só move a tela se começar exatamente sobre o painel
    // certo, que a barra do navegador nunca recolhe (ela só recolhe quando a
    // PÁGINA rola) e que o que está embaixo parece não existir. Era isso o
    // "não carrega inteira" e metade dos "botões que não funcionam".
    // A partir de `lg` a moldura de altura fixa volta — ela é o desenho do TOGA
    // v2, com lateral e painel de fonte lado a lado, e ali não há barra de
    // navegador para atrapalhar.
    <div className="flex min-h-dvh bg-tg-fundo text-tg-tinta lg:h-dvh lg:overflow-hidden">
      {/*
        Primeira parada de Tab do app inteiro, e invisível até receber o foco.

        Sem ela eram 26 paradas até o campo de pergunta da Consulta — a lateral
        inteira, item por item, mais o histórico, a cada tela aberta. Quem
        navega por teclado paga a moldura de novo em toda navegação, e a moldura
        é a mesma sempre.

        `sr-only focus:not-sr-only` é o par que a mantém fora do desenho sem
        tirá-la da árvore: leitor de tela sempre a encontra, olho só a vê quando
        ela é o foco. E aí ela tem de ficar POR CIMA de tudo — daí `z-50` e
        `fixed`, senão nasce atrás da lateral, que é o único lugar onde ela
        aparece.
      */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-tg-acento focus:px-4 focus:py-2.5 focus:text-[13px] focus:font-medium focus:text-white focus:shadow-[0_10px_30px_-12px_rgb(18_20_30_/_0.6)]"
      >
        Pular para o conteúdo
      </a>
      <Lateral
        aberta={menu}
        aoFechar={fecharMenu}
        colapsada={colapsada}
        aoAlternar={alternar}
        estreito={estreito}
      />
      {/*
        Com a gaveta por cima, a tela de trás sai do caminho de verdade: `inert`
        tira do Tab, do clique e da árvore de acessibilidade de uma vez. O véu já
        cobria o olho e não cobria nada disso — dava para tabular por onze
        paradas atrás dele.

        A coluna inteira, incluindo o topo: é o topo que tem o botão da gaveta, e
        deixá-lo fora daria um caminho de foco de volta para o que está coberto.
        O botão volta a ser focável quando a gaveta fecha, e é para ele que o
        foco é devolvido, no efeito acima.
      */}
      <div className="flex min-w-0 flex-1 flex-col bg-tg-fundo" inert={gavetaModal}>
        <Topo
          aoAbrirMenu={() => setMenu(true)}
          menuAberto={gavetaModal}
          botaoMenu={botaoMenu}
        />
        {/*
          A `key` no caminho é o que faz a entrada tocar a cada navegação: sem
          ela o elemento sobrevive à troca de rota, e uma animação só toca quando
          o nó nasce. Fica no wrapper, e não no `<main>`, para o `flex` da casca
          não depender de um nó que remonta.

          Só a área de conteúdo se move. Lateral e topo ficam parados de
          propósito — o que mudou foi a tela, e mover a moldura junto faria toda
          navegação parecer um recarregamento.
        */}
        {/* `tabIndex={-1}` é o que faz o salto pousar: sem ele o foco fica no
            link e só o scroll se move, então a próxima tecla continua de onde
            estava — na lateral. */}
        <main id="conteudo" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
          <div key={caminho} className="tg-tela flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
