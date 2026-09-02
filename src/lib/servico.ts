// =============================================================================
// Cliente de SERVIÇO — service role, servidor apenas, um arquivo só.
//
// Este é o único ponto de `src/` que lê `SUPABASE_SERVICE_ROLE_KEY`. A regra
// nasceu com `lib/vigilia/escrita.ts`, que foi o primeiro a precisar dela, e
// continua valendo palavra por palavra — o que mudou é que agora há **dois**
// chamadores, e um invariante que depende de "só existe um arquivo assim" não
// sobrevive ao segundo. Então o arquivo virou este, e os dois chamadores o usam.
//
// **O que torna isto seguro não é confiança: é a ausência do prefixo.**
// `SUPABASE_SERVICE_ROLE_KEY` não tem `NEXT_PUBLIC_`, e o Next só substitui
// variável de ambiente no bundle do cliente quando ela o tem. Um `import` deste
// arquivo a partir de um componente `'use client'` quebra o build em vez de
// vazar a chave.
//
// `lib/supabase.ts` continua limpo, e a regra do CLAUDE.md continua valendo: a
// service role nunca entra no cliente do runtime de leitura.
//
// --- por que a service role, e não a chave publishable ------------------------
//
// Os dois usos têm a mesma forma: escrever numa tabela que a RLS fecha para
// `anon` e `authenticated`, a partir de código de servidor que não tem sessão
// para ancorar policy nenhuma.
//
//   1. `lib/vigilia/escrita.ts` — a coleta roda num cron, sem cookie.
//   2. `consome_uso_llm()` e `consome_uso_busca()` — os tetos de gasto. Eram
//      chamados pela chave publishable, o que obrigava a conceder EXECUTE a
//      `anon`: qualquer um com a chave do bundle esgotava a cota do mês por um
//      POST direto ao PostgREST, sem passar pela rota que o protege. O gate
//      morava na aplicação e o dado não o repetia. Ver migration 0023.
//
// As alternativas foram recusadas e a razão está no cabeçalho de 0023: abrir
// policy para `anon` dá a qualquer visitante o direito de escrever, e uma função
// guardada por segredo em argumento põe o segredo no log de consulta do Supabase.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Criado sob demanda, e não no topo do módulo como em `lib/supabase.ts`.
 *
 * A diferença tem consequência prática: `lib/supabase.ts` lança no import quando
 * falta variável, o que é certo para uma dependência que todas as telas têm.
 * Aqui, lançar no import derrubaria qualquer rota que apenas importasse o módulo
 * — inclusive num deploy sem a chave, em que a leitura das telas deve continuar
 * funcionando e só a escrita deve recusar.
 *
 * Devolve `null`, e não lança, porque quem chama é quem sabe o que fazer com a
 * ausência: a coleta responde 503, e o caminho ao vivo cai para a resposta
 * composta. Ver `lib/toga/resposta.ts`.
 */
export function clienteDeServico(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
