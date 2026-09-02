-- =============================================================================
-- 0023 — o teto de gasto sai do alcance de quem não passou pela rota
--
-- `consome_uso_llm()` é `security definer`: ela ignora de propósito a RLS que
-- fecha `uso_llm`, porque o app não deve enxergar a tabela, só pedir uma vaga.
-- Isso está certo. O que estava errado é quem podia pedir.
--
-- 0010 concedeu EXECUTE a `anon` e a `authenticated`, e tinha de conceder: a
-- rota chamava a função pela chave publishable SEM sessão (`lib/supabase.ts`,
-- `persistSession: false`), o que a fazia chegar ao banco como `anon`. O gate de
-- sessão vivia inteiro na aplicação, e o dado não o repetia.
--
-- **A chave publishable é pública por construção** — ela está em texto claro no
-- bundle, em `.next/static/chunks/app/(app)/consulta/page.js`, e tem de estar,
-- porque é assim que o Supabase funciona no navegador. Logo, qualquer um podia:
--
--   POST https://<projeto>.supabase.co/rest/v1/rpc/consome_uso_llm
--   apikey: sb_publishable_…
--
-- Duzentas vezes, e o teto do mês acabava — sem cookie, sem passar pela rota,
-- sem tocar no limite por IP que vive na memória do processo Node. A partir daí
-- `/api/consulta/aovivo` devolvia 429 para o próprio dono. Negação de serviço
-- sobre a funcionalidade central, ao custo de 200 requisições e nenhuma
-- credencial.
--
-- **O conserto não é no grant sozinho.** Revogar de `anon` sem mais nada
-- quebraria a rota, que é justamente quem precisa da função. O par desta
-- migration é a mudança em `src/app/api/consulta/aovivo/route.ts`: o teto passa a
-- ser consumido pelo cliente de serviço (`lib/servico.ts`), que roda no servidor
-- e não existe no bundle. Aplicar esta migration sem aquela mudança derruba a
-- geração ao vivo — as duas andam juntas.
--
-- As duas alternativas continuam recusadas, pelo mesmo motivo de 0010 e de
-- `lib/vigilia/escrita.ts`: abrir policy de escrita para `anon` dá a qualquer
-- visitante o direito de mexer no contador que limita o gasto, e uma função
-- guardada por segredo em argumento põe o segredo no log de consulta do Supabase.
-- =============================================================================

-- `public` primeiro, e não só os dois papéis nomeados: o padrão do Postgres é
-- conceder EXECUTE de toda função a PUBLIC. Revogar de `anon` e `authenticated`
-- deixando PUBLIC de pé não tira nada de ninguém — os dois continuariam
-- executando pelo grant herdado, e a migration passaria dando a impressão de ter
-- fechado a porta.
revoke execute on function public.consome_uso_llm() from public, anon, authenticated;

-- E `service_role` explicitamente, porque a revogação de PUBLIC acima também o
-- alcança. Sem esta linha a rota fica sem teto nenhum para consumir e a geração
-- ao vivo responde 503 — falha fechada, mas falha.
grant execute on function public.consome_uso_llm() to service_role;

comment on function public.consome_uso_llm() is
  'Reserva uma chamada do teto mensal de geração ao vivo. Devolve permitido=false '
  'quando o mês já estourou. Decide e escreve na mesma instrução, para o teto '
  'valer sob concorrência. EXECUTE só para service_role: a chave publishable é '
  'pública e chamá-la de fora da rota esgotava a cota do mês (migration 0023).';


-- =============================================================================
-- Verificação pós-migration (rodar avulso)
--
--   -- anon não executa mais:
--   select has_function_privilege('anon', 'public.consome_uso_llm()', 'execute');
--   -- esperado: f
--   select has_function_privilege('authenticated', 'public.consome_uso_llm()', 'execute');
--   -- esperado: f
--   select has_function_privilege('service_role', 'public.consome_uso_llm()', 'execute');
--   -- esperado: t
--
--   -- e, com a chave publishable e sem sessão, pelo PostgREST:
--   --   POST /rest/v1/rpc/consome_uso_llm  ->  42501
-- =============================================================================
