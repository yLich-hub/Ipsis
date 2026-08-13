-- =============================================================================
-- 0013 — jurimetria do DataJud
--
-- Tabela separada de `vigilia_alteracoes`, e a separação é o ponto.
--
-- O DataJud responde uma pergunta diferente da que a vigília faz. Ele devolve
-- metadados de capa processual e movimentação — não ementa, não inteiro teor —,
-- e **nada em processo judicial altera o texto de uma lei**. Guardar uma
-- contagem de processos na mesma tabela das normas publicadas faria um número
-- de jurimetria aparecer numa lista de alterações legislativas, e é assim que um
-- painel começa a mentir sem que ninguém tenha escrito uma linha falsa.
--
-- O que ela guarda é um número real, conferível e com origem declarada: quantos
-- processos de "Tráfico de Drogas e Condutas Afins" (código 3608 da Tabela
-- Processual Unificada do CNJ) cada tribunal tem na base nacional. É a única
-- coisa que o DataJud entrega e que este projeto pode usar sem inventar nada.
--
-- Uma linha por (assunto, tribunal), sobrescrita a cada coleta: é fotografia do
-- estado atual, não série temporal. Série exigiria decidir a periodicidade e
-- guardar histórico que ninguém desenhou tela para ler — e um gráfico de linha
-- montado sobre três pontos coletados em dias arbitrários seria exatamente o
-- dado plausível e falso que a decisão nº 3 existe para impedir.
-- =============================================================================

create table if not exists public.vigilia_jurimetria (
  assunto        text        not null,
  codigo_assunto integer     not null,
  tribunal       text        not null,
  total          bigint      not null,
  coletado_em    timestamptz not null default now(),

  primary key (assunto, tribunal),

  constraint vigilia_jurimetria_total_ck    check (total >= 0),
  constraint vigilia_jurimetria_tribunal_ck check (tribunal ~ '^[A-Z0-9]{2,10}$')
);

comment on table public.vigilia_jurimetria is
  'Contagem de processos por assunto e tribunal, da API Pública do DataJud (CNJ). '
  'Estatística, nunca fonte de texto: o DataJud não devolve ementa nem inteiro teor.';

comment on column public.vigilia_jurimetria.total is
  'Contagem no momento de coletado_em. Sobrescrita a cada coleta — é fotografia '
  'do estado atual, não série temporal.';

-- --- RLS ---------------------------------------------------------------------
-- Leitura pública, como o corpus e como `vigilia_alteracoes`: é estatística
-- agregada de dado que já é público na origem. Escrita só pelo service role,
-- que roda nos coletores.
alter table public.vigilia_jurimetria enable row level security;

revoke insert, update, delete on public.vigilia_jurimetria from anon, authenticated;

drop policy if exists leitura_publica on public.vigilia_jurimetria;
create policy leitura_publica on public.vigilia_jurimetria
  for select to anon, authenticated using (true);


-- =============================================================================
-- Verificação pós-migration
--
--   select tribunal, total, coletado_em from public.vigilia_jurimetria
--    order by total desc;
--
--   -- sem sessão, a chave publishable lê e não escreve:
--   insert into public.vigilia_jurimetria values ('x', 1, 'STJ', 1);  -- 42501
-- =============================================================================
