'use client'

// =============================================================================
// Faixa de favoritas no topo do catálogo.
//
// Ilha de cliente pequena de propósito: os favoritos moram no localStorage, que
// o servidor não enxerga, mas o catálogo inteiro continua sendo renderizado no
// servidor. O que atravessa é só a lista de {id, apelido} — nada do texto.
// =============================================================================

import Link from 'next/link'

import { Icone } from '@/components/icones'
import { useFavoritos } from '@/components/vademecum/favoritos'

export function ListaFavoritas({ leis }: { leis: { id: string; apelido: string }[] }) {
  const { ids, montado } = useFavoritos()

  // Antes de montar não há resposta: renderizar "nenhum favorito" e trocar em
  // seguida é pior que não renderizar nada.
  if (!montado) return null

  const marcadas = leis.filter((l) => ids.includes(l.id))
  if (marcadas.length === 0) return null

  return (
    <section className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">Favoritas</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {marcadas.map((l) => (
          <li key={l.id}>
            <Link
              href={`/vademecum/${l.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-tg-ambar-borda bg-tg-ambar-fundo px-2.5 py-1.5 text-[12.5px] text-tg-ambar-txt transition-colors hover:border-tg-ambar-borda hover:text-tg-ambar-txt"
            >
              <Icone nome="estrela" className="size-3.5" fill="currentColor" strokeWidth={0} />
              {l.apelido}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
