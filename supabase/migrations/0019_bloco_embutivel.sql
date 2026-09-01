-- =============================================================================
-- 0019 — nem todo bloco de decreto merece um vetor
--
-- **Isto é uma conta de espaço, e ela foi medida.** Em 01/09/2026 o Supabase
-- avisou que o projeto passava de 500 MB no plano gratuito. A varredura por
-- tabela achou a causa numa linha:
--
--   decretos_pr_blocos   703 MB   (60 MB de dados, 261 MB de índice)
--   dispositivos         102 MB   ← o corpus federal inteiro
--   todo o resto           9 MB
--
-- São 85% do banco numa tabela só. O que pesa não é o texto: são 30.779 vetores
-- de 1536 dimensões — ~382 MB fora da linha, mais 245 MB só do índice HNSW.
--
-- **Passar do teto não é aviso: é escrita bloqueada.** E escrita bloqueada
-- derruba conversa, cliente e a vigília — o produto continuaria lendo e pararia
-- de registrar. Num portfólio, que é um link clicado semanas depois, é o pior
-- momento possível para acontecer.
--
-- --- o corte, e por que ele não perde recuperação -----------------------------
--
-- Dos 30.779 blocos, **16.114 têm menos de 150 caracteres** — a média é 208.
-- São incisos de uma linha ("I - advertência sobre os efeitos das drogas"),
-- alíneas, e o fecho do ato ("Curitiba, em 31 de janeiro de 2025").
--
-- Um fragmento desses não sustenta resposta: é o mesmo argumento que
-- `dispositivos.texto_embed` já faz no corpus federal — um "§ 4º Nos delitos
-- definidos no caput…" isolado gera vetor inútil. A diferença é que lá a saída
-- foi dar CONTEXTO ao vetor; aqui, para um inciso de seis palavras, nem o
-- contexto salva: o que ele acrescenta ao vetor do ato é ruído.
--
-- **E eles continuam alcançáveis.** A perna lexical lê `busca`, que existe em
-- todo bloco, e a perna de súmula é do ATO — as duas encontram um inciso curto
-- sem que ele tenha vetor próprio. O que se perde é a busca semântica sobre o
-- fragmento isolado, que é justamente onde ela vale menos.
--
-- --- por que uma coluna anulável, e não um filtro na consulta ------------------
--
-- O filtro poderia morar em `scripts/embed.ts` (`where length(texto) >= 150`) e
-- não custaria migration nenhuma. Mas aí a regra ficaria escondida numa
-- consulta, e o banco não saberia dizer quais blocos ele decidiu não embutir —
-- alguém olhando `embedding is null` leria "faltou rodar o embed", que é outra
-- coisa. Com `texto_embed` anulável, o banco diz: nulo é "não se embute", e o
-- `embed.ts` simplesmente não os enxerga.
-- =============================================================================

alter table public.decretos_pr_blocos alter column texto_embed drop not null;
alter table public.decretos_pr_blocos alter column texto_hash  drop not null;

comment on column public.decretos_pr_blocos.texto_embed is
  'O que vai para o vetor. NULO é decisão, não pendência: o bloco é curto '
  'demais para sustentar recuperação semântica sozinho e continua alcançável '
  'pela perna lexical e pela súmula do ato. Ver o cabeçalho da migration 0019.';


-- =============================================================================
-- Verificação pós-migration
--
--   -- quantos deixam de ter vetor, e quanto isso libera:
--   select count(*) filter (where texto_embed is null) as sem_vetor,
--          count(*) as total
--     from public.decretos_pr_blocos;
--
--   -- o espaço só volta ao disco depois de reescrever a tabela:
--   vacuum full public.decretos_pr_blocos;
-- =============================================================================
