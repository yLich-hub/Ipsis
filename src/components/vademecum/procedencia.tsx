// =============================================================================
// Procedência do acervo — o aviso que sustenta a separação.
//
// O resto do produto trata texto legal como material citável: id estável, data
// de corte auditada, cobertura declarada. Este acervo não é isso, e a diferença
// não pode ficar só no CLAUDE.md — quem abre a tela precisa ver.
//
// Componente de servidor, sem estado e sem botão de fechar, de propósito: um
// aviso que o leitor dispensa uma vez e nunca mais vê não avisa nada.
// =============================================================================

import Link from 'next/link'

import { Icone } from '@/components/icones'
import { Aviso } from '@/components/ui'
import type { IndiceAcervo, LeiAcervo } from '@/lib/tipos'

export function Procedencia({
  lei,
  origem,
}: {
  lei: LeiAcervo
  origem: IndiceAcervo['origem']
}) {
  return (
    <div className="space-y-2">
      <Aviso tom="ambar">
        <strong className="font-medium">Acervo de consulta, não fonte de citação.</strong> Este
        texto é espelho do Planalto importado de{' '}
        <a
          href={`${origem.url}/tree/${origem.sha}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-tg-ambar-borda underline-offset-2 hover:decoration-tg-ambar-txt"
        >
          {origem.repo}
        </a>{' '}
        em {origem.commit_em}, <strong className="font-medium">sem data de vigência conferida</strong>
        . Não entra na busca híbrida e não deve ser citado em peça — confira a redação vigente na
        fonte oficial antes de usar.
        {lei.link_oficial ? (
          <a
            href={lei.link_oficial}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex w-fit items-center gap-1.5 font-medium text-tg-ambar-txt hover:text-tg-ambar-txt"
          >
            Texto oficial no Planalto
            <Icone nome="link_externo" className="size-3" />
          </a>
        ) : (
          <span className="mt-1.5 block text-tg-ambar-txt">
            O espelho não trouxe link para o texto oficial
            {lei.num_lei ? ` — procure por ${lei.num_lei}` : ''}.
          </span>
        )}
      </Aviso>

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
  return (
    <p className="mt-8 border-t border-tg-linha pt-4 text-[11.5px] leading-relaxed text-tg-tenue-2">
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
