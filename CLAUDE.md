# Jesbick — consulta e geração de peças para advocacia criminal (tráfico de drogas)

Projeto de portfólio. Não é produto comercial: sem cobrança, sem multiusuário.
O critério de sucesso é que um recrutador técnico entenda em 90 segundos que o
projeto resolve um problema difícil e real.

**Escopo deliberadamente estreito:** crimes de tráfico de drogas (Lei 11.343/2006),
com Código Penal e um subconjunto curado do CPP disponíveis para consulta.
30% do escopo com 100% de acabamento > sistema amplo e quebrado.

## Stack

Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres + pgvector).
Deploy na Vercel. Embeddings: OpenAI `text-embedding-3-small` (1536 dims).
Geração de argumentação: Claude (`claude-opus-5`), com thinking adaptativo.

## Fora de escopo (não implementar)

Multiusuário, billing, painel administrativo, integração com PJe, qualquer crime
além de tráfico, segunda peça processual. Não expandir sem pedido explícito.

Autenticação saiu desta lista: existe login por e-mail e senha, de usuário único,
descrito em "Autenticação" abaixo. Nada de OAuth, papéis, convite ou perfil.

---

## As três decisões que definem o projeto

### 1. O texto legal nunca é gerado pelo modelo

Toda citação na minuta resolve para um `dispositivos.id` no banco. Os templates
de tese contêm marcadores `{{cite:lei_11343_2006_art33_p4}}`; o renderizador
substitui pelo texto **lido do banco** e por um link para `/dispositivo/[id]`.
O modelo escreve apenas a argumentação *entre* as citações.

`tests/citacao.test.ts` varre todos os `{{cite:}}` de `data/curadoria/teses.yaml`
e falha o build se algum id não existir. Citação quebrada é erro de compilação,
não erro em audiência. **Não relaxar esse teste.**

### 2. A camada de rubricas é o coração da busca

Advogado não busca pelo texto da lei, busca pelo apelido do instituto.
"Tráfico privilegiado" não aparece em lugar nenhum do art. 33 §4º; "roubo
majorado" não aparece no art. 157. Busca por palavra-chave no texto puro **não
acha o que o usuário procura** — daí a tabela `rubricas` com match exato e peso
dominante na fusão.

Rubricas têm duas origens (`rubricas.origem`):
- `oficial` — extraídas do artefato de extração do PDF (ver Limpeza, abaixo).
  351 rubricas marginais do CP, texto do próprio Vade Mecum.
- `curada` — termo coloquial escrito à mão para o recorte de tráfico.

Uma rubrica aponta para N dispositivos via `rubrica_dispositivos`, com `papel`
(`principal` | `correlato` | `requisito`) e `peso`. "Dosimetria da pena" é um
cluster ordenado (art. 42 da Lei de Drogas como principal, arts. 59 e 68 do CP
como correlatos), não um artigo só.

### 3. A data de corte é visível o tempo todo

Os JSONs são uma fotografia de **fevereiro/2025** (Vade Mecum Senado Federal,
1ª ed.). Citar redação revogada em peça criminal é grave. `leis.vigencia_ate`
é renderizado em banner global e ao lado de cada dispositivo.

O mesmo vale para cobertura: `leis.cobertura` é `integral` (Lei 11.343, CP) ou
`parcial` (CPP — subconjunto curado). Todo dispositivo de lei parcial exibe o
aviso de cobertura. Silenciar isso seria o mesmo erro de classe que silenciar a
data de corte.

---

## Fontes de dados

| Arquivo | Lei | id | Cobertura | Origem |
|---|---|---|---|---|
| `data/lei11343.json` | Lei Antidrogas 11.343/2006 | `lei_11343_2006` | integral (93 arts) | `vade_parser.py` |
| `data/codigo_penal.json` | Código Penal (DL 2.848/1940) | `dl_2848_1940` | integral (416 arts) | `vade_parser.py` |
| `data/cpp_subconjunto.json` | CPP (DL 3.689/1941) | `dl_3689_1941` | **parcial** (~25 arts) | curadoria manual |

**`vade_parser.py` está validado. Não reescrever.** Trate os JSONs como fonte de
dados imutável — a limpeza acontece em `scripts/normalize.ts`, nunca editando os
JSONs no lugar. Python/pdfplumber não estão instalados nesta máquina (só o stub
da Microsoft Store); rodar o parser exige o PDF e um ambiente Python.

O subconjunto do CPP é digitado à mão e conferido contra o texto oficial. Cobre
o que o recorte de tráfico usa: 155, 157, 386, 396, 396-A, 397, 400, 402, 403,
563-566 e o essencial de busca e apreensão domiciliar. Cada artigo carrega a data
de conferência.

### Formato de entrada (saída do parser)

```json
{
  "id": "lei_11343_2006_art33",
  "artigo": "33",
  "contexto": { "titulo": "...", "capitulo": "CAPÍTULO II – Dos Crimes" },
  "caput": "Importar, exportar, remeter, ...",
  "paragrafos": [ { "numero": "4", "texto": "...", "incisos": [] } ],
  "incisos": []
}
```

O `id` textual é a chave de citação estável — propaga para `artigos.id` e é a
raiz de `dispositivos.id`.

---

## Limpeza obrigatória antes dos embeddings (`scripts/normalize.ts`)

Três artefatos de extração do PDF, todos quantificados na auditoria inicial:

### A. Rubrica marginal colada (351 ocorrências no CP, 0 na Lei 11.343)

O Vade Mecum imprime a rubrica do dispositivo na margem; o parser a absorve no
**fim do bloco anterior**. Duas manifestações:

- No heading: `"CAPÍTULO III – Da Aplicação da Pena Fixação da pena"`
  (`Fixação da pena` é a rubrica do art. 59). O caso `"Do Furto Furto"` é a
  coincidência rara em que rubrica e nome do capítulo colidem — **não é
  duplicação literal no caso geral, dedup ingênuo não funciona.**
- No fim do dispositivo: o caput do art. 1º termina com `"Lei penal no tempo"`
  (rubrica do art. 2º); o §1º do art. 13 termina com `"Relevância da omissão"`
  (rubrica do §2º).

**Regra determinística:** o fragmento no fim do dispositivo *i*, na ordem do
documento, é a rubrica do dispositivo *i+1* — inclusive quando o *i+1* é um
parágrafo/inciso do mesmo artigo. Verificado ao longo da cadeia inicial do CP.

Isso torna a limpeza uma *feature*: as 351 rubricas removidas viram
`rubricas` com `origem = 'oficial'`, já ligadas ao dispositivo exato.

Heurística de detecção: fragmento final após pontuação de fim de frase, sem
pontuação terminal própria, iniciando em maiúscula, ≤ ~70 caracteres, sem
`"Pena –"`. **É heurística e vai ter falsos positivos** —
`scripts/audit.ts` gera o diff `texto_bruto → texto` das 351 alterações para
revisão manual antes do seed. `dispositivos.texto_bruto` guarda sempre o original.

### B. Marcadores de nota de rodapé colados (6 ocorrências)

`"...integre organização criminosa.2"`, `"...prevenção do crime:5"`,
`"...em legítima defesa;1"`. Dígito de 1–2 casas colado logo após pontuação, em
fim de bloco. Corrompe o texto legal citado na peça — remover, nunca dentro de
números como `1.500` ou `art. 33`.

### C. Ordinais como letra `o` (547 ocorrências)

`§ 1o` → `§ 1º`, `Lei no 9.099` → `Lei nº 9.099`. Normalizar para exibição e
para o índice de busca.

Das 566 ocorrências brutas, ~450 são o marcador `§ 1o` no início do bloco, que
vira `rotulo` na extração. Restam 117 dentro do texto. A regra `no` → `nº` só
dispara depois de palavra que anuncia diploma legal, ou diante de separador de
milhar: `"no 1º grau"` é português legítimo, não abreviação.

### D. Nota do Editor dentro do texto legal (11 blocos)

Não é o marcador da classe B — é o **corpo** da nota, emendado no meio da frase:

    "…mediante contraprestação 6 NE: ver ADPF no 569. irrisória, a partir…"

Os marcadores são sequenciais no documento (1–2 na Lei 11.343, 1–13 no CP).
**Não é regex-ável com segurança:** uma das notas contém `art. 2o da Lei no
7.209/1984`, e qualquer regra "corta até o primeiro ponto" decepa o texto legal
junto. Os cortes exatos estão em `data/curadoria/notas_editor.yaml`;
`normalize.ts` **aborta** se sobrar qualquer `NE:` ou se uma entrada deixar de
casar.

### E. Parágrafos que não existem (8 blocos)

`PAR_RE` casa qualquer `§ No` em início de linha. Quando a quebra de linha do
PDF cai logo antes de uma **remissão** a parágrafo, o parser trata a continuação
da frase como parágrafo novo: o dispositivo anterior fica truncado e nasce um
dispositivo fantasma, citável em peça. O pior é o **art. 37 da Lei de Drogas**
(informante do tráfico, dentro do recorte), com o caput cortado em
`"arts. 33, caput e"`.

Assinatura: tirado o marcador, o bloco começa em minúscula. `normalize.ts`
detecta e aponta; `data/curadoria/emendas.yaml` corrige, com trava `comeca_com`
que aborta se o texto mudar embaixo.

Aparentado, mas determinístico e resolvido em código: `PAR_RE` captura só o
dígito, então `§ 4º`, `§ 4º-A`, `§ 4º-B` e `§ 4º-C` chegam todos como
`numero: "4"`. Confiar nisso colapsava 29 dispositivos distintos no mesmo id —
o art. 155 do CP tem exatamente esses quatro.

### Não confundir com defeito

Os buracos na numeração são legítimos, não perda do parser:
Lei 11.343 pula 8→15 (arts. 9º–14 revogados pela Lei 13.840/2019);
CP pula 186→196 e 218→223 (revogados). Artigos `(Vetado)` / `(Revogado)` entram
no banco com `artigos.revogado = true`.

---

## Busca

Função RPC única no Postgres (uma chamada de rede, não três), fundindo por
*Reciprocal Rank Fusion*:

1. **Rubrica** — match exato em `termo` ou `variantes`. Peso dominante: quando
   bate, encabeça o resultado.
2. **Lexical** — `ts_rank_cd` sobre `dispositivos.busca` (`to_tsvector('portuguese', texto)`).
3. **Semântica** — `<=>` sobre `dispositivos.embedding`.

O que é embutido é `dispositivos.texto_embed`, não `texto`:
`capítulo + rubrica + caput do artigo + texto do dispositivo`. Um `§ 4º Nos
delitos definidos no caput...` isolado gera vetor inútil — o dispositivo não se
sustenta sozinho.

`scripts/embed.ts` reembute apenas linhas cujo hash de `texto_embed` mudou.

### Classificação de intenção (`src/lib/busca/intencao.ts`)

Por regras em TS, **sem chamada de modelo** — é determinístico e precisa ser rápido.

| Molde | Sinal | Resposta |
|---|---|---|
| `dispositivo` | padrão `art\.?\s*\d+`, sigla de lei | texto legal direto |
| `tema` | match em rubrica com `tipo = 'tema'` | cluster ordenado por `papel`/`peso` |
| `processual` | sigla CPP, termos de rito | dispositivos processuais |
| `doutrina` | "doutrina", "segundo", nome de autor | ver restrição abaixo |

### Restrição de doutrina (não negociável)

Doutrina é obra autoral protegida (Nucci, Greco, Bitencourt). **Não hospedar,
não indexar, não resumir de forma substitutiva.** Para o molde `doutrina`,
entregar entendimento consolidado extraído de jurisprudência (acórdão não tem
essa proteção) e link para fonte legítima. `rubricas.explicacao` é texto autoral
próprio, curto e funcional — não é resumo de doutrina.

---

## Geração da peça

Uma peça só: **resposta à acusação** (art. 396-A do CPP).
Fluxo: seleção de caso → checklist de teses aplicáveis → minuta em DOCX.

- `teses` — 10 a 15, curadas à mão, cada uma com `gatilho` (jsonb objetivo) e
  `fundamentos` (array de ids de dispositivos, validado no seed).
- `casos` — três casos de tráfico realistas e anonimizados, já no banco.
  **A demo nunca depende de upload de arquivo para funcionar.**
- `casos.fatos` usa as mesmas chaves de `teses.gatilho`, para o checklist ser
  avaliação direta, não heurística.

---

## Deploy (Vercel) — restrições que moldam o runtime

### Nenhuma conexão direta ao Postgres em runtime

Serverless + pool do Postgres esgota conexões. Como a busca é uma RPC única,
o app usa `supabase-js .rpc()` (PostgREST/HTTPS) para tudo em runtime.
Conexão direta ao banco (via pooler, porta 6543, modo transaction) apenas em
`scripts/*`, que rodam localmente — **nunca na Vercel**.

A rota de geração de DOCX declara `export const runtime = 'nodejs'`; a lib de
docx não roda no Edge.

### Nenhuma chamada a LLM em runtime

Sem autenticação (fora de escopo), qualquer rota pública que chame a API do
Claude é superfície de gasto anônima. A costura argumentativa é gerada
**offline** por `scripts/argumentar.ts`, revisada à mão, versionada em
`data/curadoria/argumentacao.yaml` e servida do banco.

Efeito colateral desejável: cada frase da minuta passa por revisão humana antes
de ir ao ar — padrão profissional real para peça jurídica.

O botão opcional "gerar ao vivo" é limitado por IP e por teto mensal (contador
no banco); estourado o teto, cai para a versão armazenada. **O demo nunca
depende do caminho ao vivo funcionar.**

Embeddings de consulta em runtime são aceitáveis: `text-embedding-3-small`
custa fração de centavo por milhão de buscas.

### O demo precisa sobreviver à inatividade

O plano gratuito do Supabase pausa projetos após alguns dias sem atividade
(historicamente ~7 — conferir política atual). Um portfólio é justamente um
link clicado semanas depois. Duas defesas somadas:

- Vercel Cron diário batendo em `/api/health`, que faz um `select` trivial.
- Páginas dos três casos renderizadas estaticamente. Se o banco cair, o núcleo
  da demonstração continua de pé; só a busca degrada.

### Segredos

`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`: server-side
apenas, **nunca com prefixo `NEXT_PUBLIC_`**. A service role ignora RLS — vazá-la
no bundle do cliente abre o banco para escrita. O front usa a chave publishable,
com RLS em somente-leitura nas tabelas de consulta.

## Autenticação

Supabase Auth, e-mail e senha, usuário único. Sem OAuth, sem papéis, sem perfil.

- **A senha não passa pelo projeto.** `signUp`/`signInWithPassword` entregam a
  credencial ao servidor de Auth, que guarda o hash em `auth.users` — schema que
  a chave publishable não enxerga. Nenhuma tabela em `supabase/migrations/` tem
  coluna de senha, e nenhum código em `src/` calcula hash, emite JWT ou gera
  token de recuperação. Não escrever nada disso.
- **Sessão em cookie, não em `localStorage`.** É `@supabase/ssr`: o
  `src/middleware.ts` renova o token e escreve os cookies na resposta (componente
  de servidor não pode escrever cookie), e `lib/auth/servidor.ts` lê a sessão nas
  páginas. Sessão em `localStorage` seria invisível ao servidor, e a proteção de
  rota viraria flash de tela no cliente.
- **Decisão de acesso sempre por `getUser()`, nunca por `getSession()`.**
  `getSession()` lê o cookie sem validar assinatura; cookie é território do
  cliente. `getUser()` valida o JWT no servidor de Auth.
- **A proteção é por exclusão.** `lib/auth/rotas.ts` lista o que é público (`/`,
  as quatro telas de auth, `/auth/*`, `/api/health`, `/api/busca`); o resto do
  `matcher` exige sessão. Rota nova nasce fechada. `(app)/layout.tsx` repete o
  `redirect` como rede de segurança caso o matcher deixe de casar algo.
- **Consequência aceita:** tudo sob `src/app/(app)/` é renderizado sob demanda,
  porque ler cookie torna a rota dinâmica. A página `/` continua estática — é ela
  que sustenta a demonstração se o banco estiver pausado.
- **Nenhum erro do Supabase chega cru à tela.** `lib/auth/mensagens.ts` traduz
  por `code`. Login diz "E-mail ou senha incorretos" nos dois casos, e a
  recuperação confirma o envio mesmo para e-mail inexistente: distinguir entrega
  a lista de quem tem conta.

**Configuração exigida no painel do Supabase** (não é código, e o fluxo trava sem
ela): Authentication → Sign In / Providers → Email → **Confirm email desligado**;
e a URL do deploy na lista de Redirect URLs, senão o link de recuperação volta
para `localhost`.

## Convenções

- Ids textuais estáveis em toda parte: `lei_11343_2006_art33_p4`,
  `dl_2848_1940_art59_inc4`. São chave de citação — **nunca renumerar**.
- Seed idempotente: upsert por id. Rodar duas vezes não duplica nada.
- Curadoria manual mora em `data/curadoria/*.yaml`, versionada e revisável em
  diff. Nunca digitar conteúdo curado direto numa migration.
- Migrations são aditivas e numeradas em `supabase/migrations/`.

## Ordem de trabalho

Incrementos verificáveis, parando ao fim de cada um para demonstração:

1. schema + seed
2. rubricas
3. busca
4. geração de peça
5. acabamento visual
