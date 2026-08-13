-- =============================================================================
-- 0012 — vigília do corpus
--
-- A pergunta que estas duas tabelas respondem é uma só: **a fotografia
-- envelheceu?** O corpus é uma extração do Vade Mecum do Senado com data de
-- corte em 28/02/2025 (decisão nº 3 do projeto), e o risco que a decisão nº 3
-- existe para conter é citar redação revogada numa peça criminal.
--
-- **Nada aqui escreve em `dispositivos`, `artigos` ou `leis`, e isso não é
-- descuido — é a regra.** Se um coletor pudesse reescrever texto legal em
-- runtime, `leis.vigencia_ate` deixaria de ser verdade e nenhum dispositivo
-- citado numa peça teria passado por conferência humana. É o mesmo motivo pelo
-- qual o acervo Vade Mecum (`docs/acervo-vademecum.md`) é lido mas nunca
-- citável. A vigília não corrige o corpus: ela avisa que ele precisa ser
-- reconferido, e quem reconfere é uma pessoa, rodando o parser de novo.
--
-- Por isso o par de tabelas é deliberadamente pobre. Guarda ementa, situação e
-- link para o ato oficial — nunca texto de lei. Texto de lei só entra no banco
-- pelo caminho de `vade_parser.py` → `normalize.ts` → `seed.ts`.
-- =============================================================================


-- --- o diário de bordo dos coletores -----------------------------------------
--
-- Uma linha por execução por fonte. Existe para a tela poder dizer "há 3 min" e
-- "falhou" sem inventar nenhum dos dois: os cards de saúde do desenho TOGA v2
-- mostram atividade, e atividade que não foi medida é enfeite.
create table if not exists public.vigilia_coletas (
  id         bigserial   primary key,
  fonte      text        not null,
  rodou_em   timestamptz not null default now(),
  ok         boolean     not null,
  -- Preenchido só quando `ok = false`. A tela mostra o recado cru: quem pode
  -- consertar uma fonte fora do ar é quem lê a mensagem dela, não uma tradução.
  erro       text,
  -- `vistos` é o que a API devolveu; `candidatos`, o que passou pelo filtro do
  -- corpus; `novos`, o que ainda não estava na tabela. Os três separados porque
  -- "a fonte respondeu 400 itens e nenhum toca o corpus" e "a fonte respondeu
  -- vazio" são estados diferentes, e só o segundo é suspeito.
  vistos     integer     not null default 0,
  candidatos integer     not null default 0,
  novos      integer     not null default 0,
  ms         integer     not null default 0,

  constraint vigilia_coletas_fonte_ck check (length(btrim(fonte)) between 1 and 40)
);

create index if not exists vigilia_coletas_fonte_idx
  on public.vigilia_coletas (fonte, rodou_em desc);


-- --- o que foi encontrado ----------------------------------------------------
create table if not exists public.vigilia_alteracoes (
  -- Id estável montado pela fonte: `camara:2602373`, `senado:8996484`. É o que
  -- torna a coleta idempotente — rodar o cron duas vezes no mesmo dia não
  -- duplica nada, exatamente como o seed da curadoria.
  id             text        primary key,
  fonte          text        not null,

  -- Quais leis DO CORPUS a ementa diz alterar. Array e não FK única porque uma
  -- proposição costuma mexer em duas de uma vez ("altera a Lei nº 7.560 e a Lei
  -- nº 11.343"), e uma tabela de junção para uma lista de no máximo três itens
  -- seria cerimônia sem ganho.
  leis_tocadas   text[]      not null,

  -- Ids de ARTIGO (`dl_2848_1940_art59`) que a ementa nomeia, quando nomeia.
  -- É o que liga o achado às teses da peça: `teses.fundamentos` guarda ids de
  -- dispositivo com esse mesmo prefixo, e é a diferença entre "666 projetos
  -- querem mexer no Código Penal" e "este mexe no art. 59, que a dosimetria
  -- desta peça cita". Sem FK de propósito — o artigo pode ser um que o corpus
  -- não tem (`art. 33-A`, criado pela própria proposição), e a linha continua
  -- valendo.
  artigos_tocados text[]     not null default '{}',

  identificacao  text        not null,   -- 'PL 466/2026'
  ementa         text        not null,
  apresentado_em date,
  situacao       text,

  -- O que separa "alguém propôs" de "a lei mudou". Enquanto for false, a
  -- fotografia continua válida e isto é só aviso de radar; quando vira true, o
  -- corpus está desatualizado naquele ponto e precisa de reextração.
  virou_norma    boolean     not null default false,
  norma          text,                   -- 'Lei 15.123/2026', quando virou

  url            text,
  visto_em       timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- Marcado pelo usuário quando ele já conferiu o achado contra o corpus. Não é
  -- "resolvido": é "eu li isto". Guardar quem marcou é o que permite a linha
  -- voltar a aparecer se outra sessão discordar.
  reconferido_em  timestamptz,
  reconferido_por uuid references auth.users(id) on delete set null,

  constraint vigilia_alteracoes_leis_ck  check (cardinality(leis_tocadas) > 0),
  constraint vigilia_alteracoes_ident_ck check (length(btrim(identificacao)) between 1 and 80),
  constraint vigilia_alteracoes_url_ck   check (url is null or url ~ '^https?://')
);

-- A tela lista "o que ainda não foi reconferido, mais recente primeiro", e
-- destaca o que virou norma.
create index if not exists vigilia_alteracoes_ordem_idx
  on public.vigilia_alteracoes (virou_norma desc, apresentado_em desc nulls last);

create index if not exists vigilia_alteracoes_leis_idx
  on public.vigilia_alteracoes using gin (leis_tocadas);

create index if not exists vigilia_alteracoes_artigos_idx
  on public.vigilia_alteracoes using gin (artigos_tocados);


-- --- RLS ---------------------------------------------------------------------
--
-- Leitura pública, como o corpus: um achado é o número de um projeto de lei e a
-- ementa dele, que já são públicos na origem. Escrita é do service role, que
-- roda na rota de cron e ignora RLS.
--
-- A exceção é `reconferido_*`, e ela é por COLUNA, não só por policy: RLS
-- decide quais linhas alguém alcança, não quais colunas. Sem o grant restrito,
-- "pode marcar como conferido" viraria "pode reescrever a ementa e o link do
-- ato oficial" — que é precisamente o campo em que uma edição maliciosa faria
-- diferença.
alter table public.vigilia_coletas    enable row level security;
alter table public.vigilia_alteracoes enable row level security;

revoke insert, update, delete on public.vigilia_coletas    from anon, authenticated;
revoke insert, update, delete on public.vigilia_alteracoes from anon, authenticated;

drop policy if exists leitura_publica on public.vigilia_coletas;
create policy leitura_publica on public.vigilia_coletas
  for select to anon, authenticated using (true);

drop policy if exists leitura_publica on public.vigilia_alteracoes;
create policy leitura_publica on public.vigilia_alteracoes
  for select to anon, authenticated using (true);

grant update (reconferido_em, reconferido_por) on public.vigilia_alteracoes to authenticated;

drop policy if exists marca_reconferido on public.vigilia_alteracoes;
create policy marca_reconferido on public.vigilia_alteracoes
  for update to authenticated
  using (true)
  with check (reconferido_por = (select auth.uid()));

comment on table public.vigilia_alteracoes is
  'Normas e proposições que a ementa diz alterar uma das três leis do corpus. '
  'Aviso de que a data de corte envelheceu — nunca fonte de texto legal.';


-- =============================================================================
-- Verificação pós-migration
--
--   -- sem sessão, a chave publishable lê e não escreve:
--   select count(*) from public.vigilia_alteracoes;            -- ok
--   update public.vigilia_alteracoes set ementa = 'x';         -- esperado: 42501
--
--   -- com sessão, só as duas colunas de reconferência passam:
--   update public.vigilia_alteracoes set reconferido_em = now(),
--          reconferido_por = auth.uid() where id = '...';      -- ok
--   update public.vigilia_alteracoes set url = 'https://x';    -- esperado: 42501
-- =============================================================================
