// =============================================================================
// Cliente Supabase do navegador — o único que fala com o Auth no cliente.
//
// Difere do cliente de `lib/supabase.ts` em uma coisa só, e é a coisa toda:
// aquele é anônimo, sem sessão (`persistSession: false`), e serve para LER o
// corpus nos componentes de servidor. Este guarda a sessão em cookie, para que
// o middleware e os componentes de servidor enxerguem o mesmo usuário que o
// navegador. Sessão em `localStorage` seria invisível ao servidor e a proteção
// de rota teria de virar flash de tela no cliente.
//
// A chave continua sendo a publishable, sujeita a RLS. A service role nunca
// entra em arquivo alcançável pelo bundle.
// =============================================================================

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { chaveSupabase, urlSupabase } from '@/lib/auth/ambiente'

let cliente: SupabaseClient | null = null

/**
 * Memoizado de propósito: `createBrowserClient` registra o refresh automático
 * do token. Uma instância por chamada significaria N timers e N listeners de
 * `onAuthStateChange` vivos ao mesmo tempo.
 */
export function supabaseNavegador(): SupabaseClient {
  cliente ??= createBrowserClient(urlSupabase(), chaveSupabase())
  return cliente
}
