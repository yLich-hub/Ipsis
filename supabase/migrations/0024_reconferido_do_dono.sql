-- =============================================================================
-- 0024 — marcar como conferido deixa de poder desfazer a marca de outro
--
-- A policy de 0012 dizia `using (true)`, e `using` é quais LINHAS a policy
-- alcança. Todas, portanto. O `with check` obrigava a assinar com o próprio uid,
-- o que impede assinar em nome de terceiro — e não impede sobrescrever o que
-- terceiro assinou.
--
-- Numa base de um usuário só isso é inofensivo por definição, e era a leitura
-- correta quando 0012 foi escrita. O que mudou é que o cadastro do produto é
-- self-service: qualquer pessoa cria conta pela tela `/cadastro` e chega ao
-- banco como `authenticated`. Aí "inofensivo por definição" deixa de valer, e a
-- policy passa a permitir que um estranho carimbe como conferido um achado da
-- vigília que o dono ainda não leu.
--
-- **O que se perde ao silenciar um achado.** A vigília existe para avisar que a
-- fotografia de 28/02/2025 envelheceu. Marcado como conferido, o achado deixa de
-- pedir atenção na tela — e o risco que ele carregava é uma peça protocolada com
-- redação revogada. É consequência jurídica indireta, mas é consequência.
--
-- **O grant por COLUNA de 0012 continua, e continua sendo o acerto principal.**
-- RLS decide linha, não coluna; sem `grant update (reconferido_em,
-- reconferido_por)`, "pode marcar como lido" viraria "pode reescrever a ementa e
-- o link do ato oficial". Esta migration não toca nele.
--
-- Marcar continua livre. Re-marcar o que já é de alguém, não.
-- =============================================================================

drop policy if exists marca_reconferido on public.vigilia_alteracoes;
create policy marca_reconferido on public.vigilia_alteracoes
  for update to authenticated
  -- Linha ainda não carimbada, ou carimbada por quem está pedindo. O `is null`
  -- é o que mantém o gesto normal funcionando: marcar pela primeira vez.
  using (reconferido_por is null or reconferido_por = (select auth.uid()))
  with check (reconferido_por = (select auth.uid()));

comment on policy marca_reconferido on public.vigilia_alteracoes is
  'Marcar como conferido: livre para linha sem dono; re-marcar, só quem marcou. '
  'O using (true) anterior (0012) deixava qualquer sessão sobrescrever o carimbo '
  'de qualquer outra — inofensivo com um usuário, não com cadastro aberto.';


-- =============================================================================
-- Verificação pós-migration (rodar avulso, com duas sessões)
--
--   -- sessão A, linha limpa:
--   update public.vigilia_alteracoes
--      set reconferido_em = now(), reconferido_por = auth.uid()
--    where id = '<id>';                       -- esperado: UPDATE 1
--
--   -- sessão B, mesma linha:
--   update public.vigilia_alteracoes
--      set reconferido_em = now(), reconferido_por = auth.uid()
--    where id = '<id>';                       -- esperado: UPDATE 0
--
--   -- o grant por coluna continua de pé, em qualquer sessão:
--   update public.vigilia_alteracoes set ementa = 'x';   -- esperado: 42501
-- =============================================================================
