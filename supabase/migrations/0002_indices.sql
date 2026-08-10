-- =============================================================================
-- 0002_indices.sql — índices de busca e navegação
--
-- Rodar depois de 0001. Pode rodar antes ou depois do seed: com ~1.900
-- dispositivos, o custo de construção é irrelevante nos dois casos.
-- =============================================================================

-- --- lexical -----------------------------------------------------------------
create index if not exists dispositivos_busca_idx
  on public.dispositivos using gin (busca);

-- --- semântico ---------------------------------------------------------------
-- Cosseno: o texto_embed varia muito de comprimento (caput longo vs inciso
-- curto), então distância angular é mais estável que L2 aqui.
create index if not exists dispositivos_embedding_idx
  on public.dispositivos using hnsw (embedding extensions.vector_cosine_ops);

-- --- navegação ---------------------------------------------------------------
create index if not exists dispositivos_artigo_idx
  on public.dispositivos (artigo_id, ordem);

create index if not exists dispositivos_pai_idx
  on public.dispositivos (pai_id)
  where pai_id is not null;

create index if not exists dispositivos_lei_idx
  on public.dispositivos (lei_id)
  where not revogado;

create index if not exists artigos_numero_idx
  on public.artigos (lei_id, numero_base, numero_sufixo nulls first);

create index if not exists artigos_ordem_idx
  on public.artigos (lei_id, ordem);

-- --- rubricas ----------------------------------------------------------------
-- Match exato normalizado: o caminho quente da busca.
create unique index if not exists rubricas_termo_norm_uq
  on public.rubricas (termo_norm);

create index if not exists rubricas_variantes_norm_idx
  on public.rubricas using gin (variantes_norm);

create index if not exists rubricas_busca_idx
  on public.rubricas using gin (busca);

-- Trigram: tolera erro de digitação ("tráfico priviligiado"). Ainda não é
-- usado pela RPC — é a base do "você quis dizer" do incremento 3.
create index if not exists rubricas_termo_trgm_idx
  on public.rubricas using gin (termo_norm extensions.gin_trgm_ops);

create index if not exists rubrica_disp_dispositivo_idx
  on public.rubrica_dispositivos (dispositivo_id);

-- --- peça --------------------------------------------------------------------
create index if not exists teses_ordem_idx
  on public.teses (ordem)
  where ativo;

create index if not exists argumentacao_revisada_idx
  on public.argumentacao (caso_id)
  where revisado_em is not null;
