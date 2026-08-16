// =============================================================================
// /leis/[leiId] — índice de artigos de uma lei.
//
// A lista sai na ordem do documento (`artigos.ordem`), com os headings
// aparecendo quando mudam. A rubrica marginal — aquela que o parser colava no
// fim do bloco anterior e que `normalize.ts` devolveu ao lugar certo — é o que
// torna este índice legível: "Art. 155 · Furto" em vez de só "Art. 155".
// =============================================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { ErroBanco, Selo, Vazio } from '@/components/ui'
import { artigosDaLei, lei as buscaLei, type Artigo } from '@/lib/dados'
import { dataBR, numeroBR, semAcento, tituloArtigo } from '@/lib/formato'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leiId: string }>
}): Promise<Metadata> {
  const { leiId } = await params
  const l = await buscaLei(leiId)
  return { title: l.ok && l.dados ? `${l.dados.apelido} — Toga` : 'Legislação — Toga' }
}

/** Heading mais específico disponível — a seção diz mais que o capítulo. */
const heading = (a: Artigo) => a.secao ?? a.capitulo ?? a.titulo ?? null

export default async function LeiPage({
  params,
  searchParams,
}: {
  params: Promise<{ leiId: string }>
  searchParams: Promise<{ f?: string }>
}) {
  const { leiId } = await params
  const filtro = ((await searchParams).f ?? '').trim()

  const [l, as] = await Promise.all([buscaLei(leiId), artigosDaLei(leiId)])

  // A ordem importa e é o conserto de um bug: primeiro se descarta a falha de
  // banco, e só então a ausência da lei vira 404. Enquanto "não encontrado"
  // chegava como erro, este `notFound()` nunca era alcançado e um id inexistente
  // na URL exibia "a base está fora do ar".
  if (!l.ok || !as.ok) {
    return (
      <>
        <Cabecalho titulo="Legislação" />
        <div className="flex-1 overflow-y-auto p-6">
          <ErroBanco erro={l.ok ? (as as { erro: string }).erro : l.erro} />
        </div>
      </>
    )
  }

  if (!l.dados) notFound()
  const lei = l.dados

  const alvo = semAcento(filtro)
  const artigos = alvo
    ? as.dados.filter(
        (a) =>
          semAcento(a.numero).startsWith(alvo) ||
          semAcento(a.rubrica ?? '').includes(alvo) ||
          semAcento(heading(a) ?? '').includes(alvo),
      )
    : as.dados

  let ultimoHeading: string | null = null

  return (
    <>
      <Cabecalho
        titulo={lei.apelido}
        sub={`${numeroBR(lei.total_artigos)} artigos · redação vigente em ${dataBR(lei.vigencia_ate)}`}
      >
        {lei.cobertura === 'parcial' ? (
          <Selo tom="ambar" title={lei.cobertura_nota ?? undefined}>
            cobertura parcial
          </Selo>
        ) : (
          <Selo tom="esmeralda">cobertura integral</Selo>
        )}
      </Cabecalho>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <form method="get" className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-tg-linha bg-white px-3 py-2 focus-within:border-tg-acento-palido">
              <Icone nome="filtro" className="size-4 shrink-0 text-tg-fraco-3" />
              <input
                name="f"
                defaultValue={filtro}
                placeholder="Filtrar por número, rubrica ou capítulo… (ex.: 33, furto, dosimetria)"
                aria-label="Filtrar artigos"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tg-tinta outline-none placeholder:text-tg-fraco-3"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl border border-tg-linha px-3 py-2.5 text-[13px] text-tg-tinta-4 transition-colors hover:bg-tg-preenche hover:text-tg-tinta"
            >
              Filtrar
            </button>
            {filtro && (
              <Link
                href={`/leis/${leiId}`}
                className="rounded-xl px-2 py-2.5 text-[13px] text-tg-fraco-3 hover:text-tg-tinta-2"
              >
                limpar
              </Link>
            )}
          </form>

          <p className="mt-3 text-[12px] tabular-nums text-tg-fraco-3">
            {numeroBR(artigos.length)} de {numeroBR(as.dados.length)} artigos
          </p>

          {artigos.length === 0 ? (
            <div className="mt-8">
              <Vazio icone="filtro" titulo="Nenhum artigo com esse filtro">
                O filtro casa número, rubrica e heading. Para o texto do dispositivo, use a{' '}
                <Link href="/consulta" className="text-tg-acento-txt hover:underline">
                  consulta em chat
                </Link>
                , que faz a busca híbrida sobre o texto.
              </Vazio>
            </div>
          ) : (
            <ul className="mt-3 space-y-px pb-8">
              {artigos.map((a) => {
                const h = heading(a)
                const novoHeading = h && h !== ultimoHeading
                if (h) ultimoHeading = h
                return (
                  <li key={a.id}>
                    {novoHeading && (
                      <p className="mt-5 mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
                        {h}
                      </p>
                    )}
                    <Link
                      href={`/artigo/${a.id}`}
                      className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-tg-preenche"
                    >
                      <span className="w-20 shrink-0 text-[13.5px] font-medium tabular-nums text-tg-tinta-4 group-hover:text-tg-acento-txt">
                        {tituloArtigo(a.numero)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-tg-corpo">
                        {a.rubrica ?? <span className="text-tg-tenue-2">—</span>}
                      </span>
                      {a.revogado && <Selo tom="vermelho">revogado</Selo>}
                      {/*
                        Âmbar quando a redação mudou depois da data de corte: na
                        lista inteira de uma lei, é o único sinal que o leitor
                        precisa ver antes de clicar. O selo neutro continua para
                        o artigo conferido que não mudou.
                      */}
                      {a.alterado_por.length > 0 ? (
                        <Selo
                          tom="ambar"
                          title={`Redação alterada por ${a.alterado_por.join(', ')} — conferida em ${dataBR(a.conferido_em ?? '')}`}
                        >
                          redação nova
                        </Selo>
                      ) : (
                        a.conferido_em && (
                          <Selo title={`Conferido contra o texto oficial em ${dataBR(a.conferido_em)}`}>
                            conferido
                          </Selo>
                        )
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
