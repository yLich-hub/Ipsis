# Segurança e compliance

O app é público, sem autenticação e sem multiusuário — isso é escopo
deliberado, não pendência. As decisões abaixo partem dessa premissa: **não
existe usuário confiável**, então nenhuma proteção pode depender de sessão.

---

## 1. Segredos

| Variável | Onde vive | Vaza no bundle? | Por quê |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | sim, por design | endpoint público |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | sim, por design | sujeita a RLS somente-leitura |
| `DATABASE_URL` | só `scripts/`, máquina local | **não** | conexão direta, papel `postgres` |
| `OPENAI_API_KEY` | só server | **não** | embedding de consulta |
| `SUPABASE_SERVICE_ROLE_KEY` | só server, incremento 4 | **não** | ignora RLS |

A regra que não se negocia: **nada sensível com prefixo `NEXT_PUBLIC_`**. A
service role ignora RLS — vazá-la no bundle do cliente abre o banco para
escrita.

`src/lib/supabase.ts` só conhece a chave publishable. A service role não tem
caminho de importação até lá.

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

**Nenhuma policy de escrita para `anon`. Nenhuma.** Escrita é exclusiva do papel
`postgres` via `DATABASE_URL`, nos scripts que rodam localmente.

| Tabela | Leitura pública | Condição |
|---|---|---|
| `leis`, `artigos`, `dispositivos` | sim | — |
| `rubricas`, `rubrica_dispositivos` | sim | — |
| `casos` | sim | — |
| `teses` | sim | `using (ativo)` |
| `argumentacao` | sim | `using (revisado_em is not null)` |
| `uso_llm` | **não** | sem policy alguma → invisível |

### A policy que mais importa

```sql
create policy leitura_revisada on public.argumentacao
  for select to anon, authenticated
  using (revisado_em is not null);
```

Essa é a última linha de defesa do princípio "nenhuma frase da minuta chega ao
usuário sem revisão humana". Ela transforma disciplina de processo em invariante
do banco: mesmo que uma rota nova esqueça o filtro, o Postgres não devolve a
linha.

---

## 3. Superfície de gasto

Sem autenticação, qualquer rota pública que chame a API do Claude é gasto
anônimo ilimitado. Por isso:

- **A costura argumentativa é gerada offline**, revisada à mão, versionada em
  `data/curadoria/argumentacao.yaml` e servida do banco.
- O botão opcional "gerar ao vivo" tem teto **mensal** contado no banco
  (`uso_llm`) e limite por IP. Estourado o teto, cai para a versão armazenada.
- `uso_llm` é invisível para `anon` e só é incrementada server-side.

**A demonstração nunca depende do caminho ao vivo funcionar.**

Embedding de consulta em runtime é exceção consciente:
`text-embedding-3-small` custa fração de centavo por milhão de buscas — o corpus
inteiro custou US$ 0,0028. O teto de dano é baixo o bastante.

---

## 4. Integridade do texto legal

Risco de compliance específico deste domínio: **peça protocolada com fundamento
inexistente ou com redação revogada**.

| Controle | Camada | O que impede | Estado |
|---|---|---|---|
| `valida_ids_dispositivo` | trigger | array `fundamentos` com id inexistente | ativo |
| `valida_citacoes` | trigger | `{{cite:...}}` apontando para o vazio | ativo |
| `leis_cobertura_nota_ck` | constraint | cobertura parcial sem aviso explicativo | ativo |
| `vigencia_ate` na RPC | dados | UI exibir texto sem a data de corte | ativo |
| `tests/citacao.test.ts` | build | citação quebrada vira erro de compilação | incremento 4 |

O Postgres não faz FK de elemento de array nem de marcador dentro de texto — os
dois triggers são o que fecha essa lacuna na camada de armazenamento.

E as travas da curadoria, em `normalize.ts`: entrada que deixa de casar aborta o
script, em vez de aplicar correção no escuro. Ver
[corpus.md](corpus.md#d-nota-do-editor-dentro-do-texto-legal).

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

Os três casos de demonstração são **fictícios e anonimizados**, escritos para o
projeto. Não há upload de arquivo, não há dado de cliente real, não há
persistência de consulta do usuário.

Consequência de design: **a demonstração nunca depende de upload para
funcionar.**

---

## 7. Fora de escopo, e por que isso é seguro

Autenticação, multiusuário, billing, painel administrativo e integração com PJe
não estão implementados. Isso é seguro **porque nada no sistema pressupõe que
estejam**:

- não há dado de usuário para proteger;
- não há escrita vinda do cliente para autorizar;
- o teto de gasto é global, não por conta.

Um sistema que assumisse usuários e depois removesse a autenticação seria outra
história. Este nunca os teve.

---

## Verificação

```sql
-- toda tabela com RLS ligada
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- nenhuma policy de escrita
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';

-- o trigger recusa citação órfã
insert into public.teses (id, nome, resumo, fundamentos, template_md, ordem)
values ('x','x','x','{lei_11343_2006_art999}','x',1);
-- esperado: ERRO foreign_key_violation
```
