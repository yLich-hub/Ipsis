-- =============================================================================
-- 0017 — a rubrica recupera o peso que a decisão nº 2 lhe atribui
--
-- `p_peso_rubrica` é 3.0 desde 0003 e **nunca valeu 3.0 em produção**.
--
-- A posição da rubrica na fórmula do RRF era calculada por uma janela dentro do
-- CTE `fusao`, isto é, sobre o resultado do `full outer join` das três pernas. A
-- ordenação dela abria com `(rub.papel = 'principal') desc` — e `desc`, no
-- Postgres, é NULLS FIRST. As linhas que vieram só do léxico ou só do vetor têm
-- `rub.papel` nulo, são até 400, e ficavam todas na frente do cluster de
-- rubrica.
--
-- Medido no banco, com a consulta mais central do projeto:
--
--   "tráfico privilegiado" → lei_11343_2006_art33_p4
--     sem vetor:  peso 3.0 → 0,049180   peso 0.0 → 0,000000   (rubrica = 3/61 ✓)
--     com vetor:  peso 3.0 → 0,019335   peso 0.0 → 0,007752   (rubrica = 3/259)
--
-- 3/259 é `row_number() = 199`. Sem a perna semântica o CTE `sem` fica vazio,
-- ninguém entra na frente e o número sai certo — que é a razão de isto nunca ter
-- aparecido em teste com embedding nulo, o modo em que se afinam pesos à mão.
--
-- **Por que passou despercebido por tanto tempo:** o `order by` final da função
-- abre com `f.via_rubrica desc`, então o dispositivo da rubrica encabeça a lista
-- de qualquer jeito. A tela sempre pareceu certa. O que estava errado era o
-- score — e o score só passou a decidir alguma coisa quando `filtraContexto`
-- ganhou o piso de fusão, que corta o que não tem concordância entre pernas.
--
-- **A consequência era grave e silenciosa.** Com a rubrica valendo um quarto,
-- "tráfico privilegiado" não juntava três dispositivos acima do piso de 1/61, o
-- contexto era marcado `fraco`, e o modelo recebia a instrução de dizer que o
-- acervo não cobre a pergunta e usar confidence "baixa" — sobre o instituto que
-- este projeto existe para responder.
--
-- O conserto é estrutural, não uma cláusula a mais: cada perna passa a calcular
-- a própria posição dentro do próprio CTE, que é o que `lex` e `sem` já faziam.
-- A janela da rubrica não enxerga mais linha de outra perna, e essa classe de
-- erro deixa de ser possível.
--
-- `create or replace` reescreve a função inteira porque o Postgres não sabe
-- substituir um CTE. O resto é idêntico a 0011.
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
--
-- O `distinct on` fica aqui e a posição vem no CTE seguinte: janela sobre
-- `distinct on` no mesmo select roda ANTES da deduplicação, e contaria a mesma
-- rubrica duas vezes.
rub_bruta as (
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

-- 1b) a posição DENTRO do cluster de rubrica.
--
-- É a linha inteira desta migration. Antes ela era calculada lá embaixo, na
-- fusão, sobre o resultado do `full outer join` — e o `desc` do Postgres é
-- NULLS FIRST, então as até 200 linhas em que `rub.papel` é nulo (as que vieram
-- só do léxico ou do vetor) ficavam na frente e empurravam o cluster para o
-- fim. Medido: o art. 33, § 4º recebia `row_number() = 199` numa consulta por
-- "tráfico privilegiado", e a perna valia 3/259 = 0,0116 em vez de 3/61 =
-- 0,0492 — um quarto do peso que a decisão nº 2 do CLAUDE.md lhe atribui.
--
-- Aqui a janela só enxerga linhas de rubrica, e a classe de erro deixa de
-- existir: nenhuma perna consegue mais contar as linhas de outra. É a forma que
-- `lex` e `sem` já tinham, e a assimetria era o defeito.
--
-- `nulls last` no `papel` é cinto além do suspensório: a coluna é `not null` no
-- schema, e a ordem final da função já escrevia assim. Foi exatamente a falta
-- desse par de palavras, na mesma expressão, que custou o peso da rubrica.
rub as (
  select rb.dispositivo_id,
         rb.rubrica_termo,
         rb.papel,
         rb.peso,
         row_number() over (
           order by (rb.papel = 'principal') desc nulls last, rb.peso desc nulls last, rb.dispositivo_id
         ) as pos
  from rub_bruta rb
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
    coalesce(case when rub.pos is not null then p_peso_rubrica   / (p_k + rub.pos) end, 0)
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
