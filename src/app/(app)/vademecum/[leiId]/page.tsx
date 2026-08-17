// =============================================================================
// /vademecum/[leiId] — leitura da lei inteira numa página.
//
// Uma página por lei, sem paginar por título: é o que faz o Ctrl+F do navegador
// varrer o código todo, que é como se consulta vade mecum. O preço é a
// Constituição chegando com 831 KB de HTML — carga única, e o sumário lateral
// resolve a navegação dentro dela.
//
// O HTML vem saneado do disco (scripts/vademecum.ts, allowlist com
// sanitize-html em build), por isso o dangerouslySetInnerHTML: em runtime não
// há saneamento a fazer e nenhum conteúdo de usuário chega aqui.
// =============================================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Selo } from '@/components/ui'
import { BarraLeitura } from '@/components/vademecum/barra-leitura'
import { BotaoFavorito } from '@/components/vademecum/favoritos'
import { CreditoAcervo, Procedencia } from '@/components/vademecum/procedencia'
import { Sumario } from '@/components/vademecum/sumario'
import { numeroBR } from '@/lib/formato'
import { leiDoAcervo, origemDoAcervo, textoDoAcervo } from '@/lib/vademecum'
import { titulo } from '@/lib/toga/marca'

// Sem generateStaticParams: a rota está sob (app), que lê cookie de sessão e
// por isso renderiza sob demanda de qualquer jeito. Ver CLAUDE.md, Autenticação.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ leiId: string }>
}): Promise<Metadata> {
  const lei = leiDoAcervo((await params).leiId)
  return { title: titulo(lei ? `${lei.apelido} — Vade Mecum` : 'Vade Mecum') }
}

const ID_ROLAGEM = 'acervo-rolagem'
const ID_TEXTO = 'acervo-texto'

export default async function LeiDoAcervoPage({
  params,
}: {
  params: Promise<{ leiId: string }>
}) {
  const { leiId } = await params
  const lei = leiDoAcervo(leiId)
  if (!lei) notFound()

  const html = textoDoAcervo(leiId)
  if (!html) notFound()

  const origem = origemDoAcervo()

  return (
    <>
      <Cabecalho
        titulo={lei.apelido}
        sub={`${numeroBR(lei.artigos)} artigos · ${lei.num_lei ?? lei.titulo}`}
        voltar={{ href: '/vademecum', rotulo: 'Acervo' }}
      >
        <Selo tom="ambar" title="Espelho de leitura, sem data de vigência conferida">
          acervo
        </Selo>
        {lei.corpus_id && <Selo tom="esmeralda">também no corpus curado</Selo>}
      </Cabecalho>

      <div className="flex min-h-0 flex-1">
        {/* Sumário fixo à esquerda. Some abaixo de xl porque disputaria a
            largura da coluna de leitura — no lugar dele vem o <details>. */}
        <aside className="hidden w-72 shrink-0 border-r border-tg-linha bg-white xl:block">
          <Sumario topicos={lei.sumario} idRolagem={ID_ROLAGEM} />
        </aside>

        <div id={ID_ROLAGEM} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {/* O "← Acervo" que morava aqui subiu para o `Cabecalho`. Aqui ele
                rolava para fora da tela no primeiro gesto e não voltava mais —
                num código de centenas de KB numa página só, isso é a diferença
                entre ter voltar e não ter. Ficou o favorito, que é ação sobre a
                lei e pertence ao texto. */}
            <div className="flex items-center justify-end gap-2">
              <BotaoFavorito id={lei.id} rotulo={lei.apelido} />
            </div>

            <div className="mt-3">
              <BarraLeitura idTexto={ID_TEXTO} />
            </div>

            {lei.sumario.length > 0 && (
              <details className="mt-3 rounded-xl border border-tg-linha bg-white xl:hidden">
                <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-tg-tinta-4 marker:text-tg-tenue-2">
                  Sumário · {numeroBR(lei.sumario.length)} seções
                </summary>
                {/* Altura fixa, não max-h: o sumário rola por dentro (h-full +
                    flex-1), e sem altura definida no pai o `flex-1` não teria
                    contra o que resolver — a lista vazaria e ficaria cortada. */}
                <div className="h-80 border-t border-tg-linha">
                  <Sumario topicos={lei.sumario} idRolagem={ID_ROLAGEM} />
                </div>
              </details>
            )}

            <div className="mt-4">
              <Procedencia lei={lei} />
            </div>

            {lei.ementa && (
              <p className="mt-4 border-l-2 border-tg-linha pl-3 text-[13px] italic leading-relaxed text-tg-corpo">
                {lei.ementa}
              </p>
            )}

            <article
              id={ID_TEXTO}
              className="lei-acervo mt-6"
              // HTML saneado em build — ver o cabeçalho deste arquivo.
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {lei.relacionadas.length > 0 && (
              <nav className="mt-8 border-t border-tg-linha pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
                  Leis relacionadas
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {lei.relacionadas.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/vademecum/${r.id}`}
                        className="inline-flex rounded-lg border border-tg-linha px-2.5 py-1.5 text-[12.5px] text-tg-corpo transition-colors hover:border-tg-acento-palido hover:text-tg-acento-txt"
                      >
                        {r.nome}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <CreditoAcervo origem={origem} />
          </div>
        </div>
      </div>
    </>
  )
}
