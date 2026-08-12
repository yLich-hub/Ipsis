// =============================================================================
// /busca — a RPC de busca híbrida com cara de tela.
//
// O formulário é um <form method="get"> puro: sem JS, sem estado de cliente, e
// o resultado fica endereçável (a URL com ?q= pode ser colada em qualquer
// lugar). A página chama `consultar()` direto, sem passar por /api/busca — a
// rota existe para o console do agente, que é cliente.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Aviso, CartaoCitacao, ErroBanco, Selo, Vazio } from '@/components/ui'
import { consultar } from '@/lib/busca/consultar'
import { ROTULO_MOLDE } from '@/lib/busca/intencao'
import { leis } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Busca — Toga',
  description: 'Busca híbrida: rubrica, lexical e semântica fundidas por Reciprocal Rank Fusion.',
}

const EXEMPLOS = [
  { q: 'fixação da pena', nota: 'rubrica oficial — o match exato encabeça, com 5× o score do segundo' },
  { q: 'art. 33 da Lei 11.343', nota: 'molde dispositivo — resolvido pelo id, sem passar pela fusão' },
  { q: 'porte de droga para consumo pessoal', nota: 'lexical + semântica sobre o art. 28' },
  {
    q: 'tráfico privilegiado',
    nota: 'buraco conhecido: sem rubrica curada, a semântica devolve tráfico de influência e de pessoas — é o que o incremento 2 fecha',
  },
]

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lei?: string }>
}) {
  const p = await searchParams
  const q = (p.q ?? '').trim()
  const lei = p.lei && p.lei !== 'todas' ? p.lei : null

  const ls = await leis()
  const resposta = q ? await consultar({ q, lei, qtd: 12 }) : null

  return (
    <>
      <Cabecalho titulo="Busca na legislação" sub="rubrica + lexical + semântica, numa chamada só" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {/* ---------- formulário ---------- */}
          <form method="get" className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-tg-linha bg-white px-3 py-2 focus-within:border-tg-acento-palido">
              <Icone nome="busca" className="size-4 shrink-0 text-tg-fraco-3" />
              <input
                name="q"
                defaultValue={q}
                autoFocus
                placeholder="Termo do instituto, texto legal ou descrição do caso…"
                aria-label="Consulta"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-tg-tinta outline-none placeholder:text-tg-fraco-3"
              />
            </div>

            <select
              name="lei"
              defaultValue={lei ?? 'todas'}
              aria-label="Filtrar por lei"
              className="rounded-xl border border-tg-linha bg-white px-3 py-2.5 text-[13px] text-tg-tinta-4 outline-none focus:border-tg-acento-palido"
            >
              <option value="todas">Todas as leis</option>
              {ls.ok &&
                ls.dados.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.apelido}
                  </option>
                ))}
            </select>

            <button
              type="submit"
              className="rounded-xl bg-tg-acento px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-tg-acento"
            >
              Buscar
            </button>
          </form>

          {/* ---------- resultado ---------- */}
          {!resposta ? (
            <div className="mt-8">
              <p className="text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
                Consultas que mostram as três pernas
              </p>
              <ul className="mt-2 space-y-2">
                {EXEMPLOS.map((e) => (
                  <li key={e.q}>
                    <Link
                      href={`/busca?q=${encodeURIComponent(e.q)}`}
                      className="group flex items-center gap-3 rounded-xl border border-tg-linha bg-white px-4 py-3 transition-colors hover:border-tg-acento-palido"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-tg-tinta-2">“{e.q}”</span>
                        <span className="block text-[12px] text-tg-fraco-3">{e.nota}</span>
                      </span>
                      <Icone
                        nome="seta_direita"
                        className="ml-auto size-4 shrink-0 text-tg-tenue-2 group-hover:text-tg-acento-txt"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-fraco-3">
                <Selo tom={resposta.intencao.molde === 'tema' ? 'esmeralda' : 'neutro'}>
                  {ROTULO_MOLDE[resposta.intencao.molde]}
                </Selo>
                <span>{resposta.intencao.sinal}</span>
                {resposta.direta && <Selo tom="esmeralda">leitura por id</Selo>}
                <span className="ml-auto tabular-nums">
                  {resposta.itens.length} resultado(s) · {resposta.ms} ms ·{' '}
                  {resposta.direta ? 'sem fusão' : resposta.vetor ? '3 pernas' : '2 pernas'}
                </span>
              </div>

              {resposta.aviso && <Aviso className="mt-3">{resposta.aviso}</Aviso>}
              {resposta.erro && (
                <div className="mt-3">
                  <ErroBanco erro={resposta.erro} />
                </div>
              )}

              {resposta.intencao.molde === 'doutrina' && (
                <Aviso className="mt-3">
                  Molde <strong>doutrina</strong>: obra autoral protegida não é hospedada, indexada
                  nem resumida aqui. O que volta abaixo é o texto legal; entendimento consolidado
                  virá de jurisprudência com link para a fonte, no incremento 4.
                </Aviso>
              )}

              {resposta.itens.length === 0 && !resposta.erro ? (
                <div className="mt-8">
                  <Vazio titulo="Nada casou com essa consulta">
                    As três pernas rodaram e nenhuma trouxe dispositivo. Termo de instituto que
                    ainda não tem rubrica <em>curada</em> cai exatamente aqui — é o buraco
                    conhecido do incremento 2.
                  </Vazio>
                </div>
              ) : (
                <ul className="mt-4 space-y-3 pb-6">
                  {resposta.itens.map((i) => (
                    <li key={i.dispositivo_id}>
                      <CartaoCitacao
                        d={{
                          id: i.dispositivo_id,
                          citacao: i.citacao,
                          texto: i.texto,
                          rubrica: i.artigo_rubrica,
                          contexto: i.capitulo,
                          lei_apelido: i.lei_apelido,
                          vigencia_ate: i.vigencia_ate,
                          cobertura: i.cobertura,
                          cobertura_nota: i.cobertura_nota,
                          revogado: i.revogado,
                          rubrica_termo: i.rubrica_termo,
                          papel: i.papel,
                          // Em leitura por id não há fusão: exibir score seria inventar métrica.
                          score: resposta.direta ? null : Number(i.score),
                        }}
                        compacto
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
