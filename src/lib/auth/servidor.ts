// =============================================================================
// Cliente Supabase do servidor — componentes de servidor e route handlers.
//
// Uma instância por requisição, nunca no escopo do módulo: o cliente carrega os
// cookies de UMA requisição, e um singleton serviria a sessão de um usuário
// para o próximo (o pior tipo de bug de autenticação).
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient, User } from '@supabase/supabase-js'

import { chaveSupabase, urlSupabase } from '@/lib/auth/ambiente'

export async function supabaseServidor(): Promise<SupabaseClient> {
  const jar = await cookies()

  return createServerClient(urlSupabase(), chaveSupabase(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookiesNovos) => {
        try {
          for (const { name, value, options } of cookiesNovos) jar.set(name, value, options)
        } catch {
          // Componente de servidor não pode escrever cookie. É esperado: quem
          // renova o token é o middleware, que roda antes e escreve na resposta.
          // Engolir aqui é o que a documentação do Supabase orienta — o
          // alternativo seria estourar em toda página que só lê a sessão.
        }
      },
    },
  })
}

/**
 * O usuário da requisição, ou `null`.
 *
 * `getUser()` e nunca `getSession()`: `getSession()` devolve o que está no
 * cookie sem validar assinatura, e cookie é território do cliente. `getUser()`
 * bate no servidor de Auth e valida o JWT — é a única leitura em que se pode
 * basear uma decisão de acesso.
 */
export async function usuarioAtual(): Promise<User | null> {
  try {
    const supabase = await supabaseServidor()
    const { data, error } = await supabase.auth.getUser()
    return error ? null : data.user
  } catch {
    // Auth fora do ar não pode virar stack trace na tela: quem chama trata
    // ausência de usuário como "não autenticado" e manda para /login.
    return null
  }
}
