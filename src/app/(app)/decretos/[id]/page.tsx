// =============================================================================
// /decretos/[id] — o leitor de um decreto estadual.
//
// O texto sai do banco, bloco a bloco, na ordem do documento. Nada é gerado, e
// nada é reescrito: é o mesmo princípio da decisão nº 1 do projeto aplicado a
// um acervo que não é o corpus — quem exibe texto legal exibe o que a fonte
// disse, ou não exibe.
//
// **A procedência não afirma vigência, e essa é a linha que não se cruza.**
// O que a fonte entrega é a redação compilada (a última alteração publicada) e
// o que o coletor registra é o dia em que a leu. Se o decreto foi revogado por
// inteiro, a página da fonte não foi conferida quanto a isso — então a tela diz
// "redação compilada, lida em DD/MM/AAAA" e para aí. Escrever "em vigor" seria
// a decisão nº 3 do projeto mentindo num acervo novo.
// =============================================================================

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Cabecalho } from '@/components/casca/cabecalho'
import { ErroBanco } from '@/components/toga/estados'
import { Icone } from '@/components/icones'
import { Selo } from '@/components/toga/base'
import { dataBR, especie, publicacao } from '@/lib/decretos/formato'
import { decreto } from '@/lib/decretos/leitura'
import { titulo } from '@/lib/toga/marca'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const r = await decreto(decodeURIComponent(id))
  if (!r.ok || !r.dados) return { title: titulo('Decreto') }
  return { title: titulo(r.dados.epigrafe), description: r.dados.sumula }
}

export default async function PaginaDecreto({ params }: Props) {
  const { id } = await params
  const r = await decreto(decodeURIComponent(id))

  if (!r.ok) {
    return (
      <div className="flex-1 p-6 lg:overflow-y-auto">
        <ErroBanco erro={r.erro} />
      </div>
    )
  }
  if (!r.dados) notFound()

  const d = r.dados
  const pub = publicacao(d)

  return (
    <>
      <Cabecalho
        titulo={`Decreto ${d.numero}/${d.ano}`}
        sub={
          `Publicado em ${pub.texto}` +
          // A fonte escreve o ano em dois lugares e, num ato em 1.989, eles
          // discordam. Dizer isso é a única saída que não mente de um dos lados.
          (pub.divergente ? ' (data divergente na fonte)' : '') +
          (d.diario ? ` · Diário Oficial nº ${d.diario}` : '')
        }
        voltar={{ href: '/decretos', rotulo: 'Decretos do Paraná' }}
      >
        <Selo tom="acento">{especie(d.sumula)}</Selo>
        <Selo tom="ambar" title="Acervo de consulta: decreto estadual não é fundamento de peça">
          não citável
        </Selo>
      </Cabecalho>

      <div className="min-w-0 flex-1 lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <p className="font-tg-serif text-[15px] leading-[1.6] text-tg-corpo">{d.sumula}</p>

          {/* Procedência. Diz o que se sabe — a versão lida e o dia da leitura
              — e não diz o que não se conferiu. Ver o cabeçalho deste arquivo. */}
          <div className="mt-4 rounded-2xl bg-tg-fundo px-4 py-3">
            <p className="text-[12px] leading-[1.6] text-tg-corpo-2">
              Redação <strong className="font-medium">{d.versao}</strong> — a última alteração
              publicada pela fonte —, lida em{' '}
              <strong className="font-medium">{dataBR(d.conferido_em)}</strong>. A vigência do ato
              não foi conferida.
            </p>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-tg-acento-txt hover:underline"
            >
              Ver na fonte oficial
              <Icone nome="link_externo" className="size-3" />
            </a>
          </div>

          {d.preambulo && (
            <p className="mt-6 whitespace-pre-line border-l-2 border-tg-linha pl-3 font-tg-serif text-[13.5px] leading-[1.65] text-tg-corpo-2">
              {d.preambulo}
            </p>
          )}

          {/* `tg-lista` anima os dez primeiros; um decreto de cinquenta blocos
              com transform em todos trava a rolagem, e o sinal é para a
              primeira tela. Mesma regra do índice de artigos. */}
          <div className="tg-lista mt-6 flex flex-col gap-4">
            {d.blocos.map((b) => (
              <div key={b.id} id={`b${b.ordem}`} className="scroll-mt-6">
                {b.rotulo && (
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tg-fraco-3">
                    {b.rotulo}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-line font-tg-serif text-[14.5px] leading-[1.7] text-tg-tinta-2">
                  {b.texto}
                </p>
              </div>
            ))}
          </div>

          {d.blocos.length === 0 && (
            <p className="mt-6 text-[13px] text-tg-fraco-2">
              Este ato foi colhido sem blocos de texto. É defeito de extração, não de conteúdo — o
              texto está na fonte oficial, no link acima.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
