-- =============================================================================
-- 0008 — perfil do usuário no banco
--
-- O perfil nasceu em `localStorage`, na tela de Configurações, e isso o tornava
-- uma anotação do aparelho: trocar de navegador apagava o nome e a inscrição na
-- OAB. Aqui ele fica registrado.
--
-- **Isto não abre o projeto para multiusuário.** Continua sendo um usuário só; o
-- que `usuario_id` faz é ancorar a policy em `auth.uid()`, para que o perfil
-- seja inacessível a qualquer sessão que não seja a dele. Sem essa âncora, a
-- chave publishable leria o perfil de todo mundo — a mesma razão de 0007.
--
-- Uma linha por usuário, e a chave primária é o próprio `usuario_id`: assim o
-- upsert não precisa procurar antes de gravar, e não existe o estado de duas
-- linhas de perfil discordando sobre o mesmo nome.
--
-- Os campos nascem `''` e não `null`. Perfil vazio é o estado normal de quem
-- acabou de criar a conta, não ausência de dado — e o formulário que o edita
-- lida com texto, não com três-estados.
-- =============================================================================

create table if not exists public.perfil (
  usuario_id    uuid        primary key references auth.users(id) on delete cascade,
  nome          text        not null default '',
  oab           text        not null default '',
  telefone      text        not null default '',
  atualizado_em timestamptz not null default now(),

  -- Tetos, não formatos. A inscrição na OAB varia de seccional para seccional e
  -- o telefone de país para país; recusar no banco o que a pessoa digitou sobre
  -- si mesma seria inventar uma regra que a OAB não tem.
  constraint perfil_nome_ck     check (length(nome)     <= 120),
  constraint perfil_oab_ck      check (length(oab)      <= 40),
  constraint perfil_telefone_ck check (length(telefone) <= 40)
);

-- -----------------------------------------------------------------------------
-- RLS — o perfil é do dono, e de mais ninguém
-- -----------------------------------------------------------------------------
alter table public.perfil enable row level security;

drop policy if exists perfil_do_dono on public.perfil;
create policy perfil_do_dono on public.perfil
  for all
  to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

comment on table public.perfil is
  'Nome, OAB e telefone do usuário logado. Uma linha por usuário, escrita pelo '
  'navegador com a sessão. Não entra na minuta: o .docx continua com autos, '
  'nome e OAB como campos a preencher.';
