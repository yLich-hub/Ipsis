'use client'

// Rede de segurança do app inteiro. O caso concreto que ela cobre: variável de
// ambiente ausente (`src/lib/supabase.ts` lança na importação) e queda do
// Supabase fora do caminho tratado em `lib/dados.ts`. Sem isto, o usuário vê
// uma tela branca e não sabe se o problema é dele ou do app.

import Link from 'next/link'

import { Icone } from '@/components/icones'

export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <span className="grid size-11 place-items-center rounded-xl bg-tg-supressao-fundo text-tg-supressao-txt">
        <Icone nome="alerta" className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-tg-tinta">
        Alguma coisa quebrou nesta tela
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-tg-corpo">
        O resto do app continua de pé. Se a base estiver pausada por inatividade — o projeto roda no
        plano gratuito do Supabase — a primeira requisição pode falhar e a seguinte funcionar.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-tg-linha bg-white p-3 text-[12px] text-tg-corpo">
        {error.message}
      </pre>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-tg-acento px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-tg-acento"
        >
          Tentar de novo
        </button>
        <Link
          href="/painel"
          className="rounded-xl border border-tg-linha px-4 py-2.5 text-[13px] text-tg-tinta-4 transition-colors hover:bg-tg-preenche"
        >
          Ver o painel
        </Link>
      </div>
    </main>
  )
}
