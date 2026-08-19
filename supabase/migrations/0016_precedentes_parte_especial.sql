-- =============================================================================
-- Um terceiro escopo para os precedentes: a parte especial do Código Penal
--
-- 0014 fechou `escopo` em ('drogas', 'parte_geral'), e estava certo na época: o
-- recorte era tráfico, e a parte geral entrava por valer para qualquer defesa.
--
-- Depois disso, dois institutos da parte especial entraram no projeto por pedido
-- explícito — roubo majorado com concurso de agentes (art. 157) e a presunção de
-- vulnerabilidade do art. 217-A. Eles ganharam rubrica curada, caso e tese; o
-- que faltava era a camada de como o STJ os lê. Um tema sobre a perícia da arma
-- para a majorante do § 2º serve exatamente ao caso de roubo que já está em
-- `casos.yaml`.
--
-- **Isto não abre a parte especial inteira.** Quem decide quais artigos entram é
-- `parte_especial_cp`, em `data/curadoria/precedentes.yaml`, e a lista é fechada
-- pelo mesmo argumento da parte geral: aceitar qualquer artigo traria homicídio,
-- estelionato e receptação, que nenhuma tese deste projeto alcança. O banco só
-- precisa deixar de recusar o valor.
--
-- Aditiva e idempotente, como as outras: derruba o check antigo se ele existir e
-- recria com o terceiro valor.
-- =============================================================================

alter table public.precedentes_stj
  drop constraint if exists precedentes_escopo_ck;

alter table public.precedentes_stj
  add constraint precedentes_escopo_ck
  check (escopo in ('drogas', 'parte_geral', 'parte_especial'));
