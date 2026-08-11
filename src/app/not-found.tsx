import Link from 'next/link'

import { Icone } from '@/components/icones'

export default function NaoEncontrado() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <span className="grid size-11 place-items-center rounded-xl bg-white/[0.04] text-slate-500">
        <Icone nome="busca" className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-100">
        Esse endereço não existe
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
        Se você chegou aqui por uma citação, o id do dispositivo pode estar errado — ids são
        estáveis e nunca renumerados, então um id válido sempre abre. Comece pela{' '}
        <Link href="/leis" className="text-emerald-300 hover:underline">
          legislação
        </Link>{' '}
        ou pela{' '}
        <Link href="/busca" className="text-emerald-300 hover:underline">
          busca
        </Link>
        .
      </p>
    </main>
  )
}
