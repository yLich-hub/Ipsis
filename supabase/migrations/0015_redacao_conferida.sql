-- =============================================================================
-- 0015_redacao_conferida.sql — a procedência deixa de ser só da lei
--
-- **O que mudou no mundo.** O corpus é a fotografia do Vade Mecum de 28/02/2025,
-- e `leis.vigencia_ate` respondia por todo dispositivo do banco. A vigília do
-- Planalto mostrou 63 alterações posteriores a essa data — duas na Lei de Drogas
-- —, e `data/curadoria/redacoes.yaml` alinhou 45 artigos ao texto compilado.
--
-- A partir daí a data da lei é falsa nos dois sentidos: ela subestima os artigos
-- conferidos (que estão em agosto de 2026, não em fevereiro de 2025) e continua
-- correta para os outros 1.293. Uma data só não consegue mais dizer a verdade,
-- e a decisão nº 3 do projeto é justamente que a data esteja visível e certa.
--
-- Daí duas colunas em `artigos`, ao lado do `conferido_em` que já existia:
--
--   alterado_por    quais leis posteriores mexeram neste artigo
--   fonte_redacao   contra que endereço a conferência foi feita
--
-- **O que NÃO muda:** nada aqui é escrito em runtime. A vigília continua só
-- avisando (ver o cabeçalho de 0012); quem escreve é o seed, a partir de
-- curadoria versionada e revisada em diff. A diferença entre as duas coisas é a
-- decisão nº 1 inteira.
--
-- Idempotente, como as outras.
-- =============================================================================

alter table public.artigos
  add column if not exists alterado_por  text[] not null default '{}',
  add column if not exists fonte_redacao text;

comment on column public.artigos.conferido_em is
  'Data em que a redação deste artigo foi conferida contra o texto oficial. '
  'Nula = o artigo está na redação da fotografia, e quem responde é leis.vigencia_ate.';
comment on column public.artigos.alterado_por is
  'Leis posteriores à data de corte que alteraram este artigo — exibido ao lado dele.';
comment on column public.artigos.fonte_redacao is
  'Endereço do texto compilado contra o qual a conferência foi feita.';

-- Conferido sem dizer contra o quê é carimbo sem procedência, que é exatamente o
-- tipo de garantia vazia que este projeto recusa. As duas andam juntas.
alter table public.artigos drop constraint if exists artigos_conferencia_ck;
alter table public.artigos add constraint artigos_conferencia_ck
  check (fonte_redacao is null or conferido_em is not null);


-- -----------------------------------------------------------------------------
-- v_dispositivo — a procedência do artigo passa a viajar com o dispositivo
--
-- A view é o que a tela do dispositivo e a montagem da peça leem. Sem estas duas
-- colunas aqui, o painel de procedência mostraria a data da lei num artigo cuja
-- redação é de outra data — e o rodapé do .docx transcreveria o texto novo com o
-- carimbo antigo.
--
-- `create or replace view` não aceita mudança na LISTA de colunas quando a
-- ordem muda; as novas entram no fim, que é o que permite o replace.
-- -----------------------------------------------------------------------------
create or replace view public.v_dispositivo as
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
  l.cobertura_nota,
  a.alterado_por  as artigo_alterado_por,
  a.fonte_redacao as artigo_fonte_redacao
from public.dispositivos d
join public.artigos a on a.id = d.artigo_id
join public.leis    l on l.id = d.lei_id;
