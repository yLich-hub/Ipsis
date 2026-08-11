// =============================================================================
// /pecas — resposta à acusação (art. 396-A do CPP).
//
// Uma peça só, de propósito. A tela mostra o estado real do incremento 4: se
// `casos` e `teses` estão vazios no banco, ela diz isso e explica o fluxo, em
// vez de exibir três casos falsos que não geram nada.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Cartao, ErroBanco, Selo, Vazio } from '@/components/ui'
import { casos, teses } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Peças — Jesbick',
  description: 'Resposta à acusação (art. 396-A do CPP) a partir de caso e checklist de teses.',
}

const FLUXO = [
  { n: 1, t: 'Seleção do caso', d: 'três casos de tráfico realistas e anonimizados, já no banco' },
  { n: 2, t: 'Checklist de teses', d: 'casos.fatos e teses.gatilho usam as mesmas chaves — avaliação direta, não heurística' },
  { n: 3, t: 'Costura argumentativa', d: 'gerada offline por scripts/argumentar.ts, revisada à mão, servida do banco' },
  { n: 4, t: 'Minuta em DOCX', d: 'marcadores {{cite:id}} resolvidos pelo texto lido do banco' },
]

export default async function PecasPage() {
  const [cs, ts] = await Promise.all([casos(), teses()])

  if (!cs.ok || !ts.ok) {
    return (
      <>
        <Cabecalho titulo="Peças" />
        <div className="flex-1 overflow-y-auto p-6">
          <ErroBanco erro={cs.ok ? (ts as { erro: string }).erro : (cs as { erro: string }).erro} />
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo="Peças" sub="resposta à acusação · art. 396-A do CPP">
        <Selo tom={cs.dados.length ? 'esmeralda' : 'ambar'}>
          {cs.dados.length} casos · {ts.dados.length} teses
        </Selo>
      </Cabecalho>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {cs.dados.length === 0 ? (
            <Vazio icone="documento" titulo="Incremento 4 ainda não semeado">
              O schema das <code>teses</code>, dos <code>casos</code> e da{' '}
              <code>argumentacao</code> já está no banco, com os gatilhos que recusam citação
              órfã. O que falta é a curadoria: 10 a 15 teses escritas à mão e três casos
              anonimizados.
            </Vazio>
          ) : (
            <ul className="space-y-3">
              {cs.dados.map((c) => (
                <li key={c.id}>
                  <Cartao className="p-4">
                    <p className="text-[14px] font-medium text-slate-100">{c.titulo}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{c.narrativa}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.imputacao.map((id) => (
                        <Link
                          key={id}
                          href={`/dispositivo/${id}`}
                          className="rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-emerald-300"
                        >
                          {id}
                        </Link>
                      ))}
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
          )}

          {/* ---------- fluxo ---------- */}
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Como a peça é montada
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            {FLUXO.map((f) => (
              <div key={f.n} className="flex gap-3 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.05] text-[11px] font-semibold tabular-nums text-slate-400">
                  {f.n}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] text-slate-200">{f.t}</p>
                  <p className="text-[12.5px] leading-relaxed text-slate-500">{f.d}</p>
                </div>
              </div>
            ))}
          </Cartao>

          <Cartao className="mt-4 p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-medium text-slate-200">
              <Icone nome="check" className="size-4 text-emerald-400" strokeWidth={2.2} />
              Citação quebrada é erro de compilação
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              Os triggers <code>valida_ids_dispositivo</code> e <code>valida_citacoes</code>{' '}
              recusam, no banco, qualquer tese cujo <code>{'{{cite:id}}'}</code> aponte para
              dispositivo inexistente — e o teste de citação varre o YAML de curadoria antes do
              build. Uma citação quebrada falha no CI, não em audiência.
            </p>
          </Cartao>

          <p className="mt-4 pb-6 text-[11.5px] leading-relaxed text-slate-600">
            Nenhuma frase da minuta é gerada em runtime: a argumentação é produzida offline e só
            aparece depois de revisão humana (<code>argumentacao.revisado_em</code> não nulo é
            condição da própria policy de RLS).
          </p>
        </div>
      </div>
    </>
  )
}
