-- =============================================================================
-- 0005 — a ordem do cluster de rubrica passa a valer
--
-- Defeito corrigido aqui: `order by score desc` deixava as pernas lexical e
-- semântica reordenarem o cluster por dentro. O `correlato` ultrapassava o
-- `principal` da mesma rubrica, porque ganhava pontos nas outras duas listas.
-- Medido antes desta migration:
--
--   "tráfico privilegiado", sem vetor:  § 4º (principal) 0.0492 → caput 0.0484
--   "tráfico privilegiado", com vetor:  caput (correlato) 0.0599 → § 4º 0.0492
--
-- O caput do art. 33 contém a palavra "tráfico"; o § 4º, que é a resposta, não
-- contém. É exatamente a situação que a camada de rubricas existe para resolver
-- — e a fusão a desfazia no último passo.
--
-- A regra do CLAUDE.md é "peso dominante: quando bate, encabeça o resultado", e
-- o cluster é "ordenado por papel/peso". Ou seja: quem ordena o cluster é a
-- curadoria, não o ts_rank. Agora a ordenação é em três níveis:
--
--   1. quem veio por rubrica vem primeiro;
--   2. dentro do cluster, a posição que a curadoria definiu (papel, depois peso);
--   3. o resto, por score da fusão.
--
-- `score` continua sendo devolvido e continua sendo a RRF das três pernas: ele
-- é o número que a tela mostra e que explica a busca. O que mudou é só quem
-- decide a ordem quando a rubrica bate.
--
-- Efeito colateral aceito: `p_peso_rubrica` deixa de influenciar a ordenação
-- entre cluster e não-cluster (o cluster sempre lidera) e passa a influenciar
-- apenas o score exibido. Mantido na assinatura para não quebrar chamadas.
-- =============================================================================

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
    rr.papel,
    -- Posição que a curadoria definiu. É `null` para quem não veio por rubrica,
    -- e é ela que ordena o cluster por dentro.
    rr.pos as pos_rubrica
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
order by
  -- 1. o cluster da rubrica encabeça o resultado
  f.via_rubrica desc,
  -- 2. dentro dele, a ordem da curadoria. `nulls last` é explícito de propósito:
  --    o default de ASC já põe null por último, mas depender de default numa
  --    cláusula que decide o que sai impresso em peça é economia ruim.
  f.pos_rubrica asc nulls last,
  -- 3. o resto, pela fusão
  f.score desc,
  l.ordem, a.ordem, d.ordem
limit greatest(p_qtd, 1);
$$;

comment on function public.busca_hibrida is
  'Busca híbrida por Reciprocal Rank Fusion (rubrica + lexical + semântica). '
  'Quando a rubrica bate, o cluster encabeça o resultado na ordem definida pela '
  'curadoria (papel, depois peso); o restante sai por score. Ver 0005.';
