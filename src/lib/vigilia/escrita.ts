// =============================================================================
// Cliente de ESCRITA da vigília — service role, servidor apenas
//
// **Este é o único arquivo de `src/` que toca a service role, e ele existe
// porque não havia alternativa honesta.** A coleta roda num cron: não há sessão,
// então não há `auth.uid()` para ancorar policy, e a RLS de 0012 fecha escrita
// para `anon` e `authenticated`. As saídas eram três, e duas são piores:
//
//   1. abrir policy de insert para `anon` — a chave publishable roda no
//      navegador de qualquer um, e isso daria a qualquer visitante o direito de
//      escrever linhas na vigília, com link e ementa à escolha dele;
//   2. uma função `security definer` guardada por segredo em argumento — o
//      segredo viajaria no corpo de uma chamada PostgREST e apareceria no log
//      de consulta do Supabase;
//   3. service role num módulo de servidor, chamado só pela rota de cron.
//
// A terceira é a que está aqui. O que a torna segura não é confiança: é que
// `SUPABASE_SERVICE_ROLE_KEY` não tem prefixo `NEXT_PUBLIC_`, e o Next só
// substitui variável de ambiente no bundle do cliente quando ela o tem. Um
// `import` deste arquivo a partir de um componente `'use client'` quebra o
// build em vez de vazar a chave.
//
// `lib/supabase.ts` continua limpo, e a regra do CLAUDE.md continua valendo:
// a service role nunca entra no cliente do runtime de leitura.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Criado sob demanda, e não no topo do módulo como em `lib/supabase.ts`.
 *
 * A diferença tem consequência prática: `lib/supabase.ts` lança no import
 * quando falta variável, o que é certo para uma dependência que todas as telas
 * têm. Aqui, lançar no import derrubaria qualquer rota que apenas importasse o
 * módulo — inclusive num deploy sem a chave, em que a leitura da tela deve
 * continuar funcionando e só a coleta deve recusar.
 */
export function clienteDeEscrita(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
