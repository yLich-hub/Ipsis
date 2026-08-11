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
      <span className="grid size-11 place-items-center rounded-xl bg-red-500/10 text-red-300">
        <Icone nome="alerta" className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-100">
        Alguma coisa quebrou nesta tela
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
        O resto do app continua de pé. Se a base estiver pausada por inatividade — o projeto roda no
        plano gratuito do Supabase — a primeira requisição pode falhar e a seguinte funcionar.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-[#0F172A] p-3 text-[12px] text-slate-400">
        {error.message}
      </pre>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-medium text-slate-950 transition-colors hover:bg-emerald-400"
        >
          Tentar de novo
        </button>
        <Link
          href="/painel"
          className="rounded-xl border border-white/10 px-4 py-2.5 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.06]"
        >
          Ver o painel
        </Link>
      </div>
    </main>
  )
}
