-- =============================================================================
-- 0025 — teto mensal dos embeddings de consulta
--
-- `/api/busca` é pública por decisão escrita, e a decisão continua de pé: ela lê
-- o mesmo corpus que a chave publishable já expõe sob RLS somente-leitura, e
-- devolver um 307 para `/login` a um `fetch()` de JSON produz erro
-- incompreensível no console. O que não acompanhou a decisão foi um freio.
--
-- `/api/consulta/aovivo` tem três (sessão, limite por IP e teto no banco).
-- `/api/busca` não tinha nenhum: nem rate limit, nem cache, nem cota. Cada GET
-- disparava uma chamada paga à OpenAI, com `cache: 'no-store'` e consulta aceita
-- até 400 caracteres.
--
-- --- por que o teto NÃO fecha a rota ------------------------------------------
--
-- Este é o ponto que decide o desenho. Um teto que devolve 429 numa rota PÚBLICA
-- entrega ao atacante a mesma vitória que ele queria: gastar 200 requisições e
-- deixar a busca fora do ar para o dono. Trocaria abuso de custo por abuso de
-- disponibilidade, que é pior.
--
-- Então o teto não governa a ROTA: governa a CHAMADA PAGA. Estourado, `embutir()`
-- devolve `vetor: null` com aviso, e a busca segue por rubrica e léxico — que é
-- exatamente a degradação que `lib/busca/consultar.ts` já previa para o dia em
-- que a OpenAI estivesse fora. A tela continua respondendo, com uma perna a
-- menos e dizendo que tem uma perna a menos.
--
-- --- o que este teto compra, e o que ele não compra ---------------------------
--
-- Compra um limite superior para a conta da OpenAI, que hoje não tem nenhum, e
-- que é compartilhada com `/api/consulta/aovivo` e com o `npm run embed`.
--
-- Não compra limite de VOLUME: a requisição continua custando uma execução de
-- função na Vercel e uma RPC no Supabase, e nenhum SQL alcança isso. Limitar
-- volume é trabalho da plataforma (firewall da Vercel), não deste arquivo — e
-- fingir o contrário seria a tela afirmando uma garantia que ela não tem.
--
-- O número é generoso de propósito. `text-embedding-3-small` custa fração de
-- centavo por milhão de tokens, então 20 mil embeddings por mês não é uma conta
-- que doa: é um teto onde antes não havia teto nenhum, e é isso que ele vale.
-- Para mudar: update public.uso_busca set teto = N where mes = date_trunc('month', now());
-- =============================================================================

create table if not exists public.uso_busca (
  mes      date    primary key,   -- primeiro dia do mês, como em uso_llm
  chamadas integer not null default 0,
  teto     integer not null default 20000,
  constraint uso_busca_mes_ck check (mes = date_trunc('month', mes)::date)
);

comment on table public.uso_busca is
  'Teto mensal de embeddings de consulta. Estourado, a busca degrada para rubrica '
  '+ léxico em vez de recusar — /api/busca é pública, e recusar entregaria ao '
  'atacante a negação de serviço que o teto existe para evitar.';


-- -----------------------------------------------------------------------------
-- A vaga se pede pela função, como em 0010 e pelo mesmo motivo: se a tabela
-- fosse escrita direto, a policy teria de permitir `update` a quem chama — e
-- "quem chama pode escrever no contador que o limita" é o contrário de um teto.
--
-- Ler e escrever na mesma instrução é o que torna o teto real sob concorrência.
-- Um `select` seguido de `update` deixaria duas requisições simultâneas lerem
-- 19.999 e gravarem 20.000 as duas.
-- -----------------------------------------------------------------------------
create or replace function public.consome_uso_busca()
returns table (permitido boolean, chamadas integer, teto integer)
language plpgsql
security definer
-- `search_path` fixo: sem isto, um schema no caminho do chamador poderia
-- sequestrar `uso_busca` numa função que roda com os privilégios do dono.
set search_path = public, pg_temp
as $$
declare
  m      date := date_trunc('month', now())::date;
  linha  public.uso_busca;
begin
  insert into public.uso_busca (mes) values (m) on conflict (mes) do nothing;

  update public.uso_busca u
     set chamadas = u.chamadas + 1
   where u.mes = m and u.chamadas < u.teto
  returning * into linha;

  if found then
    return query select true, linha.chamadas, linha.teto;
  else
    select * into linha from public.uso_busca where mes = m;
    return query select false, linha.chamadas, linha.teto;
  end if;
end;
$$;

comment on function public.consome_uso_busca() is
  'Reserva um embedding do teto mensal da busca. Devolve permitido=false quando o '
  'mês estourou — e aí a busca segue sem a perna semântica, não recusa. EXECUTE '
  'só para service_role, pela mesma razão de 0023.';

-- A tabela fica fechada; a vaga só se pede pela função.
alter table public.uso_busca enable row level security;
revoke all on public.uso_busca from anon, authenticated;

-- `public` primeiro: o padrão do Postgres concede EXECUTE de toda função a
-- PUBLIC, e revogar só dos dois papéis nomeados não tiraria nada de ninguém.
revoke execute on function public.consome_uso_busca() from public, anon, authenticated;
grant execute on function public.consome_uso_busca() to service_role;


-- =============================================================================
-- Verificação pós-migration (rodar avulso)
--
--   select * from public.consome_uso_busca();   -- permitido = t, chamadas = 1
--
--   -- o teto vale de verdade:
--   update public.uso_busca set teto = 1 where mes = date_trunc('month', now())::date;
--   select * from public.consome_uso_busca();   -- permitido = f
--   update public.uso_busca set teto = 20000 where mes = date_trunc('month', now())::date;
--
--   -- e ninguém de fora alcança:
--   select has_function_privilege('anon', 'public.consome_uso_busca()', 'execute');
--   -- esperado: f
-- =============================================================================
