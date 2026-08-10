-- =============================================================================
-- 0001_schema.sql — extensões, funções auxiliares, tabelas e integridade
-- Jesbick · consulta e geração de peças (tráfico de drogas)
--
-- Rodar no SQL Editor do Supabase. Idempotente: pode rodar duas vezes.
-- =============================================================================

create extension if not exists vector    with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists unaccent  with schema extensions;


-- -----------------------------------------------------------------------------
-- Normalização para match exato de rubricas
--
-- unaccent() é STABLE (depende do dicionário resolvido em runtime), então não
-- pode entrar direto em coluna gerada. Passar o dicionário explicitamente e
-- declarar o wrapper IMMUTABLE resolve — é o padrão documentado.
--
-- Por que importa: advogado digita "trafico privilegiado" sem acento. Sem
-- normalização, o match exato da rubrica falha justamente no caso mais comum.
-- -----------------------------------------------------------------------------
create or replace function public.norm(txt text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, txt))
$$;

create or replace function public.norm_arr(arr text[])
returns text[]
language sql
immutable
parallel safe
strict
as $$
  select array(select public.norm(v) from unnest(arr) as v)
$$;

-- array_to_string() é STABLE: sua assinatura é anyarray e ela invoca a função de
-- saída do tipo do elemento, que pode ser stable (timestamptz). O Postgres não
-- abre exceção para text[], então ela não entra em coluna gerada. Mesmo remédio
-- do unaccent: wrapper declarado IMMUTABLE.
create or replace function public.arr_join(arr text[])
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(array_to_string(arr, ' '), '')
$$;


-- -----------------------------------------------------------------------------
-- Configuração de busca textual em português, insensível a acento
--
-- 'portuguese' puro não casa "trafico" com "tráfico". Esta configuração aplica
-- unaccent antes do stemmer.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_ts_config c
    join pg_namespace n on n.oid = c.cfgnamespace
    where c.cfgname = 'pt_unaccent' and n.nspname = 'public'
  ) then
    create text search configuration public.pt_unaccent (copy = portuguese);
    alter text search configuration public.pt_unaccent
      alter mapping for hword, hword_part, word
      with extensions.unaccent, portuguese_stem;
  end if;
end $$;


-- =============================================================================
-- LEIS
-- =============================================================================
create table if not exists public.leis (
  id              text        primary key,   -- 'lei_11343_2006' | 'dl_2848_1940' | 'dl_3689_1941'
  nome            text        not null,
  apelido         text        not null,      -- 'Lei de Drogas' | 'Código Penal' | 'CPP'
  fonte           text        not null,
  vigencia_ate    date        not null,      -- fotografia da redação — exibido na UI
  cobertura       text        not null default 'integral',
  cobertura_nota  text,                      -- obrigatório quando cobertura = 'parcial'
  total_artigos   integer     not null default 0,
  ordem           integer     not null default 0,
  criado_em       timestamptz not null default now(),

  constraint leis_cobertura_ck check (cobertura in ('integral','parcial')),

  -- Cobertura parcial sem explicação é a mesma classe de erro que redação
  -- revogada sem aviso: o banco recusa.
  constraint leis_cobertura_nota_ck
    check (cobertura = 'integral' or nullif(btrim(cobertura_nota), '') is not null)
);

comment on column public.leis.vigencia_ate is
  'Data de corte da redação. Renderizada em banner global e ao lado de cada dispositivo.';
comment on column public.leis.cobertura is
  'integral = lei inteira no banco; parcial = subconjunto curado (CPP).';


-- =============================================================================
-- ARTIGOS
-- =============================================================================
create table if not exists public.artigos (
  id             text    primary key,  -- id textual do parser: 'lei_11343_2006_art33'
  lei_id         text    not null references public.leis(id) on delete cascade,
  numero         text    not null,     -- '33', '7-A'
  numero_base    integer not null,     -- 7   → ordena 7-A entre 7 e 8
  numero_sufixo  text,                 -- 'A'
  ordem          integer not null,     -- posição no documento
  titulo         text,
  capitulo       text,                 -- já limpo da rubrica marginal colada
  secao          text,
  rubrica        text,                 -- 'Furto', 'Fixação da pena'
  revogado       boolean not null default false,
  conferido_em   date,                 -- preenchido nos artigos de curadoria manual (CPP)

  constraint artigos_numero_uq unique (lei_id, numero),
  constraint artigos_ordem_uq  unique (lei_id, ordem) deferrable initially deferred,

  -- permite FK composta a partir de dispositivos (ver abaixo)
  constraint artigos_id_lei_uq unique (id, lei_id)
);


-- =============================================================================
-- DISPOSITIVOS — unidade de citação e de embedding
-- =============================================================================
create table if not exists public.dispositivos (
  id           text    primary key,  -- 'lei_11343_2006_art33_p4', '..._art40_inc1'
  artigo_id    text    not null,
  lei_id       text    not null,     -- desnormalizado: filtro barato na busca
  tipo         text    not null,
  numero       text,                 -- '4' | 'único' | 'I' | 'a'
  rotulo       text    not null,     -- '§ 4º' | 'I' | 'a)'  (renderizado)
  pai_id       text    references public.dispositivos(id) on delete cascade,
  ordem        integer not null,
  texto        text    not null,     -- limpo
  texto_bruto  text    not null,     -- original do parser, para auditoria da limpeza
  rubrica      text,
  citacao      text    not null,     -- 'art. 33, § 4º, da Lei nº 11.343/2006'
  texto_embed  text    not null,     -- capítulo + rubrica + caput + texto
  embed_hash   text    not null,     -- sha256(texto_embed) — embed.ts só reembute o que mudou
  revogado     boolean not null default false,

  busca tsvector generated always as (
      setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(rubrica, '')), 'A')
   || setweight(to_tsvector('public.pt_unaccent'::regconfig, texto),                 'B')
  ) stored,

  embedding extensions.vector(1536),   -- OpenAI text-embedding-3-small

  constraint dispositivos_tipo_ck
    check (tipo in ('caput','paragrafo','inciso','alinea')),

  -- lei_id não pode divergir da lei do artigo
  constraint dispositivos_artigo_fk
    foreign key (artigo_id, lei_id)
    references public.artigos(id, lei_id) on delete cascade,

  constraint dispositivos_caput_sem_pai_ck
    check (tipo <> 'caput' or pai_id is null),

  constraint dispositivos_ordem_uq
    unique (artigo_id, ordem) deferrable initially deferred
);

comment on column public.dispositivos.texto_embed is
  'O que é efetivamente embutido. "§ 4º Nos delitos definidos no caput..." isolado '
  'gera vetor inútil — o dispositivo não se sustenta fora do contexto do artigo.';
comment on column public.dispositivos.texto_bruto is
  'Texto original do parser. A limpeza da rubrica marginal é heurística; '
  'esta coluna é a rede de segurança para auditar 351 alterações no CP.';


-- =============================================================================
-- RUBRICAS — termo do instituto → dispositivo(s)
-- =============================================================================
create table if not exists public.rubricas (
  id          bigint generated always as identity primary key,
  termo       text   not null,          -- 'tráfico privilegiado'
  slug        text   not null,
  variantes   text[] not null default '{}',
  tipo        text   not null,
  origem      text   not null,          -- 'oficial' = extraída do PDF; 'curada' = manual
  explicacao  text,                     -- texto autoral curto — NUNCA resumo de doutrina

  termo_norm     text   generated always as (public.norm(termo))         stored,
  variantes_norm text[] generated always as (public.norm_arr(variantes)) stored,

  busca tsvector generated always as (
    to_tsvector(
      'public.pt_unaccent'::regconfig,
      termo || ' ' || public.arr_join(variantes)
    )
  ) stored,

  constraint rubricas_tipo_ck   check (tipo   in ('dispositivo','tema','processual')),
  constraint rubricas_origem_ck check (origem in ('oficial','curada')),
  constraint rubricas_slug_uq   unique (slug)
);

comment on table public.rubricas is
  'Advogado busca pelo apelido do instituto, não pelo texto da lei. '
  '"Tráfico privilegiado" não aparece em lugar nenhum do art. 33 §4º.';

create table if not exists public.rubrica_dispositivos (
  rubrica_id     bigint   not null references public.rubricas(id)     on delete cascade,
  dispositivo_id text     not null references public.dispositivos(id) on delete cascade,
  papel          text     not null default 'principal',
  peso           smallint not null default 100,
  nota           text,

  primary key (rubrica_id, dispositivo_id),
  constraint rd_papel_ck check (papel in ('principal','correlato','requisito')),
  constraint rd_peso_ck  check (peso between 0 and 1000)
);

comment on table public.rubrica_dispositivos is
  '"Dosimetria da pena" é um cluster ordenado: art. 42 da Lei de Drogas como '
  'principal, arts. 59 e 68 do CP como correlatos. Não é um artigo só.';


-- =============================================================================
-- Integridade referencial de ids de dispositivo em arrays e em templates
--
-- O Postgres não faz FK de elemento de array nem de marcador em texto.
-- Estes triggers são o que garante, na camada de armazenamento, que nenhuma
-- citação da minuta aponta para um dispositivo inexistente.
-- =============================================================================
create or replace function public.valida_ids_dispositivo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  coluna text := tg_argv[0];
  ids    text[];
  falta  text[];
begin
  select array(select jsonb_array_elements_text(to_jsonb(new) -> coluna)) into ids;

  select array_agg(x order by x) into falta
  from unnest(coalesce(ids, '{}'::text[])) as x
  where not exists (select 1 from public.dispositivos d where d.id = x);

  if falta is not null then
    raise exception '%.% aponta para dispositivos inexistentes: %',
      tg_table_name, coluna, falta
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;

create or replace function public.valida_citacoes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  coluna text := tg_argv[0];
  corpo  text;
  falta  text[];
begin
  select to_jsonb(new) ->> coluna into corpo;
  if corpo is null then return new; end if;

  select array_agg(distinct m[1] order by m[1]) into falta
  from regexp_matches(corpo, '\{\{cite:([a-z0-9_]+)\}\}', 'g') as m
  where not exists (select 1 from public.dispositivos d where d.id = m[1]);

  if falta is not null then
    raise exception '%.% contém {{cite:}} para dispositivos inexistentes: %',
      tg_table_name, coluna, falta
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;


-- =============================================================================
-- TESES
-- =============================================================================
create table if not exists public.teses (
  id             text    primary key,   -- 'trafico_privilegiado'
  nome           text    not null,
  resumo         text    not null,
  gatilho        jsonb   not null default '{}'::jsonb,  -- chaves casam com casos.fatos
  fundamentos    text[]  not null,                      -- ids de dispositivos
  jurisprudencia jsonb   not null default '[]'::jsonb,  -- [{tribunal,classe,numero,tese,url}]
  template_md    text    not null,                      -- minuta com marcadores {{cite:id}}
  ordem          integer not null,
  ativo          boolean not null default true,

  constraint teses_fundamentos_ck check (cardinality(fundamentos) > 0)
);

drop trigger if exists teses_valida_fundamentos on public.teses;
create trigger teses_valida_fundamentos
  before insert or update of fundamentos on public.teses
  for each row execute function public.valida_ids_dispositivo('fundamentos');

drop trigger if exists teses_valida_template on public.teses;
create trigger teses_valida_template
  before insert or update of template_md on public.teses
  for each row execute function public.valida_citacoes('template_md');


-- =============================================================================
-- CASOS de demonstração
-- =============================================================================
create table if not exists public.casos (
  id        text    primary key,
  titulo    text    not null,
  fatos     jsonb   not null,   -- mesmas chaves de teses.gatilho
  narrativa text    not null,
  imputacao text[]  not null,
  ordem     integer not null
);

drop trigger if exists casos_valida_imputacao on public.casos;
create trigger casos_valida_imputacao
  before insert or update of imputacao on public.casos
  for each row execute function public.valida_ids_dispositivo('imputacao');


-- =============================================================================
-- ARGUMENTAÇÃO pré-gerada (sem LLM em runtime)
-- =============================================================================
create table if not exists public.argumentacao (
  caso_id     text        not null references public.casos(id) on delete cascade,
  tese_id     text        not null references public.teses(id) on delete cascade,
  markdown    text        not null,   -- costura argumentativa, com {{cite:id}}
  modelo      text        not null,   -- 'claude-opus-5'
  gerado_em   timestamptz not null default now(),
  revisado_em timestamptz,            -- null = não revisado → não vai ao ar
  revisor     text,

  primary key (caso_id, tese_id)
);

drop trigger if exists argumentacao_valida_citacoes on public.argumentacao;
create trigger argumentacao_valida_citacoes
  before insert or update of markdown on public.argumentacao
  for each row execute function public.valida_citacoes('markdown');

comment on column public.argumentacao.revisado_em is
  'A UI só serve linhas com revisado_em não nulo. Cada frase da minuta passa '
  'por revisão humana antes de ir ao ar.';


-- =============================================================================
-- Teto de uso do caminho "gerar ao vivo"
-- =============================================================================
create table if not exists public.uso_llm (
  mes      date    primary key,   -- primeiro dia do mês
  chamadas integer not null default 0,
  teto     integer not null default 200,
  constraint uso_llm_mes_ck check (mes = date_trunc('month', mes)::date)
);
