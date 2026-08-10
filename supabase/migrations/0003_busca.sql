-- =============================================================================
-- 0003_busca.sql — view de leitura e RPC de busca híbrida
--
-- Uma única chamada de rede: rubrica + lexical + semântica fundidas no banco
-- por Reciprocal Rank Fusion. O embedding da consulta é calculado no app
-- (OpenAI) e passado como parâmetro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leitura de dispositivo já com o contexto que a UI precisa exibir —
-- incluindo vigência e cobertura, que nunca podem sumir da tela.
-- -----------------------------------------------------------------------------
create or replace view public.v_dispositivo
with (security_invoker = on) as
select
  d.id,
  d.artigo_id,
  d.lei_id,
  d.tipo,
  d.numero,
  d.rotulo,
  d.pai_id,
  d.ordem,
  d.texto,
  d.rubrica,
  d.citacao,
  d.revogado,
  a.numero       as artigo_numero,
  a.numero_base  as artigo_numero_base,
  a.rubrica      as artigo_rubrica,
  a.titulo,
  a.capitulo,
  a.secao,
  a.revogado     as artigo_revogado,
  a.conferido_em as artigo_conferido_em,
  l.apelido      as lei_apelido,
  l.nome         as lei_nome,
  l.vigencia_ate,
  l.cobertura,
  l.cobertura_nota
from public.dispositivos d
join public.artigos a on a.id = d.artigo_id
join public.leis    l on l.id = d.lei_id;


-- -----------------------------------------------------------------------------
-- busca_hibrida
--
-- RRF: score = Σ peso_i / (k + posição_i). A rubrica entra com peso 3× porque,
-- quando o termo do instituto bate exatamente, é a resposta — não um candidato.
--
-- p_embedding pode ser null: a busca degrada para rubrica + lexical, o que
-- mantém o app de pé se a API de embeddings estiver fora.
--
-- Chamada em JS:
--   supabase.rpc('busca_hibrida', {
--     p_consulta: q,
--     p_embedding: JSON.stringify(vetor),   // string, não array
--     p_qtd: 12
--   })
-- -----------------------------------------------------------------------------
create or replace function public.busca_hibrida(
  p_consulta       text,
  p_embedding      extensions.vector(1536) default null,
  p_qtd            integer default 12,
  p_lei            text    default null,
  p_k              integer default 60,
  p_peso_rubrica   numeric default 3.0,
  p_peso_lexical   numeric default 1.0,
  p_peso_semantico numeric default 1.0
)
returns table (
  dispositivo_id text,
  lei_id         text,
  lei_apelido    text,
  vigencia_ate   date,
  cobertura      text,
  cobertura_nota text,
  artigo_numero  text,
  artigo_rubrica text,
  capitulo       text,
  tipo           text,
  rotulo         text,
  citacao        text,
  texto          text,
  revogado       boolean,
  score          numeric,
  via_rubrica    boolean,
  rubrica_termo  text,
  papel          text
)
language sql
stable
parallel safe
set search_path = public, extensions
as $$
with q as (
  select
    public.norm(p_consulta) as termo,
    websearch_to_tsquery('public.pt_unaccent'::regconfig, p_consulta) as tsq
),

-- 1) rubrica — match exato, normalizado (sem acento, caixa baixa)
rub as (
  select distinct on (rd.dispositivo_id)
         rd.dispositivo_id,
         r.termo as rubrica_termo,
         rd.papel,
         rd.peso
  from q
  join public.rubricas r
    on r.termo_norm = q.termo
    or q.termo = any (r.variantes_norm)
  join public.rubrica_dispositivos rd on rd.rubrica_id = r.id
  join public.dispositivos d          on d.id = rd.dispositivo_id
  where p_lei is null or d.lei_id = p_lei
  order by rd.dispositivo_id, (rd.papel = 'principal') desc, rd.peso desc
),
rub_rank as (
  select
    dispositivo_id,
    rubrica_termo,
    papel,
    row_number() over (
      order by (papel = 'principal') desc, peso desc, dispositivo_id
    ) as pos
  from rub
),

-- 2) lexical — full-text em português, insensível a acento
lex as (
  select dispositivo_id, row_number() over (order by rank desc, dispositivo_id) as pos
  from (
    select d.id as dispositivo_id, ts_rank_cd(d.busca, q.tsq) as rank
    from public.dispositivos d
    cross join q
    where numnode(q.tsq) > 0
      and d.busca @@ q.tsq
      and (p_lei is null or d.lei_id = p_lei)
    order by rank desc, d.id
    limit 60
  ) t
),

-- 3) semântica — pgvector, distância de cosseno
sem as (
  select dispositivo_id, row_number() over (order by dist, dispositivo_id) as pos
  from (
    select d.id as dispositivo_id, d.embedding <=> p_embedding as dist
    from public.dispositivos d
    where p_embedding is not null
      and d.embedding is not null
      and (p_lei is null or d.lei_id = p_lei)
    order by d.embedding <=> p_embedding
    limit 60
  ) t
),

uniao as (
  select dispositivo_id from rub_rank
  union
  select dispositivo_id from lex
  union
  select dispositivo_id from sem
),

fusao as (
  select
    u.dispositivo_id,
      coalesce(p_peso_rubrica   / (p_k + rr.pos), 0)
    + coalesce(p_peso_lexical   / (p_k + lx.pos), 0)
    + coalesce(p_peso_semantico / (p_k + sm.pos), 0) as score,
    rr.dispositivo_id is not null as via_rubrica,
    rr.rubrica_termo,
    rr.papel
  from uniao u
  left join rub_rank rr on rr.dispositivo_id = u.dispositivo_id
  left join lex      lx on lx.dispositivo_id = u.dispositivo_id
  left join sem      sm on sm.dispositivo_id = u.dispositivo_id
)

select
  f.dispositivo_id,
  d.lei_id,
  l.apelido,
  l.vigencia_ate,
  l.cobertura,
  l.cobertura_nota,
  a.numero,
  a.rubrica,
  a.capitulo,
  d.tipo,
  d.rotulo,
  d.citacao,
  d.texto,
  d.revogado,
  f.score,
  f.via_rubrica,
  f.rubrica_termo,
  f.papel
from fusao f
join public.dispositivos d on d.id = f.dispositivo_id
join public.artigos      a on a.id = d.artigo_id
join public.leis         l on l.id = d.lei_id
order by f.score desc, l.ordem, a.ordem, d.ordem
limit greatest(p_qtd, 1);
$$;


-- -----------------------------------------------------------------------------
-- Saúde — alvo do Vercel Cron diário. Toca o banco para impedir que o projeto
-- gratuito do Supabase seja pausado por inatividade e mate a demo.
-- -----------------------------------------------------------------------------
create or replace function public.saude()
returns jsonb
language sql
stable
parallel safe
set search_path = public
as $$
  select jsonb_build_object(
    'ok',            true,
    'leis',          (select count(*) from public.leis),
    'artigos',       (select count(*) from public.artigos),
    'dispositivos',  (select count(*) from public.dispositivos),
    'com_embedding', (select count(*) from public.dispositivos where embedding is not null),
    'rubricas',      (select count(*) from public.rubricas),
    'teses',         (select count(*) from public.teses where ativo),
    'casos',         (select count(*) from public.casos),
    'em',            now()
  );
$$;
