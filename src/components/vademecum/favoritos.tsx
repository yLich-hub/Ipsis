'use client'

// =============================================================================
// Favoritos do acervo — localStorage, sem banco.
//
// É preferência de leitura de um usuário só, sem valor fora do navegador: não
// justifica tabela, migration nem RLS. E o acervo é justamente a parte do
// produto que continua de pé com o Supabase pausado — favoritar não pode ser o
// que traz a dependência de banco de volta.
//
// A leitura acontece depois da montagem, não durante: o servidor não tem
// localStorage, e ler no primeiro render quebraria a hidratação.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'

import { Icone } from '@/components/icones'

const CHAVE = 'jesbick:vademecum:favoritos'
const EVENTO = 'jesbick:favoritos'

function leDoDisco(): string[] {
  try {
    const cru = localStorage.getItem(CHAVE)
    const lista: unknown = cru ? JSON.parse(cru) : []
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // localStorage bloqueado (navegação privada, cookies de terceiro) ou JSON
    // corrompido por versão anterior. Favorito não vale uma tela quebrada.
    return []
  }
}

/**
 * `montado` separa "ainda não li o disco" de "li e não tem nada" — sem isso, a
 * estrela pisca vazia antes de aparecer marcada em toda navegação.
 *
 * O evento na janela sincroniza as ilhas da mesma aba (a estrela do cabeçalho e
 * a lista do catálogo); `storage` faz o mesmo entre abas, mas não dispara na
 * aba que escreveu.
 */
export function useFavoritos() {
  const [ids, setIds] = useState<string[]>([])
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    setIds(leDoDisco())
    setMontado(true)

    const sincroniza = () => setIds(leDoDisco())
    window.addEventListener(EVENTO, sincroniza)
    window.addEventListener('storage', sincroniza)
    return () => {
      window.removeEventListener(EVENTO, sincroniza)
      window.removeEventListener('storage', sincroniza)
    }
  }, [])

  const alterna = useCallback((id: string) => {
    const atual = leDoDisco()
    const novo = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    try {
      localStorage.setItem(CHAVE, JSON.stringify(novo))
    } catch {
      /* sem persistência; o estado da sessão ainda vale */
    }
    setIds(novo)
    window.dispatchEvent(new Event(EVENTO))
  }, [])

  return { ids, montado, alterna }
}

export function BotaoFavorito({ id, rotulo }: { id: string; rotulo: string }) {
  const { ids, montado, alterna } = useFavoritos()
  const marcado = ids.includes(id)

  return (
    <button
      type="button"
      onClick={() => alterna(id)}
      aria-pressed={montado ? marcado : undefined}
      title={marcado ? `Remover ${rotulo} dos favoritos` : `Favoritar ${rotulo}`}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
        marcado
          ? 'border-tg-ambar-borda bg-tg-ambar-fundo text-tg-ambar-txt'
          : 'border-tg-linha text-tg-fraco-3 hover:bg-tg-preenche hover:text-tg-tinta-4'
      }`}
    >
      <Icone
        nome="estrela"
        className="size-4"
        fill={marcado ? 'currentColor' : 'none'}
        strokeWidth={marcado ? 0 : 1.6}
      />
      <span className="sr-only">{marcado ? 'Nos favoritos' : 'Favoritar'}</span>
    </button>
  )
}
