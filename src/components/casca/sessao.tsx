'use client'

// =============================================================================
// Estado de sessão no cliente — um provedor, um listener.
//
// O usuário chega pronto do servidor (`usuarioInicial`), validado por
// `getUser()` no layout: a primeira pintura já sai com o nome certo, sem o
// piscar de "carregando…" que denuncia autenticação resolvida só no navegador.
//
// O listener existe para o que acontece DEPOIS: logout, sessão expirada, senha
// trocada. Ele é registrado uma vez, num efeito com cleanup, e sobre um cliente
// memoizado — sem isso, cada montagem somaria uma inscrição e um logout
// dispararia N navegações.
// =============================================================================

import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabaseNavegador } from '@/lib/auth/navegador'
import { ROTA_LOGIN } from '@/lib/auth/rotas'

const Contexto = createContext<User | null>(null)

/** O usuário da sessão corrente. `null` só aparece no instante entre sair e navegar. */
export const useUsuario = () => useContext(Contexto)

/**
 * `SIGNED_OUT` não diz por que a sessão acabou, e as duas causas merecem
 * recados diferentes: quem clicou em "Sair" lê uma despedida, quem teve a
 * sessão expirada lê o motivo. Quem clica avisa aqui antes de chamar
 * `signOut()`; o resto é expiração.
 */
let saidaDeliberada = false
export const marcarSaidaDeliberada = () => {
  saidaDeliberada = true
}

export function ProvedorSessao({
  usuarioInicial,
  children,
}: {
  usuarioInicial: User | null
  children: ReactNode
}) {
  const [usuario, setUsuario] = useState<User | null>(usuarioInicial)
  const router = useRouter()

  // O servidor é a fonte da verdade: a cada navegação o layout revalida com
  // `getUser()`, e o valor novo tem de vencer o que ficou no estado local.
  useEffect(() => setUsuario(usuarioInicial), [usuarioInicial])

  useEffect(() => {
    const { data } = supabaseNavegador().auth.onAuthStateChange((evento, sessao) => {
      setUsuario(sessao?.user ?? null)

      // Só SIGNED_OUT navega. TOKEN_REFRESHED chega de hora em hora e
      // INITIAL_SESSION chega em toda montagem: reagir a eles com `refresh()`
      // poria a aplicação em laço de re-renderização do servidor.
      if (evento === 'SIGNED_OUT') {
        const recado = saidaDeliberada ? 'saiu' : 'expirada'
        saidaDeliberada = false
        router.replace(`${ROTA_LOGIN}?recado=${recado}`)
        router.refresh()
      }
    })

    return () => data.subscription.unsubscribe()
  }, [router])

  return <Contexto.Provider value={usuario}>{children}</Contexto.Provider>
}
