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
import { aplicaA, casos, teses } from '@/lib/dados'
import { titulo } from '@/lib/toga/marca'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: titulo('Peças'),
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
            /*
              O texto anterior era um recado de desenvolvedor para si mesmo —
              "Incremento 4 ainda não semeado", schema, gatilho, curadoria — e
              descrevia um estado que não existe mais: os casos e as teses estão
              no banco desde então. Estado vazio errado é pior que estado vazio
              feio, porque afirma alguma coisa.

              Hoje esta tela só fica vazia se o banco não devolver os casos, e é
              isso que ela diz.
            */
            <Vazio icone="documento" titulo="Nenhum caso disponível agora">
              Os casos de demonstração vêm do banco, e ele não devolveu nenhum. Se o projeto
              estiver hospedado no plano gratuito do Supabase, a base pode ter sido pausada por
              inatividade — a primeira visita costuma acordá-la.
            </Vazio>
          ) : (
            <ul className="space-y-3">
              {cs.dados.map((c) => {
                // O checklist é avaliado aqui, com os dados que vieram do banco:
                // `teses.gatilho` contra `casos.fatos`, chave a chave. Nada de
                // heurística sobre a narrativa — ver `aplicaA` em lib/dados.ts.
                const aplicaveis = ts.dados.filter((t) => aplicaA(t, c))
                return (
                  <li key={c.id}>
                    <Cartao className="p-4">
                      <div className="flex items-start gap-3">
                        <p className="min-w-0 flex-1 text-[14px] font-medium text-tg-tinta">
                          {c.titulo}
                        </p>
                        <Selo tom={aplicaveis.length ? 'esmeralda' : 'neutro'}>
                          {aplicaveis.length} de {ts.dados.length} teses
                        </Selo>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-tg-corpo">
                        {c.narrativa}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {c.imputacao.map((id) => (
                          <Link
                            key={id}
                            href={`/dispositivo/${id}`}
                            className="rounded-md bg-tg-preenche px-1.5 py-0.5 text-[11px] text-tg-tinta-4 hover:text-tg-acento-txt"
                          >
                            {id}
                          </Link>
                        ))}
                      </div>

                      {/* O download usa o MESMO `aplicaA` que montou esta lista
                          — o arquivo não pode divergir do que se conferiu aqui. */}
                      {aplicaveis.length > 0 && (
                        <a
                          href={`/api/peca/${c.id}`}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-tg-acento px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                        >
                          <Icone nome="documento" className="size-4" strokeWidth={2} />
                          Baixar minuta .docx
                        </a>
                      )}

                      {aplicaveis.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-tg-linha-fraca pt-3">
                          {aplicaveis.map((t) => (
                            <li key={t.id} className="flex gap-2">
                              <Icone
                                nome="check"
                                className="mt-0.5 size-3.5 shrink-0 text-tg-verde-txt"
                                strokeWidth={2.4}
                              />
                              <span className="min-w-0">
                                <span className="block text-[13px] text-tg-tinta-2">{t.nome}</span>
                                <span className="block text-[12px] leading-relaxed text-tg-fraco-3">
                                  {t.resumo}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Cartao>
                  </li>
                )
              })}
            </ul>
          )}

          {/* ---------- fluxo ---------- */}
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
            Como a peça é montada
          </h2>
          <Cartao className="mt-2 divide-y divide-tg-linha-fraca">
            {FLUXO.map((f) => (
              <div key={f.n} className="flex gap-3 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-tg-preenche text-[11px] font-semibold tabular-nums text-tg-corpo">
                  {f.n}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] text-tg-tinta-2">{f.t}</p>
                  <p className="text-[12.5px] leading-relaxed text-tg-fraco-3">{f.d}</p>
                </div>
              </div>
            ))}
          </Cartao>

          <Cartao className="mt-4 p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-medium text-tg-tinta-2">
              <Icone nome="check" className="size-4 text-tg-acento-txt" strokeWidth={2.2} />
              Citação quebrada é erro de compilação
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tg-fraco-3">
              Os triggers <code>valida_ids_dispositivo</code> e <code>valida_citacoes</code>{' '}
              recusam, no banco, qualquer tese cujo <code>{'{{cite:id}}'}</code> aponte para
              dispositivo inexistente — e o teste de citação varre o YAML de curadoria antes do
              build. Uma citação quebrada falha no CI, não em audiência.
            </p>
          </Cartao>

          <p className="mt-4 pb-6 text-[11.5px] leading-relaxed text-tg-tenue-2">
            Nenhuma frase da minuta é gerada em runtime: a argumentação é produzida offline e só
            aparece depois de revisão humana (<code>argumentacao.revisado_em</code> não nulo é
            condição da própria policy de RLS).
          </p>
        </div>
      </div>
    </>
  )
}
