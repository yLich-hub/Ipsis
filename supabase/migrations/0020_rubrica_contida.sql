-- =============================================================================
-- 0020 — a rubrica CONTIDA deixa de mandar na consulta
--
-- A camada de rubricas é a decisão nº 2 do projeto: advogado busca pelo apelido
-- do instituto, e quando o apelido bate, ele manda. Isso continua valendo — para
-- quem DIGITOU o apelido.
--
-- O que esta migration separa é o outro caso. Desde 0011 a rubrica também casa
-- por **termo contido na frase**, a partir de 12 caracteres normalizados, e essa
-- regra existe por um bom motivo: sem ela, "Associação para o tráfico e concurso
-- de pessoas: qual a diferença?" não dispara rubrica nenhuma e a busca devolve o
-- art. 149-A do CP — tráfico de PESSOAS. O match contido conserta isso.
--
-- Só que ele entrava pela MESMA porta do match exato, e a porta é larga demais:
-- o `order by` final abre com `via_rubrica desc`, então qualquer match de
-- rubrica encabeça a lista **independentemente do score**. Um termo mencionado
-- de passagem passava a mandar numa pergunta que não era sobre ele.
--
-- --- medido antes, com a pergunta que o CLAUDE.md já registrava ---------------
--
--   "o réu confessou o tráfico, mas quero discutir a nulidade da entrada na
--    residência sem mandado"
--
--     1. art. 65, III, d, do CP   0,04918  ◆ rubrica "confissão espontânea"
--     2. art. 65 do CP            0,04839  ◆ rubrica "confissão espontânea"
--     3. art. 293 do CPP          0,01639
--
-- A frase incidental — `reu confessou`, 13 caracteres — tomou as duas primeiras
-- posições, e busca domiciliar, que é o assunto da pergunta, não aparecia entre
-- os seis primeiros. O piso de contexto pegava (marcava `fraco`), que é a rede
-- funcionando; mas a resposta certa também não vinha.
--
-- **O corte de 12 caracteres foi calibrado contra o peso quebrado.** Ele nasceu
-- em 0011, quando a rubrica valia de fato 0,7× em vez de 3× — o defeito que 0017
-- consertou. Com o peso certo, termo curado curto e genérico domina de verdade,
-- e há 236 termos com 12+ caracteres, entre eles `reu confessou`,
-- `regime inicial` e `prova ilicita`.
--
-- --- o conserto, e por que não é mexer no número ------------------------------
--
-- Subir o corte de 12 para 18 seria trocar um número arbitrário por outro, e
-- continuaria errado para algum termo. O que estava errado não era o
-- comprimento: era **as duas formas de match terem o mesmo poder**.
--
--   igualdade → o usuário digitou o nome do instituto. Manda, como sempre mandou.
--   contido   → o termo apareceu dentro de uma frase. É sinal, não comando.
--
-- Duas mudanças, as duas pequenas:
--
--   1. O match contido vale METADE de `p_peso_rubrica` — 1,5 contra 3,0.
--      Continua acima do léxico e do vetor, então a rubrica contida ainda
--      levanta o dispositivo; já não é o dobro deles. É derivado, e não
--      parâmetro novo, porque parâmetro a mais criaria uma SOBRECARGA da função
--      em vez de substituí-la, e as duas assinaturas conviveriam.
--   2. O `order by` passa a abrir com `via_rubrica_exata`, não com
--      `via_rubrica`. A rubrica contida perde o passe livre e compete por score,
--      onde qualquer dispositivo com duas pernas concordando a ultrapassa.
--
-- `via_rubrica_exata` NÃO sai no retorno: ela existe só para a ordenação. O tipo
-- de retorno fica idêntico, e é por isso que esta migration não toca uma linha
-- de TypeScript — `Achado`, o painel de fonte e `refina()` continuam vendo
-- `via_rubrica` como antes, que continua sendo "a rubrica alcançou este
-- dispositivo", verdade nos dois casos.
--
-- `create or replace` reescreve a função inteira porque o Postgres não sabe
-- substituir um CTE. O resto é idêntico a 0017.
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
         rd.peso,
         -- **A distinção que esta migration existe para fazer.** Igualdade é
         -- alguém digitando o nome do instituto; contido é alguém mencionando
         -- o termo de passagem, dentro de uma frase sobre outra coisa.
         (r.termo_norm = q.termo or q.termo = any (r.variantes_norm)) as exata
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
  -- `exata desc` primeiro: se a mesma rubrica casa das duas formas, vale a
  -- exata — o `distinct on` fica com a primeira linha de cada dispositivo.
  order by rd.dispositivo_id, exata desc, (rd.papel = 'principal') desc, rd.peso desc
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
         rb.exata,
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
    coalesce(case when rub.pos is not null
                  -- Metade do peso quando o termo só apareceu DENTRO da frase.
                  -- Derivado de `p_peso_rubrica` em vez de ser parâmetro novo:
                  -- parâmetro a mais cria uma SOBRECARGA da função em vez de
                  -- substituí-la, e duas assinaturas conviveriam com o
                  -- PostgREST escolhendo uma delas.
                  then (case when rub.exata then p_peso_rubrica else p_peso_rubrica / 2 end)
                       / (p_k + rub.pos) end, 0)
    + coalesce(case when lex.pos is not null then p_peso_lexical   / (p_k + lex.pos) end, 0)
    + coalesce(case when sem.pos is not null then p_peso_semantico / (p_k + sem.pos) end, 0)
      as score,
    rub.dispositivo_id is not null as via_rubrica,
    -- Não sai no retorno: serve só à ordenação, logo abaixo. Manter o tipo de
    -- retorno intacto é o que permite esta migration não tocar em uma linha de
    -- TypeScript.
    coalesce(rub.exata, false) as via_rubrica_exata,
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
  -- **Só a rubrica EXATA encabeça a lista.** Era `via_rubrica desc`, e isso
  -- punha qualquer match no topo independentemente do score — inclusive o
  -- contido, que é o termo aparecendo de passagem numa frase sobre outra coisa.
  -- A rubrica contida agora compete por score, com peso próprio, e é ultrapassada
  -- por qualquer dispositivo em que duas pernas concordaram.
  f.via_rubrica_exata desc,
  (f.papel = 'principal') desc nulls last,
  f.peso desc nulls last,
  f.score desc,
  v.id
limit greatest(p_qtd, 1);
$$;

comment on function public.busca_hibrida(
  text, extensions.vector, integer, text, integer, numeric, numeric, numeric
) is
  'Busca do corpus: rubrica + léxico + vetor, fundidos por RRF. A rubrica pesa '
  '3.0 quando a consulta É o termo e 1.5 quando o termo aparece dentro dela — '
  'e só a primeira forma encabeça a lista. Ver o cabeçalho da migration 0020.';


-- =============================================================================
-- Verificação pós-migration
--
--   -- a rubrica exata continua mandando:
--   select rotulo, round(score, 5), via_rubrica
--     from public.busca_hibrida('tráfico privilegiado') limit 3;
--
--   -- e a contida não sequestra mais a frase:
--   select rotulo, round(score, 5), via_rubrica from public.busca_hibrida(
--     'o réu confessou o tráfico, mas quero discutir a nulidade da entrada na '
--     'residência sem mandado') limit 5;
-- =============================================================================
