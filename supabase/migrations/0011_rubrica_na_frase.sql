-- =============================================================================
-- 0011 — a rubrica passa a bater também DENTRO da frase
--
-- O CTE `rub` casava por igualdade da consulta inteira contra `termo` ou uma
-- entrada de `variantes`. Isso funciona para quem digita "associação para o
-- tráfico" na caixa de busca, e **falha silenciosamente para quem pergunta**:
--
--   "Associação para o tráfico e concurso de pessoas: qual a diferença?"
--
-- A consulta inteira nunca é igual a uma rubrica, a perna de rubrica não
-- dispara, e sobram léxico e vetor — que devolvem o art. 149-A do CP, tráfico de
-- PESSOAS. É exatamente o erro que o CLAUDE.md registra como a razão de a camada
-- de rubricas existir, reaparecendo pela porta dos fundos assim que a consulta
-- vira frase em vez de termo.
--
-- Isso não era visível enquanto a resposta do chat era composta de fatos sobre a
-- busca: a prosa não afirmava nada sobre a lei, então trazer o artigo errado
-- passava por "resultado ruim". Com a resposta redigida a partir do contexto
-- recuperado, o erro vira uma resposta inteira sobre o crime errado — e aparecer
-- é a melhor coisa que um erro desses pode fazer.
--
-- **A trava contra falso positivo é o comprimento.** Só termo com 12 ou mais
-- caracteres normalizados pode casar contido na frase. Sem ela, "tráfico" (7)
-- casaria em toda pergunta sobre tráfico e a rubrica — que tem peso dominante na
-- fusão — passaria a mandar em consultas que ela não entende. A igualdade exata
-- continua valendo para qualquer comprimento, então rubrica curta não perde nada
-- de quem a digita direto.
--
-- O resto da função é idêntico ao de 0005 (a ordem do cluster). `create or
-- replace` reescreve inteira porque Postgres não sabe substituir um CTE.
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

-- 1) rubrica — igualdade exata OU termo longo contido na frase
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
    or (length(r.termo_norm) >= 12 and position(r.termo_norm in q.termo) > 0)
    or exists (
      select 1
      from unnest(r.variantes_norm) as v
      where length(v) >= 12 and position(v in q.termo) > 0
    )
  join public.rubrica_dispositivos rd on rd.rubrica_id = r.id
  join public.dispositivos d          on d.id = rd.dispositivo_id
  where p_lei is null or d.lei_id = p_lei
  order by rd.dispositivo_id, (rd.papel = 'principal') desc, rd.peso desc
),

-- 2) lexical — ts_rank_cd sobre dispositivos.busca
lex as (
  select d.id as dispositivo_id,
         row_number() over (
           order by ts_rank_cd(d.busca, q.tsq) desc, d.id
         ) as pos
  from public.dispositivos d, q
  where q.tsq is not null
    and d.busca @@ q.tsq
    and (p_lei is null or d.lei_id = p_lei)
  limit 200
),

-- 3) semântica — distância de vetor
sem as (
  select d.id as dispositivo_id,
         row_number() over (order by d.embedding <=> p_embedding) as pos
  from public.dispositivos d
  where p_embedding is not null
    and d.embedding is not null
    and (p_lei is null or d.lei_id = p_lei)
  order by d.embedding <=> p_embedding
  limit 200
),

-- fusão por Reciprocal Rank Fusion
fusao as (
  select
    coalesce(rub.dispositivo_id, lex.dispositivo_id, sem.dispositivo_id) as dispositivo_id,
    coalesce(
      case when rub.dispositivo_id is not null then
        p_peso_rubrica / (p_k + row_number() over (
          order by (rub.papel = 'principal') desc, rub.peso desc, rub.dispositivo_id
        ))
      end, 0)
    + coalesce(case when lex.pos is not null then p_peso_lexical   / (p_k + lex.pos) end, 0)
    + coalesce(case when sem.pos is not null then p_peso_semantico / (p_k + sem.pos) end, 0)
      as score,
    rub.dispositivo_id is not null as via_rubrica,
    rub.rubrica_termo,
    rub.papel,
    rub.peso
  from rub
  full outer join lex on lex.dispositivo_id = rub.dispositivo_id
  full outer join sem on sem.dispositivo_id = coalesce(rub.dispositivo_id, lex.dispositivo_id)
)

select
  v.id,
  v.lei_id,
  v.lei_apelido,
  v.vigencia_ate,
  v.cobertura,
  v.cobertura_nota,
  v.artigo_numero,
  v.artigo_rubrica,
  v.capitulo,
  v.tipo,
  v.rotulo,
  v.citacao,
  v.texto,
  v.revogado,
  f.score,
  f.via_rubrica,
  f.rubrica_termo,
  f.papel
from fusao f
join public.v_dispositivo v on v.id = f.dispositivo_id
-- A ordem do cluster (0005): dentro da mesma rubrica, principal antes de
-- correlato, e peso maior antes de peso menor. Sem isto o cluster de
-- "dosimetria da pena" saía embaralhado.
order by
  f.via_rubrica desc,
  (f.papel = 'principal') desc nulls last,
  f.peso desc nulls last,
  f.score desc,
  v.id
limit greatest(p_qtd, 1);
$$;

comment on function public.busca_hibrida is
  'Busca híbrida: rubrica (exata ou contida na frase, ≥12 caracteres), lexical e '
  'semântica, fundidas por RRF numa chamada só.';
