'use client'

// =============================================================================
// O inspetor de citação — a única parte interativa da página pública.
//
// O visitante lê uma resposta e abre, uma por uma, as citações dela. Cada uma
// mostra o id do dispositivo, a lei de origem, o texto literal e a data de
// corte da redação. O que ele está conferindo é a decisão nº 1 do projeto:
// entre as citações há argumentação; DENTRO delas não há nada escrito por
// ninguém — o texto veio do corpus, lido em build por `lib/landing/corpus.ts`.
//
// **Estado mínimo de propósito.** Uma citação aberta por vez, e nenhum efeito.
// Abrir a segunda fecha a primeira porque o objetivo é comparar afirmação com
// dispositivo, não empilhar painéis: com três abertos o leitor perde de vista
// qual trecho sustentava qual.
//
// **A ênfase não é grifo decorativo.** Ela marca a afirmação que aquele
// dispositivo sustenta, e só acende quando a citação correspondente está
// aberta — senão a página abriria com três trechos destacados e nenhuma
// relação visível entre eles e as citações.
//
// Sem dependência de rede, de sessão ou de banco: tudo que esta ilha recebe já
// veio resolvido do servidor. É o que a ADR 6 pede de uma demonstração que
// precisa funcionar quando alguém clica no link semanas depois.
// =============================================================================

import { useState } from 'react'

import { Icone } from '@/components/icones'
import { dataBR } from '@/lib/formato'
import type { BlocoDaResposta } from '@/lib/landing/inspetor'

/** O parágrafo com a afirmação sustentada em destaque — só quando aberto. */
function Paragrafo({ texto, enfase, aceso }: { texto: string; enfase: string; aceso: boolean }) {
  const corte = texto.indexOf(enfase)
  if (corte < 0 || !aceso) return <>{texto}</>

  return (
    <>
      {texto.slice(0, corte)}
      <mark className="rounded bg-tg-acento-fraco-2 px-0.5 text-tg-acento-txt">{enfase}</mark>
      {texto.slice(corte + enfase.length)}
    </>
  )
}

export function Inspetor({
  blocos,
  dataDeCorte,
}: {
  blocos: BlocoDaResposta[]
  dataDeCorte: string
}) {
  const [aberta, setAberta] = useState<number | null>(0)

  return (
    <ol className="flex flex-col gap-3">
      {blocos.map((b, i) => {
        const aceso = aberta === i
        const painelId = `citacao-${i}`

        return (
          <li key={b.citacao.id} className="flex flex-col">
            <p className="font-tg-serif text-[16.5px] leading-[1.7] text-tg-corpo">
              <Paragrafo texto={b.texto} enfase={b.enfase} aceso={aceso} />{' '}
              <button
                type="button"
                onClick={() => setAberta(aceso ? null : i)}
                aria-expanded={aceso}
                aria-controls={painelId}
                className={`inline-flex translate-y-px items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 align-middle font-tg text-[11.5px] font-medium transition-colors ${
                  aceso
                    ? 'bg-tg-acento text-white shadow-[var(--tg-elev-acento)]'
                    : 'bg-tg-acento-fraco text-tg-acento-txt hover:bg-tg-acento-fraco-3'
                }`}
              >
                <Icone nome="balanca" className="size-3" />
                {b.citacao.artigo}
                {b.citacao.rotulo === 'caput' ? '' : `, ${b.citacao.rotulo}`}
              </button>
            </p>

            {/* `hidden` e não desmontagem: o painel guarda texto legal, e um
                leitor de tela que já anunciou `aria-controls` precisa achar o
                alvo no documento. */}
            <div
              id={painelId}
              hidden={!aceso}
              className="tg-entra mt-2.5 rounded-2xl border border-tg-linha-forte bg-tg-preenche p-4"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-md bg-tg-caixa px-1.5 py-0.5 text-[11px] tracking-[0.01em] text-tg-corpo-2">
                  {b.citacao.id}
                </span>
                <span className="text-[11.5px] text-tg-fraco">{b.citacao.lei}</span>
              </div>

              <p className="mt-2.5 font-tg-serif text-[15px] leading-[1.65] text-tg-tinta-3">
                {b.citacao.texto}
              </p>

              <p className="mt-3 flex items-center gap-1.5 border-t border-tg-linha-tenue pt-2.5 text-[11.5px] text-tg-fraco-2">
                <Icone nome="cadeado" className="size-3.5 shrink-0" />
                {/* Um único filho de texto: com `gap`, cada nó solto viraria
                    item de flex, e a pontuação ganharia espaço antes dela. */}
                <span>
                  Lido do corpus em tempo de build. Redação vigente em{' '}
                  <strong className="font-medium text-tg-corpo-2">{dataBR(dataDeCorte)}</strong>.
                </span>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
