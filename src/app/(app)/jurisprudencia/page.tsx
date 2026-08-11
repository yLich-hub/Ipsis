// =============================================================================
// /jurisprudencia — entendimento consolidado ligado às teses.
//
// A jurisprudência mora em `teses.jurisprudencia` (jsonb), não numa base
// própria: ela existe para sustentar uma tese da peça, não para ser um
// buscador de acórdãos. Enquanto o incremento 4 não é semeado, a tela mostra
// isso — e explica por que doutrina não entra aqui.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Cartao, ErroBanco, Selo, Vazio } from '@/components/ui'
import { teses } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jurisprudência — Jesbick',
  description: 'Entendimento consolidado extraído de acórdãos, ligado às teses da peça.',
}

export default async function JurisprudenciaPage() {
  const ts = await teses()

  if (!ts.ok) {
    return (
      <>
        <Cabecalho titulo="Jurisprudência" />
        <div className="flex-1 overflow-y-auto p-6">
          <ErroBanco erro={ts.erro} />
        </div>
      </>
    )
  }

  const linhas = ts.dados.flatMap((t) =>
    (t.jurisprudencia ?? []).map((j) => ({ ...j, tese: t.nome, teseId: t.id })),
  )

  return (
    <>
      <Cabecalho titulo="Jurisprudência" sub="acórdão sustenta tese — não é buscador de acórdãos">
        <Selo tom={linhas.length ? 'esmeralda' : 'ambar'}>{linhas.length} entradas</Selo>
      </Cabecalho>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {linhas.length === 0 ? (
            <Vazio icone="balanca" titulo="Nenhuma tese semeada ainda">
              As entradas de jurisprudência vivem em <code>teses.jurisprudencia</code> e chegam
              junto com o incremento 4. Enquanto isso, o texto legal está todo consultável na{' '}
              <Link href="/busca" className="text-emerald-300 hover:underline">
                busca
              </Link>
              .
            </Vazio>
          ) : (
            <ul className="space-y-3">
              {linhas.map((j, i) => (
                <li key={`${j.teseId}-${i}`}>
                  <Cartao className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {j.tribunal && <Selo tom="esmeralda">{j.tribunal}</Selo>}
                      <span className="text-[13px] text-slate-300">
                        {j.classe} {j.numero}
                      </span>
                      <span className="ml-auto text-[11.5px] text-slate-600">{j.tese}</span>
                    </div>
                    {j.url && (
                      <a
                        href={j.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-[12px] text-slate-500 hover:text-emerald-300"
                      >
                        {j.url}
                      </a>
                    )}
                  </Cartao>
                </li>
              ))}
            </ul>
          )}

          <Cartao className="mt-6 p-4">
            <h2 className="text-[13px] font-medium text-slate-200">Por que não há doutrina aqui</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              Doutrina é obra autoral protegida (Nucci, Greco, Bitencourt): não é hospedada, não é
              indexada e não é resumida de forma substitutiva neste projeto. Acórdão não tem essa
              proteção — por isso o molde <code>doutrina</code> da busca responde com entendimento
              consolidado extraído de jurisprudência e link para fonte legítima. A restrição não é
              negociável; é o que separa uma ferramenta que um advogado pode usar de uma que ele
              não pode.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  )
}
