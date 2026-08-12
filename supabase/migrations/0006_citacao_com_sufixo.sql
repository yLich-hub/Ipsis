-- =============================================================================
-- 0006 — o validador de citação passa a enxergar artigo com sufixo de letra
--
-- `valida_citacoes` casava `\{\{cite:([a-z0-9_]+)\}\}`. Sem o hífen no conjunto,
-- todo marcador de artigo sufixado era invisível para o trigger:
--
--   {{cite:dl_3689_1941_art396-a_caput}}   art. 396-A do CPP — a peça inteira
--   {{cite:dl_3689_1941_art3-a_caput}}     estrutura acusatória
--   {{cite:lei_11343_2006_art23-a_caput}}
--
-- Invisível não é inofensivo: o trigger não recusava a citação quebrada, ele
-- deixava de vê-la. Uma tese apontando para `art396-z_caput`, que não existe,
-- entrava no banco sem erro — e a decisão nº 1 ("citação quebrada é erro de
-- compilação") tinha um buraco exatamente na classe de artigo que este projeto
-- mais cita.
--
-- O defeito só se tornou alcançável quando o CPP entrou no corpus e as teses de
-- rito passaram a citar o art. 396-A. Antes disso nenhuma tese citava artigo
-- sufixado, e o buraco era teórico.
--
-- `tests/citacao.test.ts` tem o mesmo padrão, corrigido junto: as duas camadas
-- precisam concordar, senão a que roda antes do build deixa de proteger a outra.
-- =============================================================================

create or replace function public.valida_citacoes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  coluna text := tg_argv[0];
  corpo  text;
  falta  text[];
begin
  select to_jsonb(new) ->> coluna into corpo;
  if corpo is null then return new; end if;

  select array_agg(distinct m[1] order by m[1]) into falta
  from regexp_matches(corpo, '\{\{cite:([a-z0-9_-]+)\}\}', 'g') as m
  where not exists (select 1 from public.dispositivos d where d.id = m[1]);

  if falta is not null then
    raise exception '%.% contém {{cite:}} para dispositivos inexistentes: %',
      tg_table_name, coluna, falta
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;
