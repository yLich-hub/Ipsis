-- =============================================================================
-- 0009 — clientes do escritório
--
-- A primeira tabela do projeto que guarda dado de pessoa de fora. Tudo o mais no
-- banco é texto de lei, curadoria ou conversa do próprio usuário; aqui entra o
-- nome de quem o advogado defende. Duas consequências, e as duas estão no
-- schema:
--
-- 1. **RLS por `auth.uid()`, como em 0007 e 0008.** Sem a âncora em
--    `usuario_id`, a chave publishable — que roda no navegador de qualquer um —
--    leria a agenda inteira do escritório. Numa tabela de conversas isso é
--    constrangedor; numa tabela de réus de processo criminal é grave.
-- 2. **Nada é obrigatório além do nome.** CPF, telefone, e-mail e o vínculo com
--    o caso são opcionais e nascem `null`. Cadastro que exige CPF empurra quem
--    ainda não o tem a digitar qualquer coisa, e um CPF inventado é pior que
--    campo vazio: ele parece conferido.
--
-- O vínculo com `casos` é `on delete set null`, e não `cascade`: o caso é peça
-- de demonstração, curada e resemeável; o cliente é dado do usuário. Reseed da
-- curadoria não pode levar a agenda junto.
-- =============================================================================

create table if not exists public.clientes (
  id            uuid        primary key default gen_random_uuid(),
  usuario_id    uuid        not null references auth.users(id) on delete cascade,
  nome          text        not null,
  -- Só os 11 dígitos. Guardar "123.456.789-09" faria a busca por CPF depender de
  -- o usuário digitar a pontuação do mesmo jeito das duas vezes; a máscara é
  -- assunto da tela, não do banco.
  cpf           text,
  telefone      text,
  email         text,
  caso_id       text        references public.casos(id) on delete set null,
  nota          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint clientes_nome_ck     check (length(btrim(nome)) between 1 and 120),
  constraint clientes_cpf_ck      check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint clientes_telefone_ck check (telefone is null or length(btrim(telefone)) between 8 and 24),
  -- Peneira grossa de propósito: o banco recusa o que claramente não é e-mail e
  -- não tenta mais que isso. A regra completa da RFC não cabe num check, e um
  -- regex quase-certo recusaria endereço válido de gente real.
  constraint clientes_email_ck    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  constraint clientes_nota_ck     check (nota is null or length(nota) <= 2000)
);

-- Cadastrar o mesmo cliente duas vezes é o erro mais comum de uma agenda, e os
-- dois cadastros divergem no primeiro telefone que muda. O índice é parcial
-- porque CPF é opcional: `null` não colide com `null` em índice único, mas
-- deixar explícito evita a dúvida na próxima leitura.
create unique index if not exists clientes_usuario_cpf_uq
  on public.clientes (usuario_id, cpf)
  where cpf is not null;

-- A lista é sempre "meus clientes, em ordem alfabética".
create index if not exists clientes_usuario_nome_idx
  on public.clientes (usuario_id, nome);

-- -----------------------------------------------------------------------------
-- RLS — a agenda é do dono, e de mais ninguém
-- -----------------------------------------------------------------------------
alter table public.clientes enable row level security;

drop policy if exists clientes_do_dono on public.clientes;
create policy clientes_do_dono on public.clientes
  for all
  to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

comment on table public.clientes is
  'Clientes do escritório. Só o nome é obrigatório; CPF é opcional e guardado '
  'como 11 dígitos. Escrita pelo navegador com a sessão, RLS por auth.uid().';
