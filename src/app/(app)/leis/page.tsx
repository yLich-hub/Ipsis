// =============================================================================
// /leis — o corpus disponível para consulta.
//
// Cobertura ao lado do nome, sempre. Uma lei parcial exibida como se fosse
// integral é o mesmo erro de classe que citar redação revogada: quem confia no
// resultado leva o erro para a peça. Ver CLAUDE.md, decisão nº 3.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Aviso, Cartao, ErroBanco, Selo } from '@/components/ui'
import { contagemDispositivos, leis } from '@/lib/dados'
import { dataBR, numeroBR } from '@/lib/formato'
import { titulo } from '@/lib/toga/marca'

export const revalidate = 300

export const metadata: Metadata = {
  title: titulo('Legislação'),
  description: 'Lei 11.343/2006 e Código Penal, com data de corte e cobertura declaradas.',
}

export default async function LeisPage() {
  const ls = await leis()

  if (!ls.ok) {
    return (
      <>
        <Cabecalho titulo="Legislação" />
        <div className="flex-1 overflow-y-auto p-6">
          <ErroBanco erro={ls.erro} />
        </div>
      </>
    )
  }

  const comContagem = await Promise.all(
    ls.dados.map(async (l) => ({ l, dispositivos: await contagemDispositivos(l.id) })),
  )

  return (
    <>
      <Cabecalho titulo="Legislação" sub="fotografia de fevereiro/2025, Vade Mecum Senado Federal" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <ul className="space-y-3">
            {comContagem.map(({ l, dispositivos }) => (
              <li key={l.id}>
                <Link
                  href={`/leis/${l.id}`}
                  className="group block rounded-xl border border-tg-linha bg-white p-4 transition-colors hover:border-tg-acento-palido"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium text-tg-tinta">{l.apelido}</span>
                    {l.cobertura === 'parcial' ? (
                      <Selo tom="ambar" title={l.cobertura_nota ?? undefined}>
                        cobertura parcial
                      </Selo>
                    ) : (
                      <Selo tom="esmeralda">cobertura integral</Selo>
                    )}
                    <Icone
                      nome="seta_direita"
                      className="ml-auto size-4 text-tg-tenue-2 transition-colors group-hover:text-tg-acento-txt"
                    />
                  </div>
                  <p className="mt-1 text-[13px] text-tg-corpo">{l.nome}</p>
                  <p className="mt-3 text-[12.5px] tabular-nums text-tg-corpo">
                    {numeroBR(l.total_artigos)} artigos · {numeroBR(dispositivos)} dispositivos
                    citáveis
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-tg-tenue-2">
                    redação vigente em {dataBR(l.vigencia_ate)} · {l.fonte}
                  </p>
                  {l.cobertura_nota && (
                    <p className="mt-2 text-[12px] leading-relaxed text-tg-ambar-txt">
                      {l.cobertura_nota}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {!comContagem.some(({ l }) => l.id === 'dl_3689_1941') && (
            <Aviso className="mt-4">
              O subconjunto curado do <strong>CPP</strong> (arts. 155, 157, 386, 396, 396-A, 397,
              400, 402, 403, 563–566 e busca e apreensão domiciliar) está digitado e conferido em{' '}
              <code>data/cpp_subconjunto.json</code>, mas ainda não foi semeado — por isso não
              aparece acima.
            </Aviso>
          )}

          <Cartao className="mt-6 p-4">
            <h2 className="text-[13px] font-medium text-tg-tinta-2">Buracos na numeração não são defeito</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tg-fraco-3">
              A Lei 11.343 pula do art. 8º ao 15 (arts. 9º a 14 revogados pela Lei 13.840/2019) e o
              Código Penal pula 186→196 e 218→223. Artigos revogados entram no banco marcados como
              tal, em vez de sumirem — sumir esconderia perda de extração do parser.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  )
}
