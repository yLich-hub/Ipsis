-- =============================================================================
-- 0018 — acervo de decretos estaduais do Paraná
--
-- Decretos do Executivo do Paraná, 2022–2026, colhidos de
-- `legislacao.pr.gov.br` por `coletores/parana.py` na versão **compilada** do
-- texto. O levantamento inteiro, com os números que decidiram o recorte, está
-- em `docs/decretos-pr-levantamento.md`.
--
-- **Por que estas tabelas existem separadas, e por que NÃO são `dispositivos`.**
-- É a mesma separação de `precedentes_stj` (0014) e do acervo Vade Mecum, e
-- aqui ela é ainda mais direta: `dispositivos.id` é a chave de citação da peça,
-- e toda citação da minuta resolve para lá. Decreto do Executivo estadual não é
-- fundamento de resposta à acusação por tráfico — não revoga lei federal, não
-- tipifica crime e não altera pena. Se um decreto pudesse virar `{{cite:}}` por
-- descuido de modelagem, `tests/citacao.test.ts`, os triggers de 0001 e
-- `montarPeca` estariam guardando um universo que passou a incluir norma
-- administrativa estadual.
--
-- O id vive em espaço próprio — `decpr:2025:8812` — que nunca casa o padrão do
-- corpus (`lei_11343_2006_art33_p4`). A separação é estrutural, não uma regra
-- que alguém precise lembrar de aplicar.
--
-- **`conferido_em` é o que esta tabela pode afirmar, e `vigente` é o que ela
-- NÃO pode.** A fonte serve o texto compilado e risca o que foi alterado, mas
-- se ela sinaliza revogação total do ato não foi conferido — nenhum decreto
-- sabidamente revogado foi aberto na medição de 21/08/2026. Enquanto isso não
-- for medido, não existe coluna dizendo "em vigor", e a tela diz "redação
-- compilada, lida em DD/MM/AAAA". Inventar a coluna seria a decisão nº 3 do
-- projeto perdida numa tabela nova.
-- =============================================================================

-- --- o ato -------------------------------------------------------------------

create table if not exists public.decretos_pr (
  -- `decpr:<ano>:<numero>`. Número e ano, não o `codAto` interno da fonte: são
  -- eles que identificam o decreto para quem o cita, e sobrevivem a uma
  -- renumeração do banco de lá.
  id            text        primary key,

  numero        text        not null,
  ano           integer     not null,

  -- Como a fonte imprime: "Decreto 8812 - 31 de Janeiro de 2025".
  epigrafe      text        not null,

  -- **A súmula é a camada de apelido deste acervo.** Decreto não tem rubrica
  -- marginal, e ninguém procura decreto pelo número: procura por
  -- "regulamento do ICMS" ou "conselho estadual de políticas sobre drogas".
  -- É o papel que `rubricas` faz no corpus, e por isso ela tem peso próprio na
  -- fusão de `busca_decretos`, abaixo.
  sumula        text        not null,

  -- "O GOVERNADOR DO ESTADO DO PARANÁ… DECRETA:". Fica fora dos blocos de
  -- propósito: é fórmula de promulgação, não dispositivo, e recuperá-la como
  -- se fosse norma encheria a busca de preâmbulo idêntico.
  preambulo     text        not null default '',

  publicado_em  date        not null,
  diario        text,

  cod_ato       text        not null,
  url           text        not null,

  -- Qual das três visualizações da fonte foi lida: `compilado`, `alterado` ou
  -- `original`. Sempre a primeira, hoje. A coluna existe para o dia em que isso
  -- deixar de ser verdade não haver um acervo em que a versão simplesmente não
  -- estava escrita.
  versao        text        not null default 'compilado',

  -- Quando o coletor leu esta página. Análogo de `artigos.conferido_em`, e a
  -- única afirmação de atualidade que este acervo faz. Ver o cabeçalho.
  conferido_em  date        not null,

  coletado_em   timestamptz not null default now(),

  constraint decretos_pr_id_ck     check (id ~ '^decpr:[0-9]{4}:[0-9A-Za-z.-]+$'),
  constraint decretos_pr_versao_ck check (versao in ('compilado', 'alterado', 'original')),
  constraint decretos_pr_ano_ck    check (ano between 1900 and 2200)
);

-- --- os dispositivos do ato --------------------------------------------------

create table if not exists public.decretos_pr_blocos (
  -- `decpr:2025:8812:3` — o ato mais a ordem no documento.
  id           text    primary key,

  decreto_id   text    not null references public.decretos_pr (id) on delete cascade,
  ordem        integer not null,

  -- "Art. 1º", "§ 2º", "I". Vazio no fecho e na assinatura, que são parte do
  -- ato publicado e não têm rótulo na fonte.
  rotulo       text    not null default '',
  texto        text    not null,

  -- O que vai para o vetor: epígrafe + súmula + rótulo + texto. Um "§ 2º Para
  -- os fins deste Decreto…" isolado gera vetor inútil — é o mesmo argumento de
  -- `dispositivos.texto_embed`, e a mesma razão de o embedding ser por bloco e
  -- o contexto vir do ato inteiro.
  texto_embed  text    not null,
  texto_hash   text    not null,
  embedding    extensions.vector(1536),

  busca tsvector generated always as (
      setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(rotulo, '')), 'B')
   || setweight(to_tsvector('public.pt_unaccent'::regconfig, texto),                'C')
  ) stored,

  constraint decretos_pr_blocos_ordem_ck check (ordem > 0),
  unique (decreto_id, ordem)
);

-- --- índices -----------------------------------------------------------------

-- A busca do ato pela súmula é a perna de maior peso; ela vai por GIN sobre um
-- índice de expressão, e não por coluna gerada, porque a súmula é do ATO e a
-- fusão precisa dela junto dos blocos.
create index if not exists decretos_pr_sumula_idx
  on public.decretos_pr using gin (
    to_tsvector('public.pt_unaccent'::regconfig, epigrafe || ' ' || sumula)
  );

create index if not exists decretos_pr_ano_idx on public.decretos_pr (ano, publicado_em desc);

create index if not exists decretos_pr_blocos_busca_idx
  on public.decretos_pr_blocos using gin (busca);

-- HNSW, como `dispositivos_embedding_idx`: mesma escolha, mesmo motivo.
create index if not exists decretos_pr_blocos_embedding_idx
  on public.decretos_pr_blocos using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists decretos_pr_blocos_decreto_idx
  on public.decretos_pr_blocos (decreto_id, ordem);

comment on table public.decretos_pr is
  'Decretos do Executivo do Paraná (fonte: legislacao.pr.gov.br, texto '
  'compilado). Fonte de LEITURA e de consulta: nenhum decreto vira fundamento '
  'de peça. Ver o cabeçalho da migration 0018.';

comment on column public.decretos_pr.conferido_em is
  'Data em que o coletor leu a página. NÃO é afirmação de vigência — a fonte '
  'não foi conferida quanto a revogação total do ato.';


-- --- RLS ---------------------------------------------------------------------
-- Leitura pública, como o corpus e os precedentes: ato normativo publicado em
-- Diário Oficial é domínio público (art. 8º, I da Lei 9.610/1998). Escrita só
-- pelo service role, que roda no seed.
alter table public.decretos_pr        enable row level security;
alter table public.decretos_pr_blocos enable row level security;

revoke insert, update, delete on public.decretos_pr        from anon, authenticated;
revoke insert, update, delete on public.decretos_pr_blocos from anon, authenticated;

drop policy if exists leitura_publica on public.decretos_pr;
create policy leitura_publica on public.decretos_pr
  for select to anon, authenticated using (true);

drop policy if exists leitura_publica on public.decretos_pr_blocos;
create policy leitura_publica on public.decretos_pr_blocos
  for select to anon, authenticated using (true);


-- =============================================================================
-- busca_decretos — a fusão do acervo estadual
--
-- **RPC própria, e não uma quarta perna em `busca_hibrida`.** Os dois corpora
-- não se misturam numa fusão só por uma razão aritmética: o piso de contexto de
-- `filtraContexto` é derivado de `p_k` e dos pesos das três pernas atuais, e
-- mexer nisso reabre a classe de erro que 0017 acabou de fechar. São duas
-- chamadas de rede, independentes, que o runtime faz em `Promise.all` — a
-- latência é a maior das duas, não a soma.
--
-- Três pernas, com a lição de 0017 aplicada desde a primeira linha: **cada uma
-- calcula a própria posição dentro do próprio CTE.** Nenhuma janela enxerga
-- linha de outra perna, e a assimetria que custou o peso da rubrica não tem
-- como nascer aqui.
--
--   1. súmula   — `ts_rank_cd` sobre epígrafe + súmula do ATO, peso 2.0
--   2. lexical  — `ts_rank_cd` sobre o texto do BLOCO, peso 1.0
--   3. semântica — `<=>` sobre o embedding do bloco, peso 1.0
--
-- **Por que a súmula pesa 2.0 e não 3.0 como a rubrica do corpus.** A rubrica
-- casa por igualdade exata de um termo curado à mão: quando bate, bateu. A
-- súmula casa por `ts_rank_cd`, que é aproximação — dar-lhe peso dominante faria
-- qualquer palavra em comum com a ementa de um decreto encabeçar o resultado.
-- 2.0 a põe acima das outras duas sem lhe dar a última palavra.
-- =============================================================================

create or replace function public.busca_decretos(
  p_consulta        text,
  p_embedding       extensions.vector(1536) default null,
  p_qtd             integer default 12,
  p_ano             integer default null,
  p_k               integer default 60,
  p_peso_sumula     numeric default 2.0,
  p_peso_lexical    numeric default 1.0,
  p_peso_semantico  numeric default 1.0
)
returns table (
  bloco_id     text,
  decreto_id   text,
  numero       text,
  ano          integer,
  epigrafe     text,
  sumula       text,
  publicado_em date,
  conferido_em date,
  versao       text,
  url          text,
  ordem        integer,
  rotulo       text,
  texto        text,
  score        numeric,
  via_sumula   boolean
)
language sql
stable
parallel safe
set search_path = public, extensions
as $$
with q as (
  select websearch_to_tsquery('public.pt_unaccent'::regconfig, p_consulta) as tsq
),

-- 1) súmula — o "apelido" do decreto. Um acerto aqui traz o CAPUT do ato, que
-- é o bloco de ordem 1: quem procurou "regulamento do ICMS" quer começar a
-- leitura no começo, não no § 3º do art. 14.
sum_bruta as (
  select distinct on (d.id)
         b.id as bloco_id,
         ts_rank_cd(
           to_tsvector('public.pt_unaccent'::regconfig, d.epigrafe || ' ' || d.sumula),
           q.tsq
         ) as rank
  from public.decretos_pr d
  join public.decretos_pr_blocos b on b.decreto_id = d.id
  cross join q
  where q.tsq is not null
    and to_tsvector('public.pt_unaccent'::regconfig, d.epigrafe || ' ' || d.sumula) @@ q.tsq
    and (p_ano is null or d.ano = p_ano)
  order by d.id, b.ordem
  limit 200
),

sumu as (
  select bloco_id,
         row_number() over (order by rank desc, bloco_id) as pos
  from sum_bruta
),

-- 2) lexical — o texto do bloco
lex as (
  select b.id as bloco_id,
         row_number() over (order by ts_rank_cd(b.busca, q.tsq) desc, b.id) as pos
  from public.decretos_pr_blocos b
  join public.decretos_pr d on d.id = b.decreto_id
  cross join q
  where q.tsq is not null
    and b.busca @@ q.tsq
    and (p_ano is null or d.ano = p_ano)
  limit 200
),

-- 3) semântica
sem as (
  select b.id as bloco_id,
         row_number() over (order by b.embedding <=> p_embedding) as pos
  from public.decretos_pr_blocos b
  join public.decretos_pr d on d.id = b.decreto_id
  where p_embedding is not null
    and b.embedding is not null
    and (p_ano is null or d.ano = p_ano)
  order by b.embedding <=> p_embedding
  limit 200
),

fusao as (
  select
    coalesce(sumu.bloco_id, lex.bloco_id, sem.bloco_id) as bloco_id,
    coalesce(case when sumu.pos is not null then p_peso_sumula    / (p_k + sumu.pos) end, 0)
    + coalesce(case when lex.pos  is not null then p_peso_lexical   / (p_k + lex.pos)  end, 0)
    + coalesce(case when sem.pos  is not null then p_peso_semantico / (p_k + sem.pos)  end, 0)
      as score,
    sumu.bloco_id is not null as via_sumula
  from sumu
  full outer join lex on lex.bloco_id = sumu.bloco_id
  full outer join sem on sem.bloco_id = coalesce(sumu.bloco_id, lex.bloco_id)
)

select
  b.id,
  d.id,
  d.numero,
  d.ano,
  d.epigrafe,
  d.sumula,
  d.publicado_em,
  d.conferido_em,
  d.versao,
  d.url,
  b.ordem,
  b.rotulo,
  b.texto,
  round(f.score, 6),
  f.via_sumula
from fusao f
join public.decretos_pr_blocos b on b.id = f.bloco_id
join public.decretos_pr d        on d.id = b.decreto_id
order by f.via_sumula desc, f.score desc, d.publicado_em desc, b.ordem
limit greatest(p_qtd, 1)
$$;

comment on function public.busca_decretos is
  'Busca do acervo de decretos do Paraná: súmula (2.0) + léxico (1.0) + vetor '
  '(1.0), fundidos por RRF. Separada de busca_hibrida de propósito — ver o '
  'cabeçalho da migration 0018.';


-- =============================================================================
-- Verificação pós-migration
--
--   select ano, count(*) from public.decretos_pr group by 1 order by 1;
--   select count(*) from public.decretos_pr_blocos where embedding is null;
--
--   -- a consulta que motivou o acervo entrar no recorte deste projeto:
--   select numero, ano, left(sumula, 70), score
--     from public.busca_decretos('conselho estadual de políticas sobre drogas');
-- =============================================================================
