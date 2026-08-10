-- =============================================================================
-- 0004_rls.sql — Row Level Security
--
-- O app é público e sem autenticação (fora de escopo). O front usa a chave
-- publishable e só precisa LER. Escrita é exclusiva do service role, que roda
-- nos scripts de seed na máquina local e ignora RLS.
--
-- Regra: nenhuma policy de insert/update/delete para anon. Nenhuma.
-- =============================================================================

alter table public.leis                 enable row level security;
alter table public.artigos              enable row level security;
alter table public.dispositivos         enable row level security;
alter table public.rubricas             enable row level security;
alter table public.rubrica_dispositivos enable row level security;
alter table public.teses                enable row level security;
alter table public.casos                enable row level security;
alter table public.argumentacao         enable row level security;
alter table public.uso_llm              enable row level security;

-- Escrita nunca chega ao banco por engano vinda do cliente.
revoke insert, update, delete, truncate on all tables in schema public
  from anon, authenticated;


-- --- consulta pública --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'leis','artigos','dispositivos','rubricas','rubrica_dispositivos','casos'
  ] loop
    execute format('drop policy if exists leitura_publica on public.%I', t);
    execute format(
      'create policy leitura_publica on public.%I for select to anon, authenticated using (true)',
      t
    );
  end loop;
end $$;

-- Teses: só as ativas ficam visíveis.
drop policy if exists leitura_publica on public.teses;
create policy leitura_publica on public.teses
  for select to anon, authenticated
  using (ativo);

-- Argumentação: só o que passou por revisão humana vai ao ar.
-- Esta policy é a última linha de defesa do princípio "nenhuma frase da minuta
-- chega ao usuário sem revisão". Não afrouxar.
drop policy if exists leitura_revisada on public.argumentacao;
create policy leitura_revisada on public.argumentacao
  for select to anon, authenticated
  using (revisado_em is not null);

-- uso_llm: sem policy alguma → invisível para anon. Só o service role lê e
-- incrementa, a partir da rota server-side que controla o teto.


-- --- funções -----------------------------------------------------------------
grant execute on function public.busca_hibrida(
  text, extensions.vector, integer, text, integer, numeric, numeric, numeric
) to anon, authenticated;

grant execute on function public.saude() to anon, authenticated;


-- =============================================================================
-- Verificação pós-migration (rodar avulso; deve retornar linhas coerentes)
--
--   select * from public.saude();
--
--   -- toda tabela com RLS ligada e nenhuma policy de escrita:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
--   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';
--
--   -- a configuração de busca ignora acento:
--   select to_tsvector('public.pt_unaccent', 'tráfico privilegiado')
--        @@ websearch_to_tsquery('public.pt_unaccent', 'trafico privilegiado');
--   -- esperado: t
--
--   -- o trigger recusa citação órfã:
--   insert into public.teses (id, nome, resumo, fundamentos, template_md, ordem)
--   values ('x','x','x','{lei_11343_2006_art999}','x',1);
--   -- esperado: ERRO foreign_key_violation
-- =============================================================================
