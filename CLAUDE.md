# Jesbick — consulta e geração de peças para advocacia criminal (tráfico de drogas)

Projeto de portfólio. Não é produto comercial: sem cobrança, sem multiusuário.
O critério de sucesso é que um recrutador técnico entenda em 90 segundos que o
projeto resolve um problema difícil e real.

**Escopo deliberadamente estreito:** crimes de tráfico de drogas (Lei 11.343/2006),
com Código Penal e Código de Processo Penal disponíveis para consulta.
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

O **acervo Vade Mecum** (`/vademecum`) também saiu: 75 legislações federais de
todas as áreas, para leitura. Ele não fere o recorte porque não participa de nada
que produza peça — ver "Acervo Vade Mecum" abaixo e `docs/acervo-vademecum.md`.

---

## As três decisões que definem o projeto

### 1. O texto legal nunca é gerado pelo modelo

Toda citação na minuta resolve para um `dispositivos.id` no banco. Os templates
de tese contêm marcadores `{{cite:lei_11343_2006_art33_p4}}`; o renderizador
substitui pelo texto **lido do banco** e por um link para `/dispositivo/[id]`.
O modelo escreve apenas a argumentação *entre* as citações.

`tests/citacao.test.ts` (16 asserções) varre todos os `{{cite:}}` e todos os ids
de `fundamentos` e `imputacao` da curadoria e falha se algum não existir.
Confere contra `data/normalizado/`, não contra o banco, para rodar no CI sem
rede e sem segredo — é a mesma fonte que o seed escreve. Os triggers
`valida_ids_dispositivo` e `valida_citacoes` são a segunda camada, na escrita.

Ele também guarda três contratos que não são de id: fundamento declarado tem de
ser citado no template (e vice-versa), toda chave de `gatilho` tem de existir em
todo caso, e toda tese tem de ser acionada por ao menos um caso — tese que
nenhum caso aciona não é demonstrável.

Citação quebrada é erro de compilação, não erro em audiência. **Não relaxar esse
teste.**

### 2. A camada de rubricas é o coração da busca

Advogado não busca pelo texto da lei, busca pelo apelido do instituto.
"Tráfico privilegiado" não aparece em lugar nenhum do art. 33 §4º; "roubo
majorado" não aparece no art. 157. Busca por palavra-chave no texto puro **não
acha o que o usuário procura** — daí a tabela `rubricas` com match exato e peso
dominante na fusão.

Rubricas têm duas origens (`rubricas.origem`):
- `oficial` — extraídas do artefato de extração do PDF (ver Limpeza, abaixo).
  414 rubricas marginais do CP, texto do próprio Vade Mecum.
- `curada` — 35 termos coloquiais escritos à mão para o recorte, em
  `data/curadoria/rubricas.yaml`, com 153 variantes e 96 vínculos.

**Nem a Lei de Drogas nem o CPP têm rubrica `oficial` que preste** — o Vade Mecum
imprime rubrica marginal quase só no Código Penal (414 lá, 0 na Lei de Drogas, 7
no CPP). Logo, tudo que o recorte do projeto precisa vem da
curadoria, e sem ela a busca erra de forma silenciosa e grave. Medido no banco
antes de a curadoria existir: `tráfico privilegiado` devolvia o art. 332 do CP
(tráfico de *influência*) e `associação para o tráfico` devolvia o art. 149-A
(tráfico de *pessoas*).

O match é por **igualdade exata da consulta inteira** contra `termo` ou uma
entrada de `variantes` (CTE `rub` em `0003_busca.sql`) — não é match parcial.
Por isso as variantes são o grosso do trabalho do arquivo, não enfeite: é
`variantes` que faz "olheiro" e "fogueteiro" caírem no art. 37.

Uma rubrica aponta para N dispositivos via `rubrica_dispositivos`, com `papel`
(`principal` | `correlato` | `requisito`) e `peso`. "Dosimetria da pena" é um
cluster ordenado (art. 42 da Lei de Drogas como principal, arts. 59 e 68 do CP
como correlatos), não um artigo só.

O seed aborta se uma rubrica curada usar slug de oficial (o upsert por slug
converteria a oficial em curada), se houver slug repetido, ou se algum
`dispositivos[].id` não existir no banco.

### 3. A data de corte é visível o tempo todo

Os JSONs são uma fotografia de **fevereiro/2025** (Vade Mecum Senado Federal,
1ª ed.). Citar redação revogada em peça criminal é grave. `leis.vigencia_ate`
é renderizado em banner global e ao lado de cada dispositivo.

O mesmo vale para cobertura: `leis.cobertura` é `integral` ou `parcial`, e todo
dispositivo de lei parcial exibe o aviso. As três leis do corpus são hoje
`integral` — o mecanismo fica de pé para a próxima lei que entrar recortada.
Silenciar cobertura seria o mesmo erro de classe que silenciar a data de corte.

---

## Fontes de dados

| Arquivo | Lei | id | Cobertura | Origem |
|---|---|---|---|---|
| `data/lei11343.json` | Lei Antidrogas 11.343/2006 | `lei_11343_2006` | integral (93 arts) | `vade_parser.py` |
| `data/codigo_penal.json` | Código Penal (DL 2.848/1940) | `dl_2848_1940` | integral (416 arts) | `vade_parser.py` |
| `data/codigo_processo_penal.json` | CPP (DL 3.689/1941) | `dl_3689_1941` | integral (821 arts) | `vade_parser.py` |

**`vade_parser.py` está validado. Não reescrever.** Trate os JSONs como fonte de
dados imutável — a limpeza acontece em `scripts/normalize.ts`, nunca editando os
JSONs no lugar.

Como rodar o parser (o caminho do PDF deixou de ser fixo; use `VADE_PDF` para
trocá-lo):

```
python -m venv .venv && .venv/Scripts/pip install pdfplumber
.venv/Scripts/python vade_parser.py <pag_inicial> <pag_final> <lei_id> "<nome>" <saida.json>
```

Intervalos conferidos no PDF: **CPP = 366 a 422**. Não use 423: a página só
carrega o título do Código Tributário Nacional, que vaza para dentro do art. 811.
Não use 424: ela traz o índice sistemático do CTN, que vaza 8 mil caracteres para
o mesmo artigo.

### O CPP deixou de ser subconjunto digitado à mão

O documento prescrevia digitar ~25 artigos e marcar `cobertura = parcial`. A
premissa era que o Vade Mecum não trazia o CPP — e não se sustenta: ele está no
mesmo PDF, e o mesmo parser o extrai inteiro, com a mesma data de corte.

**Digitar à mão seria produzir texto legal fora da fonte, que é exatamente o que
a decisão nº 1 proíbe.** Um CPP com buracos ainda obrigaria toda tela a exibir
aviso de cobertura para uma limitação autoinfligida. A máquina de `cobertura =
parcial` continua no schema e nas telas, sem nenhuma lei a usar por enquanto.

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

### A. Rubrica marginal colada (385: 379 no CP, 6 no CPP, 0 na Lei 11.343)

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

Isso torna a limpeza uma *feature*: as rubricas removidas viram `rubricas` com
`origem = 'oficial'`, já ligadas ao dispositivo exato. São 379 extraídas do fim
de bloco; somadas às que vêm dos 115 headings, dão as 414 rubricas oficiais no
banco.

Heurística de detecção: fragmento final após pontuação de fim de frase, sem
pontuação terminal própria, iniciando em maiúscula, ≤ ~70 caracteres, sem
`"Pena –"`. **É heurística e vai ter falsos positivos** —
`scripts/audit.ts` gera o diff `texto_bruto → texto` das alterações para
revisão manual antes do seed. `dispositivos.texto_bruto` guarda sempre o original.

### B. Marcadores de nota de rodapé colados (58 ocorrências)

`"...integre organização criminosa.2"`, `"...prevenção do crime:5"`,
`"...em legítima defesa;1"`. Dígito de 1–2 casas colado logo após pontuação, em
fim de bloco. Corrompe o texto legal citado na peça — remover, nunca dentro de
números como `1.500` ou `art. 33`.

### C. Ordinais como letra `o` (179 alterações registradas)

`§ 1o` → `§ 1º`, `Lei no 9.099` → `Lei nº 9.099`. Normalizar para exibição e
para o índice de busca.

Das 566 ocorrências brutas do PDF, a maioria é o marcador `§ 1o` no início do
bloco, que vira `rotulo` na extração e nunca chega ao texto. O que sobra dentro
do texto é o que `normalize.ts` altera de fato — 98 alterações no relatório. A
regra `no` → `nº` só dispara depois de palavra que anuncia diploma legal, ou
diante de separador de milhar: `"no 1º grau"` é português legítimo, não
abreviação.

> **Os números desta seção vêm de `data/normalizado/relatorio.json`, não da
> memória.** Foram corrigidos depois de a auditoria encontrar divergência entre
> o que o documento afirmava e o que o pipeline registrava. Com o CPP no corpus
> são 677 alterações. `/fontes` lê o mesmo relatório, então tela e documento não
> podem mais divergir sem que os dois mudem juntos. Ao reexecutar
> `npm run normalize`, conferir se estes números mudaram.

### D. Nota do Editor dentro do texto legal (42 blocos)

Não é o marcador da classe B — é o **corpo** da nota, emendado no meio da frase:

    "…mediante contraprestação 6 NE: ver ADPF no 569. irrisória, a partir…"

Os marcadores são sequenciais no documento (1–2 na Lei 11.343, 1–13 no CP).
**Não é regex-ável com segurança:** uma das notas contém `art. 2o da Lei no
7.209/1984`, e qualquer regra "corta até o primeiro ponto" decepa o texto legal
junto. Os cortes exatos estão em `data/curadoria/notas_editor.yaml`;
`normalize.ts` **aborta** se sobrar qualquer `NE:` ou se uma entrada deixar de
casar.

### E. Parágrafos que não existem (11 blocos)

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
**Os três passos estão implementados e verificados** — ver "A minuta" abaixo.

- `teses` — 13 curadas à mão em `data/curadoria/teses.yaml`, cada uma com
  `gatilho` (jsonb objetivo), `fundamentos` (ids de dispositivos) e
  `template_md` com os marcadores `{{cite:}}`.
- `casos` — três casos de tráfico realistas e anonimizados em
  `data/curadoria/casos.yaml`, já no banco.
  **A demo nunca depende de upload de arquivo para funcionar.**
- `casos.fatos` usa as mesmas chaves de `teses.gatilho`, para o checklist ser
  avaliação direta, não heurística. A avaliação é `aplicaA()`, em `lib/dados.ts`,
  e aparece em `/pecas`. Todo caso carrega **todas** as chaves de gatilho,
  inclusive as desfavoráveis: chave ausente viraria `undefined`, e "não apurado"
  passaria por "não ocorreu".
- `jurisprudencia` só recebe entendimento com tribunal identificado. `url` fica
  ausente onde o endereço oficial não foi conferido, em vez de ser derivado do
  número — mesma regra do acervo Vade Mecum.

### A minuta

`GET /api/peca/[casoId]` devolve o `.docx`. `export const runtime = 'nodejs'` —
a lib docx não roda no Edge. A rota exige sessão (não está em `PUBLICAS`).

Quatro arquivos, com uma responsabilidade cada:

- `lib/peca/resolver.ts` — resolve `{{cite:id}}` contra um mapa de dispositivos.
  É aqui que a decisão nº 1 vira código, e **não importa cliente nenhum**:
  `lib/supabase.ts` lança no import quando falta variável de ambiente, e um
  teste que exigisse segredo não rodaria no CI. A separação é o que permite
  `tests/peca.test.ts` montar a peça inteira offline.
- `lib/peca/montar.ts` — busca esses dispositivos em `v_dispositivo`, **numa
  consulta só** para a peça inteira (são ~19 citações por minuta; uma ida por
  marcador transforma o download em espera).
- `lib/peca/docx.ts` — só formatação: A4, margens 3/2 cm, corpo 12 pt com
  entrelinha 1,5, e transcrição de dispositivo recuada 4 cm em 10 pt. O recuo
  não é enfeite: é o que separa, num relance, o que a defesa afirma do que a lei
  diz.
- `app/api/peca/[casoId]/route.ts` — lê caso e teses, aplica o **mesmo**
  `aplicaA()` da tela e empacota.

**Sem modo degradado.** Se um `{{cite:}}` não resolver, `montarPeca` lança
`CitacaoOrfa` e a rota devolve 500 com os ids. Minuta com marcador cru
envergonha; minuta com a citação silenciosamente omitida vai a juízo com
fundamento vazio. Essa é a terceira camada — as outras duas são
`tests/citacao.test.ts` e os triggers.

Tela e arquivo saem do mesmo cálculo, de propósito: se divergissem, a
conferência feita no checklist não valeria para o arquivo protocolado.

Nenhuma chamada a modelo em runtime, e não por economia — a argumentação já está
escrita e revisada em `teses.yaml`, e o texto legal vem do banco. Não há frase na
peça que alguém não tenha lido antes.

A data de corte vai no rodapé de toda página, junto da contagem de dispositivos
transcritos: a decisão nº 3 tem de sobreviver ao download.

Autos, nome e OAB ficam como campos a preencher. Os casos são anonimizados, e
inventar número de processo seria o dado plausível e falso que este projeto
existe para não produzir.

`tests/peca.test.ts` (9 asserções, offline) monta a minuta de **todos** os casos
contra `data/normalizado/` e confere que: nenhum caso fica sem citação, todo
dispositivo citado tem texto e rótulo não vazios, nenhum marcador cru sobrevive,
citação órfã e fundamento órfão derrubam a montagem com o id nomeado, o `.docx`
é zip válido sem escape duplo, o texto de cada dispositivo citado aparece dentro
do arquivo, e a data de corte sai impressa no rodapé.

O rodapé é `word/footer1.xml`, parte separada do pacote — procurá-lo em
`word/document.xml` dá falso negativo.

Conferido por mutação: engolir a citação em `fatia()` (o modo de falha
silencioso, em que a peça sai sem o texto legal e sem erro) faz o teste falhar
com "minuta sem nenhuma citação".

**Restrição herdada do corpus:** a peça é do art. 396-A do CPP, mas o CPP não
está semeado (`data/cpp_subconjunto.json` não existe; o banco tem duas leis).
Por isso nenhum `fundamentos` e nenhum `{{cite:}}` aponta para o CPP — apontar
quebraria o seed, corretamente. As 13 teses são todas de direito material; as de
rito entram quando o subconjunto do CPP for digitado e normalizado.

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
- **A proteção é por exclusão.** `lib/auth/rotas.ts` lista o que é público (as
  quatro telas de auth, `/auth/*`, `/api/health`, `/api/busca`); o resto do
  `matcher` exige sessão. Rota nova nasce fechada. `(app)/layout.tsx` repete o
  `redirect` como rede de segurança caso o matcher deixe de casar algo.
- **`/` não é tela, é desvio.** Não há página inicial: quem tem sessão cai em
  `/consulta`, quem não tem cai em `/login`. O middleware decide (`ehRaiz`),
  antes de consultar a lista de públicas; `src/app/page.tsx` só repete o desvio
  como rede de segurança, mandando para `/login` sem ler sessão — quem já entrou
  é devolvido a `/consulta` pela regra de `ehFormularioDeAuth`, então o atalho
  acerta nos dois estados sem gastar uma ida ao servidor de Auth.
- **Consequência aceita:** tudo sob `src/app/(app)/` é renderizado sob demanda,
  porque ler cookie torna a rota dinâmica. Com `/` fora do ar como tela, o que
  sustenta a demonstração de banco pausado é `/vademecum`, que lê do disco.
- **Nenhum erro do Supabase chega cru à tela.** `lib/auth/mensagens.ts` traduz
  por `code`. Login diz "E-mail ou senha incorretos" nos dois casos, e a
  recuperação confirma o envio mesmo para e-mail inexistente: distinguir entrega
  a lista de quem tem conta.

**Configuração exigida no painel do Supabase** (não é código, e o fluxo trava sem
ela): Authentication → Sign In / Providers → Email → **Confirm email desligado**;
e a URL do deploy na lista de Redirect URLs, senão o link de recuperação volta
para `localhost`.

## Acervo Vade Mecum

75 legislações federais para consulta livre, em `/vademecum`. Espelho do Planalto
importado de `RenanSantos7/Vade-Mecum` num SHA fixado (commit de 03/05/2025) por
`scripts/vademecum.ts`, para `data/vademecum/`. Detalhe completo em
`docs/acervo-vademecum.md`.

**É acervo de leitura, não corpus citável — e a separação é a regra que não se
negocia.** O texto vem de espelho de terceiro, sem data de vigência conferida. Se
pudesse virar fundamento de peça, a decisão nº 3 estaria perdida.

- Ids do acervo (`cf`, `cdc`) nunca casam o padrão do corpus (`dl_2848_1940`).
- Nada é escrito em `dispositivos`; sem embedding; a busca híbrida não enxerga.
- `seed.ts`, `embed.ts`, `normalize.ts` e `busca/consultar.ts` **não podem
  referenciar `vademecum`** — `tests/vademecum.test.ts` falha se alguém ligar.
- Toda tela do acervo carrega selo, aviso de procedência e, no CP e no CPP, link
  cruzado para o lado curado.

**Não derivar URL do Planalto pelo número da lei.** 42 das 75 estão sem link
oficial porque o espelho não trouxe. `itcmd` é lei do Rio de Janeiro e `estsppi`
é do Piauí: norma estadual não está no `ccivil_03`, e a URL montada pelo número
abriria a lei federal homônima. A tela diz que o link falta; a curadoria vai em
`data/curadoria/vademecum.yaml`, conferida com
`npm run vademecum -- --verificar-links`.

Runtime lê do disco, sem Supabase: é a única parte do produto que continua
inteira com o banco pausado.

## Design system — TOGA v2

A interface é a implementação de `Design_system/TOGA v2 - Assistente Jurídico.dc.html`,
um protótipo vivo de 1440×940. Tema **claro**: fundo `#f7f8fa`, lateral `#f1f2f6`,
acento roxo `#3a3960`. Duas famílias, e cada uma tem um trabalho: **Inter Tight**
é a voz da interface (rótulo, botão, metadado) e **Source Serif 4** é a voz do
texto jurídico (lei, ementa, súmula, resposta do assistente). A divisão separa,
sem precisar de moldura, o que o produto afirma do que o produto cita.

O documento desenha tudo em `style=""` inline. Aqui cada valor vira token uma vez
só, no bloco `@theme` de `src/app/globals.css` (`bg-tg-acento`, `text-tg-fraco-2`).
`src/lib/toga/tokens.ts` guarda **apenas** o que a folha de estilo não alcança:
cor escolhida por índice, valor calculado em runtime e cor dentro de gradiente.
Cor nova que possa ser classe **tem** que ser classe.

### As quatro telas

| Rota | Tela | De onde vêm os dados |
|---|---|---|
| `/consulta` | chat, painel de fonte, dosimetria e histórico | `/api/busca` + `localStorage` |
| `/jurisprudencia` | entendimento consolidado | `teses.jurisprudencia` (jsonb) |
| `/dosimetria` | cálculo trifásico ao vivo | aritmética local, sem banco |
| `/vademecum` | grade de ramos + leitor | índice do acervo, em disco |

A lateral tem quatro itens: Consulta, Jurisprudência, Dosimetria e Vade Mecum.
O documento desenha seis, e as demais saíram a pedido, para o sistema ficar só
com o que se usa.

Atrás do `⌄` sobraram duas, e sobraram por serem **destino, não ponto de
partida**: `/leis` (o corpus navegável) e `/pecas` (onde a minuta é baixada).
Com elas ficam `/artigo/[id]` e `/dispositivo/[id]`, que não são navegação —
são o alvo dos links de citação, e removê-los quebraria a decisão nº 1.

Removidas: `/sumulas`, `/fontes`, `/painel`, `/busca`, `/suporte`,
`/configuracoes`, `/fila`, `/processos` e `/relatorios`. As quatro primeiras
duplicavam o que a Consulta já faz ou eram diagnóstico de desenvolvimento; as
três últimas eram avisos de "fora de escopo" que nem estavam no menu.

### O chat é a tela principal

Duas coisas moram nele além da busca, e as duas seguem a mesma regra: nada de
cálculo nem de estado duplicado.

**Dosimetria dentro da resposta.** Um cartão recolhido aparece em **toda**
resposta, porque a pergunta de um advogado raramente diz "calcule a pena" — ele
pergunta sobre o § 4º, e a pena é a consequência que ele quer ver. Um cartão
condicionado a palavra-chave erraria justamente aí.

A conta vem de `lib/toga/dosimetria.ts`, **a mesma** que a tela de Dosimetria
usa. Antes a aritmética morava dentro do componente da tela; duas cópias
divergiriam na primeira correção, e divergir aqui é a tela dizer uma pena e o
cartão dizer outra sobre o mesmo caso. `tests/dosimetria.test.ts` (16 asserções)
tranca as regras que a conta tem de respeitar: Súmula 231 na segunda fase, peso
dobrado do art. 42 na primeira, e terceira fase podendo cair abaixo do mínimo.

`leDaConversa()` lê da pergunta os fatos que sabe representar — "reincidente",
"primário", "3 kg", "perto de escola". É reconhecimento de termo, não
interpretação: **o que não é reconhecido não vira suposição**, fica no padrão, e
os chips mostram o que foi lido para o usuário conferir.

**Histórico de conversas.** `lib/toga/historico.ts`, em `localStorage`. A lista
"Recentes" da lateral era uma lista fixa de sugestões — promessa falsa, já que
nada ali tinha sido consultado por ninguém. Agora lista conversas reais, e as
sugestões só aparecem enquanto não houver nenhuma.

Guarda a resposta **crua** da busca, não a prosa composta: a prosa é derivada e
`comporResposta()` a reconstrói igual, então guardar o derivado dobraria o
tamanho e congelaria uma segunda versão da mesma frase. Reabrir é `?c=<id>`, e a
conversa volta já pronta — reanimar a digitação de algo que o usuário veio reler
seria fazê-lo esperar de novo.

**A consequência é aceita e precisa ser dita: o histórico não atravessa navegador
nem máquina.** Uma tabela exigiria migration, policy de RLS e uma ida de rede a
cada troca, para guardar o que o navegador guarda de graça num produto de usuário
único. Se isso passar a importar, o caminho é uma tabela `conversas` com RLS por
`auth.uid()`, e o módulo vira a interface que ela implementa.

Os links que apontavam para elas foram redirecionados, não apagados: a página
de erro e a de 404 agora levam à Consulta, e a rubrica clicável do artigo abre
`/consulta?p=<termo>` — a mesma busca híbrida que `/busca` fazia.

### Onde o desenho foi recusado, e por quê

O protótipo é de outro produto: ele raspa DOU e DataJud, indexa acórdão, mostra
214 diplomas com vigência de hoje e redige análise jurídica em parágrafos. Isso
colide de frente com as três decisões deste projeto. A forma foi mantida ao
pixel; o conteúdo foi trocado pelo verdadeiro.

- **A prosa do chat não é gerada por modelo.** Ela é composta em
  `src/lib/toga/resposta.ts` a partir de **fatos sobre a busca**: qual molde a
  classificação reconheceu, se a rubrica bateu, quantos dispositivos vieram, qual
  a data de corte, o que degradou. Tudo verificável na mesma tela. O conteúdo
  jurídico fica onde tem de ficar — no texto do dispositivo, lido do banco, no
  painel da fonte. Efeito colateral bom: a resposta explica a própria busca.
- **A digitação é animação, os passos são reais.** 7 caracteres a cada 16 ms,
  como no documento; o texto já chegou inteiro e está sendo revelado. Os quatro
  passos são os do pipeline, e o `meta` de cada um é o número que aquele passo
  produziu.
- **Esqueleto só onde a espera existe.** O documento aciona esqueleto a cada
  toque em filtro. Em `/jurisprudencia` filtrar é local e síncrono; o esqueleto
  ficou no `loading.tsx`, onde a espera é a ida ao Supabase.
- **Barra de progresso não chega a 100% antes do resultado.** Em `/fontes` ela
  para em 92% e só fecha quando `/api/health` responde.
- **Nada de linha do tempo do dispositivo.** O produto não guarda redações
  anteriores; o painel mostra procedência (data de corte, cobertura, id de
  citação). Inventar três redações seria o dado plausível e falso que a decisão
  nº 3 existe para impedir.
- **O cartão "Base sincronizada" virou "Base conferida".** Mesma forma — ponto
  vivo, rótulo, linha de apoio — carregando a data de corte, que é a decisão nº 3
  e não pode depender de a tela da vez lembrar de mostrá-la.
- **`/dosimetria` calcula tráfico, não roubo.** O documento dosa o art. 157 do CP;
  o recorte é o art. 33 da Lei 11.343 (5 a 15 anos). Não é troca cosmética: o
  tráfico tem o art. 42, que manda a natureza e a quantidade da droga
  **preponderarem** sobre o art. 59 — daí o nono vetor, com peso dobrado.

`prefers-reduced-motion` desliga todo o movimento. O documento não trata disso —
protótipo não precisa; produto precisa.

## Convenções

- Ids textuais estáveis em toda parte: `lei_11343_2006_art33_p4`,
  `dl_2848_1940_art59_inc4`. São chave de citação — **nunca renumerar**.
- Seed idempotente: upsert por id. Rodar duas vezes não duplica nada.
- Curadoria manual mora em `data/curadoria/*.yaml`, versionada e revisável em
  diff. Nunca digitar conteúdo curado direto numa migration.
- Migrations são aditivas e numeradas em `supabase/migrations/`.

## Ordem de trabalho

Incrementos verificáveis, parando ao fim de cada um para demonstração:

1. schema + seed — feito: 3 leis, 1330 artigos, 3653 dispositivos, todos com vetor
2. rubricas — feito: 421 oficiais + 35 curadas, com 153 variantes
3. busca — feito: RPC única, com a ordem do cluster corrigida em 0005
4. geração de peça — feito: `/api/peca/[casoId]`, ver "A minuta" acima
5. acabamento visual — feito: TOGA v2 implementado, ver "Design system" acima

Os cinco incrementos estão de pé. O que falta é acabamento, não estrutura — a
lista está no fim deste arquivo.

## Verificação

`npm run verificar` roda os três de uma vez: `eslint .`, `tsc --noEmit` e
`vitest run`. É o que se roda antes de commitar.

O build também quebra com o lint (`eslint.ignoreDuringBuilds: false`). Antes a
flag era `true`, e o efeito não era "o lint falha e nós ignoramos": **não havia
configuração de ESLint alguma**, e a flag escondia a ausência — build verde não
dizia nada sobre o código. Conferido por mutação: uma variável não usada em
`resolver.ts` derruba `npm run build` com `no-unused-vars`.

`eslint.config.mjs` é flat config com o plugin do Next via `FlatCompat`, porque
`next lint` está deprecado no Next 16. Três desvios do padrão, todos com motivo
escrito no arquivo: `argsIgnorePattern: '^_'` (a rota de peça recebe `_req`),
`no-non-null-assertion` desligado em `scripts/` e `tests/`, e `data/` fora do
lint por ser fonte de dados, não código.

A única supressão pontual no código é `@next/next/no-page-custom-font` em
`app/layout.tsx`: a regra existe para o Pages Router, onde a fonte declarada numa
página só carrega ali; aqui o link está no layout raiz do App Router. Trocar por
`next/font` está recusado de propósito — baixaria a fonte em build e impediria
buildar sem rede.

As três suítes (41 asserções) rodam **offline**, sem segredo: `citacao` e `peca`
leem `data/normalizado/`, e `vademecum` lê o acervo em disco.

## Pendências conhecidas

- **`art. 761` do CPP termina em `"art. 82.49"`.** O `49` é marcador de rodapé
  que a regra B recusa remover, por ser indistinguível de decimal (`82.49`).
  Aparece em `relatorio.json` como o único suspeito. Fora do recorte.
- **`argumentacao` e `uso_llm` estão vazias e sem uso.** A costura offline por
  `scripts/argumentar.ts` não existe, e hoje não é necessária: a argumentação
  vive em `teses.template_md`, escrita à mão. O botão "gerar ao vivo" e o teto
  mensal do CLAUDE.md nunca foram implementados — não invente que existem.
- **`/sumulas` e `/fontes` foram removidas** a pedido, para o sistema ficar só
  com o que se usa. Saíram por inteiro: rota, componente e módulo de dados
  (`lib/toga/sumulas.ts` e `lib/toga/pipeline.ts`). Nada mais as importava, e o
  `outputFileTracingIncludes` de `/fontes` saiu junto. Se voltarem, o relatório
  do normalize continua em `data/normalizado/relatorio.json` — a fonte que
  `/fontes` lia nunca esteve na tela.
