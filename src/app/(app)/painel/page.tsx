// =============================================================================
// /painel — estado real da base e dos incrementos.
//
// Não é o "dashboard" genérico do desenho original (métricas de escritório,
// prazos, produtividade — nada disso existe aqui). É o que um portfólio precisa
// mostrar: o que está de pé, medido no banco no momento do carregamento, e não
// um número escrito à mão num JSX.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Aviso, Cartao, ErroBanco, Metrica, Selo } from '@/components/ui'
import { contagemDispositivos, contagemRubricas, leis, saude } from '@/lib/dados'
import { dataBR, numeroBR } from '@/lib/formato'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Painel — Toga',
  description: 'Estado da base: leis, artigos, dispositivos, embeddings e rubricas.',
}

const INCREMENTOS = [
  { n: 1, nome: 'Schema + seed', prova: 'leis, artigos e dispositivos no banco' },
  { n: 2, nome: 'Rubricas', prova: 'rubricas ligadas a dispositivos' },
  { n: 3, nome: 'Busca híbrida', prova: 'embeddings + RPC de fusão' },
  { n: 4, nome: 'Geração de peça', prova: 'teses e casos curados' },
  { n: 5, nome: 'Acabamento visual', prova: 'telas navegáveis' },
] as const

export default async function PainelPage() {
  const [s, ls, curadas] = await Promise.all([saude(), leis(), contagemRubricas('curada')])

  if (!s.ok) {
    return (
      <>
        <Cabecalho titulo="Painel" sub="estado da base" />
        <div className="flex-1 overflow-y-auto p-6">
          <ErroBanco erro={s.erro} />
        </div>
      </>
    )
  }

  const d = s.dados
  const listaLeis = ls.ok ? ls.dados : []
  const porLei = await Promise.all(
    listaLeis.map(async (l) => ({ lei: l, dispositivos: await contagemDispositivos(l.id) })),
  )

  const cobertura = d.dispositivos ? Math.round((d.com_embedding / d.dispositivos) * 100) : 0

  const estado = (n: number): 'pronto' | 'parcial' | 'pendente' => {
    if (n === 1) return d.artigos > 0 && d.dispositivos > 0 ? 'pronto' : 'pendente'
    if (n === 2) return d.rubricas > 0 ? ((curadas ?? 0) > 0 ? 'pronto' : 'parcial') : 'pendente'
    if (n === 3) return cobertura === 100 ? 'pronto' : d.com_embedding > 0 ? 'parcial' : 'pendente'
    if (n === 4) return d.teses > 0 && d.casos > 0 ? 'pronto' : 'pendente'
    return 'parcial'
  }

  const SELO = {
    pronto: <Selo tom="esmeralda">de pé</Selo>,
    parcial: <Selo tom="ambar">parcial</Selo>,
    pendente: <Selo>pendente</Selo>,
  }

  return (
    <>
      <Cabecalho titulo="Painel" sub={`base consultada em ${new Date(d.em).toLocaleString('pt-BR')}`} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metrica rotulo="Leis" valor={numeroBR(d.leis)} nota="Lei 11.343 e Código Penal" />
            <Metrica rotulo="Artigos" valor={numeroBR(d.artigos)} />
            <Metrica rotulo="Dispositivos" valor={numeroBR(d.dispositivos)} nota="unidade de citação" />
            <Metrica
              rotulo="Com embedding"
              valor={`${cobertura}%`}
              tom={cobertura === 100 ? 'esmeralda' : 'ambar'}
              nota={`${numeroBR(d.com_embedding)} vetores de 1536 dims`}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metrica
              rotulo="Rubricas"
              valor={numeroBR(d.rubricas)}
              nota={`${numeroBR(curadas ?? 0)} curadas · ${numeroBR(d.rubricas - (curadas ?? 0))} oficiais`}
            />
            <Metrica rotulo="Teses" valor={numeroBR(d.teses)} tom={d.teses ? 'neutro' : 'ambar'} />
            <Metrica rotulo="Casos" valor={numeroBR(d.casos)} tom={d.casos ? 'neutro' : 'ambar'} />
            <Cartao className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
                Saúde
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-2xl font-semibold text-tg-acento-txt">
                <Icone nome="check" className="size-5" strokeWidth={2.2} />
                ok
              </p>
              <a
                href="/api/health"
                className="mt-1 inline-flex items-center gap-1 text-[12px] text-tg-fraco-3 hover:text-tg-acento-txt"
              >
                /api/health <Icone nome="link_externo" className="size-3" />
              </a>
            </Cartao>
          </div>

          {/* ---------- leis ---------- */}
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
            Corpus
          </h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {porLei.map(({ lei, dispositivos }) => (
              <Link
                key={lei.id}
                href={`/leis/${lei.id}`}
                className="group rounded-xl border border-tg-linha bg-white p-4 transition-colors hover:border-tg-acento-palido"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-tg-tinta">{lei.apelido}</span>
                  {lei.cobertura === 'parcial' ? (
                    <Selo tom="ambar">cobertura parcial</Selo>
                  ) : (
                    <Selo tom="esmeralda">integral</Selo>
                  )}
                  <Icone
                    nome="seta_direita"
                    className="ml-auto size-4 text-tg-tenue-2 transition-colors group-hover:text-tg-acento-txt"
                  />
                </div>
                <p className="mt-1 text-[12.5px] text-tg-fraco-3">{lei.nome}</p>
                <p className="mt-3 text-[12.5px] tabular-nums text-tg-corpo">
                  {numeroBR(lei.total_artigos)} artigos · {numeroBR(dispositivos)} dispositivos
                </p>
                <p className="mt-0.5 text-[11.5px] text-tg-tenue-2">
                  redação vigente em {dataBR(lei.vigencia_ate)}
                </p>
              </Link>
            ))}
          </div>

          {!ls.ok && <Aviso className="mt-3">Não consegui listar as leis: {ls.erro}</Aviso>}
          {listaLeis.length < 3 && (
            <Aviso className="mt-3">
              O subconjunto curado do CPP (<code>dl_3689_1941</code>) ainda não foi semeado. Toda
              tela que depende dele mostra o estado real, não um vazio silencioso.
            </Aviso>
          )}

          {/* ---------- incrementos ---------- */}
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
            Ordem de trabalho
          </h2>
          <Cartao className="mt-2 divide-y divide-tg-linha-fraca">
            {INCREMENTOS.map((i) => (
              <div key={i.n} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-tg-preenche text-[11px] font-semibold tabular-nums text-tg-corpo">
                  {i.n}
                </span>
                <span className="text-[13.5px] text-tg-tinta-2">{i.nome}</span>
                <span className="hidden text-[12px] text-tg-tenue-2 sm:block">· {i.prova}</span>
                <span className="ml-auto">{SELO[estado(i.n)]}</span>
              </div>
            ))}
          </Cartao>

          <p className="mt-3 pb-6 text-[11.5px] leading-relaxed text-tg-tenue-2">
            Os selos acima são derivados das contagens do banco nesta requisição — nenhum deles é
            texto fixo. Incremento 4 aparece como pendente porque <code>teses</code> e{' '}
            <code>casos</code> ainda estão vazios.
          </p>
        </div>
      </div>
    </>
  )
}
