-- =============================================================================
-- 0022 — precedente do STJ não guarda id de artigo que não existe
--
-- Medido em 02/09/2026: **28 ids em 21 dos 72 temas** apontam para artigo que o
-- corpus não tem. São números do CPC lidos como se fossem da Lei de Drogas ou do
-- Código Penal — `lei_11343_2006_art1030`, `dl_2848_1940_art1036`,
-- `lei_11343_2006_art400`.
--
-- A causa está em `artigos_de`, no lado Python: ela recusa atribuir artigo
-- quando a frase NUMERA dois diplomas, e não recusa quando o segundo é apenas
-- NOMEADO — "art. 1.030 do CPC" numa tese que fala da Lei de Drogas. A recusa
-- está certa; o buraco é o "apenas nomeado".
--
-- **Por que o conserto mora aqui, e não no coletor.** A pendência registrava o
-- impasse: filtrar contra o corpus exigiria `data/normalizado/`, que é ignorado
-- pelo git e não existe no GitHub Actions, onde a coleta roda — e filtrar só
-- onde o arquivo existe faria o coletor se comportar diferente em dois
-- ambientes, que é pior que o ruído.
--
-- O impasse desaparece quando se muda de lugar. **A tabela `artigos` está no
-- banco**, e o banco é o mesmo em qualquer ambiente: ele sempre sabe o corpus.
-- O coletor continua gravando o que extraiu — ele não tem como saber —, e a
-- escrita recusa o que não resolve. É o mesmo desenho de `valida_ids_dispositivo`
-- (0001), que já faz isto pelos dispositivos: id de citação quebrado tem de
-- morrer na escrita, não aparecer na tela.
--
-- **Filtra, não rejeita a linha.** O tema entra igual; o que se perde é o
-- vínculo que não resolvia — e vínculo que não resolve é inerte na recuperação,
-- porque ele nunca cruza com dispositivo nenhum. Derrubar o tema inteiro por
-- causa de um id ruim descartaria a tese junto, que é o dado que importa.
-- =============================================================================

create or replace function public.filtra_artigos_do_precedente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.artigos_tocados is null or cardinality(new.artigos_tocados) = 0 then
    return new;
  end if;

  select coalesce(array_agg(a order by a), '{}')
    into new.artigos_tocados
    from unnest(new.artigos_tocados) as a
   where exists (select 1 from public.artigos x where x.id = a);

  return new;
end;
$$;

drop trigger if exists filtra_artigos on public.precedentes_stj;
create trigger filtra_artigos
  before insert or update of artigos_tocados on public.precedentes_stj
  for each row execute function public.filtra_artigos_do_precedente();

comment on function public.filtra_artigos_do_precedente is
  'Descarta de precedentes_stj.artigos_tocados o id de artigo que não existe em '
  '`artigos`. O coletor grava o que extraiu; o banco recusa o que não resolve. '
  'Ver o cabeçalho da migration 0022.';

-- Limpa o que já está gravado. O `update` dispara o trigger acima.
update public.precedentes_stj
   set artigos_tocados = artigos_tocados
 where exists (
   select 1 from unnest(artigos_tocados) as a
    where not exists (select 1 from public.artigos x where x.id = a)
 );

-- =============================================================================
-- Verificação pós-migration
--
--   select count(*) from public.precedentes_stj p,
--          unnest(p.artigos_tocados) as a(art)
--    where not exists (select 1 from public.artigos x where x.id = a.art);
--   -- tem de devolver 0
-- =============================================================================
