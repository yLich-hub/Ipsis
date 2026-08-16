'use client'

// =============================================================================
// TOGA v2 — Vade Mecum: grade de ramos + leitor
//
// O documento de design monta esta tela como nove cartões de ramo do direito à
// esquerda e um leitor de 404px à direita, com o texto do artigo dentro. O
// acervo real tem 75 legislações federais em nove áreas, então a grade sai
// direto dos dados — nada de nove cartões fixos com contagens inventadas.
//
// A única liberdade tomada em relação ao desenho está no painel: em vez do texto
// do artigo, ele lista as leis do ramo selecionado. Carregar texto de lei aqui
// custaria uma ida ao disco por clique (a Constituição sozinha tem 831 KB) para
// mostrar quatro parágrafos que a tela da lei já mostra inteiros e melhor. O
// painel faz o que ele de fato é: a antessala da leitura.
//
// O selo de procedência aparece em todo lugar por regra do projeto: este acervo
// é espelho de terceiro, sem vigência conferida, e **não é corpus citável**.
// Onde uma lei também existe no corpus curado, o cartão mostra o caminho para
// lá — que é o único lado que pode virar fundamento de peça.
// =============================================================================

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Selo, TituloTela } from '@/components/toga/base'
import { ListaFavoritas } from '@/components/vademecum/lista-favoritas'
import { numeroBR } from '@/lib/formato'
import type { AreaAcervo, LeiAcervo } from '@/lib/tipos'
import { MATIZ, type Matiz } from '@/lib/toga/tokens'

/**
 * Cor do quadradinho de cada ramo. Por posição e não por nome de área: o índice
 * do acervo pode ganhar uma área nova, e o pior que acontece é a décima repetir
 * a primeira — melhor que um `undefined` virando quadrado transparente.
 */
const MATIZES = Object.values(MATIZ) as (typeof MATIZ)[Matiz][]

type Origem = { repo: string; url: string; sha: string; commit_em: string; licenca: string }

export function VadeMecum({
  areas,
  leis,
  origem,
}: {
  areas: AreaAcervo[]
  leis: LeiAcervo[]
  origem: Origem
}) {
  const [ramo, setRamo] = useState<string>(() => areas[0]?.chave ?? '')
  const [soCuradas, setSoCuradas] = useState(false)
  const [filtro, setFiltro] = useState('')

  const curadas = useMemo(() => leis.filter((l) => l.corpus_id).length, [leis])

  const visiveis = useMemo(() => {
    const alvo = filtro.trim().toLowerCase()
    return leis.filter((l) => {
      if (soCuradas && !l.corpus_id) return false
      if (!alvo) return true
      return [l.apelido, l.titulo, l.num_lei, l.ementa, l.area_rotulo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(alvo)
    })
  }, [leis, soCuradas, filtro])

  const ramosVisiveis = useMemo(
    () => areas.filter((a) => visiveis.some((l) => l.area === a.chave)),
    [areas, visiveis],
  )

  const areaAtual = areas.find((a) => a.chave === ramo) ?? ramosVisiveis[0] ?? areas[0]
  const leisDoRamo = visiveis.filter((l) => l.area === areaAtual?.chave)

  const artigosTotal = leis.reduce((s, l) => s + l.artigos, 0)

  return (
    <div className="tg-sobe flex min-h-0 flex-1 flex-col xl:flex-row">
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-[30px] pt-6 sm:px-7">
        <TituloTela
          titulo="Vade Mecum"
          sub={
            <>
              {numeroBR(leis.length)} legislações federais · {numeroBR(artigosTotal)} artigos ·{' '}
              <span className="text-tg-tenue">espelho de leitura, sem vigência conferida</span>
            </>
          }
        >
          <button
            type="button"
            onClick={() => setSoCuradas((s) => !s)}
            aria-pressed={soCuradas}
            className={`tgb shrink-0 rounded-full px-3.5 py-2 text-[12px] font-medium shadow-[var(--tg-elev-1)] ${
              soCuradas ? 'bg-tg-acento text-white' : 'bg-white text-tg-corpo'
            }`}
          >
            Somente as curadas ({curadas})
          </button>
        </TituloTela>

        {/*
          O aviso de procedência que ficava aqui saiu a pedido: ele aparecia
          antes de qualquer coisa e atrapalhava quem só queria procurar uma lei.
          A separação entre acervo e corpus curado não dependia dele — ela é
          estrutural, não visual: os ids do acervo nunca casam o padrão do
          corpus, nada é escrito em `dispositivos`, a busca híbrida não enxerga
          o acervo, e `tests/vademecum.test.ts` falha se alguém ligar os dois.
          O crédito da fonte continua no rodapé do leitor, que é obrigação de
          licença, não aviso ao usuário.
        */}
        {/*
          A faixa de favoritas. `ListaFavoritas` existia pronta e não estava
          montada em lugar nenhum: a estrela do leitor gravava no `localStorage`
          e nada no produto lia de volta, então favoritar era um botão que não
          levava a nada. Ela some sozinha quando não há favorito — ver o próprio
          componente.
        */}
        <ListaFavoritas leis={leis.map((l) => ({ id: l.id, apelido: l.apelido }))} />

        <div className="mt-4 flex items-center gap-2.5 rounded-[18px] bg-white px-4 py-3 shadow-[var(--tg-elev-1f)]">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border-[1.6px] border-tg-fraco-3"
          />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nome, número ou área… (ex.: consumidor, 8.078, penal)"
            aria-label="Filtrar legislações do acervo"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tg-tinta-2 outline-none placeholder:text-tg-tenue-2"
          />
          <span className="shrink-0 text-[12px] tabular-nums text-tg-fraco-3">
            {numeroBR(visiveis.length)} de {numeroBR(leis.length)}
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ramosVisiveis.map((a, i) => {
            const doRamo = visiveis.filter((l) => l.area === a.chave)
            const arts = doRamo.reduce((s, l) => s + l.artigos, 0)
            const temCurada = doRamo.some((l) => l.corpus_id)
            const ativo = a.chave === areaAtual?.chave

            return (
              <button
                key={a.chave}
                type="button"
                onClick={() => setRamo(a.chave)}
                aria-pressed={ativo}
                className={`tgb tgc tg-sobe rounded-[18px] bg-white px-[17px] py-4 text-left ${
                  ativo
                    ? 'shadow-[0_1px_2px_rgb(18_20_30_/_0.06),0_14px_30px_-20px_rgb(58_57_96_/_0.7)]'
                    : 'shadow-[var(--tg-elev-1)]'
                }`}
              >
                <span className="mb-2.5 flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="size-[26px] shrink-0 rounded-[9px]"
                    style={{ background: MATIZES[i % MATIZES.length] }}
                  />
                  <span className="min-w-0 truncate text-[14.5px] font-medium text-tg-tinta">
                    {a.rotulo}
                  </span>
                  <span className="flex-1" />
                  {temCurada && <Selo tom="verde">tem curada</Selo>}
                </span>

                <span className="mb-3 block h-9 overflow-hidden text-[12px] leading-[1.5] text-tg-fraco-2">
                  {a.descricao ?? 'Legislação federal do ramo, no espelho do Planalto.'}
                </span>

                {/*
                  `num_lei` vem do espelho por extenso ("Decreto-Lei nº 2.848,
                  de 7 de Dezembro de 1940."), e o documento de design supõe a
                  forma curta. Truncar é melhor que abreviar por regex: uma
                  regra que corta "de 7 de Dezembro de 1940" acerta no CP e erra
                  em lei estadual com nome irregular.
                */}
                <span className="flex flex-wrap gap-[5px]">
                  {doRamo.slice(0, 3).map((l) => (
                    <span
                      key={l.id}
                      title={l.num_lei ?? l.apelido}
                      className="max-w-[150px] truncate rounded-full bg-tg-preenche px-[9px] py-[3px] text-[11px] text-tg-suave"
                    >
                      {l.num_lei ?? l.apelido}
                    </span>
                  ))}
                </span>

                <span className="mt-3 flex items-center gap-2 whitespace-nowrap border-t border-tg-linha-fraca pt-[11px]">
                  <span className="min-w-0 truncate text-[11.5px] text-tg-tenue">
                    {numeroBR(doRamo.length)} diplomas · {numeroBR(arts)} art.
                  </span>
                  <span className="flex-1" />
                  <span className="shrink-0 text-[11.5px] font-medium text-tg-acento-txt">
                    {ativo ? 'No leitor' : 'Abrir →'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {ramosVisiveis.length === 0 && (
          <p className="mt-3 rounded-[18px] bg-white px-6 py-10 text-center text-[13px] text-tg-fraco-2 shadow-[var(--tg-elev-1)]">
            Nenhuma legislação com esse filtro. O filtro casa nome, número, ementa e área — o que
            busca dentro do texto da lei é a{' '}
            <Link href="/consulta" className="text-tg-acento-txt hover:underline">
              consulta
            </Link>
            , e ela só enxerga o corpus curado.
          </p>
        )}
      </div>

      {/* leitor */}
      <aside className="flex w-full shrink-0 flex-col border-t border-tg-linha-media bg-white xl:w-[404px] xl:border-l xl:border-t-0">
        <div className="shrink-0 border-b border-tg-linha-fraca px-[22px] pb-4 pt-5">
          <p className="mb-2 text-[12px] font-medium text-tg-fraco-3">Leitor</p>
          <h2 className="font-tg-serif text-[17px] leading-[1.25] text-tg-tinta">
            {areaAtual?.rotulo ?? 'Acervo'}
          </h2>
          <p className="mb-3 mt-[5px] text-[12px] text-tg-fraco-3">
            {numeroBR(leisDoRamo.length)} diplomas neste ramo ·{' '}
            {numeroBR(leisDoRamo.reduce((s, l) => s + l.artigos, 0))} artigos
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Selo tom="ambar" title="Sem data de vigência conferida">
              não citável
            </Selo>
            <span className="flex-1" />
            <Link
              href={`/consulta?p=${encodeURIComponent(areaAtual?.rotulo ?? '')}`}
              className="tgb shrink-0 rounded-full bg-tg-acento-fraco px-[11px] py-1.5 text-[11.5px] font-medium text-tg-acento-txt"
            >
              Perguntar sobre isto
            </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-[22px] pb-[26px] pt-5">
          <p className="mb-3.5 text-[11.5px] font-medium text-tg-tenue">
            {areaAtual?.descricao ?? 'Legislação do ramo'}
          </p>

          <div className="flex flex-col gap-3.5">
            {leisDoRamo.map((l) => (
              <div
                key={l.id}
                className={`tg-sobe rounded-[14px] ${
                  l.corpus_id ? 'bg-tg-acento-fraco px-[15px] py-3.5' : ''
                }`}
              >
                <Link
                  href={`/vademecum/${l.id}`}
                  className="tgb block font-tg-serif text-[14px] leading-[1.6] text-tg-tinta-4"
                >
                  <span className="font-tg text-[13.5px] font-medium text-tg-tinta-2">
                    {l.apelido}
                  </span>
                  {l.num_lei && (
                    <span className="ml-1.5 font-tg text-[11.5px] text-tg-fraco-3">
                      {l.num_lei}
                    </span>
                  )}
                  {l.ementa && (
                    <span className="mt-1 block line-clamp-3 text-[13px]">{l.ementa}</span>
                  )}
                </Link>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-tg text-[11.5px] text-tg-fraco-3">
                    {numeroBR(l.artigos)} artigos
                  </span>
                  {l.corpus_id ? (
                    <Link
                      href={`/leis/${l.corpus_id}`}
                      className="tgb rounded-full bg-tg-acento-fraco-2 px-2 py-[3px] font-tg text-[10px] font-semibold text-tg-acento-txt"
                    >
                      também no corpus curado →
                    </Link>
                  ) : null}
                  {!l.link_oficial && (
                    <span
                      title="O espelho não trouxe link, e derivar a URL pelo número abriria outra lei."
                      className="font-tg text-[11px] text-tg-tenue-2"
                    >
                      sem link oficial
                    </span>
                  )}
                </div>
              </div>
            ))}

            {leisDoRamo.length === 0 && (
              <p className="text-[12.5px] text-tg-fraco-2">
                Nenhuma legislação deste ramo passa pelo filtro atual.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-2xl bg-tg-fundo px-4 py-[15px]">
            <p className="mb-2.5 text-[12px] font-medium text-tg-suave">Neste acervo</p>
            <div className="flex flex-col gap-2.5">
              {[
                { tag: 'Corpus', t: 'A legislação citável em peça', href: '/leis' },
                { tag: 'Busca', t: 'Rubrica, léxico e vetor no corpus', href: '/consulta' },
                { tag: 'Origem', t: `${origem.repo} · ${origem.licenca}`, href: origem.url },
              ].map((l) => (
                <Link
                  key={l.tag}
                  href={l.href}
                  className="tgb flex items-center gap-2.5"
                  {...(l.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  <span className="shrink-0 rounded-full bg-tg-acento-fraco px-2 py-[3px] text-[10px] font-semibold text-tg-acento-txt">
                    {l.tag}
                  </span>
                  <span className="truncate text-[12px] text-tg-corpo-2">{l.t}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
