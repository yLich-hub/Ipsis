'use client'

// =============================================================================
// TOGA v2 — Jurisprudência
//
// O documento de design desenha um buscador de acórdãos: 1.284 resultados,
// filtro por tribunal, esqueleto de carregamento a cada toque. Este produto não
// é isso, e a diferença é deliberada — a jurisprudência aqui mora em
// `teses.jurisprudencia`, existe para *sustentar uma tese da peça*, e não para
// ser pesquisada solta.
//
// O que se manteve do desenho: a coluna de filtros de 242px, a barra de consulta
// com contagem, os chips do que está ativo, o cartão de resultado com ementa
// serifada e as duas ações no rodapé.
//
// O que mudou, e por quê:
//
// - Os filtros saem dos dados que vieram, não de uma lista fixa. Um filtro
//   "TJSP (388)" que não filtra nada porque não há acórdão do TJSP é a coisa que
//   mais rápido revela uma tela de demonstração.
// - O esqueleto de carregamento não é acionado por toque em filtro. Filtrar aqui
//   é síncrono e local; fingir 850 ms de espera seria mentir sobre o custo. Ele
//   aparece onde a espera é real — no carregamento do banco, via Suspense da
//   página. Ver `Esqueletos`, exportado no fim deste arquivo.
// =============================================================================

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Caixinha, Esqueleto, Selo } from '@/components/toga/base'
import { MARCA } from '@/lib/toga/marca'

export type Linha = {
  tribunal?: string
  classe?: string
  numero?: string
  tese?: string
  url?: string
  /** Nome da tese da peça que este entendimento sustenta. */
  origem: string
  origemId: string

  /**
   * Situação do precedente qualificado, no vocabulário do STJ: 'Trânsito em
   * Julgado', 'Cancelada', 'Sobrestado', 'Revisado'…
   *
   * Só as linhas vindas de `precedentes_stj` a têm — a curadoria manual não
   * tem como acompanhar situação, e por isso ela não a exibe em vez de exibir
   * um "vigente" que ninguém conferiu.
   *
   * **É o campo mais importante desta tela.** Dos 61 temas coletados, 14 estão
   * cancelados ou sobrestados, entre eles o Tema 600 — *o tráfico privilegiado
   * não é equiparado a hediondo* —, que está `Revisado`. Mostrar a tese sem a
   * situação seria entregar ao advogado um entendimento morto com cara de vivo,
   * que é a versão jurisprudencial do que a decisão nº 3 existe para impedir.
   */
  situacao?: string
}

/**
 * A situação exige conferência antes do uso?
 *
 * Espelha `situacoes_de_alerta` de `data/curadoria/precedentes.yaml`. O prefixo
 * cobre as variações de gênero que o STJ usa no mesmo arquivo — 'Cancelada' e
 * 'Cancelado' aparecem os dois, conforme a natureza do precedente.
 */
export const pedeCuidado = (situacao?: string): boolean =>
  !!situacao &&
  /^(cancelad|sobrestad|suspens|revisad|em julgamento|afetad)/i.test(situacao.trim())

type Ordem = 'tese' | 'tribunal'

export function Jurisprudencia({ linhas }: { linhas: Linha[] }) {
  const [ligados, setLigados] = useState<Record<string, boolean>>({})
  const [ordem, setOrdem] = useState<Ordem>('tese')
  const [busca, setBusca] = useState('')

  /**
   * Grupos de filtro derivados dos dados. Chave prefixada pelo grupo para que
   * um tribunal chamado "STJ" e uma tese chamada "STJ" não colidam no mesmo
   * dicionário de ligados.
   */
  const grupos = useMemo(() => {
    const conta = (campo: (l: Linha) => string | undefined, prefixo: string) => {
      const mapa = new Map<string, number>()
      for (const l of linhas) {
        const v = campo(l)
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1)
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => ({ chave: `${prefixo}:${t}`, t, n }))
    }
    return [
      { nome: 'Tribunal', itens: conta((l) => l.tribunal, 'tribunal') },
      { nome: 'Classe', itens: conta((l) => l.classe, 'classe') },
      // Filtro novo, e o mais útil dos quatro: é por ele que se isola o que o
      // STJ já cancelou ou está revendo.
      { nome: 'Situação', itens: conta((l) => l.situacao, 'situacao') },
      { nome: 'Tese sustentada', itens: conta((l) => l.origem, 'origem') },
    ].filter((g) => g.itens.length > 0)
  }, [linhas])

  const ativos = Object.keys(ligados).filter((k) => ligados[k])

  const resultados = useMemo(() => {
    const alvo = busca.trim().toLowerCase()

    const passa = (l: Linha) => {
      // Dentro de um grupo os filtros somam (OU); entre grupos eles restringem
      // (E). É o comportamento que qualquer facetado tem, e o contrário —
      // tudo em E — deixaria "STJ + STF" sempre vazio.
      for (const g of grupos) {
        const marcados = g.itens.filter((i) => ligados[i.chave])
        if (marcados.length === 0) continue
        const valor =
          g.nome === 'Tribunal'
            ? l.tribunal
            : g.nome === 'Classe'
              ? l.classe
              : g.nome === 'Situação'
                ? l.situacao
                : l.origem
        if (!marcados.some((m) => m.t === valor)) return false
      }
      if (!alvo) return true
      return [l.tese, l.numero, l.classe, l.tribunal, l.origem, l.situacao]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(alvo)
    }

    const filtrados = linhas.filter(passa)
    return filtrados.sort((a, b) =>
      ordem === 'tribunal'
        ? (a.tribunal ?? '').localeCompare(b.tribunal ?? '')
        : a.origem.localeCompare(b.origem),
    )
  }, [linhas, grupos, ligados, busca, ordem])

  return (
    <div className="tg-sobe flex min-h-0 flex-1">
      {/* filtros */}
      <aside className="hidden w-[242px] shrink-0 overflow-auto border-r border-tg-linha-media px-4 py-5 xl:block">
        <div className="mb-4 flex items-center gap-2">
          <p className="text-[12px] font-medium text-tg-suave">Filtros</p>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setLigados({})}
            className="tgb text-[11.5px] font-medium text-tg-acento-txt"
          >
            Limpar
          </button>
        </div>

        {grupos.map((g) => (
          <div key={g.nome} className="mb-5">
            <p className="mb-2.5 text-[11.5px] font-medium text-tg-fraco-3">{g.nome}</p>
            <div className="flex flex-col gap-[3px]">
              {g.itens.map((i) => {
                const on = !!ligados[i.chave]
                return (
                  <button
                    key={i.chave}
                    type="button"
                    onClick={() => setLigados((l) => ({ ...l, [i.chave]: !l[i.chave] }))}
                    aria-pressed={on}
                    className={`tgb flex items-center gap-[9px] rounded-[10px] px-[9px] py-1.5 text-left transition-[background-color,box-shadow] duration-200 hover:bg-tg-acento-fraco hover:shadow-[inset_0_0_0_1px_var(--color-tg-acento-palido)] ${
                      on ? 'bg-tg-preenche' : ''
                    }`}
                  >
                    <Caixinha marcada={on} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-tg-corpo">
                      {i.t}
                    </span>
                    <span className="shrink-0 text-[11px] text-tg-tenue-2">{i.n}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/*
          A restrição de doutrina é regra dura do projeto e mora nesta tela
          porque é aqui que a pergunta nasce: "e a doutrina?". Ver CLAUDE.md.
        */}
        <div className="rounded-2xl bg-white px-4 py-3.5 shadow-[var(--tg-elev-1)]">
          <p className="text-[12px] font-medium text-tg-tinta-2">Por que não há doutrina</p>
          <p className="mt-1.5 text-[11.5px] leading-[1.55] text-tg-fraco-2">
            Doutrina é obra autoral protegida — Nucci, Greco, Bitencourt. Este projeto não hospeda,
            não indexa e não resume de forma substitutiva. Acórdão não tem essa proteção, e é por
            isso que o entendimento consolidado cabe aqui e o resumo de manual não cabe em lugar
            nenhum.
          </p>
        </div>
      </aside>

      {/* resultados */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pb-3.5 pt-5 sm:px-[26px]">
          <div className="flex items-center gap-[11px] rounded-[18px] bg-white px-4 py-3.5 shadow-[var(--tg-elev-1f)]">
            <Selo tom="acento">Entendimento consolidado</Selo>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por tese, classe ou número…"
              aria-label="Filtrar entendimentos"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-tg-tinta-2 outline-none placeholder:text-tg-tenue-2"
            />
            <span className="shrink-0 text-[12px] text-tg-fraco-3">
              {resultados.length} de {linhas.length}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-[7px]">
            {ativos.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setLigados((l) => ({ ...l, [k]: false }))}
                className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-acento-fraco px-[11px] py-1.5 text-[11.5px] font-medium text-tg-acento-txt hover:bg-tg-acento-fraco-3"
              >
                {k.split(':').slice(1).join(':')} ✕
              </button>
            ))}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOrdem((o) => (o === 'tese' ? 'tribunal' : 'tese'))}
              className="tgb shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] text-tg-suave shadow-[var(--tg-elev-1)]"
            >
              Ordenar: {ordem === 'tese' ? 'por tese' : 'por tribunal'} ⌄
            </button>
          </div>
        </div>

        <div className="tg-lista flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 pb-[26px] pt-1 sm:px-[26px]">
          {resultados.map((l, i) => (
            <Cartao key={`${l.origemId}-${i}`} l={l} />
          ))}

          {resultados.length === 0 && (
            <div className="rounded-[18px] bg-white px-6 py-10 text-center shadow-[var(--tg-elev-1)]">
              <p className="text-[13.5px] font-medium text-tg-tinta-2">
                {linhas.length === 0
                  ? 'Nenhuma tese semeada ainda'
                  : 'Nenhum entendimento com esses filtros'}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-[1.6] text-tg-fraco-2">
                {linhas.length === 0 ? (
                  <>
                    As entradas vêm de{' '}
                    <code className="text-tg-corpo">teses.jurisprudencia</code> e de{' '}
                    <code className="text-tg-corpo">precedentes_stj</code>, e esta tela só as lê —
                    se as duas estão vazias, o banco não respondeu. O texto legal continua
                    consultável na{' '}
                    <Link href="/consulta" className="text-tg-acento-txt hover:underline">
                      consulta
                    </Link>
                    .
                  </>
                ) : (
                  'Limpe um filtro ou apague o texto da busca.'
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cartao({ l }: { l: Linha }) {
  const identificacao = [l.classe, l.numero].filter(Boolean).join(' ')

  return (
    <article className="tgc tg-sobe rounded-[18px] bg-white px-5 py-[17px] shadow-[var(--tg-elev-1)]">
      <div className="mb-2.5 flex flex-wrap items-center gap-[9px]">
        {l.tribunal && <Selo tom="escuro">{l.tribunal}</Selo>}
        {identificacao && (
          <span className="shrink-0 text-[13.5px] font-medium text-tg-tinta">{identificacao}</span>
        )}
        <span className="truncate text-[12px] text-tg-fraco-3">sustenta “{l.origem}”</span>
        <span className="flex-1" />
        {/* A situação vem antes do "sustenta tese" de propósito: um tema
            cancelado continua ligado à tese, e é justamente aí que o selo verde
            sozinho enganaria. */}
        {l.situacao && (
          <Selo
            tom={pedeCuidado(l.situacao) ? 'ambar' : 'verde'}
            title={
              pedeCuidado(l.situacao)
                ? 'Situação registrada pelo STJ — confira antes de usar'
                : 'Situação registrada pelo STJ'
            }
          >
            {l.situacao}
          </Selo>
        )}
        {!l.situacao && <Selo tom="verde">Sustenta tese</Selo>}
      </div>

      {l.tese && (
        <p className="mb-3.5 font-tg-serif text-[13.5px] leading-[1.68] text-tg-tinta-5">
          {l.tese}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="text-[11.5px] text-tg-fraco-3">
          {l.url ? 'link para o inteiro teor conferido' : 'sem link oficial na curadoria'}
        </span>
        <span className="flex-1" />
        {l.url && (
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="tgb shrink-0 rounded-full bg-tg-preenche px-3 py-1.5 text-[11.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
          >
            Inteiro teor ↗
          </a>
        )}
        <Link
          href={`/consulta?p=${encodeURIComponent(l.tese ?? l.origem)}`}
          className="tgb shrink-0 rounded-full bg-tg-acento px-3 py-1.5 text-[11.5px] font-medium text-white shadow-[0_4px_12px_-6px_rgb(179_20_31_/_0.8)]"
        >
          Perguntar ao {MARCA.nome}
        </Link>
      </div>
    </article>
  )
}

/**
 * Esqueleto de carregamento — a forma exata do cartão acima.
 *
 * Usado pelo `loading.tsx` da rota, onde a espera é a ida ao Supabase e
 * portanto real. As larguras (46/150/210px) são as do documento de design: elas
 * imitam pílula, número e linha de metadados, e é essa imitação que faz o
 * esqueleto parecer o conteúdo chegando em vez de três barras cinzas.
 */
export function Esqueletos({ quantos = 3 }: { quantos?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-[76px] sm:px-[26px]">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="rounded-[18px] bg-white px-5 py-[18px] shadow-[var(--tg-elev-1)]">
          <div className="mb-3 flex gap-[9px]">
            <Esqueleto className="h-[18px] w-[46px]" />
            <Esqueleto className="h-[18px] w-[150px]" />
            <Esqueleto className="h-[18px] w-[210px]" />
          </div>
          <Esqueleto className="mb-2 h-3" />
          <Esqueleto className="mb-2 h-3 w-[92%]" />
          <Esqueleto className="h-3 w-[64%]" />
        </div>
      ))}
    </div>
  )
}
