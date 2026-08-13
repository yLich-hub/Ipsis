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
// fica: a marca, "Nova consulta", os quatro quadradinhos coloridos com `title`,
// e o ponto vivo da data de corte — este último porque a decisão nº 3 diz que a
// data é visível o tempo todo, e "recolhi o menu" não é motivo para ela sumir.
// =============================================================================

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useUsuario, marcarSaidaDeliberada } from '@/components/casca/sessao'
import { Ponto, Selo } from '@/components/toga/base'
import { supabaseNavegador } from '@/lib/auth/navegador'
import {
  EVENTO_HISTORICO,
  type Conversa,
  agrupa as agrupaConversas,
  lista as listaConversas,
  procura as procuraConversas,
  remove as removeConversa,
} from '@/lib/toga/historico'
import { GRADIENTE_CONTA, GRADIENTE_MARCA, MATIZ } from '@/lib/toga/tokens'

// --- mapa de telas -----------------------------------------------------------

/**
 * As quatro telas do produto, na ordem do documento. `matiz` é só a cor do quadradinho
 * de 18px que faz as vezes de ícone — ver `lib/toga/tokens.ts`.
 */
const TELAS = [
  { href: '/consulta', rotulo: 'Consulta em chat', matiz: MATIZ.lavanda },
  { href: '/jurisprudencia', rotulo: 'Jurisprudência', matiz: MATIZ.gelo },
  { href: '/dosimetria', rotulo: 'Dosimetria', matiz: MATIZ.sabia },
  { href: '/vademecum', rotulo: 'Vade Mecum', matiz: MATIZ.rosa },
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
}

/**
 * As duas telas de apoio, atrás do `⌄` ao lado da marca.
 *
 * Legislação e Peças ficam fora da lateral por serem destino, não ponto de
 * partida: chega-se a elas por uma citação ou pelo fim de um fluxo. As demais
 * que viviam aqui — Painel, Busca, Como funciona e Diagnóstico — foram
 * removidas por duplicarem o que a Consulta já faz ou por serem diagnóstico de
 * desenvolvimento.
 */
const OUTRAS = [
  { href: '/leis', rotulo: 'Legislação curada', nota: 'Lei 11.343, CP e recorte do CPP' },
  { href: '/pecas', rotulo: 'Peças', nota: 'resposta à acusação, art. 396-A' },
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

const ativoEm = (caminho: string, href: string) =>
  caminho === href || caminho.startsWith(`${href}/`)

/** Duas letras do e-mail — não há nome de exibição no escopo, e não vale inventar. */
function iniciais(email: string): string {
  const local = email.split('@')[0] ?? ''
  const partes = local.split(/[._-]+/).filter(Boolean)
  const bruto =
    partes.length > 1 ? `${partes[0]![0]}${partes[1]![0]}` : local.slice(0, 2) || email.slice(0, 2)
  return bruto.toUpperCase()
}

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
}: {
  aberta: boolean
  aoFechar: () => void
  /**
   * Só vale a partir de `lg`. Abaixo disso a lateral já é uma gaveta que entra e
   * sai inteira, e colapsar uma gaveta não significa nada.
   */
  colapsada: boolean
  aoAlternar: () => void
}) {
  const caminho = usePathname()
  const params = useSearchParams()
  const [menu, setMenu] = useState(false)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [busca, setBusca] = useState('')
  const router = useRouter()

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
        className={`fixed inset-y-0 left-0 z-40 flex w-[246px] shrink-0 flex-col border-r border-tg-linha bg-tg-lateral pb-3.5 pt-[18px] transition-[transform,width,padding] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:static lg:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        } ${colapsada ? 'px-3 lg:w-[64px] lg:px-2' : 'px-3'}`}
      >
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
            aria-label="Toga — início"
            title={colapsada ? 'Toga' : undefined}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[11px] font-tg-serif text-[15px] font-semibold text-white shadow-[var(--tg-elev-marca)]"
              style={{ background: GRADIENTE_MARCA }}
            >
              T
            </span>
            <span className={`min-w-0 ${colapsada ? 'lg:hidden' : ''}`}>
              <span className="block text-[15.5px] font-semibold leading-[1.1] -tracking-[0.01em] text-tg-tinta">
                Toga
              </span>
              <span className="block truncate text-[11px] leading-[1.3] text-tg-fraco-2">
                Advocacia criminal
              </span>
            </span>
          </Link>

          <span className={`flex-1 ${colapsada ? 'lg:hidden' : ''}`} />

          {/* O `⌄` das outras telas não cabe na trilha — some junto com os
              rótulos, e as duas telas de apoio continuam alcançáveis por link. */}
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-label="Outras telas"
            className={`tgb grid size-6 shrink-0 place-items-center rounded-lg text-tg-fraco-2 hover:bg-tg-caixa ${
              colapsada ? 'lg:hidden' : ''
            }`}
          >
            <span aria-hidden="true" className="-mt-1 text-[13px] leading-none">
              ⌄
            </span>
          </button>

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

          {menu && <MenuOutras caminho={caminho} aoFechar={() => setMenu(false)} />}
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
          <span className={`flex-1 ${colapsada ? 'lg:hidden' : ''}`} />
          <span
            aria-hidden="true"
            className={`text-[11px] font-normal text-tg-tenue ${colapsada ? 'lg:hidden' : ''}`}
          >
            ⌘N
          </span>
        </button>

        {/* as seis telas */}
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
        <div
          className={`mt-[22px] flex min-h-0 flex-1 flex-col ${colapsada ? 'lg:hidden' : ''}`}
        >
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

          <div className="flex flex-col gap-px overflow-auto">
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
        <div
          className={`mt-3 block rounded-[14px] bg-white px-3 py-[11px] shadow-[var(--tg-elev-1)] ${
            colapsada ? 'lg:hidden' : ''
          }`}
        >
          <span className="mb-1.5 flex items-center gap-[7px]">
            <Ponto pulsa />
            <span className="text-[11.5px] font-medium text-tg-verde-txt">Base conferida</span>
          </span>
          <span className="block text-[11.5px] leading-[1.45] text-tg-fraco-2">
            Vade Mecum do Senado, 1ª ed. · redação de{' '}
            <strong className="font-medium text-tg-corpo">28/02/2025</strong>
          </span>
        </div>

        {/*
          Na trilha o cartão não cabe, mas a data de corte não pode simplesmente
          sumir — ela é a decisão nº 3 do projeto. Vira o ponto vivo sozinho, com
          a data no `title`: o sinal continua na tela e a informação continua a
          um hover de distância.
        */}
        {colapsada && (
          <div
            className="mt-auto hidden justify-center py-2 lg:flex"
            title="Base conferida · Vade Mecum do Senado, 1ª ed. · redação de 28/02/2025"
          >
            <Ponto pulsa />
          </div>
        )}
      </aside>
    </>
  )
}

/** Menu do `⌄`: as telas do produto que não estão entre as seis do desenho. */
function MenuOutras({ caminho, aoFechar }: { caminho: string; aoFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={aoFechar}
        className="fixed inset-0 z-10 cursor-default"
      />
      <div
        role="menu"
        className="absolute left-0 right-0 top-full z-20 overflow-hidden rounded-[14px] bg-white p-1 shadow-[0_1px_2px_rgb(18_20_30_/_0.06),0_18px_40px_-16px_rgb(18_20_30_/_0.4)]"
      >
        <p className="px-3 pb-1 pt-2 text-[10.5px] font-medium text-tg-fraco-3">
          Outras telas do produto
        </p>
        {OUTRAS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            role="menuitem"
            onClick={aoFechar}
            className={`block rounded-[10px] px-3 py-2 transition-colors hover:bg-tg-preenche ${
              ativoEm(caminho, o.href) ? 'bg-tg-preenche' : ''
            }`}
          >
            <span className="block text-[12.5px] font-medium text-tg-tinta-2">{o.rotulo}</span>
            <span className="block text-[11px] text-tg-fraco-3">{o.nota}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

// --- topo --------------------------------------------------------------------

export function Topo({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const caminho = usePathname()
  const [busca, setBusca] = useState(false)

  const [titulo, sub] = useMemo(() => {
    const exato = CABECALHOS[caminho]
    if (exato) return exato
    const prefixo = Object.keys(CABECALHOS).find((k) => caminho.startsWith(`${k}/`))
    return prefixo ? CABECALHOS[prefixo]! : ['Toga', '']
  }, [caminho])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBusca(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-tg-linha-media bg-white/70 px-4 backdrop-blur-[14px] sm:px-[22px]">
      <button
        type="button"
        onClick={aoAbrirMenu}
        aria-label="Abrir menu"
        className="tgb -ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-tg-fraco-3 hover:bg-tg-campo lg:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
          <span className="block h-[1.5px] w-[15px] rounded-full bg-current" />
        </span>
      </button>

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
        <span aria-hidden="true" className="text-[11px] text-tg-tenue-2">
          ⌘K
        </span>
      </button>

      <Conta />

      {busca && <Paleta aoFechar={() => setBusca(false)} />}
    </header>
  )
}

/**
 * Avatar da conta. No documento é decorativo ("MR"); aqui abre o menu de
 * sessão, porque sair tem de caber em algum lugar e este é o lugar onde
 * qualquer pessoa vai procurar. O visual é o mesmo círculo de 32px.
 */
function Conta() {
  const usuario = useUsuario()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
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

  return (
    <div className="relative shrink-0">
      {aberto && (
        <button
          type="button"
          aria-label="Fechar menu da conta"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={email}
        className="tgb grid size-8 place-items-center rounded-full text-[11.5px] font-semibold text-white shadow-[0_3px_10px_-4px_rgb(67_66_107_/_0.7)]"
        style={{ background: GRADIENTE_CONTA }}
      >
        {iniciais(email)}
        <span className="sr-only">Conta de {email}</span>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-[14px] bg-white p-1 shadow-[0_1px_2px_rgb(18_20_30_/_0.06),0_18px_40px_-16px_rgb(18_20_30_/_0.4)]"
        >
          <div className="px-3 py-2.5">
            <p className="text-[10.5px] font-medium text-tg-fraco-3">Sessão ativa</p>
            <p className="mt-0.5 truncate text-[12.5px] text-tg-tinta-2" title={email}>
              {email}
            </p>
          </div>
          <div className="my-1 border-t border-tg-linha-tenue" />
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

  useEffect(() => {
    campo.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const alvo = q.trim().toLowerCase()
  const telas = TELAS.filter((t) => !alvo || t.rotulo.toLowerCase().includes(alvo))

  function ir(href: string) {
    aoFechar()
    router.push(href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(18_20_30_/_0.28)] px-4 pt-[14vh]">
      <button type="button" aria-label="Fechar busca" onClick={aoFechar} className="fixed inset-0" />
      <div
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

/** Preferência de lateral colapsada. Chave própria, não parte do histórico. */
const CHAVE_COLAPSO = 'toga:lateral-colapsada'

export function Casca({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false)
  const [colapsada, setColapsada] = useState(false)
  const caminho = usePathname()

  // Navegou: fecha a lateral do modo estreito. Sem isto ela fica por cima da
  // tela que acabou de abrir.
  useEffect(() => setMenu(false), [caminho])

  // A preferência é lida depois de montar: `localStorage` não existe no
  // servidor, e usá-la no primeiro render faria o HTML divergir. O custo é a
  // lateral nascer aberta e encolher — preferível a um erro de hidratação.
  useEffect(() => {
    try {
      setColapsada(window.localStorage.getItem(CHAVE_COLAPSO) === '1')
    } catch {
      // Modo privado de alguns navegadores estoura no getItem.
    }
  }, [])

  const alternar = useCallback(() => {
    setColapsada((c) => {
      const nova = !c
      try {
        window.localStorage.setItem(CHAVE_COLAPSO, nova ? '1' : '0')
      } catch {
        /* a preferência não persiste; a sessão atual funciona igual */
      }
      return nova
    })
  }, [])

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
    <div className="flex h-dvh overflow-hidden bg-tg-fundo text-tg-tinta">
      <Lateral
        aberta={menu}
        aoFechar={() => setMenu(false)}
        colapsada={colapsada}
        aoAlternar={alternar}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-tg-fundo">
        <Topo aoAbrirMenu={() => setMenu(true)} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
