// =============================================================================
// Atalhos do leitor do acervo.
//
// Aqui morava o aviso âmbar de procedência, removido a pedido: ele abria toda
// tela do acervo e atrapalhava quem só queria localizar uma lei.
//
// **A separação entre acervo e corpus curado não dependia dele.** Ela é
// estrutural: os ids do acervo (`cf`, `cdc`) nunca casam o padrão do corpus
// (`dl_2848_1940`), nada é escrito em `dispositivos`, a busca híbrida não
// enxerga o acervo, e `tests/vademecum.test.ts` falha se alguém ligar os dois.
// O que sai é o texto do aviso, não a garantia.
//
// O que fica: o link para o texto oficial (atalho, não advertência), o link
// cruzado para o lado curado quando a mesma lei existe lá, e o crédito de
// licença no rodapé — este último é obrigação, não escolha.
// =============================================================================

import Link from 'next/link'

import { Icone } from '@/components/icones'
import { Aviso } from '@/components/ui'
import type { IndiceAcervo, LeiAcervo } from '@/lib/tipos'

export function Procedencia({ lei }: { lei: LeiAcervo }) {
  return (
    <div className="space-y-2">
      {/* O link para o texto oficial fica: não é aviso, é atalho. Quem lê uma
          lei do acervo e quer conferir a redação vigente tem para onde ir num
          clique, sem precisar procurar no Planalto. */}
      {lei.link_oficial && (
        <a
          href={lei.link_oficial}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-tg-acento-txt hover:underline"
        >
          Texto oficial no Planalto
          <Icone nome="link_externo" className="size-3" />
        </a>
      )}

      {/* A mesma lei existe dos dois lados, e só um deles é citável. Mandar o
          leitor para lá é o que evita a peça sair com fundamento do espelho. */}
      {lei.corpus_id && (
        <Aviso tom="esmeralda">
          Esta lei também está no <strong className="font-medium">corpus curado</strong>, com
          rubrica, data de corte auditada e id de citação estável — é de lá que saem os fundamentos
          das peças.{' '}
          <Link
            href={`/leis/${lei.corpus_id}`}
            className="font-medium text-tg-acento-txt underline decoration-emerald-300/40 underline-offset-2 hover:decoration-emerald-300"
          >
            Abrir no corpus curado
          </Link>
        </Aviso>
      )}
    </div>
  )
}

/** Crédito no rodapé do leitor: de onde veio o texto e sob qual licença. */
export function CreditoAcervo({ origem }: { origem: IndiceAcervo['origem'] }) {
  // `suave` e não `tenue-2`: estava em 1.92:1. Este parágrafo é a obrigação
  // para com o espelho de terceiro — licença e commit fixado —, e o CLAUDE.md
  // diz que ele não deve ser removido. Ilegível é uma forma de remover.
  return (
    <p className="mt-8 border-t border-tg-linha pt-4 text-[11.5px] leading-relaxed text-tg-suave">
      Texto de lei federal é de domínio público (art. 8º, I da Lei 9.610/1998). O espelho vem de{' '}
      <a
        href={`${origem.url}/tree/${origem.sha}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-tg-fraco-3 underline underline-offset-2 hover:text-tg-tinta-4"
      >
        {origem.repo}
      </a>{' '}
      ({origem.licenca}), commit <code className="text-tg-fraco-3">{origem.sha.slice(0, 7)}</code> de{' '}
      {origem.commit_em}. A interface é deste projeto; nenhum código do repositório de origem foi
      copiado.
    </p>
  )
}
