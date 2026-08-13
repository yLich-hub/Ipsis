-- =============================================================================
-- 0010 — o teto mensal do caminho "gerar ao vivo"
--
-- `uso_llm` existe desde 0001 e nunca foi usada: o CLAUDE.md prometia um botão
-- opcional de geração ao vivo, limitado por teto mensal, que nunca foi
-- implementado. Esta migration é o que faz o teto existir de verdade.
--
-- **Por que uma função e não um `update` do app.** A rota roda com a chave
-- publishable, sujeita a RLS. Se a tabela fosse escrita direto, a policy teria
-- de permitir `update` a qualquer sessão — e "qualquer sessão pode escrever no
-- contador que limita o gasto" é o contrário de um teto. A função é
-- `security definer`: o app não enxerga a tabela, só consegue pedir uma vaga.
--
-- **Ler e escrever na mesma instrução** é o que torna o teto real sob
-- concorrência. Um `select` seguido de `update` deixaria duas requisições
-- simultâneas lerem 199 e gravarem 200 as duas. O `update ... where chamadas <
-- teto` decide e escreve de uma vez; quem perder a corrida não encontra linha e
-- recebe `permitido = false`.
-- =============================================================================

create or replace function public.consome_uso_llm()
returns table (permitido boolean, chamadas integer, teto integer)
language plpgsql
security definer
-- `search_path` fixo: sem isto, um schema no caminho do chamador poderia
-- sequestrar `uso_llm` numa função que roda com os privilégios do dono.
set search_path = public, pg_temp
as $$
declare
  m      date := date_trunc('month', now())::date;
  linha  public.uso_llm;
begin
  insert into public.uso_llm (mes) values (m) on conflict (mes) do nothing;

  update public.uso_llm u
     set chamadas = u.chamadas + 1
   where u.mes = m and u.chamadas < u.teto
  returning * into linha;

  if found then
    return query select true, linha.chamadas, linha.teto;
  else
    select * into linha from public.uso_llm where mes = m;
    return query select false, linha.chamadas, linha.teto;
  end if;
end;
$$;

comment on function public.consome_uso_llm() is
  'Reserva uma chamada do teto mensal de geração ao vivo. Devolve permitido=false '
  'quando o mês já estourou. Decide e escreve na mesma instrução, para o teto '
  'valer sob concorrência.';

-- A tabela fica fechada; a vaga só se pede pela função.
alter table public.uso_llm enable row level security;

revoke all on public.uso_llm from anon, authenticated;
grant execute on function public.consome_uso_llm() to anon, authenticated;
