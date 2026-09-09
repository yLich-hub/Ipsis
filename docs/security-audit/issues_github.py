# -*- coding: utf-8 -*-
"""
Texto integral das issues do GitHub, em Markdown, pronto para copiar e colar.

Cada entrada é (numero, titulo_curto, corpo_markdown). O corpo já vem com o
título, as labels, a descrição, a evidência com arquivo:linha, o impacto, a
sugestão de correção e os critérios de aceite — nada é montado pelo
renderizador, que só desenha o bloco delimitado.

São três issues para quatro achados: os dois informativos de higiene (CI e
documentação duplicada) foram agrupados, porque são o mesmo tipo de trabalho e
abrir duas seria spam.
"""

ISSUES = [
    (
        1,
        "Travar por asserção que anon não volte a ter escrita no banco",
        """# [Segurança] Travar por asserção que `anon` não volte a ter escrita no banco

**Labels:** `security`, `severidade: baixa`, `banco`, `rls`, `teste`

> **O achado que originou esta issue já foi corrigido** por
> `supabase/migrations/0026_escrita_do_dono.sql`, aplicada e conferida. O que
> sobra — e é o que esta issue pede — é a asserção que impede o problema de
> voltar. Ver o histórico abaixo, que vale como registro.

## O que estava errado

`0004_rls.sql` declarava "nenhuma escrita para anon" e executava:

```sql
revoke insert, update, delete, truncate on all tables in schema public
  from anon, authenticated;
```

`on all tables in schema public` é uma **fotografia**: alcança as tabelas que
existem no instante em que roda. Dez tabelas criadas depois — `conversas` e
`conversa_trocas` (0007), `perfil` (0008), `clientes` (0009), as da vigília
(0012, 0013), `precedentes_stj` (0014) e as de decretos (0018) — nasceram com
`GRANT ALL` para `anon` e `authenticated`, porque é o que o
`ALTER DEFAULT PRIVILEGES` do Supabase manda fazer. Medido:
**44 linhas** de INSERT/UPDATE/DELETE/TRUNCATE em
`information_schema.role_table_grants`.

Para DML a RLS cobria. **TRUNCATE não**: no Postgres, RLS se aplica a SELECT,
INSERT, UPDATE, DELETE e MERGE, e quem tem o privilégio de TRUNCATE esvazia a
tabela inteira sem que policy nenhuma reclame.

## A correção que esta issue recomendava estava errada

Vale registrar, porque é a parte reaproveitável. A sugestão original era repetir
o bloco de 0004. **Ensaiado em transação com rollback, ele derruba o produto:**

**(a) RLS decide QUAIS linhas, não SE o papel pode escrever.** As duas checagens
são independentes e a de privilégio vem primeiro:

```
revoke insert on public.clientes from authenticated;
set local role authenticated;
insert into public.clientes (usuario_id, nome) values (...);
--> ERROR:  permission denied for table clientes
```

Em 0004 o revoke em bloco era inofensivo porque não havia escrita de usuário
nenhuma — a autenticação nem existia.

**(b) revogar UPDATE de tabela apaga junto o grant por COLUNA.**
`vigilia_alteracoes` concede UPDATE só em `reconferido_em` e `reconferido_por`
(0012, 0024), e é isso que impede "marcar como conferido" de virar "reescrever o
link do ato oficial". Medido: depois de `revoke update ... from authenticated`,
`information_schema.column_privileges` devolve **zero** coluna — o botão para de
funcionar, sem erro na migration e sem nada dizendo o motivo.

## O que 0026 fez

Nominal, a partir da superfície de escrita levantada de `src/`:

```sql
revoke truncate on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke delete on public.perfil          from authenticated;
revoke update, delete on public.conversa_trocas from authenticated;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;
```

Resultado conferido no banco: **44 → 9 linhas**, e as 9 são exatamente as cinco
escritas reais do produto (`clientes`, `conversas`, `conversa_trocas`, `perfil`
pelo navegador com sessão, mais o UPDATE por coluna de `vigilia_alteracoes`).
TRUNCATE não sobrou em tabela nenhuma. `npm run e2e` seguiu 24/24.

## O que falta, e é o pedido desta issue

O `alter default privileges` faz tabela nova nascer fechada, mas **nada observa
o estado**. Grant é estado do banco, e estado que ninguém observa é estado que
volta — foi exatamente assim que 0004 envelheceu sem ninguém notar.

Falta uma asserção, na forma que o projeto já usa para o `matcher` do middleware
em `tests/acesso.test.ts`: uma consulta que falhe se `anon` voltar a ter
qualquer escrita, ou se `authenticated` ganhar escrita fora da lista conhecida.

Ela **não cabe no `npm run verificar`**, que roda offline e sem segredo por
decisão escrita. O lugar natural é junto de `npm run e2e`, que já fala com o
Supabase de verdade, ou um `npm run grants` chamado à mão antes de congelar uma
versão.

## Critérios de aceite

- [ ] Existe um comando que lê `information_schema.role_table_grants` e falha se
      `anon` tiver INSERT, UPDATE, DELETE ou TRUNCATE em qualquer tabela de
      `public`.
- [ ] O mesmo comando falha se `authenticated` tiver escrita **fora** da lista
      esperada — hoje: `clientes` (I/U/D), `conversas` (I/U/D),
      `conversa_trocas` (I), `perfil` (I/U). A lista mora no teste, para que
      ampliá-la seja uma decisão que aparece no diff.
- [ ] O mesmo comando falha se qualquer papel que não seja `service_role` ou
      `postgres` tiver TRUNCATE em `public`.
- [ ] A asserção confere também o `pg_default_acl` do papel `postgres`, senão ela
      passa a verde no dia seguinte ao de alguém reconceder o default.
- [ ] Rodar o comando contra o banco de hoje passa, sem ajuste.
""",
    ),
    (
        2,
        "Higiene: permissions no CI e a duplicação do AGENTS.md",
        """# [Segurança] Higiene: `permissions:` ausente em verificacao.yml e AGENTS.md duplicando o CLAUDE.md

**Labels:** `security`, `severidade: informativa`, `ci`, `documentação`

Dois itens de higiene agrupados: são o mesmo tipo de trabalho e abrir duas
issues seria spam.

---

## Parte A — `verificacao.yml` não declara `permissions:`

### Problema

Sem bloco `permissions:`, o `GITHUB_TOKEN` do job recebe o conjunto padrão
configurado na organização ou no repositório, que pode ser mais amplo que o
necessário. O workflow da vigília já declara o mínimo; o de verificação não, e a
assimetria é acidental — os dois arquivos foram escritos com meses de diferença.

### Evidência

`.github/workflows/verificacao.yml:35-38` — não há bloco `permissions:`

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

`.github/workflows/vigilia.yml:69-70` — o contraste

```yaml
permissions:
  contents: read
```

### Impacto

Baixo e indireto. Este workflow não usa segredo nenhum — é o que permite que ele
rode com segurança em PR vindo de fork —, e para `pull_request` de fork o GitHub
já entrega token somente-leitura. O que se ganha declarando é deixar de depender
de uma configuração que mora fora do arquivo e pode mudar sem ninguém notar.

### Correção

Duas linhas no topo de `verificacao.yml`, iguais às de `vigilia.yml`. Nenhum
passo do arquivo escreve no repositório, então não há o que quebrar.

---

## Parte B — AGENTS.md duplica o CLAUDE.md inteiro

### Problema

São 2.573 linhas duplicadas que diferem em **duas** — o nome do agente. Não há
segredo em nenhum dos dois arquivos, e isso foi conferido.

O que faz disto assunto de segurança é o conteúdo: é neste documento que vivem
as quatro configurações obrigatórias do painel do Supabase, incluindo
**"Allow new users to sign up: desligado"**, que é a correção do achado de
severidade alta da auditoria anterior. O projeto escolheu esse documento como o
lugar onde a exigência sobrevive ao próximo deploy.

Duas cópias significam que ela pode passar a existir em uma e não na outra, e o
agente que ler a errada não saberá.

### Evidência

```
$ diff AGENTS.md CLAUDE.md
685c685
< Codex é superfície de gasto anônima — e a autenticação, quando entrou, não
---
> Claude é superfície de gasto anônima — e a autenticação, quando entrou, não
982c982
< primeira versão trazia `Codex-opus-5` escrito no JSX, e continuou exibindo isso
---
> primeira versão trazia `claude-opus-5` escrito no JSX, e continuou exibindo isso
```

### Impacto

Nenhum imediato: hoje as duas cópias dizem a mesma coisa. O risco é de
divergência silenciosa — a mesma classe de erro que o `marca.ts` do projeto
existe para impedir, e que o próprio documento descreve como *"é assim que uma
tela fica com o nome antigo"*.

### Correção

Duas saídas, e a escolha é de processo:

1. `AGENTS.md` vira um arquivo de três linhas apontando para o `CLAUDE.md` —
   preserva a convenção que outros agentes procuram sem duplicar conteúdo;
2. um é gerado do outro num passo do `npm run verificar`, que falha se
   divergirem — a mesma disciplina que `tests/vigilia.test.ts` aplica aos dois
   runtimes do filtro.

## Critérios de aceite

- [ ] `verificacao.yml` declara `permissions: contents: read`.
- [ ] Um PR de teste continua passando nos dois jobs.
- [ ] `AGENTS.md` deixa de ser cópia integral: ou aponta para o `CLAUDE.md`, ou
      passa a ser gerado com asserção que falha na divergência.
- [ ] A tabela de configuração obrigatória do painel existe em **um** lugar
      canônico, e o outro arquivo aponta para ele.
""",
    ),
    (
        3,
        "Tornar verificável o Secure password change",
        """# [Segurança] "Secure password change" não é verificável de fora do painel

**Labels:** `security`, `severidade: informativa`, `auth`, `verificação`

## Problema

O produto depende de um interruptor do painel do Supabase para fechar a troca de
senha sem reautenticação, e o endpoint público de configurações não devolve esse
campo. Os outros três ajustes obrigatórios são confirmáveis; este não é
afirmável nem negável de fora.

## Evidência

`GET /auth/v1/settings` — endpoint público do Auth:

```
disable_signup ......... true    <- verificável, e está fechado
mailer_autoconfirm ..... true    <- verificável
external.email ......... true    <- verificável
secure_password_change . (ausente do payload)
```

`src/components/auth/redefinir-senha.tsx:53-62`

```ts
const supabase = supabaseNavegador()
const { error } = await supabase.auth.updateUser({ password: senha })
//                                    ^ sem senha atual, por desenho do SDK
```

A guarda que existe em código — o cookie `ipsis-recuperacao`, posto por
`/auth/confirmar` e exigido por `/redefinir-senha` — impede o **acidente** de
quem já está logado abrir a tela, e isso foi verificado no navegador. Ela não
impede quem tem um cookie válido e chama o SDK sem passar por tela nenhuma.

## Impacto

Se o interruptor estiver desligado, um cookie de sessão obtido por outro caminho
permite trocar a senha sem conhecer a antiga — tomada permanente da conta. Se
estiver ligado, não há impacto.

**A auditoria não consegue dizer qual dos dois é o caso**, e é essa a lacuna que
esta issue registra.

## Sugestão de correção

1. Conferir uma vez no painel: Authentication → Providers → Email →
   **Secure password change**.
2. Anotar a data da conferência ao lado da linha na tabela do `CLAUDE.md` — é a
   mesma disciplina de `artigos.conferido_em` e do `conferido_em` dos decretos:
   quando não dá para medir, registra-se quem olhou e quando.
3. Mais forte, e opcional: um caso de e2e que faça login, chame
   `updateUser({ password })` sem reautenticar e espere a recusa. Transforma uma
   configuração de painel numa asserção que roda.

## Critérios de aceite

- [ ] O estado do interruptor foi conferido no painel.
- [ ] A tabela de configuração obrigatória do `CLAUDE.md` traz a data da
      conferência ao lado da linha.
- [ ] Opcional: um caso de e2e cobre a recusa de `updateUser` sem
      reautenticação, e ele falha se o interruptor for desligado.
""",
    ),
]
