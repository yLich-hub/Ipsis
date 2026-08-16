# Segurança e compliance

Usuário único, autenticado por e-mail e senha sobre o Supabase Auth. Sem OAuth,
sem papéis, sem convite, sem perfil.

A proteção é **por exclusão**: `src/lib/auth/rotas.ts` lista o que é público e o
`matcher` do middleware exige sessão em todo o resto — de modo que rota nova
nasce fechada, que é o lado certo para errar. `(app)/layout.tsx` repete o
`redirect` como rede de segurança, para o dia em que o matcher deixar de casar
algo.

E a decisão de acesso é **sempre** por `getUser()`, nunca por `getSession()`.
`getSession()` lê o cookie sem validar assinatura, e cookie é território do
cliente; `getUser()` valida o JWT no servidor de Auth.

> Este documento já partiu da premissa oposta — "o app é público e não existe
> usuário confiável". A autenticação entrou depois, e o que ela mudou não foi
> relaxar controle nenhum: foi permitir que a rota de geração exista sem ser
> superfície de gasto anônima. Tudo que era invariante do banco continua sendo.

---

## 1. Segredos

| Variável | Onde vive | Vaza no bundle? | Por quê |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | sim, por design | endpoint público |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | sim, por design | sujeita a RLS |
| `DATABASE_URL` | só `scripts/`, máquina local | **não** | conexão direta, papel `postgres` |
| `OPENAI_API_KEY` | só server | **não** | embedding da consulta e redação da resposta |
| `SUPABASE_SERVICE_ROLE_KEY` | server; `scripts/` e **um** arquivo de `src/` | **não** | ignora RLS |
| `CRON_SECRET` | só server | **não** | a única porta da rota de coleta |

A regra que não se negocia: **nada sensível com prefixo `NEXT_PUBLIC_`**. A
service role ignora RLS — vazá-la no bundle do cliente abre o banco para
escrita. É a ausência do prefixo que faz o Next recusá-la no cliente em vez de
embuti-la.

`src/lib/supabase.ts` continua conhecendo só a chave publishable.

**A service role passou a ter um ponto de uso em `src/`**, e é um só:
`src/lib/vigilia/escrita.ts`, chamado pela rota de cron. A coleta grava numa
tabela com RLS fechada e não tem sessão para ancorar policy. As duas
alternativas foram recusadas e estão escritas no cabeçalho daquele arquivo —
policy de insert para `anon` daria a qualquer visitante o direito de escrever na
vigília, e `security definer` com o segredo em argumento poria o segredo no log
de consulta do Supabase.

### A senha não passa pelo projeto

`signUp` e `signInWithPassword` entregam a credencial ao servidor de Auth, que
guarda o hash em `auth.users` — schema que a chave publishable não enxerga.
Nenhuma tabela em `supabase/migrations/` tem coluna de senha, e nenhum código em
`src/` calcula hash, emite JWT ou gera token de recuperação. **Não escrever nada
disso.**

A sessão vive em **cookie**, não em `localStorage`: é `@supabase/ssr`, com o
middleware renovando o token e escrevendo os cookies na resposta. Sessão em
`localStorage` seria invisível ao servidor, e a proteção de rota viraria flash de
tela no cliente.

O `.gitignore` usa `.env*` em vez dos padrões usuais `.env`, `.env.local`,
`.env*.local` — porque esses três deixam passar backups como `.env.local.bak`,
que é exatamente o arquivo que alguém cria antes de mexer e esquece.

---

## 2. Row Level Security

Ligada em todas as tabelas. [`0004_rls.sql`](../supabase/migrations/0004_rls.sql)

```sql
revoke insert, update, delete, truncate on all tables in schema public
  from anon, authenticated;
```

**O corpus não tem policy de escrita para ninguém.** Escrita nele é exclusiva do
papel `postgres` via `DATABASE_URL`, nos scripts que rodam localmente. Conferido
com sessão: `insert` em `leis` e `update` em `dispositivos` devolvem 42501.

O que veio depois foi **escrita de dado do usuário**, sempre ancorada em
`auth.uid()`:

| Tabela | Leitura | Escrita |
|---|---|---|
| `leis`, `artigos`, `dispositivos` | pública | nenhuma |
| `rubricas`, `rubrica_dispositivos` | pública | nenhuma |
| `casos` | pública | nenhuma |
| `teses` | pública, `using (ativo)` | nenhuma |
| `precedentes_stj` | pública | nenhuma |
| `vigilia_coletas`, `vigilia_jurimetria` | pública | só service role |
| `vigilia_alteracoes` | pública | service role + **duas colunas** por sessão |
| `conversas`, `conversa_trocas` | só do dono | só do dono |
| `perfil` | só do dono | só do dono |
| `clientes` | só do dono | só do dono |
| `uso_llm` | **não** | sem policy alguma → invisível |

### A policy que mais importa

Não é mais a de `argumentacao` — aquela tabela continua vazia e sem uso, porque a
argumentação da peça vive em `teses.template_md`, escrita à mão. A que carrega
peso hoje é o **grant por coluna** da vigília:

```sql
grant update (reconferido_em, reconferido_por) on public.vigilia_alteracoes
  to authenticated;
```

RLS decide **linha**, não coluna. Sem esse recorte, "pode marcar como lido"
viraria "pode reescrever o link do ato oficial" — o mesmo usuário que confere um
achado poderia trocar a URL do Diário Oficial por outra qualquer.

Conferido contra o banco: com sessão, marcar como conferido devolve 200 e
reescrever `url` ou `ementa` devolve 42501. Sem sessão, 401.

### A separação que a agenda de clientes exige

`clientes` é a **primeira tabela com dado de pessoa de fora** — tudo o mais é
texto de lei, curadoria ou conversa do próprio usuário. Sem a âncora em
`usuario_id`, a chave publishable — que roda no navegador de qualquer um — leria
a agenda inteira. Conferido: sem sessão, o `select` devolve `[]` e o `insert`
devolve 42501.

---

## 3. Superfície de gasto

A regra nunca foi "LLM é proibido", e sim **"nenhuma rota que responda sem sessão
pode gastar com modelo"**. Sem autenticação, isso tornava a proibição absoluta; a
autenticação não apagou a regra, apagou o motivo de ela ser absoluta.

`/api/consulta/aovivo` é o **único ponto do produto que chama um modelo em
runtime**, com três freios em camadas:

1. **A rota exige sessão** — não está em `lib/auth/rotas.ts`, e rota nova nasce
   fechada.
2. **Limite por IP** na memória do processo. É quebra-molas, não portão: em
   serverless cada instância tem o próprio mapa, e instância nova nasce com ele
   vazio. Existe para o caso barato e comum — alguém segurando o botão.
3. **Teto mensal no banco**, `consome_uso_llm()` ([migration
   0010](../supabase/migrations/0010_teto_llm.sql)), 200 chamadas por mês. A
   função decide e escreve **na mesma instrução**, então duas requisições
   simultâneas não passam juntas pela última vaga. Conferido: com `teto = 1`, a
   segunda devolve `permitido = false`.

`uso_llm` é invisível para `anon` e só é tocada server-side. Ela deixou de ser
tabela morta — era a única peça de 0001 que nunca tinha sido usada.

**A minuta continua sem modelo nenhum.** A argumentação da peça está escrita à
mão em `teses.yaml`; não há chamada a modelo em `/api/peca/[casoId]`. Cada frase
do `.docx` passou por revisão humana, que é padrão profissional real para peça
jurídica.

**A demonstração nunca depende do caminho ao vivo funcionar.** Sem chave, a rota
devolve 503 e a resposta composta por função pura continua na tela. Falha de
rede, teto estourado, recusa do modelo, validação recusada duas vezes: em todos
os casos o que já estava na tela permanece, e a interface diz o motivo.

Embedding de consulta em runtime é exceção consciente:
`text-embedding-3-small` custa fração de centavo por milhão de buscas — o corpus
inteiro custou US$ 0,008. O teto de dano é baixo o bastante.

### A rota de cron, e por que ela é a única exceção

`/api/vigilia/coletar` está em `PUBLICAS`, e é a única exceção do projeto à regra
"sessão ou nada". Cron não tem navegador nem cookie, e um redirect para `/login`
faria a coleta falhar em silêncio todo dia.

**Pública aqui não quer dizer aberta**: ela exige
`Authorization: Bearer $CRON_SECRET` e recusa tudo com 503 quando o segredo não
está configurado — o lado certo para errar numa rota que escreve com service
role. Ela troca uma porta por outra, em vez de remover a porta.

---

## 4. Integridade do texto legal

Risco de compliance específico deste domínio: **peça protocolada com fundamento
inexistente ou com redação revogada**.

| Controle | Camada | O que impede | Estado |
|---|---|---|---|
| `tests/citacao.test.ts` | build | citação quebrada vira erro de compilação | ativo · 16 asserções |
| `valida_ids_dispositivo` | trigger | array `fundamentos` com id inexistente | ativo |
| `valida_citacoes` | trigger | `{{cite:...}}` apontando para o vazio | ativo |
| `CitacaoOrfa` | runtime | minuta sair com citação silenciosamente omitida | ativo · 500 com os ids |
| `leis_cobertura_nota_ck` | constraint | cobertura parcial sem aviso explicativo | ativo |
| `vigencia_ate` na RPC | dados | UI exibir texto sem a data de corte | ativo |
| `DATA_DE_CORTE` | código | data escrita à mão no JSX envelhecer sozinha | ativo |
| `valida()` da geração | runtime | modelo transcrever lei ou citar id que não veio da busca | ativo · seis recusas |

São três camadas para a mesma coisa, e é de propósito: o teste falha antes do
build, os triggers recusam na escrita, e `CitacaoOrfa` derruba a montagem da peça
em vez de produzir minuta pela metade. Minuta com marcador cru envergonha; minuta
com a citação omitida vai a juízo com fundamento vazio.

O Postgres não faz FK de elemento de array nem de marcador dentro de texto — os
dois triggers são o que fecha essa lacuna na camada de armazenamento.

E as travas da curadoria, em `normalize.ts`: entrada que deixa de casar aborta o
script, em vez de aplicar correção no escuro. Vale também para a redação nova —
`era` guarda o texto anterior exato, e nenhuma redação se aplica no escuro. Ver
[corpus.md](corpus.md#d-nota-do-editor-dentro-do-texto-legal).

### O que a validação da resposta gerada recusa

Seis regras, todas no servidor, todas testadas offline em `tests/consulta.test.ts`:

| Recusa | Por quê |
|---|---|
| `doc_id` fora do contexto recuperado | id que não veio da busca é alucinação, mesmo existindo no banco |
| citação para `sources[].id` inexistente | marcador que não abre nada é pior que nenhum |
| forma diferente do esquema | segunda camada, para o dia em que o esquema mudar |
| **transcrição de lei** | doze palavras seguidas iguais às de um dispositivo do contexto e a resposta cai — "gerar" inclui copiar do contexto para a prosa |
| **parágrafo sem âncora** | todo parágrafo tem de citar ao menos uma fonte; sem isso cabia uma afirmação inteira apoiada em treinamento |
| **letra fora do alfabeto latino** | observado numa geração real: devanágari no lugar de "crime". As outras cinco não alcançam esse caso |

Recusado, o servidor regenera **uma vez** com a violação nomeada. Recusado de
novo, cai para a resposta composta.

A parte estrutural não depende de prompt: a chamada não declara ferramenta
nenhuma, então navegar não é uma capacidade que o modelo tenha nesta rota.

---

## 5. Direito autoral

**Doutrina é obra protegida.** Nucci, Greco, Bitencourt. O sistema não hospeda,
não indexa e não resume de forma substitutiva.

Para consultas com intenção doutrinária, a resposta é entendimento consolidado
extraído de **jurisprudência** — acórdão não tem essa proteção — mais link para
fonte legítima. `rubricas.explicacao` é texto autoral próprio, curto e
funcional.

O PDF do Vade Mecum **não é versionado**: `*.pdf` está no `.gitignore`. O que vai
ao repositório são os JSONs extraídos, com atribuição de fonte em `leis.fonte`.

---

## 6. Dados pessoais

Os quatro casos de demonstração são **fictícios e anonimizados**, escritos para o
projeto. Não há upload de arquivo. Consequência de design: **a demonstração nunca
depende de upload para funcionar.**

Três coisas passaram a ser guardadas, e as três vivem sob RLS por `auth.uid()`:

- **`conversas` / `conversa_trocas`** — o histórico do chat. Sem teto e sem
  expiração: conversa some quando o usuário a apaga, e só então. Quem escreve é o
  cliente do navegador carregando a sessão.
- **`perfil`** — nome, OAB e telefone. Saiu do `localStorage` porque trocar de
  navegador apagava a inscrição, o que fazia dele anotação do aparelho, não
  cadastro. **Não entra na minuta**: o `.docx` continua saindo com campos a
  preencher.
- **`clientes`** — a agenda do escritório, e o único dado de pessoa de fora.

Sobre a agenda, duas escolhas que valem registro. **Só o nome é obrigatório**:
cadastro que exige CPF empurra quem não o tem a digitar qualquer coisa, e CPF
inventado é pior que campo vazio porque parece conferido. O que é digitado,
porém, é conferido — `cpfValido()` calcula os dois dígitos verificadores e recusa
os onze repetidos. E o CPF é guardado como **11 dígitos crus**: máscara é assunto
da tela, e gravar `123.456.789-09` faria a busca depender de o usuário digitar a
pontuação do mesmo jeito das duas vezes.

O vínculo com `casos` é `on delete set null`, não `cascade`: o caso é peça de
demonstração resemeável, o cliente é dado do usuário — reseed da curadoria não
pode levar a agenda junto.

---

## 7. Fora de escopo, e por que isso é seguro

Multiusuário, billing, painel administrativo e integração com PJe não estão
implementados, e não estão por decisão de produto.

**Autenticação saiu desta lista** — existe, e está descrita no topo. O que ela
mudou foi permitir a rota de geração; o que ela **não** mudou é que nenhuma
proteção do corpus depende dela. A escrita em `dispositivos` continua impossível
para `anon` e para `authenticated`; o que a sessão libera é dado do próprio
usuário.

`usuario_id` existe para ancorar policy, não para abrir o produto a vários
usuários. Continua sendo um usuário só.

---

## Verificação

```sql
-- toda tabela com RLS ligada
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- quem pode escrever o quê
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';

-- o grant da vigília é por coluna, não pela tabela
select column_name, privilege_type from information_schema.column_privileges
 where table_name = 'vigilia_alteracoes' and grantee = 'authenticated';

-- o trigger recusa citação órfã
insert into public.teses (id, nome, resumo, fundamentos, template_md, ordem)
values ('x','x','x','{lei_11343_2006_art999}','x',1);
-- esperado: ERRO foreign_key_violation
```

E pelo lado do cliente, que é o que de fato importa — a chave publishable é a que
roda no navegador de qualquer visitante:

```bash
# sem sessão: as tabelas de usuário devolvem [] e a escrita devolve 42501
curl -s "$URL/rest/v1/clientes?select=*" -H "apikey: $PUBLISHABLE"
curl -s -X POST "$URL/rest/v1/clientes" -H "apikey: $PUBLISHABLE" \
     -H 'content-type: application/json' -d '{"nome":"Invasor"}'

# com sessão: o corpus continua fechado
curl -s -X PATCH "$URL/rest/v1/dispositivos?id=eq.lei_11343_2006_art33_caput" \
     -H "apikey: $PUBLISHABLE" -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"texto":"hackeado"}'
# esperado: 403 · 42501 permission denied
```
