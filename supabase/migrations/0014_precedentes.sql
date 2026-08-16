-- =============================================================================
-- 0014 — precedentes qualificados do STJ
--
-- Temas repetitivos, IACs e controvérsias do Sistema de Gestão de Precedentes
-- do STJ, do Portal de Dados Abertos, licença Creative Commons Atribuição.
--
-- **Por que esta tabela existe separada, e por que ela NÃO é `dispositivos`.**
-- Precedente não é lei. Ele interpreta a lei, e a interpretação muda: dos 61
-- temas que tocam o recorte, oito estão CANCELADOS. Se um tema pudesse virar
-- fundamento de peça pelo mesmo caminho de um dispositivo, a decisão nº 1 do
-- projeto — toda citação resolve para um `dispositivos.id` conferido — deixaria
-- de valer, porque o que se estaria citando não é texto legal conferido, é
-- entendimento que pode ter morrido.
--
-- É a mesma separação do acervo Vade Mecum: fonte de leitura, não de peça.
--
-- **`situacao` é o que torna esta tabela aceitável neste projeto.** As ementas
-- do STJ também são abertas e há muito mais delas, mas o dump de ementas não
-- traz nenhum campo de vigência — medido em 14/08/2026, `tema` vem vazio em
-- 3.326 de 3.326 registros. Indexá-las seria construir, ao lado de um corpus
-- auditado e datado, uma base que não sabe dizer se o que mostra ainda vale.
-- O dataset de temas sabe: tem `situacao`, `entendimento_anterior` e o
-- histórico de mudança. É o análogo honesto de `leis.vigencia_ate`.
-- =============================================================================

create table if not exists public.precedentes_stj (
  -- `stj:<sequencialPrecedente>`. O sequencial é a chave do banco do STJ e
  -- sobrevive a republicação do arquivo; tipo e número, não — um tema pode ser
  -- renumerado ao mudar de natureza jurídica.
  id                text        primary key,

  tipo              text        not null,   -- 'Tema Repetitivo', 'IAC', 'Controvérsia'…
  numero            text        not null,
  situacao          text        not null,

  -- O que se cita. Vazio é comum e legítimo: tema afetado ainda não tem tese.
  tese_firmada      text,
  questao           text,
  -- Preenchido quando o STJ registra que mudou de posição. É o campo que impede
  -- a tela de mostrar entendimento superado como se fosse o atual.
  entendimento_anterior text,
  -- O log de mudança de situação, como o STJ o escreve:
  -- "Situação alterada de pendente para cancelada em: 18/8/2021."
  historico         text,

  ref_legislativa   text,
  ref_sumular       text,
  sumula_originada  text,

  julgado_em        date,
  publicado_em      date,
  afetado_em        date,

  -- Por que este tema entrou: o recorte de drogas ou a parte geral do CP.
  -- Fica na linha, e não só na curadoria, para a tela poder separar os dois sem
  -- reabrir o YAML — e para uma mudança no filtro aparecer no diff dos dados.
  escopo            text        not null,

  -- Ids de artigo do corpus que o texto do tema nomeia, quando dá para
  -- atribuir. Mesma extração da vigília (`artigos_de`), com as mesmas travas:
  -- mais de um diploma numerado na frase e nada é atribuído. Sem FK — o tema
  -- pode citar artigo que o corpus não tem.
  artigos_tocados   text[]      not null default '{}',

  coletado_em       timestamptz not null default now(),

  constraint precedentes_escopo_ck check (escopo in ('drogas', 'parte_geral')),
  constraint precedentes_tipo_ck   check (length(btrim(tipo)) between 1 and 60)
);

-- A tela lista por situação e por escopo; o cruzamento com as teses usa o array.
create index if not exists precedentes_situacao_idx on public.precedentes_stj (situacao, escopo);
create index if not exists precedentes_artigos_idx  on public.precedentes_stj using gin (artigos_tocados);

comment on table public.precedentes_stj is
  'Precedentes qualificados do STJ (dados abertos, CC-BY). Fonte de LEITURA: '
  'nenhum tema vira fundamento de peça. Ver o cabeçalho da migration 0014.';

comment on column public.precedentes_stj.situacao is
  'Vocabulário do STJ: Trânsito em Julgado, Cancelada, Sobrestado, Afetado… '
  'É o que separa entendimento vivo de entendimento morto, e o motivo de esta '
  'tabela existir em vez de uma de ementas.';


-- --- RLS ---------------------------------------------------------------------
-- Leitura pública, como o corpus: é decisão judicial publicada, sob CC-BY.
-- Escrita só pelo service role, que roda no coletor.
alter table public.precedentes_stj enable row level security;

revoke insert, update, delete on public.precedentes_stj from anon, authenticated;

drop policy if exists leitura_publica on public.precedentes_stj;
create policy leitura_publica on public.precedentes_stj
  for select to anon, authenticated using (true);


-- =============================================================================
-- Verificação pós-migration
--
--   select situacao, escopo, count(*) from public.precedentes_stj
--    group by 1, 2 order by 3 desc;
--
--   -- os que pedem cuidado:
--   select numero, situacao, left(tese_firmada, 80) from public.precedentes_stj
--    where situacao in ('Cancelada', 'Cancelado', 'Sobrestado');
-- =============================================================================
