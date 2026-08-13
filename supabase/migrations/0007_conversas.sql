-- =============================================================================
-- 0007 — histórico de conversas no banco, por usuário
--
-- O histórico nasceu em `localStorage` e tinha duas limitações que o tornavam
-- diferente do que se espera de um chat: teto de 20 conversas, com despejo
-- silencioso da mais antiga, e nada atravessando navegador ou máquina.
--
-- Aqui não há teto. Conversa não expira e não é despejada — o usuário apaga o
-- que quiser apagar, e o resto fica. É como o ChatGPT e o Claude se comportam, e
-- é o que foi pedido.
--
-- **Isto não abre o projeto para multiusuário.** Continua sendo um usuário só; o
-- que a coluna `usuario_id` faz é ancorar a policy de RLS em `auth.uid()`, para
-- que o histórico seja inacessível a qualquer sessão que não seja a dele. Sem
-- essa âncora, a chave publishable leria a conversa de todo mundo.
--
-- As duas tabelas são escritas pelo NAVEGADOR, com a sessão do usuário — não
-- pelo cliente anônimo do servidor. É a única parte do produto que escreve no
-- banco em runtime, e por isso é a única com policy de INSERT.
-- =============================================================================

create table if not exists public.conversas (
  id            uuid        primary key default gen_random_uuid(),
  usuario_id    uuid        not null references auth.users(id) on delete cascade,
  titulo        text        not null,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),

  constraint conversas_titulo_ck check (length(btrim(titulo)) between 1 and 200)
);

-- A lista da lateral é sempre "minhas conversas, da mais recente para a mais
-- antiga". Sem este índice ela vira varredura assim que o histórico crescer —
-- e o ponto desta migration é justamente deixá-lo crescer.
create index if not exists conversas_usuario_recentes_idx
  on public.conversas (usuario_id, atualizada_em desc);

create table if not exists public.conversa_trocas (
  id          bigint      generated always as identity primary key,
  conversa_id uuid        not null references public.conversas(id) on delete cascade,
  -- Posição na conversa. Reabrir precisa devolver as trocas na ordem em que
  -- aconteceram, e `criada_em` empataria em gravações no mesmo milissegundo.
  ordem       integer     not null,
  pergunta    text        not null,
  -- A resposta CRUA da busca. A prosa exibida é derivada dela por
  -- `comporResposta()` — guardar o texto composto dobraria o tamanho e
  -- congelaria uma segunda versão da mesma frase.
  resposta    jsonb       not null,
  criada_em   timestamptz not null default now(),

  constraint conversa_trocas_ordem_uq unique (conversa_id, ordem),
  constraint conversa_trocas_ordem_ck check (ordem >= 0)
);

create index if not exists conversa_trocas_conversa_idx
  on public.conversa_trocas (conversa_id, ordem);

-- -----------------------------------------------------------------------------
-- RLS — o histórico é do dono, e de mais ninguém
--
-- As tabelas de corpus são somente-leitura para todos (0004). Estas são o
-- oposto: leitura e escrita, restritas a `auth.uid()`. Sessão anônima não
-- enxerga nem escreve nada.
-- -----------------------------------------------------------------------------
alter table public.conversas       enable row level security;
alter table public.conversa_trocas enable row level security;

drop policy if exists conversas_do_dono on public.conversas;
create policy conversas_do_dono on public.conversas
  for all
  to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- A troca não guarda dono: ela pertence a quem é dono da conversa. Repetir
-- `usuario_id` aqui criaria duas fontes para o mesmo fato, e a chance de elas
-- discordarem.
drop policy if exists conversa_trocas_do_dono on public.conversa_trocas;
create policy conversa_trocas_do_dono on public.conversa_trocas
  for all
  to authenticated
  using (
    exists (
      select 1 from public.conversas c
      where c.id = conversa_id and c.usuario_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversas c
      where c.id = conversa_id and c.usuario_id = (select auth.uid())
    )
  );

comment on table public.conversas is
  'Histórico do chat, por usuário. Sem teto e sem expiração: o usuário apaga o '
  'que quiser, o resto fica. Escrita feita pelo navegador, com a sessão.';
