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
Geração da resposta do chat: OpenAI (`gpt-5.4-mini` por padrão, `OPENAI_MODEL`),
com structured output estrito, por `fetch` cru — sem SDK no runtime, como já era
com os embeddings.

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
entrada de `variantes`, **ou pelo termo contido na frase** quando ele tem 12 ou
mais caracteres normalizados (CTE `rub`, hoje em `0011_rubrica_na_frase.sql`).
Por isso as variantes são o grosso do trabalho do arquivo, não enfeite: é
`variantes` que faz "olheiro" e "fogueteiro" caírem no art. 37.

**O match contido entrou em 0011, e entrou por um bug caro.** Até então era só
igualdade da consulta inteira, o que funciona para quem digita "associação para
o tráfico" na caixa e falha para quem pergunta "Associação para o tráfico e
concurso de pessoas: qual a diferença?". A frase nunca é igual à rubrica, a
perna de rubrica não dispara, e sobram léxico e vetor — que devolviam o art.
149-A do CP, tráfico de PESSOAS. É o mesmo erro que esta seção descreve como
motivo de a camada existir, reaparecendo pela porta dos fundos assim que a
consulta vira frase. Conferido antes e depois de 0011: a mesma pergunta passa a
devolver o art. 35 da Lei 11.343, via rubrica.

A trava contra falso positivo é o comprimento. Só termo com 12+ caracteres pode
casar contido; sem isso "tráfico" (7) casaria em toda pergunta sobre tráfico e a
rubrica — que tem peso dominante na fusão — mandaria em consultas que ela não
entende. Igualdade exata continua valendo para qualquer comprimento.

O erro só ficou visível quando a resposta do chat passou a ser redigida a partir
do contexto recuperado: com a prosa composta de fatos sobre a busca, trazer o
artigo errado passava por "resultado ruim"; com a resposta gerada, vira um texto
inteiro sobre o crime errado.

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

### Nenhuma chamada a LLM no caminho padrão

A regra nunca foi "LLM é proibido", e sim "nenhuma rota que responda sem sessão
pode gastar com modelo". Sem autenticação, uma rota pública que chame a API do
Claude é superfície de gasto anônima — e a autenticação, quando entrou, não
apagou a regra: apagou o motivo de ela ser absoluta.

**A minuta continua sem modelo nenhum**: a argumentação da peça está escrita à
mão em `teses.yaml`, e não há chamada a modelo em `/api/peca/[casoId]`. Cada
frase do `.docx` passou por revisão humana, que é padrão profissional real para
peça jurídica.

**A resposta do chat, essa, é gerada** — `/api/consulta/aovivo` é o caminho
padrão da Consulta desde que a prosa composta se mostrou o que era: verdadeira e
sempre igual, qualquer que fosse a pergunta. Explicar o próprio pipeline é bom
como rodapé; não serve como resposta. `comporResposta()` não foi removida —
virou a rede de segurança, e é ela que responde quando falta chave, falta rede,
o teto estoura, o modelo recusa ou a validação recusa duas vezes.

A rota é o único ponto do produto que chama um modelo em runtime. Três freios,
em camadas:

1. a rota **exige sessão** — não está em `lib/auth/rotas.ts`, e rota nova nasce
   fechada;
2. limite por IP na memória do processo — quebra-molas, não portão: em
   serverless cada instância tem o próprio mapa;
3. **teto mensal no banco**, `consome_uso_llm()` (migration 0010), 200 chamadas
   por mês. A função decide e escreve na mesma instrução, então duas requisições
   simultâneas não passam juntas pela última vaga. Conferido: com `teto = 1`, a
   segunda chamada devolve `permitido = false`.

`uso_llm` deixou de ser tabela morta: era a única peça de 0001 que nunca tinha
sido usada, e é ela que sustenta o teto.

**O demo nunca depende do caminho ao vivo funcionar.** Sem `ANTHROPIC_API_KEY` a
rota devolve 503, e a resposta composta continua na tela. Falha de rede, teto
estourado, recusa do modelo, validação recusada duas vezes: em todos os casos o
que já estava na tela permanece e a interface diz o motivo ao lado do botão.

Embeddings de consulta em runtime continuam aceitáveis: `text-embedding-3-small`
custa fração de centavo por milhão de buscas.

### O contrato da geração

Não se pede prosa ao modelo; pede-se **JSON com esquema fechado** (structured
output), e o servidor valida antes de a tela ver. Quatro arquivos em
`lib/consulta/`, um trabalho cada:

- `contrato.ts` — tipos, o esquema JSON e a instrução do sistema.
- `valida.ts` — as quatro recusas. Puro, offline.
- `enriquece.ts` — o banco sobrescreve tudo que não é argumentação. Puro.
- `aovivo.ts` — a chamada ao `claude-opus-5`, o streaming e a regeneração.

**O esquema é curto de propósito.** O modelo devolve `paragraphs[]` (texto +
índices de citação), `sources[]` (só `id` e `doc_id`), `confidence` e
`followups`. Rótulo, trecho, vigência, cobertura, status e `url` **não são
pedidos** — vêm do `Achado` que a busca recuperou. Pedir vigência ao modelo seria
deixá-lo afirmar que um artigo está em vigor, que é a informação plausível e
falsa que a decisão nº 3 existe para impedir. Pedir o trecho seria deixá-lo
gerar texto de lei, que a decisão nº 1 proíbe.

`checked_at` não existe, e não por esquecimento: não há coletor conferindo nada.
O que existe é `vigencia_ate` — a data em que a fotografia foi tirada. Carimbar
"conferido às 06:12 de hoje" sem que nada tenha conferido seria o pior tipo de
mentira que este produto pode contar.

`penalty_calc` também ficou fora. Os fatos da dosimetria já são extraídos por
`leDaConversa()`, por regra, em TS, com 16 asserções travando a conta — pedir a
mesma extração ao modelo criaria um segundo extrator para divergir do primeiro.

**As quatro recusas de `valida()`**, todas no servidor, todas testadas offline:

| Recusa | Por quê |
|---|---|
| `doc_id` fora do contexto recuperado | id que não veio da busca é alucinação, mesmo existindo no banco |
| citação para `sources[].id` inexistente | marcador que não abre nada é pior que nenhum |
| forma diferente do esquema | segunda camada, para o dia em que o esquema mudar |
| **transcrição de lei** | doze palavras seguidas iguais às de um dispositivo do contexto e a resposta cai: a decisão nº 1 diz que texto legal nunca é gerado, e "gerar" inclui copiar do contexto para a prosa |

Recusado, o servidor **regenera uma vez** com a violação nomeada. Recusado de
novo, cai para a resposta composta. Não há terceira tentativa: ela custa o dobro
do tempo para um caso que já se mostrou ruim.

**Sem modelo de reserva, e é decisão.** A recomendação usual é declarar um
segundo modelo para o caso de o primeiro recusar. Aqui já existe reserva melhor:
`comporResposta()`, que não custa nada e não pode falhar. Pagar uma segunda
chamada de modelo para recuperar o que uma função pura entrega seria trocar o
determinístico pelo caro.

**A prosa gerada é guardada no histórico**, ao contrário da composta. A composta
é derivada e `comporResposta()` a reconstrói igual; a gerada não — pedir de novo
ao modelo daria outro texto, e reabrir uma conversa para encontrar uma resposta
diferente da que se leu é pior que não ter histórico. `conversa_trocas.resposta`
passou a guardar `{ bruta, gerada }`; `leResposta()` reconhece as duas formas, e
linha antiga continua abrindo.

**Streaming.** Os passos animados são os eventos reais do pipeline, emitidos
enquanto rodam. O texto é revelado token a token por um leitor incremental
(`LeitorDeTexto`) que extrai os campos `text` do JSON parcial — o modelo emite
JSON, a tela não pode mostrar JSON. **A prévia nunca é a resposta**: ela é
descartada quando o objeto fecha e passa na validação, e o que fica é o objeto
validado. Fontes e cartão só aparecem nesse momento.

`enriquece()` devolve um `RespostaComposta` — o mesmo tipo de `comporResposta()`.
Não é coincidência: é o que permite a tela ter um renderizador só e o caminho ao
vivo cair para o composto sem pulo de layout.

**A resposta sai do acervo, não da memória do modelo.** A regra zero da
instrução diz que o bloco de `<dispositivo>` é a única fonte, que o modelo não
tem acesso à internet e não deve simular ter, e que conhecimento vindo do
treinamento não vale como fonte aqui — mesmo estando certo, ele não é conferível
nesta tela, e o usuário confere a resposta contra os dispositivos que aparecem
ao lado dela. Sem contexto que sustente a pergunta, o modelo diz isso na
primeira frase e usa confidence `baixa`.

A parte estrutural disso não depende de prompt: a chamada não declara ferramenta
nenhuma, então navegar não é uma capacidade que o modelo tenha nesta rota, e a
validação recusa qualquer `doc_id` que não veio da busca. O prompt cuida do que
a validação não alcança — a prosa apoiada em memória, que não cita id nenhum.

Conferido com uma pergunta que o corpus não responde (o enunciado da Súmula 512
do STJ): a resposta diz que o contexto não a traz, nomeia o que ele cobre (§ 4º
do art. 33, art. 42, caput do art. 33) e não inventa o enunciado.

**O aviso de origem tem duas redações**, e essa é a parte que não se negocia:
resposta composta diz "nenhum parágrafo acima foi escrito por modelo"; resposta
gerada nomeia o modelo, diz de quantos dispositivos recuperados ela saiu e
afirma que não houve consulta à internet. Manter a primeira frase numa resposta
gerada seria mentir na única linha da tela que existe para não mentir.

**O nome do modelo vem do servidor, no evento `fim`** — a tela não o adivinha. A
primeira versão trazia `claude-opus-5` escrito no JSX, e continuou exibindo isso
depois da troca de provedor: o aviso que existe para não mentir passou a mentir
sobre si mesmo. Com `OPENAI_MODEL` configurável, qualquer nome fixo no cliente
nasce errado.

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
- No CP e no CPP, a tela do acervo traz link cruzado para o lado curado.

**O aviso âmbar de procedência foi removido a pedido.** Ele abria a grade e o
leitor, e atrapalhava quem só queria localizar uma lei. **A separação não
dependia dele** — ela é estrutural, e os quatro pontos acima continuam valendo
sem uma linha de texto na tela. O que saiu foi o aviso, não a garantia.

O que ficou, e por quê: o link para o texto oficial no Planalto (atalho, não
advertência), o link cruzado para o corpus curado, e o crédito de licença no
rodapé do leitor — este é obrigação para com o espelho de terceiro, não escolha
de produto, e não deve ser removido.

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

### As sete telas

| Rota | Tela | De onde vêm os dados |
|---|---|---|
| `/consulta` | chat, painel de fonte, dosimetria e histórico | `/api/busca` + `conversas` |
| `/jurisprudencia` | entendimento consolidado | `teses.jurisprudencia` (jsonb) |
| `/dosimetria` | cálculo trifásico ao vivo | aritmética local, sem banco |
| `/vademecum` | grade de ramos + leitor | índice do acervo, em disco |
| `/clientes` | cadastro do escritório | `clientes` (RLS por sessão) |
| `/fontes` | vigília sobre a data de corte | `vigilia_*` (migration 0012) |
| `/configuracoes` | perfil, garantias, fontes, aparência, segurança | `perfil` + `leis` do banco |

**A lateral colapsa** para uma trilha de 64px, por `⌘B` ou pelo botão ao lado da
marca, com a preferência guardada em `localStorage`. Não contradiz a largura
fixa: são dois valores fixos, 246 e 64, e não uma lateral fluida. Só a partir de
`lg` — abaixo disso ela já é uma gaveta, e recolher gaveta não quer dizer nada.

Na trilha somem rótulos, histórico, busca e o cartão de base; ficam a marca,
"Nova consulta", os seis quadradinhos com `title` e **o ponto vivo da data de
corte**, porque a decisão nº 3 diz que a data é visível o tempo todo e "recolhi o
menu" não é motivo para ela sumir.

A lateral tem sete itens: Consulta, Jurisprudência, Dosimetria, Vade Mecum,
Clientes, Fontes e atualizações e Configurações. O documento desenha seis; o
sétimo é a vigília, que voltou a pedido — ver "Vigília do corpus" abaixo.

Atrás do `⌄` sobraram duas, e sobraram por serem **destino, não ponto de
partida**: `/leis` (o corpus navegável) e `/pecas` (onde a minuta é baixada).
Com elas ficam `/artigo/[id]` e `/dispositivo/[id]`, que não são navegação —
são o alvo dos links de citação, e removê-los quebraria a decisão nº 1.

Removidas: `/sumulas`, `/painel`, `/busca`, `/suporte`, `/fila`, `/processos` e
`/relatorios`. As três primeiras duplicavam o que a Consulta já faz ou eram
diagnóstico de desenvolvimento; as quatro últimas eram avisos de "fora de
escopo" que nem estavam no menu.

`/fontes` também estava nesta lista e **voltou com outro trabalho**. Ela saíra
por ser diagnóstico do pipeline de normalização; hoje é a vigília do corpus, que
é pergunta de produto e não de desenvolvimento — ver a seção abaixo.

### Configurações

`/configuracoes` voltou a pedido, com a forma do documento (trilha de 250px,
cartões de raio 20, listas de opção com interruptor à direita) e o conteúdo
trocado pelo que existe de verdade. O documento ajusta outro produto — 12
assentos de escritório, fatura de R$ 2.390/mês, cinco coletores em Python,
sincronização do DOU a cada 30 minutos —, e desenhar isso encheria a tela do
dado plausível e falso que a decisão nº 3 existe para impedir.

| Seção do documento | Aqui | Por quê |
|---|---|---|
| Perfil e OAB | Perfil e OAB | igual; guardado no navegador |
| IA e citações | IA e citações | vira o que já é garantido, sem interruptor |
| Fontes e sincronização | Fontes e data de corte | não há coletor; há corpus |
| Alertas | Aparência | nada notifica; a interface tem duas preferências reais |
| Segurança | Segurança | sessão, senha, encerrar em todos os aparelhos |
| Escritório e cobrança | — | multiusuário e billing são fora de escopo |

**Nenhum interruptor da tela é decorativo.** Existem dois, e os dois mexem em
coisa visível na hora: "lateral recolhida" (a mesma preferência do `⌘B`) e
"reduzir movimento" (põe `data-movimento="reduzido"` no `<html>`, que
`globals.css` trata com as mesmas regras da media query de
`prefers-reduced-motion`). O resto das linhas é leitura, com pílula de estado no
lugar do interruptor — a diferença entre "ajustável" e "garantido" fica na forma,
não numa nota de rodapé.

A seção "IA e citações" é onde as três decisões do projeto aparecem como
garantias sem chave de desligar. O documento deixa desligar "citação obrigatória"
e "selo de vigência"; aqui elas são a razão de o sistema existir, e o que as
segura (`tests/citacao.test.ts`, os triggers e a recusa de montar peça com
citação órfã) não tem interruptor.

`lib/toga/preferencias.ts` guarda as duas preferências locais — lateral e
movimento — e emite `toga:preferencias`. O evento é o que faz o ajuste mexer na
lateral na hora: `Casca` e `/configuracoes` são árvores diferentes, e sem ele a
escolha só apareceria no próximo carregamento. `storage` entra junto, para duas
abas não discordarem da mesma preferência.

**O perfil saiu do `localStorage` e foi para o banco** (`public.perfil`,
migration 0008): trocar de navegador apagava o nome e a inscrição na OAB, o que
fazia dele anotação do aparelho, não cadastro. `lib/toga/perfil.ts` continua
usando o `localStorage`, mas como **cache**: o avatar aparece em toda tela e não
pode esperar uma ida ao banco para pintar duas letras. O cache pinta na hora, o
banco corrige depois, e é o banco que vale quando discordam. Quem tinha perfil
gravado antes da migration não o perde — sem linha no banco e com cache cheio,
`carrega()` sobe o que estava no navegador.

**O perfil não entra na minuta.** Ele alimenta as iniciais do avatar e o menu da
conta, e para aí: o `.docx` continua saindo com "Autos nº ____" e "Advogado(a) —
OAB/__ nº ______" como campos a preencher. Preencher o cabeçalho de uma peça a
partir de um ajuste de tela é decisão sobre a peça, não sobre a tela de ajustes.
Só há campo de nome, OAB e telefone — nada de foto: não há upload nem
armazenamento de imagem, e o botão "Trocar foto" do documento seria um botão que
não faz nada.

### Clientes do escritório

`/clientes` e `public.clientes` (migration 0009). É a **primeira tabela que
guarda dado de pessoa de fora** — tudo o mais no banco é texto de lei, curadoria
ou conversa do próprio usuário. Daí três regras que as outras telas não têm:

- **RLS por `auth.uid()`, sem exceção.** Sem a âncora em `usuario_id`, a chave
  publishable — que roda no navegador de qualquer um — leria a agenda inteira.
  Conferido: sem sessão, o `select` devolve `[]` e o `insert` devolve 42501.
- **Falha não é silenciosa.** O histórico engole erro de banco e vira lista
  vazia, porque perder conforto é aceitável; aqui o erro aparece na tela e o
  formulário continua preenchido. As funções devolvem `{ ok, erro }`, não `null`.
- **Só o nome é obrigatório.** Cadastro que exige CPF empurra quem não o tem a
  digitar qualquer coisa, e CPF inventado é pior que campo vazio porque parece
  conferido. O que é digitado, porém, é conferido: `cpfValido()` calcula os dois
  dígitos verificadores e recusa os onze repetidos. O banco só olha o formato —
  dígito verificador é conta, e `tests/clientes.test.ts` (14 asserções, offline)
  a tranca junto com os tetos, que têm de bater com os checks de 0009.

CPF é guardado como 11 dígitos crus: máscara é assunto da tela, e gravar
`123.456.789-09` faria a busca depender de o usuário digitar a pontuação do mesmo
jeito das duas vezes. O vínculo com `casos` é `on delete set null`, e não
`cascade`: o caso é peça de demonstração resemeável, o cliente é dado do usuário
— reseed da curadoria não pode levar a agenda junto.

**Isto não abre o projeto para multiusuário.** Continua sendo um usuário só;
`usuario_id` existe para ancorar a policy, como em `conversas` e `perfil`.

A seção de fontes lê `leis` e `contagemDispositivos` do banco, e não uma
constante: número de dispositivo escrito à mão envelhece calado. Com o banco
pausado, a seção diz que não pôde ler e as outras quatro continuam de pé.

### Vigília do corpus

`/fontes` e as tabelas `vigilia_coletas` e `vigilia_alteracoes` (migration 0012).
Responde uma pergunta só: **a fotografia de 28/02/2025 envelheceu?**

O documento desenha o painel de outro produto — cinco coletores em Python
raspando DOU e DataJud a cada 30 minutos, 1,2 milhão de documentos, "Sincronizar
agora", comparador de redações lado a lado. A forma foi mantida; o conteúdo, não.

**A vigília nunca escreve em `dispositivos`, `artigos` ou `leis`, e essa é a
regra que sustenta as outras.** Um coletor que reescrevesse texto legal em
runtime faria `leis.vigencia_ate` deixar de ser verdade, e nenhum dispositivo
citado numa peça teria mais passado por conferência humana — a decisão nº 3
estaria perdida pela porta dos fundos. A vigília avisa; quem corrige é gente,
rodando `vade_parser.py` sobre a nova redação e conferindo o diff. Por isso ela
pode errar sem estragar nada, e é o que permite que o filtro seja heurístico.

**As cinco fontes do desenho existem.** Três delas rodam em Python, em
`coletores/` — detalhe completo em `coletores/README.md`.

| Fonte | O que entrega | Onde roda |
|---|---|---|
| **Planalto** | texto compilado; alteração **já em vigor**, por artigo | Python (scraping) |
| Câmara | proposições e situação da tramitação | Vercel (TS) |
| Senado | processos e `normaGerada`, com data de publicação no DOU | Vercel (TS) |
| DOU | confirma publicação da norma e guarda o endereço oficial | Python |
| DataJud | contagem de processos por assunto | Python |

**A coleta é de dois andares, e isso é decisão.** O Vercel Cron roda o andar
leve — Câmara e Senado, duas APIs REST que cabem numa função serverless e
mantêm a tela viva sem depender de nada fora da Vercel. O GitHub Actions
(`.github/workflows/vigilia.yml`) roda o completo: scraping de 900 KB de HTML por
lei, extração de página do DOU e consulta Elasticsearch não cabem — nem devem —
no runtime que serve a tela. É a mesma separação que já vale para
`vade_parser.py`: trabalho de lote não mora no caminho do usuário.

**Os dois andares não divergem por construção.** `data/curadoria/vigilia.yaml` é
a fonte única dos padrões de reconhecimento; `coletores/config.py` o lê em tempo
de execução, e `tests/vigilia.test.ts` falha se `alvos.ts` se afastar de qualquer
linha dele. As duas suítes usam as mesmas ementas reais — se uma passar e a
outra falhar, a divergência aparece na hora. É a escolha de `tests/citacao.test.ts`:
não eliminar a duplicação, trancá-la.

**O Planalto é o coletor mais importante dos cinco, e a razão é estrutural.**
Câmara e Senado contam o que foi *proposto*; só o texto compilado mostra o que
*está em vigor*. Na primeira execução ele encontrou **63 alterações posteriores à
data de corte**, entre elas a Lei 15.581/2025 (art. 23 da Lei de Drogas) e a Lei
15.358/2026 (art. 40-A) — duas que nenhuma API de proposição reportaria como
alteração consumada. **A fotografia de 28/02/2025 já está furada, e o projeto não
sabia.**

**O que ficou de fora, e por quê:** o LexML (SRU atrás de verificação com
JavaScript — fonte que só funciona no navegador não serve para coleta), o INLABS
(edição completa do DOU em ZIP, com cadastro — e não fez falta, porque o Senado
já informa data e veículo de publicação em `normaGerada`), a ementa de acórdão
(nem STF nem STJ têm API pública de jurisprudência) e o STF no DataJud
(`api_publica_stf` devolve 404: o Supremo não se submete ao controle
administrativo do CNJ e não está na base).

**O DataJud não participa da detecção de alteração**, e por isso tem tabela
própria (`vigilia_jurimetria`, migration 0013). Ele devolve capa e movimentação
processual, não ementa nem inteiro teor, e nada em processo judicial altera o
texto de uma lei. O card do documento promete "metadados e ementas"; a metade
das ementas não existe na API. O que ele responde de verdade — quanto o recorte
pesa no Judiciário — vira estatística num painel com título próprio.

**Três armadilhas de scraping, todas com o mesmo modo de falha:** nenhum erro,
nenhuma exceção, lista vazia e a tela afirmando que o corpus está em dia.
(1) O Planalto derruba User-Agent que não comece por `Mozilla` — a saída foi a
forma `compatible`, que passa pelo filtro de prefixo e continua se identificando,
não fingir ser Chrome. (2) `get_text("\n")` do BeautifulSoup separa nós inline e
encontrava 11 das 283 anotações. (3) O separador de bloco não pode ser `\n`,
porque o próprio texto do Planalto contém `\r\n\t` no meio da anotação. As três
estão anotadas no código e cobertas por `coletores/tests/test_planalto.py`.

**O filtro é a peça que pode errar em silêncio**, e por isso mora inteiro em
`lib/vigilia/alvos.ts`, puro e offline, com 31 asserções em `tests/vigilia.test.ts`
sobre ementas reais colhidas das duas APIs. Três regras:

1. **Verbo de alteração obrigatório.** Metade das ementas que citam a Lei 11.343
   a citam como referência ("nos termos da Lei nº 11.343"). Sem essa exigência a
   tela diria que a fotografia envelheceu sem nada ter mudado — alarme falso é o
   modo mais confiável de fazer alguém parar de ler a lista.
2. **`(?!\s+militar)` nos dois códigos.** O Código Penal Militar é o DL
   1.001/1969 e o CPP Militar é o 1.002/1969 — leis que o banco não tem.
3. **O erro é enviesado para o falso positivo.** Achado a mais custa uma linha
   que se lê e descarta; achado a menos custa uma peça protocolada com redação
   revogada.

**O vínculo com as teses é o que torna a tela legível.** Medido contra a API em
13/08/2026: 666 proposições declaram alterar o Código Penal desde a data de
corte. Uma lista de 666 linhas afoga a única que importa. `artigosDe()` extrai os
artigos que a ementa nomeia e a tela cruza com `teses.fundamentos` — o mesmo
grafo de citação da decisão nº 1. É o "Impacto nas teses (7)" do documento,
verdadeiro porque os dois lados saem do banco.

Duas travas contra atribuição errada, e as duas devolvem lista vazia em vez de
chutar: ementa que altera **duas leis do corpus** não recebe artigo nenhum
("altera o CP e o CPP, nos arts. 33 e 155" não diz qual é de qual), e ementa com
**mais de um diploma numerado** também não — "Altera o art. 2º da Lei nº 7.209 e
a Lei nº 11.343" produziria `lei_11343_2006_art2`, um id que existe no banco,
aponta para o artigo errado e não levantaria suspeita de ninguém.

**"Sincronizar agora" não existe.** A coleta é o cron diário
(`/api/vigilia/coletar`, `20 9 * * *` em `vercel.json`); a tela só lê. Botão que
dispara duas APIs públicas a cada clique é superfície de bloqueio por rate limit,
e o que ele prometia — saber quando foi a última coleta — está no card.

**O comparador de redações virou o painel de teses.** O produto não guarda
redações anteriores; inventar um "2018 → 2019" lado a lado é exatamente o que a
decisão nº 3 impede.

**A janela do cron é de 60 dias, e isso não abre buraco.** O Senado devolve o
intervalo inteiro numa resposta só (~4 MB desde a data de corte), e repetir isso
todo dia é desperdício. Mas o achado que importa é o projeto de 2025 sancionado
hoje, que está fora de qualquer janela por data de apresentação — daí
`atualizaPendentes()`, que reconsulta por id tudo que o banco já conhece e ainda
não virou lei, nas duas fontes.

**A rota de cron é a única exceção do projeto à regra "sessão ou nada"**, e ela
troca uma porta por outra em vez de remover a porta: está em `PUBLICAS` porque
cron não tem cookie, e exige `Authorization: Bearer $CRON_SECRET`. Sem o segredo
configurado ela recusa tudo com 503.

**`lib/vigilia/escrita.ts` é o único arquivo de `src/` que toca a service role.**
A coleta grava numa tabela com RLS fechada e não tem sessão para ancorar policy.
As duas alternativas foram recusadas e estão escritas no cabeçalho do arquivo:
policy de insert para `anon` daria a qualquer visitante o direito de escrever
linhas na vigília, e `security definer` com segredo em argumento poria o segredo
no log de consulta do Supabase. `lib/supabase.ts` continua limpo.

Marcar como conferido é a única escrita que sai do navegador, e o `grant` é **por
coluna** (`reconferido_em`, `reconferido_por`): RLS decide linha, não coluna, e
sem isso "pode marcar como lido" viraria "pode reescrever o link do ato oficial".
Conferido no banco: sem sessão, `select` devolve 0 linhas e `insert`/`update`
devolvem 42501.

`npm run vigilia -- --seco` roda as duas APIs do andar leve e o filtro sem gravar
nada. `.venv/Scripts/python -m coletores --seco` faz o mesmo com as cinco fontes,
incluindo o scraping — é como se confere o que o filtro está pegando antes de
encher a tabela. `--tudo` faz a carga inicial, que nenhum dos dois crons faz.

`.venv/Scripts/python -m pytest coletores -q` roda as 35 asserções do lado
Python, offline e sem segredo, como as oito suítes do vitest.

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

**Histórico de conversas.** `lib/toga/historico.ts`, sobre as tabelas
`conversas` e `conversa_trocas` (migration 0007). A lista "Recentes" da lateral
era uma lista fixa de sugestões — promessa falsa, já que nada ali tinha sido
consultado por ninguém. Agora lista conversas reais, e as sugestões só aparecem
enquanto não houver nenhuma.

**Sem teto e sem expiração.** A primeira versão guardava em `localStorage` com
limite de 20 conversas e despejo silencioso da mais antiga; nem o limite nem o
despejo sobreviveram à pergunta óbvia — "e se eu fizer 200 perguntas?". Conversa
agora some quando o usuário a apaga, e só então. Conferido no banco: 25
conversas gravadas, 25 devolvidas; 12 trocas numa conversa, 12 devolvidas.

Quem escreve é o cliente do **navegador**, carregando a sessão — é a RLS por
`auth.uid()` que torna o histórico inacessível a qualquer outra sessão.
Conferido: a chave publishable sem sessão enxerga zero conversas. É a única
parte do produto que escreve no banco em runtime, e a única tabela com policy
de INSERT.

Guarda a resposta **crua** da busca, não a prosa composta: a prosa é derivada e
`comporResposta()` a reconstrói igual, então guardar o derivado dobraria o
tamanho e congelaria uma segunda versão da mesma frase. Reabrir é `?c=<id>`, e a
conversa volta já pronta — reanimar a digitação de algo que o usuário veio reler
seria fazê-lo esperar de novo.

Apagar a conversa leva as trocas junto, por `on delete cascade`. Histórico é
conforto: toda falha de leitura ou escrita vira lista vazia ou `null`, e a
conversa em curso segue.

Os links que apontavam para elas foram redirecionados, não apagados: a página
de erro e a de 404 agora levam à Consulta, e a rubrica clicável do artigo abre
`/consulta?p=<termo>` — a mesma busca híbrida que `/busca` fazia.

### Onde o desenho foi recusado, e por quê

O protótipo é de outro produto: ele raspa DOU e DataJud, indexa acórdão, mostra
214 diplomas com vigência de hoje e redige análise jurídica em parágrafos. Isso
colide de frente com as três decisões deste projeto. A forma foi mantida ao
pixel; o conteúdo foi trocado pelo verdadeiro.

- **A prosa do chat É gerada por modelo, e isso foi uma reversão consciente.** A
  versão anterior compunha a prosa em `src/lib/toga/resposta.ts` a partir de
  **fatos sobre a busca** — qual molde a classificação reconheceu, se a rubrica
  bateu, quantos dispositivos vieram, a data de corte, o que degradou. Era
  verdadeira, verificável na mesma tela, e **respondia a mesma coisa para toda
  pergunta**. Explicar o próprio pipeline é bom como rodapé; não serve como
  resposta a quem perguntou a diferença entre associação e concurso de pessoas.
  O que a geração NÃO afrouxou: o conteúdo jurídico continua vindo do texto do
  dispositivo, lido do banco, e toda citação é conferida contra o contexto
  recuperado antes de a tela ver. `comporResposta()` continua no código como rede
  de segurança — ver "O contrato da geração".
- **A digitação é animação no caminho composto, e revelação real no gerado.**
  7 caracteres a cada 16 ms quando o texto já chegou inteiro; token a token
  quando ele está chegando. Os passos são os mesmos nos dois casos, e são reais.
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

As oito suítes (125 asserções) rodam **offline**, sem segredo: `citacao`, `peca` e
`vigilia` leem `data/normalizado/`, `vademecum` lê o acervo em disco, e
`dosimetria`, `historico`, `clientes` e `consulta` testam função pura.

> **"Offline" não é o mesmo que "em qualquer clone".** `data/normalizado/*` é
> ignorado pelo git — são 5,2 MB de saída determinística do `npm run normalize`,
> e a regra do `.gitignore` é versionar a entrada e as regras, não o resultado.
> O PDF do Vade Mecum também é ignorado (`*.pdf`), então nem dá para regenerar
> sem ele. Num clone novo, as asserções que conferem id contra o corpus não
> encontram o arquivo.
>
> Isso ficou invisível por meses porque não havia CI: a primeira execução do
> workflow da vigília quebrou com `FileNotFoundError` e derrubou a coleta antes
> de ela começar. O lado Python passou a **pular** essas asserções com o motivo
> impresso (`exige_corpus`, em `coletores/tests/test_filtro.py`); as do filtro,
> que são as que podem errar em silêncio, continuam rodando sempre. O lado
> vitest ainda quebraria num clone sem corpus — hoje não há CI que o rode, e
> quando houver, é o mesmo conserto. `consulta`
é a que tranca o contrato da geração ao vivo — validação e leitura incremental —
sem chamar modelo nenhum. O que fala com o Supabase é verificado contra o banco
de verdade, não em teste offline.

`npm run verificar` **não roda o lado Python**, e a separação é proposital: o
vitest não deve depender de um venv que pode não existir na máquina de quem só
mexe na interface. Os coletores têm a própria suíte, com o mesmo critério —
offline, sem segredo:

```
.venv/Scripts/python -m pytest coletores -q      # 35 asserções
```

`tests/vigilia.test.ts` e `coletores/tests/test_filtro.py` testam a **mesma
regra** contra as **mesmas ementas reais**, em runtimes diferentes. Não é
redundância: é a trava que faz a divergência entre os dois filtros aparecer na
hora, em vez de virar uma tela que diz que nada mudou. O workflow do GitHub
Actions roda o pytest **antes** de coletar — uma coleta que grava com o filtro
quebrado é pior que uma que não roda.

`npm run migrar -- 0008_perfil.sql` aplica uma migration pela conexão direta de
`scripts/db.ts`. Não há ledger de "o que já rodou", e não precisa haver: toda
migration do projeto é idempotente (`create table if not exists`, `drop policy if
exists` antes do `create policy`), e a ordem está na numeração do arquivo, que se
revisa em diff — um ledger no banco esconderia num registro invisível o que hoje
está no `ls` da pasta.

## Pendências conhecidas

- **`art. 761` do CPP termina em `"art. 82.49"`.** O `49` é marcador de rodapé
  que a regra B recusa remover, por ser indistinguível de decimal (`82.49`).
  Aparece em `relatorio.json` como o único suspeito. Fora do recorte.
- **`argumentacao` continua vazia e sem uso.** A costura offline por
  `scripts/argumentar.ts` não existe, e hoje não é necessária: a argumentação da
  peça vive em `teses.template_md`, escrita à mão. `uso_llm` saiu desta lista —
  é o teto mensal do botão "gerar ao vivo", ver "Nenhuma chamada a LLM no
  caminho padrão".
- **A geração ao vivo só existe na Consulta.** A minuta continua sem modelo
  nenhum, e não é lacuna a preencher sem pedido: cada frase do `.docx` passou por
  revisão humana, que é padrão profissional real para peça jurídica.
- **`/sumulas` e `/fontes` foram removidas** a pedido, para o sistema ficar só
  com o que se usa. Saíram por inteiro: rota, componente e módulo de dados
  (`lib/toga/sumulas.ts` e `lib/toga/pipeline.ts`). Nada mais as importava, e o
  `outputFileTracingIncludes` de `/fontes` saiu junto. Se voltarem, o relatório
  do normalize continua em `data/normalizado/relatorio.json` — a fonte que
  `/fontes` lia nunca esteve na tela.
