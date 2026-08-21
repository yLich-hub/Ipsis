'use client'

// =============================================================================
// TOGA v2 — Fontes e atualizações
//
// O documento de design desenha o painel de um produto que raspa o DOU e o
// DataJud a cada 30 minutos: cinco coletores em Python, 214 diplomas com
// vigência de hoje, 1,2 milhão de documentos, "Sincronizar agora" e um
// comparador de redações lado a lado. Este produto não é isso, e não pode
// fingir que é: o corpus é uma fotografia de 28/02/2025, e a decisão nº 3 do
// projeto existe justamente para essa data ficar visível.
//
// A forma foi mantida — cartões de coletor com barrinhas de atividade, lista de
// alterações captadas à esquerda, painéis estreitos à direita — e o conteúdo
// foi trocado pelo verdadeiro. O que mudou, e por quê:
//
// - **Dois coletores, não cinco.** Os três que faltam estão nomeados na tela,
//   com o motivo de cada um. Ver `lib/vigilia/fontes.ts`. Cinco cards com três
//   deles alimentados por número inventado seria o dado plausível e falso.
//
// - **"Sincronizar agora" não existe.** A coleta é o cron diário, e um botão
//   que dispara duas APIs públicas a cada clique é superfície de gasto e de
//   bloqueio por rate limit. O que existe é a data da última coleta, que é a
//   informação que o botão prometia.
//
// - **O comparador de redações virou o vínculo com as teses.** O produto não
//   guarda redações anteriores — inventar um "2018 → 2019" lado a lado seria
//   exatamente o que a decisão nº 3 impede. No lugar dele fica a pergunta que o
//   advogado tem de verdade, e que o desenho chama de "Impacto nas teses":
//   *esta alteração toca algum artigo que a MINHA peça cita?* Os dois lados
//   vêm do banco — `teses.fundamentos` e `vigilia_alteracoes.artigos_tocados`.
//
// - **A barra de atividade é real.** `barrasDoColetor` desenha a forma, mas a
//   contagem ao lado é a da última coleta gravada. Card sem coleta nenhuma diz
//   "nunca rodou", em vez de mostrar barrinhas sobre o vazio.
// =============================================================================

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Barrinha, Caixinha, Cartao, Ponto, Selo, TituloTela } from '@/components/toga/base'
import { barrasDoColetor } from '@/lib/toga/tokens'
import { dataBR } from '@/lib/formato'
import { ALVOS } from '@/lib/vigilia/alvos'
import { FONTES, RECUSADAS, fonte } from '@/lib/vigilia/fontes'
import type { Alteracao, Coleta, Jurimetria, TeseCitante } from '@/lib/vigilia/leitura'
import { marca } from '@/lib/vigilia/marcar'

export type Props = {
  alteracoes: Alteracao[]
  coletas: Record<string, Coleta>
  teses: TeseCitante[]
  jurimetria: Jurimetria[]
  /**
   * `artigo_id → leis que já entraram no corpus`, de `artigos.alterado_por`.
   *
   * É o que permite a tela distinguir "a lei mudou e o corpus não sabe" de "a
   * lei mudou e o corpus já foi alinhado". Sem isso, o achado incorporado
   * continuaria na lista com a mesma cara do pendente, e a tela diria que há 63
   * pendências onde não há nenhuma.
   */
  incorporados: Record<string, string[]>
  /** Data de corte lida de `leis.vigencia_ate` — a do banco, não a do código. */
  dataDeCorte: string | null
  /** Recado do banco quando a leitura falhou. A tela continua de pé sem ele. */
  erro: string | null
}

const ROTULO_DA_LEI = Object.fromEntries(ALVOS.map((a) => [a.leiId, a.rotulo]))

type Filtro = 'todas' | 'normas' | 'teses'

export function Fontes({
  alteracoes,
  coletas,
  teses,
  jurimetria,
  incorporados,
  dataDeCorte,
  erro,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [leis, setLeis] = useState<Record<string, boolean>>({})
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})

  /**
   * Quais teses cada achado atinge. Calculado uma vez para a lista inteira: um
   * `find` por linha dentro do render refaria a mesma varredura a cada tecla no
   * campo de busca.
   */
  const impacto = useMemo(() => {
    const mapa = new Map<string, TeseCitante[]>()
    for (const a of alteracoes) {
      if (a.artigosTocados.length === 0) continue
      const atingidas = teses.filter((t) => t.artigos.some((art) => a.artigosTocados.includes(art)))
      if (atingidas.length > 0) mapa.set(a.id, atingidas)
    }
    return mapa
  }, [alteracoes, teses])

  /**
   * Achados que o corpus já absorveu.
   *
   * A regra é estreita de propósito: o achado só conta como incorporado quando
   * TODO artigo que ele nomeia já traz, em `alterado_por`, a norma dele. Um
   * achado que toca três artigos e foi conferido em dois continua pendente — é
   * nos dois terços restantes que a peça citaria redação revogada.
   *
   * Achado sem artigo nomeado nunca é incorporado: não há como afirmar nada
   * sobre um alvo que a ementa não disse qual é.
   */
  const incorporado = useMemo(() => {
    const mapa = new Map<string, boolean>()
    for (const a of alteracoes) {
      const norma = a.norma ?? a.identificacao
      mapa.set(
        a.id,
        a.artigosTocados.length > 0 &&
          a.artigosTocados.every((art) => (incorporados[art] ?? []).includes(norma)),
      )
    }
    return mapa
  }, [alteracoes, incorporados])

  const leisAtivas = Object.keys(leis).filter((k) => leis[k])

  const lista = useMemo(() => {
    const alvo = busca.trim().toLowerCase()
    return alteracoes.filter((a) => {
      if (filtro === 'normas' && !a.virouNorma) return false
      if (filtro === 'teses' && !impacto.has(a.id)) return false
      if (leisAtivas.length > 0 && !a.leisTocadas.some((l) => leisAtivas.includes(l))) return false
      if (!alvo) return true
      return (
        a.ementa.toLowerCase().includes(alvo) || a.identificacao.toLowerCase().includes(alvo)
      )
    })
  }, [alteracoes, busca, filtro, impacto, leisAtivas])

  const normas = alteracoes.filter((a) => a.virouNorma).length
  const comTese = impacto.size

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:overflow-y-auto">
      <div className="mx-auto max-w-[1240px]">
        <TituloTela
          titulo="Fontes e atualizações"
          sub={
            <>
              A vigília não atualiza o corpus — ela avisa quando a fotografia de{' '}
              <strong className="font-medium text-tg-corpo">{dataBR(dataDeCorte)}</strong> envelhece.
            </>
          }
        >
          <span className="hidden items-center gap-2 sm:flex">
            <Selo tom={normas > 0 ? 'ambar' : 'verde'}>
              {normas > 0
                ? `${normas} ${normas === 1 ? 'norma publicada' : 'normas publicadas'}`
                : 'nenhuma norma publicada'}
            </Selo>
          </span>
        </TituloTela>

        {erro && (
          <div className="mt-5 rounded-[14px] bg-tg-ambar-fundo px-4 py-3 text-[12.5px] leading-relaxed text-tg-ambar-txt">
            <strong className="font-semibold">A base não respondeu.</strong> A vigília lê do banco,
            que no plano gratuito pausa por inatividade. O recado dele: {erro}
          </div>
        )}

        {/* --- cartões dos coletores -------------------------------------
            Cinco, como no documento — e cada um alimentado por coleta que
            aconteceu. Card sem execução diz "nunca rodou", em vez de mostrar
            barrinhas sobre o vazio. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {FONTES.map((f, i) => (
            <CartaoColetor key={f.id} id={f.id} indice={i} coleta={coletas[f.id]} />
          ))}
        </div>

        {/*
          A coluna única do celular precisa ser `minmax(0,1fr)` escrita, e não
          o padrão: item de grade nasce com `min-width: auto`, então a trilha
          crescia até caber o conteúdo mais largo de dentro — a linha de filtros
          com o campo de `min-w-[180px]`. Medido em 390px: os dois cartões
          ficavam com 466px e a página inteira rolava para o lado.
        */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* --- alterações captadas -------------------------------------- */}
          <Cartao className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-tg-linha-fraca px-4 py-3.5 sm:px-5">
              <h2 className="text-[13.5px] font-semibold text-tg-tinta">Alterações captadas</h2>
              <span className="text-[11.5px] text-tg-fraco-3">
                {lista.length === alteracoes.length
                  ? `${alteracoes.length} ${alteracoes.length === 1 ? 'item' : 'itens'}`
                  : `${lista.length} de ${alteracoes.length}`}
              </span>
              <span className="flex-1" />
              <div className="flex items-center gap-1.5">
                {(
                  [
                    ['todas', `Todas`],
                    ['normas', `Já viraram lei (${normas})`],
                    ['teses', `Tocam uma tese (${comTese})`],
                  ] as const
                ).map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltro(k)}
                    aria-pressed={filtro === k}
                    className={`tgb rounded-full px-3 py-1.5 text-[11.5px] font-medium max-sm:inline-flex max-sm:min-h-[38px] max-sm:items-center ${
                      filtro === k
                        ? 'bg-tg-acento-fraco text-tg-acento-txt'
                        : 'bg-tg-preenche text-tg-corpo hover:bg-tg-preenche-alto'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-tg-linha-tenue px-4 py-2.5 sm:px-5">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar na ementa ou pelo número…"
                aria-label="Buscar nas alterações"
                className="min-w-[180px] flex-1 rounded-[10px] bg-tg-campo px-3 py-1.5 text-[12.5px] text-tg-tinta outline-none placeholder:text-tg-fraco-3 focus:bg-white"
              />
              {ALVOS.map((a) => (
                <button
                  key={a.leiId}
                  type="button"
                  onClick={() => setLeis((l) => ({ ...l, [a.leiId]: !l[a.leiId] }))}
                  className="tgb flex shrink-0 items-center gap-1.5 rounded-full bg-tg-preenche px-2.5 py-1.5 text-[11.5px] text-tg-corpo hover:bg-tg-preenche-alto max-sm:min-h-[38px] max-sm:px-3.5"
                >
                  <Caixinha marcada={Boolean(leis[a.leiId])} />
                  {a.rotulo}
                </button>
              ))}
            </div>

            {lista.length === 0 ? (
              <Vazia total={alteracoes.length} dataDeCorte={dataDeCorte} />
            ) : (
              <ul className="tg-lista">
                {lista.map((a) => (
                  <Linha
                    key={a.id}
                    a={a}
                    teses={impacto.get(a.id) ?? []}
                    incorporado={incorporado.get(a.id) ?? false}
                    marcado={marcados[a.id] ?? Boolean(a.reconferidoEm)}
                    aoMarcar={async () => {
                      setMarcados((m) => ({ ...m, [a.id]: true }))
                      const r = await marca(a.id)
                      // Falhou: devolve o estado, em vez de deixar a tela
                      // afirmando uma conferência que o banco não registrou.
                      if (!r.ok) setMarcados((m) => ({ ...m, [a.id]: false }))
                    }}
                  />
                ))}
              </ul>
            )}
          </Cartao>

          {/* --- painéis da direita --------------------------------------- */}
          <div className="flex flex-col gap-4">
            <PainelCorpus dataDeCorte={dataDeCorte} normas={normas} />
            <PainelTeses teses={teses} impacto={impacto} />
            <PainelJurimetria linhas={jurimetria} />
            <CartaoRecusadas />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- cartões -----------------------------------------------------------------

function CartaoColetor({
  id,
  indice,
  coleta,
}: {
  id: string
  indice: number
  coleta: Coleta | undefined
}) {
  const f = fonte(id as never)
  const barras = barrasDoColetor(indice)

  // "há 3 min" depende de `Date.now()`, que o servidor e o navegador leem em
  // instantes diferentes — renderizá-lo no HTML do servidor daria divergência
  // de hidratação. Até montar, sai a data absoluta, que é verdadeira nos dois
  // lados; depois de montar, vira o relativo, que é o que o desenho pede.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  return (
    <Cartao className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Ponto cor={coleta?.ok === false ? 'var(--color-tg-ambar-borda)' : undefined} pulsa={coleta?.ok} />
        <h3 className="text-[12.5px] font-semibold text-tg-tinta">{f.nome}</h3>
        <span className="flex-1" />
        {/* Onde o coletor roda. Está na tela porque explica por que um card
            atualiza de manhã e outro à tarde, e porque scraping no runtime que
            serve a página seria uma decisão ruim que ninguém veria. */}
        <span
          className="shrink-0 text-[10px] text-tg-suave"
          title={
            f.motor === 'python'
              ? `${f.origem} · coletado por coletores/ (Python, GitHub Actions)`
              : `${f.origem} · coletado pelo cron da Vercel`
          }
        >
          {f.motor === 'python' ? 'py' : 'ts'}
        </span>
      </div>

      <p className="mt-1.5 min-h-[44px] text-[11.5px] leading-[1.35] text-tg-fraco-2">
        {f.descricao}
      </p>

      {/* A forma é a do documento; a leitura embaixo é a da última coleta. */}
      <div aria-hidden="true" className="mt-2.5 flex h-8 items-end gap-[3px]">
        {barras.map((b, i) => (
          <span
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: coleta ? b.altura : '18%', background: coleta ? b.cor : '#e9ebf0' }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {coleta ? (
          <>
            <span className="text-tg-fraco-3">
              {montado ? desde(coleta.rodouEm) : dataBR(coleta.rodouEm)}
            </span>
            <Barrinha />
            <span className={coleta.ok ? 'text-tg-corpo' : 'text-tg-ambar-txt'}>
              {coleta.ok
                ? `${coleta.candidatos} de ${coleta.vistos} tocam o corpus`
                : 'falhou na última coleta'}
            </span>
          </>
        ) : (
          <span className="text-tg-suave">nunca rodou — o cron ainda não passou por aqui</span>
        )}
      </div>

      {coleta?.erro && (
        <p className="mt-1.5 truncate text-[10.5px] text-tg-ambar-txt" title={coleta.erro}>
          {coleta.erro}
        </p>
      )}
    </Cartao>
  )
}

/**
 * O que ficou de fora, e por quê.
 *
 * Existe porque a alternativa era pior das duas maneiras: sumir com elas
 * deixaria a pergunta "e a ementa do acórdão?" sem resposta na tela, e
 * desenhá-las com número plausível seria mentir. Aqui elas aparecem como o que
 * são — decisões, com motivo.
 */
function CartaoRecusadas() {
  return (
    <Cartao className="px-4 py-4">
      <div className="flex items-center gap-2">
        <Ponto cor="#c6c9d2" />
        <h2 className="text-[12.5px] font-semibold text-tg-tinta">Fora da vigília</h2>
      </div>
      <ul className="mt-2.5 flex flex-col gap-2">
        {RECUSADAS.map((r) => (
          <li key={r.nome} className="text-[11px] leading-[1.45]">
            <span className="font-medium text-tg-corpo">{r.nome}</span>
            <span className="block text-tg-fraco-3">{r.motivo}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

/**
 * Jurimetria do DataJud.
 *
 * Separada das alterações, e num painel com título próprio, porque responde
 * outra pergunta: não é "a lei mudou?", é "quanto o recorte pesa no
 * Judiciário?". Uma contagem de processos numa lista de normas publicadas é
 * como um painel começa a mentir sem que ninguém tenha escrito uma linha falsa.
 *
 * O rodapé diz o que a API não entrega. O card do documento promete "metadados
 * e ementas"; a metade das ementas não existe no DataJud, e o silêncio sobre
 * isso seria a promessa passando por cumprida.
 */
function PainelJurimetria({ linhas }: { linhas: Jurimetria[] }) {
  if (linhas.length === 0) return null

  const nf = new Intl.NumberFormat('pt-BR')

  return (
    <Cartao className="px-4 py-4">
      <h2 className="text-[12.5px] font-semibold text-tg-tinta">Peso no Judiciário</h2>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-tg-fraco-2">
        Processos de <em className="not-italic text-tg-corpo">{linhas[0]!.assunto}</em> na base
        nacional do CNJ.
      </p>

      <ul className="mt-3 flex flex-col gap-0.5">
        {linhas.map((l) => (
          <li
            key={`${l.assunto}:${l.tribunal}`}
            className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[11.5px]"
          >
            <span className="w-12 shrink-0 font-medium text-tg-tinta-2">{l.tribunal}</span>
            <span className="flex-1 text-right tabular-nums text-tg-corpo">
              {nf.format(l.total)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-tg-linha-tenue pt-3 text-[11px] leading-[1.5] text-tg-fraco-3">
        Contagem, não jurisprudência: a API Pública do DataJud devolve capa e
        movimentação processual, sem ementa nem inteiro teor. E o STF não está na base — ele não
        se submete ao controle administrativo do CNJ.
      </p>
    </Cartao>
  )
}

// --- lista -------------------------------------------------------------------

function Linha({
  a,
  teses,
  incorporado,
  marcado,
  aoMarcar,
}: {
  a: Alteracao
  teses: TeseCitante[]
  incorporado: boolean
  marcado: boolean
  aoMarcar: () => void
}) {
  return (
    <li className="border-b border-tg-linha-tenue px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom={a.virouNorma ? 'ambar' : 'neutro'} title={fonte(a.fonte).origem}>
          {fonte(a.fonte).nome}
        </Selo>
        <span className="text-[13px] font-semibold text-tg-tinta">{a.identificacao}</span>
        {a.virouNorma && (
          <Selo
            tom={incorporado ? 'neutro' : 'escuro'}
            title={
              incorporado
                ? 'O corpus já traz esta redação — ver artigos.alterado_por'
                : 'A fotografia do corpus está desatualizada neste ponto'
            }
          >
            {a.norma ?? 'virou lei'}
          </Selo>
        )}
        {/*
          O selo verde não é "alguém leu": é "o texto do banco já é este". Ele
          sai de `artigos.alterado_por`, que é a mesma coluna que a tela do
          artigo e o rodapé da peça usam — se um dia divergirem, os três
          divergem juntos, e não a tela sozinha.
        */}
        {incorporado && (
          <Selo tom="verde" title="A redação nova já está no corpus, conferida e citável">
            no corpus
          </Selo>
        )}
        <span className="flex-1" />
        {/* Data de apresentação da proposição: é o dado da linha, não enfeite. */}
        <span className="text-[11px] text-tg-suave">{dataBR(a.apresentadoEm)}</span>
      </div>

      {/* Ementa em serifada: é texto legislativo citado, não voz da interface. */}
      <p className="mt-1.5 font-tg-serif text-[13px] leading-[1.55] text-tg-corpo">{a.ementa}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {a.leisTocadas.map((l) => (
          <Link
            key={l}
            href={`/leis/${l}`}
            className="text-[11px] font-medium text-tg-acento-txt underline decoration-tg-acento-palido underline-offset-2 max-sm:-my-2 max-sm:inline-block max-sm:py-2"
          >
            {ROTULO_DA_LEI[l] ?? l}
          </Link>
        ))}

        {a.artigosTocados.length > 0 && (
          <>
            <Barrinha />
            <span className="flex flex-wrap items-center gap-1.5">
              {a.artigosTocados.map((art) => (
                <Link
                  key={art}
                  href={`/artigo/${art}`}
                  className="rounded-full bg-tg-preenche px-2 py-0.5 text-[10.5px] text-tg-corpo hover:bg-tg-preenche-alto max-sm:inline-flex max-sm:min-h-[34px] max-sm:items-center max-sm:px-3"
                >
                  art. {art.split('_art')[1]}
                </Link>
              ))}
            </span>
          </>
        )}

        {teses.length > 0 && (
          <>
            <Barrinha />
            <span
              className="text-[11px] font-medium text-tg-ambar-txt"
              title={teses.map((t) => t.nome).join(' · ')}
            >
              Impacto nas teses ({teses.length})
            </span>
          </>
        )}

        <span className="flex-1" />

        {a.url && (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            // `py-2 -my-2` no toque: a área tocável cresce de 17 para 33px e o
            // layout não se mexe, porque a margem negativa devolve o que o
            // padding tomou. Link em linha de texto é isento do alvo mínimo
            // (WCAG 2.5.8), mas 11px sublinhado num celular é difícil de
            // acertar de qualquer jeito, e isto não custa um pixel de desenho.
            className="text-[11px] text-tg-fraco-2 underline decoration-tg-linha underline-offset-2 hover:text-tg-tinta max-sm:-my-2 max-sm:inline-block max-sm:py-2"
          >
            ver na origem ↗
          </a>
        )}

        {marcado ? (
          <span className="text-[11px] text-tg-verde-txt">conferido</span>
        ) : (
          <button
            type="button"
            onClick={aoMarcar}
            className="tgb rounded-full bg-tg-preenche px-2.5 py-1 text-[11px] font-medium text-tg-corpo hover:bg-tg-preenche-alto max-sm:inline-flex max-sm:min-h-[38px] max-sm:items-center max-sm:px-3.5"
          >
            marcar como conferido
          </button>
        )}
      </div>

      {a.situacao && (
        <p className="mt-1.5 truncate text-[10.5px] text-tg-tenue" title={a.situacao}>
          {a.situacao}
        </p>
      )}
    </li>
  )
}

function Vazia({ total, dataDeCorte }: { total: number; dataDeCorte: string | null }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[13px] text-tg-corpo">
        {total === 0
          ? 'Nada captado ainda.'
          : 'Nenhuma alteração com esses filtros.'}
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-tg-fraco-3">
        {total === 0 ? (
          <>
            Ou o cron ainda não rodou, ou nenhuma proposição publicada depois de{' '}
            {dataBR(dataDeCorte)} declara alterar a Lei 11.343, o Código Penal ou o Código de
            Processo Penal. As duas coisas são distinguíveis pelos cartões acima.
          </>
        ) : (
          'A lista inteira continua acessível em “Todas”.'
        )}
      </p>
    </div>
  )
}

// --- painéis -----------------------------------------------------------------

function PainelCorpus({ dataDeCorte, normas }: { dataDeCorte: string | null; normas: number }) {
  return (
    <Cartao className="px-4 py-4">
      <h2 className="text-[12.5px] font-semibold text-tg-tinta">O corpus citável</h2>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-tg-fraco-2">
        As três leis que a peça pode citar saíram do Vade Mecum do Senado, 1ª ed., na redação de{' '}
        <strong className="font-medium text-tg-corpo">{dataBR(dataDeCorte)}</strong>.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {ALVOS.map((a) => (
          <li key={a.leiId}>
            <Link
              href={`/leis/${a.leiId}`}
              className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[12px] text-tg-corpo hover:bg-tg-preenche"
            >
              <Ponto cor="var(--color-tg-acento-palido)" tamanho={5} />
              <span className="flex-1 truncate">{a.rotulo}</span>
              <span className="text-[10.5px] text-tg-tenue">{a.leiId}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-tg-linha-tenue pt-3 text-[11px] leading-[1.5] text-tg-fraco-3">
        {normas > 0 ? (
          <>
            <strong className="font-medium text-tg-ambar-txt">
              A fotografia está furada em {normas} {normas === 1 ? 'ponto' : 'pontos'}.
            </strong>{' '}
            Corrigir é rodar o parser sobre a nova redação e reconferir o diff — a vigília não
            reescreve texto legal, e é por isso que ela pode errar sem estragar nada.
          </>
        ) : (
          <>
            A vigília nunca escreve em <code className="text-[10.5px]">dispositivos</code>. Ela lê
            duas APIs públicas e compara com o que o banco já guarda; atualizar o corpus continua
            sendo trabalho de gente, com o parser e o diff na frente.
          </>
        )}
      </p>
    </Cartao>
  )
}

function PainelTeses({
  teses,
  impacto,
}: {
  teses: TeseCitante[]
  impacto: Map<string, TeseCitante[]>
}) {
  /** Quantos achados atingem cada tese. É a leitura inversa do mapa. */
  const contagem = useMemo(() => {
    const c = new Map<string, number>()
    for (const lista of impacto.values()) {
      for (const t of lista) c.set(t.id, (c.get(t.id) ?? 0) + 1)
    }
    return c
  }, [impacto])

  const ordenadas = [...teses].sort((a, b) => (contagem.get(b.id) ?? 0) - (contagem.get(a.id) ?? 0))

  return (
    <Cartao className="px-4 py-4">
      <h2 className="text-[12.5px] font-semibold text-tg-tinta">Impacto nas teses</h2>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-tg-fraco-2">
        Cruzamento entre os artigos que cada achado nomeia e os que a peça cita em{' '}
        <code className="text-[10.5px]">teses.fundamentos</code>.
      </p>

      {teses.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-tg-tenue">
          As teses não puderam ser lidas do banco. O cruzamento fica de fora; a lista de alterações
          continua de pé.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-0.5">
          {ordenadas.map((t) => {
            const n = contagem.get(t.id) ?? 0
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[11.5px]"
              >
                <span className={`flex-1 truncate ${n > 0 ? 'text-tg-tinta-2' : 'text-tg-fraco-3'}`}>
                  {t.nome}
                </span>
                {n > 0 ? (
                  <Selo tom="ambar">{n}</Selo>
                ) : (
                  <span className="text-[10.5px] text-tg-tenue">—</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 border-t border-tg-linha-tenue pt-3 text-[11px] leading-[1.5] text-tg-fraco-3">
        Achado que não nomeia artigo não entra neste cruzamento. Metade das ementas diz “altera o
        Código Penal” sem dizer onde, e atribuir um artigo por dedução seria pior que deixar o
        campo vazio.
      </p>
    </Cartao>
  )
}

// --- apoio -------------------------------------------------------------------

/** `há 3 min`, `há 2 h`, `há 5 d`. Acima disso, a data. */
function desde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return dataBR(iso)
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d <= 14 ? `há ${d} d` : dataBR(iso)
}
