// =============================================================================
// Cliente de ESCRITA da vigília — service role, servidor apenas
//
// **A service role continua morando num arquivo só, e agora esse arquivo é
// `lib/servico.ts`.** Ela existe porque não havia alternativa honesta: a coleta
// roda num cron, não há sessão, então não há `auth.uid()` para ancorar policy, e
// a RLS de 0012 fecha escrita para `anon` e `authenticated`. As saídas eram
// três, e duas são piores:
//
//   1. abrir policy de insert para `anon` — a chave publishable roda no
//      navegador de qualquer um, e isso daria a qualquer visitante o direito de
//      escrever linhas na vigília, com link e ementa à escolha dele;
//   2. uma função `security definer` guardada por segredo em argumento — o
//      segredo viajaria no corpo de uma chamada PostgREST e apareceria no log
//      de consulta do Supabase;
//   3. service role num módulo de servidor, chamado só pela rota de cron.
//
// A terceira é a que está aqui. Este arquivo permanece por nome: `clienteDeEscrita`
// diz o que a vigília faz com ele, e o cabeçalho acima é o registro de por que a
// exceção existe. O que ele não faz mais é ler a variável de ambiente — quem lê é
// `lib/servico.ts`, para que o segundo chamador (os tetos de gasto, migration
// 0023) não transformasse "um arquivo toca a service role" em dois.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { clienteDeServico } from '@/lib/servico'

export function clienteDeEscrita(): SupabaseClient | null {
  return clienteDeServico()
}
