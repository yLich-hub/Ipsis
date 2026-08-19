-- =============================================================================
-- 0016_revisao_tese.sql — registro de revisão humana da argumentação
--
-- Rodar no SQL Editor do Supabase. Idempotente: pode rodar duas vezes.
--
-- O texto legal da minuta tem três camadas de conferência (o teste de citação,
-- os triggers de escrita e a recusa de montar peça com citação órfã). A
-- ARGUMENTAÇÃO entre as citações não tinha nenhuma — e o projeto afirma, em
-- cinco documentos, que "cada frase do .docx passou por revisão humana". Era
-- garantia em prosa sobre um dado que o banco não guardava.
--
-- `revisao` guarda só o que se sabe: 'pendente' quando a tese ainda não foi lida
-- por quem assina a peça.
--
-- **NULL significa "sem registro", nunca "conferida".** As dezesseis teses
-- anteriores a esta coluna não recebem carimbo retroativo: escrever uma data que
-- ninguém anotou seria inventar o registro para fazê-lo parecer completo, que é
-- o mesmo dado plausível e falso que `jurisprudencia` recusa quando não há
-- número de súmula conferido.
--
-- O check existe para o valor não virar vocabulário solto. Um 'ok' ou
-- 'conferida' escrito à mão passaria a ser lido como aprovação que ninguém deu —
-- e o dia em que houver conferência de verdade, ela entra com data e nome, em
-- colunas próprias, não neste texto.
-- =============================================================================

alter table public.teses
  add column if not exists revisao text;

alter table public.teses
  drop constraint if exists teses_revisao_ck;

alter table public.teses
  add constraint teses_revisao_ck
  check (revisao is null or revisao = 'pendente');

comment on column public.teses.revisao is
  'pendente = argumentação ainda não lida por advogado. NULL = sem registro, nunca "conferida".';
