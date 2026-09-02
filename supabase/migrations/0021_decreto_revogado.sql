-- =============================================================================
-- 0021 — o acervo passa a saber quando um decreto foi revogado por inteiro
--
-- **Isto responde uma pendência que existia desde que o acervo entrou.** A
-- migration 0018 diz, no cabeçalho: "se ela sinaliza revogação total do ato não
-- foi conferido — e carimbar 'em vigor' sem ter medido seria a decisão nº 3
-- mentindo numa tabela nova". Foi conferido em 02/09/2026, contra seis atos
-- reais: três revogados por inteiro, dois com um artigo revogado e um vivo.
--
-- **A fonte sinaliza.** Quando a revogação é total, ela serve uma página de um
-- bloco só — "(Revogado pelo Decreto 10832 de 06/08/2025)" —, sem súmula e sem
-- nenhum `Art.`.
--
-- **E a armadilha quase custou um dado errado.** A MESMA frase aparece dentro de
-- atos vivos, marcando um inciso que caiu: o Decreto 475/2023, que institui o
-- CONESD e é o mais citado deste acervo, traz "(Revogado pelo Decreto 7859 de
-- 06/11/2024)" em dois blocos. Procurar a palavra na página inteira marcaria
-- como revogado justamente ele. O que separa os dois casos é a FORMA da página,
-- não a frase — e é isso que `coletores/parana.py` lê, com teste para os dois.
--
-- **O que esta coluna NÃO é.** Ela não é vigência. `revogado_por` nulo quer
-- dizer "a fonte não trouxe nota de revogação total quando o coletor leu a
-- página", e não "está em vigor" — um decreto pode ter perdido objeto, sido
-- revogado por lei ou caducado sem que a página diga. Continua não existindo
-- coluna de vigência, pelo mesmo motivo de sempre: o acervo afirma o que leu.
-- =============================================================================

alter table public.decretos_pr add column if not exists revogado_por text;

comment on column public.decretos_pr.revogado_por is
  'Nota de revogação TOTAL, como a fonte a escreve. NULO não é "em vigor": é '
  '"a fonte não trouxe nota de revogação total na data da leitura". Ver o '
  'cabeçalho da migration 0021.';

create index if not exists decretos_pr_revogado_idx
  on public.decretos_pr (ano) where revogado_por is not null;

-- =============================================================================
-- Verificação pós-migration
--
--   select count(*) filter (where revogado_por is not null) as revogados,
--          count(*) as total from public.decretos_pr;
-- =============================================================================
