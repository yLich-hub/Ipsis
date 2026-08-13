import Link from 'next/link'

import { Icone } from '@/components/icones'

export default function NaoEncontrado() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <span className="grid size-11 place-items-center rounded-xl bg-tg-preenche text-tg-fraco-3">
        <Icone nome="busca" className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-tg-tinta">
        Esse endereço não existe
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-tg-corpo">
        Se você chegou aqui por uma citação, o id do dispositivo pode estar errado — ids são
        estáveis e nunca renumerados, então um id válido sempre abre. Comece pela{' '}
        <Link href="/leis" className="text-tg-acento-txt hover:underline">
          legislação
        </Link>{' '}
        ou pela{' '}
        <Link href="/consulta" className="text-tg-acento-txt hover:underline">
          consulta em chat
        </Link>
        .
      </p>
    </main>
  )
}
