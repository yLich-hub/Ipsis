# Ipsis — consulta e geração de peças para advocacia criminal (tráfico de drogas)

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

Os **decretos estaduais do Paraná** (`/decretos`) saíram por pedido explícito, e
entram pela mesma porta: acervo de consulta, tabela própria, fora da peça. Ver
"Decretos estaduais do Paraná" abaixo e `docs/decretos-pr-levantamento.md`.

**Dois institutos fora do tráfico entraram na busca, por pedido explícito** —
roubo majorado com concurso de agentes (art. 157) e a presunção de
vulnerabilidade do art. 217-A. São três rubricas curadas em
`data/curadoria/rubricas.yaml`, e só isso: o Código Penal já está no corpus em
cobertura integral, então os dispositivos já existiam, já tinham vetor e já eram
citáveis. O que faltava era a camada de apelido.

**Eles chegam à peça**, também por pedido: dois casos novos em `casos.yaml`
(roubo com reconhecimento fotográfico; estupro de vulnerável com resultado
qualificador sem laudo) e cinco teses novas, quatro delas de rito e de prova.

**Isso obrigou a consertar uma colisão do modelo, e o conserto importa mais que
as teses.** `gatilho` é um saco plano de chaves, sem noção de qual crime: um caso
de roubo com acusado primário e bons antecedentes satisfazia, inteirinho, o
gatilho de **tráfico privilegiado** — e o checklist ofereceria o art. 33, § 4º a
quem responde pelo art. 157. As nove teses cuja argumentação está presa à Lei de
Drogas passaram a exigir `trafico_imputado: true`; `regime_inicial_menos_gravoso`
ganhou guarda de pena (`pena_provavel_superior_a_oito_anos: false`), porque o
art. 33, § 2º do CP fecha o regime acima de oito anos e o mínimo do art. 217-A
está acima disso. Conferido caso a caso: os quatro casos de tráfico recebem
exatamente as mesmas teses de antes, e nenhuma tese de tráfico aparece nos dois
casos novos.

> Esta linha dizia "e o mínimo do art. 217-A é oito", e envelheceu: o corpus
> conferido em 15/08/2026 traz **10 a 18 anos**, elevados pelas Leis 15.280/2025
> e 15.353/2026. A guarda continua certa — dez também fecha o regime —, mas o
> número na prosa era da redação antiga. Foi a tabela de crimes da dosimetria
> que o pegou, lendo o preceito secundário do corpus em vez da memória; é o
> mesmo motivo pelo qual a data de corte é visível o tempo todo.

**As cinco teses novas não têm `jurisprudencia`, e é a regra 3 de `teses.yaml`
funcionando:** entendimento consolidado não se infere, e não houve como conferir
número de súmula ou de acórdão. Tese sem precedente é honesta; tese com
precedente inventado é o dado plausível e falso que o projeto recusa.

**Não há tese sobre a vulnerabilidade do art. 217-A**, e a ausência é decisão. O
§ 4º-A diz que a presunção é absoluta e a relativização inadmissível — escrever
argumento contra texto expresso seria pôr numa peça protocolada uma alegação que
a lei rejeita em termos.

**A restrição de doutrina não foi tocada por isto.** `explicacao` continua sendo
texto autoral próprio dizendo o que o dispositivo faz — ver "Restrição de
doutrina" abaixo, que segue valendo palavra por palavra.

---

## As três decisões que definem o projeto

### 1. O texto legal nunca é gerado pelo modelo

Toda citação na minuta resolve para um `dispositivos.id` no banco. Os templates
de tese contêm marcadores `{{cite:lei_11343_2006_art33_p4}}`; o renderizador
substitui pelo texto **lido do banco** e por um link para `/dispositivo/[id]`.
O modelo escreve apenas a argumentação _entre_ as citações.

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
- `curada` — 38 termos coloquiais escritos à mão, em
  `data/curadoria/rubricas.yaml`, com 173 variantes e 109 vínculos.

**Nem a Lei de Drogas nem o CPP têm rubrica `oficial` que preste** — o Vade Mecum
imprime rubrica marginal quase só no Código Penal (414 lá, 0 na Lei de Drogas, 7
no CPP). Logo, tudo que o recorte do projeto precisa vem da
curadoria, e sem ela a busca erra de forma silenciosa e grave. Medido no banco
antes de a curadoria existir: `tráfico privilegiado` devolvia o art. 332 do CP
(tráfico de _influência_) e `associação para o tráfico` devolvia o art. 149-A
(tráfico de _pessoas_).

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
casar contido; sem isso "tráfico" (7) casaria em toda pergunta sobre tráfico.
Igualdade exata continua valendo para qualquer comprimento.

**O comprimento não bastava, e 0020 separou as duas formas de match.** O corte de
12 foi calibrado em 0011, quando a rubrica valia de fato 0,7× em vez de 3× — o
defeito que 0017 consertou. Com o peso certo, termo curado curto e genérico passa
a dominar de verdade: medido em 02/09/2026, "o réu confessou o tráfico, mas quero
discutir a nulidade da entrada na residência sem mandado" devolvia o art. 65,
III, d do CP nas duas primeiras posições, por causa de `reu confessou` (13
caracteres), e **nada sobre busca domiciliar**.

O que estava errado não era o comprimento: era as duas formas de match terem o
mesmo poder. O `order by` final abria com `via_rubrica desc`, então qualquer
match encabeçava a lista **independentemente do score**.

    igualdade → o usuário digitou o nome do instituto. Manda, como sempre mandou.
    contido   → o termo apareceu dentro de uma frase. É sinal, não comando.

0020 dá ao contido **metade do peso** (1,5 contra 3,0) e tira dele o passe livre
na ordenação: ele compete por score, onde qualquer dispositivo com duas pernas
concordando o ultrapassa. O tipo de retorno não mudou — `via_rubrica_exata` serve
só à ordenação e não sai da função —, e por isso a migration não tocou uma linha
de TypeScript.

Conferido depois: "tráfico privilegiado", "dosimetria da pena", "associação para
o tráfico" e "busca domiciliar sem mandado" continuam com o cluster certo em
primeiro, com o mesmo score de antes. E a pergunta que motivou 0011 —
"Associação para o tráfico e concurso de pessoas: qual a diferença?" — passou a
devolver **os dois** institutos, art. 29 do CP em primeiro e art. 35 da Lei de
Drogas em segundo, que é o que a pergunta pede. O art. 149-A, tráfico de pessoas,
continua fora.

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

**A data deixou de ser uma só, e isso é o cumprimento da decisão, não uma
exceção a ela.** A vigília do Planalto mostrou 63 alterações posteriores à
fotografia, duas na Lei de Drogas; `data/curadoria/redacoes.yaml` alinhou 47
artigos ao texto compilado, e a partir daí `leis.vigencia_ate` mentiria nos dois
sentidos — subestimando os artigos conferidos e continuando certa para os outros
1.293. Quem responde por um artigo atualizado é `artigos.conferido_em`, ao lado
de `artigos.alterado_por` (as leis) e `artigos.fonte_redacao` (o endereço). A
tela do artigo, a lista da lei e o rodapé do `.docx` mostram a data do artigo
quando ela existe, e a da lei quando não. Ver "O corpus atualizado" abaixo.

O mesmo vale para cobertura: `leis.cobertura` é `integral` ou `parcial`, e todo
dispositivo de lei parcial exibe o aviso. As três leis do corpus são hoje
`integral` — o mecanismo fica de pé para a próxima lei que entrar recortada.
Silenciar cobertura seria o mesmo erro de classe que silenciar a data de corte.

**A data não é digitada em JSX, e isso é o argumento de `marca.ts` aplicado ao
que o projeto mais preza.** Onde a tela tem um dispositivo em mãos, ela imprime o
`vigencia_ate` daquele registro; onde não tem — a lateral, a tela de entrada, a
pílula da caixa de consulta — ela lê `DATA_DE_CORTE`, em `lib/vigilia/alvos.ts`,
que é o mesmo valor que o coletor usa para recortar a janela das APIs. Havia
cinco literais `28/02/2025` espalhados pelo JSX, e um deles ficava no painel de
procedência da Consulta, que já recebia o `vigencia_ate` do dispositivo e o
ignorava. A próxima fotografia deixaria metade das telas com a data velha — e
data velha é exatamente o que esta decisão existe para impedir.

---

## Fontes de dados

| Arquivo                           | Lei                          | id               | Cobertura           | Origem                      |
| --------------------------------- | ---------------------------- | ---------------- | ------------------- | --------------------------- |
| `data/lei11343.json`              | Lei Antidrogas 11.343/2006   | `lei_11343_2006` | integral (94 arts)  | `vade_parser.py` + Planalto |
| `data/codigo_penal.json`          | Código Penal (DL 2.848/1940) | `dl_2848_1940`   | integral (421 arts) | `vade_parser.py` + Planalto |
| `data/codigo_processo_penal.json` | CPP (DL 3.689/1941)          | `dl_3689_1941`   | integral (825 arts) | `vade_parser.py` + Planalto |

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
  "paragrafos": [{ "numero": "4", "texto": "...", "incisos": [] }],
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

**Regra determinística:** o fragmento no fim do dispositivo _i_, na ordem do
documento, é a rubrica do dispositivo _i+1_ — inclusive quando o _i+1_ é um
parágrafo/inciso do mesmo artigo. Verificado ao longo da cadeia inicial do CP.

Isso torna a limpeza uma _feature_: as rubricas removidas viram `rubricas` com
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
> são 838 alterações — 677 de limpeza do PDF e 161 de redação nova, que é a
> regra `redacao` e não conserta artefato nenhum (ver "O corpus atualizado").
> `/fontes` lê o mesmo relatório, então tela e documento não
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

## O corpus atualizado — a segunda fonte

A vigília do Planalto encontrou **63 alterações posteriores à fotografia de
28/02/2025**, duas delas na Lei de Drogas. O conserto que este documento previa
era "rodar o `vade_parser.py` sobre a nova redação", e ele não existe: **o PDF do
Vade Mecum é a fotografia.** A redação nova não está nele e nunca vai estar. Sem
uma segunda fonte, o sistema fica para sempre sabendo que está desatualizado — e
saber não conserta o texto que sai no `.docx`.

A segunda fonte é o **texto compilado do Planalto**, e ela entra por um caminho
que preserva as três decisões:

```
coletores/redacao.py         →  data/vigilia/redacoes.propostas.yaml   (proposta)
        ↓ conferência humana, bloco a bloco
data/curadoria/redacoes.yaml →  scripts/normalize.ts → seed            (corpus)
```

**O scraper continua não escrevendo texto legal em lugar nenhum.** Ele propõe;
`redacoes.yaml` é curadoria versionada, revisável em diff, com data e endereço da
conferência em cada entrada. É a mesma distância que existe entre
`headings.propostas.yaml` e `headings.yaml` — e ela é a decisão nº 1 inteira: um
scraper que alimentasse `dispositivos` trocaria a fonte auditada por uma
raspagem, e ninguém saberia dizer qual dispositivo passou por olho humano.

Hoje são **47 artigos**, alterados por 25 leis posteriores: 37 com blocos
reescritos ou incluídos (125 blocos) e 10 artigos que a lei criou depois da
fotografia — entre eles o **art. 40-A da Lei de Drogas** (pena em dobro para
integrante de organização criminosa ultraviolenta) e o art. 23, parágrafo único.

### A conferência é sobre a lei inteira, não sobre a lista da vigília

`coletores/redacao.py` compara os **1.340 artigos** das três leis com a página
compilada. Artigo que ninguém alterou tem de bater com o corpus, e quando não
bate é o extrator que está errado — é o mesmo raciocínio de `tests/vigilia.test.ts`
rodar o filtro contra ementas reais.

Só vira curadoria a divergência que carrega **norma posterior à data de corte**.
O que sobra fica no relatório da proposta e não entra: são 545 divergências
tipográficas entre o Vade Mecum e o Planalto (`seqüestro`, `Assembléias`,
`Decreto-lei` contra `Decreto-Lei`), que não são mudança de lei nenhuma.

Rodar de novo hoje devolve **0 blocos a atualizar** nas três leis. É essa a
verificação: o comando é idempotente e a resposta "nada a fazer" é a prova de
que o corpus está em dia.

### As armadilhas do HTML, que custaram texto legal errado

Estão anotadas em `coletores/redacao.py` e cobertas por
`coletores/tests/test_redacao.py`. As que mais custaram:

- **`cp1252`, não `latin-1`.** As páginas não declaram charset e são exportação
  de Word: o travessão vive na faixa 0x91–0x97, que o latin-1 lê como caractere
  de controle invisível. Com ele some o `VII – contra`, e a enumeração viaja
  escondida dentro do parágrafo pai.
- **`Art. 1º - Não há crime`.** O `- N` virava sufixo de artigo: 302 dos 416
  artigos do CP deixavam de casar com o corpus. O mesmo com `§ 1º - Para`.
- **`Art. 359-M-A`.** Sufixo composto. Sem ele o artigo virava repetição do
  `359-M` e o texto novo sumia sem erro nenhum.
- **A rubrica marginal também está no Planalto**, em bloco próprio. Colada no
  dispositivo anterior, fazia 414 artigos do CP parecerem alterados.
- **O texto revogado continua na página, riscado** (`<strike>`), e emenda duas
  redações numa frase se não for descartado antes de qualquer leitura.

### As travas, porque isto reescreve texto legal

1. `era` guarda o texto que o corpus tinha, exato. `normalize.ts` aborta se ele
   não casar — nenhuma redação se aplica no escuro, como em `emendas.yaml`.
2. Entrada que não casa com dispositivo nenhum aborta o script.
3. `dispositivos.texto_bruto` continua guardando o que o Vade Mecum dizia; o
   diff sai em `npm run audit` sob a regra `redacao`.
4. `tests/redacao.test.ts` (10 asserções, offline) confere que o corpus **carrega
   a redação nova e não a antiga**, que o bloco incluído entrou na ordem certa,
   que o artigo criado nasce com citação e com o caput no vetor, que nenhuma
   anotação do Planalto vazou para o texto e que nenhum bloco traz a enumeração
   dos filhos embutida.

A quarta pegou dois erros reais antes do seed: treze parágrafos novos do art. 310
do CPP entrando de trás para a frente, e a rubrica do artigo seguinte colada no
fim do art. 168-A.

**Bloco com enumeração embutida não é aplicado no automático.** Quando o Planalto
imprime os incisos dentro do texto do parágrafo, gravar aquele texto escreveria o
conteúdo dos filhos duas vezes no banco — e uma citação ao parágrafo passaria a
transcrever, na peça, trecho que não é dele. Esses vão para o relatório com o
motivo.

### O que isto não faz

Não apaga a data de corte e não torna o corpus auto-atualizável. A vigília
continua só avisando; quem confere e assina é gente, e a assinatura é o
`conferido_em` de cada entrada. `/fontes` cruza `artigos.alterado_por` com os
achados e marca com selo verde o que o corpus já absorveu — **derivado, não um
estado novo**: sai da mesma coluna que a tela do artigo e o rodapé da peça usam,
então não tem como divergir sozinho.

---

## Busca

Função RPC única no Postgres (uma chamada de rede, não três), fundindo por
_Reciprocal Rank Fusion_:

1. **Rubrica** — match exato em `termo` ou `variantes`. Peso dominante (3×):
   quando bate, encabeça o resultado.
2. **Lexical** — `ts_rank_cd` sobre `dispositivos.busca` (`to_tsvector('portuguese', texto)`).
3. **Semântica** — `<=>` sobre `dispositivos.embedding`.

**O peso dominante da rubrica não valia nada em produção, e ninguém sabia.**
`p_peso_rubrica` é 3.0 desde 0003, mas a posição da rubrica na fórmula do RRF
era calculada por uma janela dentro do CTE de fusão — isto é, sobre o resultado
do `full outer join` das três pernas. A ordenação abria com
`(rub.papel = 'principal') desc`, e `desc` no Postgres é NULLS FIRST: as até 400
linhas que vieram só do léxico ou só do vetor têm `papel` nulo e ficavam todas na
frente. Medido antes do conserto, com a consulta mais central do projeto:

    "tráfico privilegiado" → art. 33, § 4º
      sem vetor:  3/61  = 0,049180      (certo — o CTE `sem` fica vazio)
      com vetor:  3/259 = 0,011583      (row_number = 199)

**Passou anos invisível porque a ORDEM continuava certa:** o `order by` final
abre com `via_rubrica desc`, então o dispositivo da rubrica encabeça a lista de
qualquer jeito. A tela sempre pareceu correta. O que estava errado era o score —
e o score só passou a decidir algo quando `filtraContexto` ganhou o piso de
fusão. A partir daí, "tráfico privilegiado" não juntava três dispositivos acima
de 1/61, o contexto era marcado `fraco`, e o modelo recebia instrução de dizer
que o acervo não cobre a pergunta e usar confidence "baixa" — sobre o instituto
que este projeto existe para responder.

`0017_peso_da_rubrica.sql` move a posição para dentro do CTE `rub`, que é a
forma que `lex` e `sem` já tinham. A assimetria era o defeito: agora nenhuma
perna consegue contar as linhas de outra, e a classe de erro deixa de existir.
Remedido depois, sobre dez consultas — a separação entre dentro e fora do
recorte triplicou:

| perfil                | topo          | razão último/topo | acima do piso |
| --------------------- | ------------- | ----------------- | ------------- |
| consulta com rubrica  | 0,060–0,064   | 0,24–0,26         | 3–4 de 8      |
| duas pernas de acordo | 0,030         | 0,84              | 8 de 8        |
| fora do corpus        | 0,0164 (1/61) | 0,90              | 0 de 8        |

**Nenhum teste offline pega essa regressão, e não há como.** Ela mora no SQL da
RPC e só aparece contra o banco; a suíte tranca o outro lado, que é o piso
separar os dois perfis quando os scores chegam certos. Para o lado do banco
existe `npm run contexto`, que imprime score, piso e o aviso de recuperação
fraca lado a lado.

O que é embutido é `dispositivos.texto_embed`, não `texto`:
`capítulo + rubrica + caput do artigo + texto do dispositivo`. Um `§ 4º Nos
delitos definidos no caput...` isolado gera vetor inútil — o dispositivo não se
sustenta sozinho.

`scripts/embed.ts` reembute apenas linhas cujo hash de `texto_embed` mudou.

### Classificação de intenção (`src/lib/busca/intencao.ts`)

Por regras em TS, **sem chamada de modelo** — é determinístico e precisa ser rápido.

| Molde         | Sinal                                | Resposta                            |
| ------------- | ------------------------------------ | ----------------------------------- |
| `dispositivo` | padrão `art\.?\s*\d+`, sigla de lei  | texto legal direto                  |
| `tema`        | match em rubrica com `tipo = 'tema'` | cluster ordenado por `papel`/`peso` |
| `processual`  | sigla CPP, termos de rito            | dispositivos processuais            |
| `doutrina`    | "doutrina", "segundo", nome de autor | ver restrição abaixo                |

### Restrição de doutrina (não negociável)

Doutrina é obra autoral protegida (Nucci, Greco, Bitencourt). **Não hospedar,
não indexar, não resumir de forma substitutiva.** Para o molde `doutrina`,
entregar entendimento consolidado extraído de jurisprudência (acórdão não tem
essa proteção) e link para fonte legítima. `rubricas.explicacao` é texto autoral
próprio, curto e funcional — não é resumo de doutrina.

**A segunda metade dessa regra passou a existir em código.** Por muito tempo o
molde `doutrina` só sabia recusar: reconhecia a intenção e devolvia "não
hospedo, não indexo, não resumo". Recusa correta e ramo morto — o classificador
enxergava um pedido que o produto não atendia. `lib/consulta/doutrina.ts` é o
link para a fonte, e a tela o desenha só nesse molde.

**A distinção legal é do art. 8º, IV da Lei 9.610/98:** lei e decisão judicial
não são obra protegida, e por isso o corpus as hospeda inteiras; livro e artigo
são. O que a lei autoriza expressamente é a **citação de passagem** com autor e
origem (art. 46, III) — não a paráfrase reescrita, que é o mesmo risco por outra
forma, porque o que se protege é a expressão e não a ideia.

**Uma fonte só, e é a regra do acervo Vade Mecum aplicada de novo:** endereço não
conferido fica ausente em vez de ser deduzido. Medido em 17/08/2026 — o BDJur do
STJ passou (DSpace 7; a rota humana é casca Angular, e o que se conferiu foi a
consulta que ela dispara na API REST: 372 itens para "tráfico privilegiado", 0
para palavra inventada, com escopo na comunidade Doutrina). SciELO devolve 403 a
cliente que não é navegador, Oasisbr não respondeu, e o LexML está atrás da mesma
verificação de JavaScript que já o tirou dos coletores.

**Nada é colhido, e o colhedor não existe.** O OAI-PMH do BDJur está de pé
(`/server/oai/request` responde `<repositoryName>BDJur</repositoryName>`), e se um
dia entrar, entra pelo desenho de `redacao.py`: Python em `coletores/`, proposta
em `data/vigilia/`, curadoria humana em `data/curadoria/`, tabela própria sem FK
para `dispositivos`. **Metadado tem um problema que o corpus não tem: doutrina
não carrega vigência.** Um artigo de 2015 sobre tráfico privilegiado é anterior
ao HC 118.533 do STF e nenhum campo do Dublin Core diz isso — é a mesma razão
pela qual as ementas do STJ ficaram de fora, e ela vale com mais força aqui.

---

## Geração da peça

Uma peça só: **resposta à acusação** (art. 396-A do CPP).
Fluxo: seleção de caso → checklist de teses aplicáveis → minuta em DOCX.
**Os três passos estão implementados e verificados** — ver "A minuta" abaixo.

- `teses` — 21 curadas à mão em `data/curadoria/teses.yaml`, cada uma com
  `gatilho` (jsonb objetivo), `fundamentos` (ids de dispositivos) e
  `template_md` com os marcadores `{{cite:}}`.
- `casos` — quatro casos de tráfico realistas e anonimizados em
  `data/curadoria/casos.yaml`, já no banco (flagrante em via pública, apreensão
  em rodovia, vigilância sem apreensão e entrada em residência sem mandado).
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

`tests/peca.test.ts` (10 asserções, offline) monta a minuta de **todos** os casos
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

**O rodapé aprendeu a dizer mais de uma data.** A minuta transcreve o art. 65 do
Código Penal, que a Lei 15.160/2025 alterou depois da fotografia; carimbar
28/02/2025 sobre esse texto seria a decisão nº 3 mentindo dentro do arquivo
protocolado. Quando algum dispositivo transcrito está em redação posterior, o
rodapé diz quantos são, contra o que foram conferidos e por quais leis. A data
impressa é a **mais antiga** das conferências: é a única que cobre todos os
artigos citados.

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
mão em `teses.yaml`, e não há chamada a modelo em `/api/peca/[casoId]`.

**"Cada frase passou por revisão humana" era afirmação sem registro, e virou
dado.** O texto legal tem três camadas de conferência; a argumentação entre as
citações não tinha nenhuma, e a garantia vivia só na prosa de cinco documentos —
até que cinco teses entraram escritas por modelo e não havia onde anotar isso.
`teses.revisao` (migration 0016) guarda `pendente`; o checklist de `/pecas` põe
selo âmbar na tese, e o rodapé do `.docx` diz quantas teses daquela minuta
aguardam revisão, nomeando-as. Provado por mutação: trocar a frase do rodapé
derruba `tests/peca.test.ts`.

**NULL é "sem registro", nunca "conferida".** As dezesseis teses anteriores à
coluna não recebem carimbo retroativo: escrever uma data que ninguém anotou
seria inventar o registro para fazê-lo parecer completo — o mesmo dado plausível
e falso que `jurisprudencia` recusa quando não há número de súmula conferido. Só
a marca explícita é contada, e quem revisar apaga a linha do YAML.

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
output), e o servidor valida antes de a tela ver. Cinco arquivos em
`lib/consulta/`, um trabalho cada:

- `contrato.ts` — tipos, o esquema JSON e a instrução do sistema.
- `valida.ts` — as cinco recusas. Puro, offline.
- `enriquece.ts` — o banco sobrescreve tudo que não é argumentação. Puro.
- `fio.ts` — o que uma troca deixa para a próxima. Puro, offline.
- `aovivo.ts` — a chamada ao modelo, o streaming e a regeneração.

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

**As seis recusas de `valida()`**, todas no servidor, todas testadas offline:

| Recusa                                  | Por quê                                                                                                                                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doc_id` fora do contexto recuperado    | id que não veio da busca é alucinação, mesmo existindo no banco                                                                                                                                                                                                                  |
| citação para `sources[].id` inexistente | marcador que não abre nada é pior que nenhum                                                                                                                                                                                                                                     |
| forma diferente do esquema              | segunda camada, para o dia em que o esquema mudar                                                                                                                                                                                                                                |
| **transcrição de lei**                  | doze palavras seguidas iguais às de um dispositivo do contexto e a resposta cai: a decisão nº 1 diz que texto legal nunca é gerado, e "gerar" inclui copiar do contexto para a prosa                                                                                             |
| **parágrafo sem âncora**                | todo parágrafo tem de citar ao menos uma fonte — ver abaixo                                                                                                                                                                                                                      |
| **letra fora do alfabeto latino**       | observado numa geração real: `"não é um अपराधo autônomo"`, devanágari no lugar de "crime". Nenhuma das outras alcança — o parágrafo cita, não transcreve e tem a forma certa. A regra é allowlist por escrita e só sobre letras, então `ã`, `§`, `⅔` e aspas tipográficas passam |

**A quinta entrou por último, e fecha a fresta que as outras quatro deixavam.**
Elas garantem que o que o modelo CITA veio da busca; nenhuma obrigava a citar.
Um parágrafo com `citations: []` passava por todas — e é exatamente nele que
cabia uma afirmação inteira apoiada em treinamento, do tipo "o porte ilegal é
punido com reclusão de 2 a 4 anos": curta, correta no mundo, impossível de
conferir nesta tela, e invisível para as outras quatro.

O esquema dizia "vazio é legítimo: nem todo parágrafo cita". Era verdade como
descrição de estilo e falso como garantia: deixava a ancoragem por conta do
prompt, num arquivo que existe porque prompt não é garantia.

O custo foi medido antes de entrar, contra perguntas reais dentro e fora do
recorte: **12 parágrafos, 12 ancorados, nenhuma queda para a resposta
composta**. Parágrafo sem texto não é cobrado — sozinho ele já cai na recusa de
resposta vazia, e ao lado de parágrafos válidos é só sujeira de formatação.

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

### O fio da conversa

O array de mensagens era `[system, user]` e nada mais: cada pergunta chegava
sozinha, sem notícia da anterior. **E não era só o modelo que esquecia — a busca
esquecia junto.** "E se ele for reincidente?" ia crua para `busca_hibrida`, que
devolvia o que achasse para a palavra "reincidente", e o § 4º da troca anterior
— o assunto que o advogado tinha na cabeça — não estava em lugar nenhum do
contexto. A pergunta de seguimento é a forma mais natural de usar um chat, e era
justamente a que o produto não atendia.

**Só duas coisas atravessam a troca: a pergunta e os ids citados.**

A prosa gerada **não** volta. Ela não passa por `valida()` de novo, e reinjetá-la
deixaria uma afirmação da troca 1 sobreviver até a troca 3 sem âncora nenhuma —
a mesma fresta que a recusa de parágrafo sem citação existe para fechar,
reaberta pela porta do histórico. Id é coisa já conferida contra o contexto
recuperado; prosa não é.

**A consulta da busca continua intocada, e essa é a decisão que mais custou.** O
caminho óbvio — concatenar a pergunta anterior e mandar as duas para a RPC —
envenena a perna de rubrica, que tem peso dominante e casa por termo contido a
partir de 12 caracteres: depois de uma troca sobre "tráfico privilegiado", TODA
pergunta seguinte carregaria o termo para dentro da consulta e a rubrica
encabeçaria o resultado de assuntos que não têm nada com ela. Seria o art. 149-A
da decisão nº 2 outra vez, agora disparado pela própria conversa.

A continuidade vem então por **herança de id**: os dispositivos que a resposta
anterior citou entram no contexto da seguinte, lidos do banco por
`lerDispositivos()` e marcados com `origem` no bloco `<dispositivo>`. A busca da
pergunta nova segue limpa, e o que ela recupera soma em vez de competir. A
herança entra **depois** de `filtraContexto`, porque não passou pela fusão desta
pergunta e o piso a cortaria inteira — e um dispositivo que o piso cortou e a
troca anterior citou volta por ela, com razão: a conversa já o tratou como
assunto.

Tetos: três trocas, cinco dispositivos herdados. Herdado é aposta, não
recuperação, e herança sem teto dominaria o contexto de uma pergunta que mudou
de assunto.

**Quando a recuperação é fraca, o aviso muda de redação, e não some.** `fraco`
mede uma coisa só: os termos desta pergunta não acharam concordância no corpus.
Sem conversa atrás isso quer dizer "o acervo não cobre o assunto"; com conversa
atrás quer dizer isso **ou** que a pergunta não tem termo próprio para casar. Um
"e nesse caso?" não acha nada em lugar nenhum e ainda assim é respondível.
Afirmar a primeira leitura nos dois casos faria o chat negar um assunto que
acabou de cobrir; suprimir o aviso faria o contrário, que é pior. Diz-se o que
de fato se mediu, e a decisão fica com quem tem as duas metades na frente.

**O fio sai da tela, não do banco.** `conversas` tem RLS por `auth.uid()` e o
cliente da rota não carrega sessão do usuário — ler o histórico no servidor não
funcionaria. Então ele vem no corpo da requisição e é entrada de usuário como
qualquer outra: `saneiaFio()` descarta em silêncio o que não tem forma de id, e
troca malformada não pode custar a resposta.

**Três armadilhas silenciosas, achadas ao ligar isto e trancadas por teste.** Nas
três o herdado é citado, `valida()` o aceita — ele está em `recuperados` — e a
falha acontece depois, sem erro nenhum:

1. `enriquece()` recebia os achados **crus** da busca. Um `doc_id` herdado não
   estava na lista, a fonte era descartada e o parágrafo ficava ancorado nos
   dados e órfão na tela, justamente depois de a âncora virar obrigatória. Passa
   a receber o contexto inteiro.
2. `PainelFonte` procura o id em `achados` e, não achando, **caía no primeiro da
   lista**: clicar em "art. 33, § 4º" abriria outro artigo, com o link "Abrir
   dispositivo ↗" apontando para o errado junto. Por isso o evento `fim` carrega
   os herdados — fora do evento `busca`, que é a resposta crua e é ele que vai
   para o histórico. **A queda para `achados[0]` foi removida**: não achar e não
   abrir é defeito de conforto; abrir outro artigo é o produto afirmando coisa
   falsa.
3. **A conversa reaberta do histórico repetia a armadilha 2**, e por um caminho
   que o evento `fim` não alcança: a linha guarda `bruta`, e as fontes de uma
   troca com fio apontam para dispositivo que a busca DAQUELA pergunta não
   devolveu. `religaHerdados()` reata pelo pool da conversa inteira — e não
   precisa de nada gravado a mais, porque todo id herdado entrou em alguma troca
   anterior **pela busca**: a herança só repassa o que já foi recuperado uma vez.
   Guardar os herdados na linha seria gravar derivado, que é o que
   `conversa_trocas` evita.

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
- `/vademecum` lê do disco, sem Supabase: com o banco pausado, é a parte do
  produto que continua inteira.

> **A renderização estática das páginas de caso não existe mais, e a troca foi
> consciente.** Ler cookie torna a rota dinâmica, então tudo sob `src/app/(app)/`
> é renderizado sob demanda desde que a autenticação entrou — está escrito em
> "Autenticação", como consequência aceita. O que sustenta a demonstração de
> banco pausado é o acervo em disco, não uma página pré-renderizada. Conferido no
> `next build`: das 26 rotas, só `/` e `/_not-found` saem estáticas.

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

**O cartão "Neste acervo" da grade e o crédito de licença do rodapé do leitor
também saíram, a pedido.** O primeiro era navegação lateral (Corpus, Busca,
Origem) no pé da coluna de ramos; o segundo era a atribuição ao espelho. Este
documento dizia que o crédito não devia ser removido, e a frase era mais dura
que a obrigação: **o que se importou é texto de lei federal, domínio público
pelo art. 8º, I da Lei 9.610/1998, e nenhum código do repositório de origem foi
copiado** — não há obra de terceiro no que a tela mostra. A procedência continua
registrada onde ela é auditável —
`docs/acervo-vademecum.md` e o SHA fixado em `scripts/vademecum.ts` —, que é
mais do que um parágrafo de rodapé garantia.

O que ficou na tela, e por quê: o link para o texto oficial no Planalto (atalho,
não advertência) e o link cruzado para o corpus curado.

**Não derivar URL do Planalto pelo número da lei.** 42 das 75 estão sem link
oficial porque o espelho não trouxe. `itcmd` é lei do Rio de Janeiro e `estsppi`
é do Piauí: norma estadual não está no `ccivil_03`, e a URL montada pelo número
abriria a lei federal homônima. A tela diz que o link falta; a curadoria vai em
`data/curadoria/vademecum.yaml`, conferida com
`npm run vademecum -- --verificar-links`.

Runtime lê do disco, sem Supabase: é a única parte do produto que continua
inteira com o banco pausado.

## Decretos estaduais do Paraná

`/decretos` e as tabelas `decretos_pr` / `decretos_pr_blocos` (migration 0018).
Decretos normativos do Executivo do Paraná, 2022–2026, na redação **compilada**
publicada pela Casa Civil em `legislacao.pr.gov.br`. Entrou por pedido
explícito, com busca própria e tela própria na lateral. O levantamento completo
— fonte conferida endpoint por endpoint, volume medido, arquitetura em sete
blocos — está em `docs/decretos-pr-levantamento.md`.

**É acervo de consulta, não corpus citável, e a separação é estrutural.** É a
mesma de `precedentes_stj` e do acervo Vade Mecum, e aqui ela é ainda mais
direta: decreto do Executivo estadual não revoga lei federal, não tipifica crime
e não altera pena. O id vive em espaço próprio — `decpr:2025:8812` — que nunca
casa o padrão do corpus (`lei_11343_2006_art33_p4`); não há FK para
`dispositivos`; e `tests/decretos.test.ts` falha se algum id do acervo casar o
padrão do corpus. Nada disso depende de alguém lembrar da regra.

**O recorte é normativo, e foi medido.** São 17.778 decretos na janela pedida, e
a leitura de janeiro/2025 inteiro — 326 súmulas, as sete páginas — mostrou que a
esmagadora maioria é ato de pessoal: 130 nomeações, 61 exonerações, 22
designações. Ingerir tudo poria milhares de nomes de servidores num corpus que a
Consulta lê em voz alta, afogaria a fusão em "Secretaria de Estado da Educação"
e deixaria 96% das linhas sem resposta possível para a vigência.

O recorte entra em `data/curadoria/decretos_pr.yaml`, aplicado à **súmula** que a
listagem já traz — o texto integral só é buscado para o que passa. Em
janeiro/2025 ele deixa entrar 25 das 326, ou 7,7%; nos cinco anos inteiros,
**1.989 de 17.765**, entre 8,6% e 13,5% por ano. E **nenhuma súmula da amostra
fica sem casar `entra` ou `sai`**.
Esse zero é a asserção mais forte da suíte: recorte total sobre dado real, e não
peneira com buraco por onde espécie desconhecida passa sem ninguém ver.

**A súmula é a camada de rubrica deste acervo.** Decreto não tem rubrica
marginal, e ninguém procura decreto por número: procura por "regulamento do
ICMS" ou "conselho estadual de políticas sobre drogas". É a decisão nº 2 do
projeto reencontrada em outro corpus — e por isso a súmula tem peso próprio (2.0)
na fusão de `busca_decretos`, acima do léxico e do vetor. **Não 3.0 como a
rubrica do corpus:** rubrica casa por igualdade exata de termo curado à mão, e
quando bate, bateu; súmula casa por `ts_rank_cd`, que é aproximação — peso
dominante faria qualquer palavra em comum com uma ementa encabeçar o resultado.

**RPC própria, não uma quarta perna em `busca_hibrida`.** O piso de contexto de
`filtraContexto` é derivado de `p_k` e dos pesos das três pernas de lá; misturar
dois corpora numa fusão só reabriria a classe de erro que 0017 fechou. As três
pernas de `busca_decretos` já nascem com a lição de 0017 aplicada: **cada uma
calcula a própria posição dentro do próprio CTE**, e nenhuma janela enxerga
linha de outra perna.

**A revogação total passou a ser lida, e a armadilha quase custou um dado
errado.** A pendência dizia que ninguém tinha conferido se a fonte sinaliza ato
revogado por inteiro. Conferido em 02/09/2026 contra seis atos reais — três
revogados, dois com um artigo revogado e um vivo: **ela sinaliza**, servindo uma
página de um bloco só, com a nota "(Revogado pelo Decreto 10832 de 06/08/2025)",
sem súmula e sem nenhum `Art.`.

A armadilha é que **a mesma frase aparece dentro de atos vivos**, marcando um
inciso que caiu — o Decreto 475/2023, que institui o CONESD e é o mais citado
deste acervo, traz duas. Procurar a palavra na página marcaria como revogado
justamente ele. O que separa os dois casos é a FORMA da página, não a frase, e é
isso que o coletor lê, com teste para os dois lados. São **40 dos 1.496**, e até
então a tela os mostrava como qualquer outro ato.

`revogado_por` (migration 0021) **não é coluna de vigência**, e a distinção é a
de sempre: nulo quer dizer "a fonte não trouxe nota de revogação total na data da
leitura", não "está em vigor" — um decreto pode ter perdido objeto ou sido
revogado por lei sem que a página diga.

**O que a tela afirma, e o que ela recusa afirmar.** A fonte serve três versões
do texto — `compilado`, `alterado`, `original` — e o coletor lê a primeira, que
é o análogo estadual do texto compilado do Planalto. O que se pode dizer é
"redação compilada, lida em DD/MM/AAAA", e é isso que a tela e a coluna
`conferido_em` dizem. **Não existe coluna de vigência**, porque se a fonte
sinaliza revogação total do ato não foi conferido — e carimbar "em vigor" sem
ter medido seria a decisão nº 3 mentindo numa tabela nova.

**A fonte bloqueia por volume**, e isso moldou o coletor. Depois de ~40
requisições em rajada ela responde `Erro 403 — Acesso temporariamente
bloqueado`, servido pela própria aplicação e por IP, apanhando até o GET
inicial. Três consequências, todas em código: o respiro subiu para 4 s neste
host; 403 vira a exceção `Bloqueado` e **para a execução** em vez de virar falha
de um mês; e **ano lido pela metade não é gravado**.

A terceira nasceu de um defeito real e é a que mais importa. A primeira versão
engolia o erro do mês e seguia — e gravou quatro arquivos de ano silenciosamente
errados, dois deles dizendo `"no_recorte": 0` para anos inteiros que ninguém
conseguiu ler. Nada quebrou, nada avisou, e semeado o acervo afirmaria na tela
que 2023 e 2024 não tiveram decreto normativo nenhum. O conserto é o princípio de
`montarPeca` aplicado à coleta: **sem modo degradado**. O arquivo do ano carrega
`completo`, `scripts/seed-decretos.ts` recusa semear ano incompleto, e a coleta
virou retomável (`--pular-prontos`).

**O número do decreto não é chave única, e isso não estava previsto.** A fonte
**republica** um ato quando a primeira publicação saiu com erro, e a
republicação entra como registro novo: `codAto` diferente, data posterior, a
mesma epígrafe — às vezes com " - Republicado" grudado no fim, às vezes sem
nada. São seis pares em 2023, entre eles o Decreto 2.914, que regulamenta o
Sistema Estadual de Unidades de Conservação.

Quem pegou foi `tests/decretos.test.ts`, na asserção de id único, e o modo de
falha era o de sempre: o seed faria upsert de um sobre o outro e **a ordem do
arquivo decidiria** qual texto fica — metade das vezes a publicação superada,
sem erro nenhum e sem nada na tela dizendo que houve republicação. `deduplica()`
fica com a publicação mais recente, que é a mesma escolha de ler
`tipoVisualizacao=compilado` em vez de `original`, e **relata o descarte** no
campo `republicados` do arquivo do ano: descartar em silêncio é o que ela existe
para impedir.

`data/decretos_pr/` é **versionado**, como `data/vademecum/` e pelo mesmo
argumento do `.gitignore`: a entrada vem de um servidor de terceiro. Ignorá-la
amarraria o seed a um scraping ao vivo — de uma fonte que bloqueia — e deixaria o
acervo irrecuperável no dia em que ela saísse do ar.

**O acervo encolheu por uma conta de espaço, e a conta é a parte que importa.**
Em 01/09/2026 o Supabase avisou que o projeto passava dos 500 MB do plano
gratuito, com 841 MB. A varredura por tabela achou a causa numa linha só:
`decretos_pr_blocos` ocupava **703 MB dos 827 MB** — 85% do banco —, contra 102
MB do corpus federal inteiro. O que pesava não era o texto: eram 30.779 vetores
de 1536 dimensões, ~382 MB fora da linha mais 245 MB só do índice HNSW.

Passar do teto não é aviso, é **escrita bloqueada** — e escrita bloqueada
derruba conversa, cliente e a vigília, deixando o produto lendo e sem registrar.
Dois cortes, os dois medidos:

1. **As 493 homologações de emergência municipal saíram do recorte.** Um quarto
   do acervo dizendo a mesma coisa — emergência num município por enxurrada,
   vendaval ou estiagem —, normativas e inúteis para a advocacia criminal. A
   pendência já as questionava; a conta de espaço decidiu.
2. **Bloco com menos de 150 caracteres não recebe vetor** (migration 0019).
   Eram 16.114 dos 30.779: incisos de uma linha, alíneas e o fecho do ato. É o
   argumento de `texto_embed` levado ao limite — no corpus a saída foi dar
   contexto ao vetor; para um inciso de seis palavras, nem o contexto salva.
   **Eles continuam alcançáveis** pela perna lexical, que lê `busca` em toda
   linha, e pela súmula, que é do ato.

`texto_embed` virou anulável em vez de o filtro morar numa consulta do
`embed.ts`: assim o banco DIZ quais blocos ele decidiu não embutir, e ninguém lê
`embedding is null` como "faltou rodar o embed".

Resultado, medido: **827 MB → 353 MB**, 1.496 decretos e 28.315 blocos, 12.694
com vetor. E a recuperação não piorou — as sete consultas de controle mantiveram
o mesmo decreto no topo, com score igual ou melhor ("conselho estadual de
políticas sobre drogas" foi de 0,0612 para 0,0638).

**O espaço só volta ao disco depois de `vacuum full`.** Apagar linha no Postgres
não devolve arquivo ao sistema, e sem isso a medição do Supabase continuaria
igual — a tabela ficou em 229 MB só depois de reescrita.

**A tela desenha 60 cartões por vez, e o número saiu de medição no navegador.**
Com os 1.989 de uma vez, `/decretos` chegava ao telefone com **2,3 MB de HTML e
14.195 nós no DOM**, numa página de 366 mil pixels de altura — para mostrar os
seis cartões que cabem na primeira tela de um celular. Com a janela: **710 KB,
687 nós**, e o primeiro cartão em 1,3 s em vez de 3,5 s. É a mesma decisão de
`tg-lista` animar só os dez primeiros, e pelo mesmo motivo: o custo é de quem
desenha, não de quem lê.

**O filtro continua vendo o acervo inteiro** — ele roda sobre o array todo, em
memória, e ficou mais rápido (82 ms contra 242 ms, medido com os 1.989 de
então). O que a janela limita é o
desenho, e o botão do rodapé diz quantos ainda não foram desenhados: lista
cortada que não se anuncia é lista que mente sobre o próprio tamanho.

**A lista não traz `epigrafe` nem `url`.** A primeira repete número e data, que
já têm coluna própria; a segunda só o leitor usa. São 130 caracteres por linha
que ninguém lê, vezes 1.989.

**"Redação compilado" era erro de concordância em três telas.** A coluna guarda
o vocabulário da fonte — `compilado`, `alterado`, `original` —, e assim deve
continuar, porque é o nome dos três botões da página do Paraná. Quem concorda em
português é `versaoFem()`, na exibição.

Os comandos:

```
.venv/Scripts/python -m coletores.parana --seco --ano 2025 --mes 1
.venv/Scripts/python -m coletores.parana --pular-prontos   # retoma a maratona
npm run seed-decretos
npm run embed -- --decretos
npm run decretos -- "conselho estadual de políticas sobre drogas"
```

**O coletor não é da vigília, e por isso não entra em `coletores/__main__`.** A
vigília responde uma pergunta só — _a fotografia de 28/02/2025 envelheceu?_ — e
nada aqui altera o corpus federal. Isto é ingestão de acervo novo, com o mesmo
papel de `scripts/vademecum.ts`.

**O chat vê os decretos, e vê por uma porta.** `lib/decretos/porteiro.ts`
decide, por regra em TS e sem chamada de modelo, se o acervo estadual entra: a
pergunta tem de falar em decreto ou trazer marca do Executivo estadual. Porta
fechada não custa requisição nenhuma — e ela fica fechada na esmagadora maioria
das consultas, que são sobre crime.

**A armadilha do porteiro é o Decreto-Lei.** O Código Penal é o DL 2.848/1940 e
o CPP é o 3.689/1941: as duas leis mais citadas do produto têm a palavra
"decreto" dentro do nome. Sem `(?!\s*-?\s*lei)`, a pergunta mais central do
projeto arrastaria consigo um corpus que não tem nada a ver com ela.

**A consulta que vai ao acervo não é a pergunta crua.** Saem dela as palavras
que abriram a porta — "decreto", "Paraná", "estadual" —, porque num acervo em
que todo ato é um decreto do Executivo do Paraná elas não separam um ato de
outro. Serviram para decidir SE o acervo entra; decidir QUAL ato entra é
trabalho das outras palavras.

**O piso do acervo não zera, e a diferença para o corpus foi medida.** As três
pernas de `busca_decretos` usam `websearch_to_tsquery`, que exige TODAS as
palavras — e nenhuma súmula contém "qual" ou "trata". Numa pergunta em forma de
pergunta sobra a perna semântica sozinha, e aí todo resultado cai na mesma
escada de 1/61. Medido em 22/08/2026:

| Consulta                                                      | Topo                | Perfil                                        |
| ------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| "conselho estadual de políticas sobre drogas" (frase nominal) | 0,0621 · via súmula | 4 blocos, forte                               |
| "qual decreto trata do porte de arma dos policiais penais?"   | 0,0164              | 2 blocos, **fraco** — e o decreto está certo  |
| "decreto sobre pesca esportiva em rio"                        | 0,0164              | 2 blocos, **fraco** — e o acervo não responde |

Os dois últimos perfis são **indistinguíveis pelo score**. Cortar pelo piso
jogaria fora o acerto junto com o erro; deixar passar calado poria um decreto de
bacias hidrográficas como fonte. A saída é a de `filtraContexto`: manda-se o
pouco, MARCADO, e o contexto diz ao modelo que aqueles blocos vieram só por
proximidade semântica e que ele não deve construir argumento sobre eles.
Conferido contra o modelo real: na pergunta da pesca ele respondeu que o acervo
não cobre e não usou o decreto.

**Tag própria — `<decreto>`, nunca `<dispositivo>`.** São hierarquias
normativas diferentes, e a distinção tem de estar na marcação, não só no prompt.
A regra 8 do contrato manda escrever "o Decreto estadual X/AAAA dispõe que…" e
nunca "a lei determina que…". Conferido: o modelo escreveu sozinho que o decreto
"organiza a composição do CONESD, mas não cria tipo penal nem altera regime de
tráfico".

**Decreto não conta como fonte primária**, e a exclusão é a mesma decisão de ele
não entrar na peça: o medidor de confiança mede quanto da resposta se apoia no
corpus curado e datado. O cartão dele é âmbar e diz "redação compilado" — nunca
"Em vigor" —, e clicar abre `/decretos/[id]` em vez do painel lateral, que
procura por `dispositivo_id` e não acharia um id `decpr:`.

**O fio da conversa carrega o decreto, e ligar isso consertou um defeito
anterior ao acervo.** `saneiaFio` recusava todo id com dois-pontos, e os dois
espaços de id não-corpus do produto têm um: `stj:1234` e `decpr:2023:475:1`.
Precedente e decreto eram descartados ali, sem erro e sem rastro, e o efeito só
aparecia uma troca depois — a pergunta de seguimento perdia o assunto. O
comentário de `lerDispositivos` dizia que "o fio carrega também id de precedente
do STJ": era verdade sobre a intenção e falsa sobre o código. Pior, um teste
**afirmava o defeito**, exigindo que `stj:4200` fosse descartado.

A herança importa mais aqui do que no corpus: "e quem preside esse colegiado?"
não tem a palavra "decreto", então o porteiro fecha — e sem herança o assunto
que a conversa acabou de tratar sumiria entre uma troca e outra. Conferido com
duas trocas reais: a segunda pergunta, de porta fechada e busca vazia no acervo,
respondeu sobre o CONESD pelo Decreto 475/2023 herdado. O bloco herdado entra
marcado com `origem:`, como no corpus, e a marca é o que impede o aviso de
recuperação fraca desta pergunta de cair sobre um decreto que a conversa já
tratou.

**A guarda de contexto vazio passou a contar o acervo, e isso foi um conserto.**
Ela contava só dispositivos do corpus, e uma pergunta SOBRE decreto legitimamente
não recupera lei federal nenhuma: medido, o corpus voltava vazio, o acervo
devolvia quatro blocos do decreto certo e a resposta era recusada inteira — o
produto tinha a resposta em mãos e dizia que não tinha o que citar.

## Design system — TOGA v2

A interface é a implementação de `Design_system/TOGA v2 - Assistente Jurídico.dc.html`,
um protótipo vivo de 1440×940. Tema **claro**: fundo `#f7f8fa`, lateral `#f1f2f6`,
acento vermelho `#b3141f`. Duas famílias, e cada uma tem um trabalho: **Inter Tight**
é a voz da interface (rótulo, botão, metadado) e **Source Serif 4** é a voz do
texto jurídico (lei, ementa, súmula, resposta do assistente). A divisão separa,
sem precisar de moldura, o que o produto afirma do que o produto cita.

O documento desenha tudo em `style=""` inline. Aqui cada valor vira token uma vez
só, no bloco `@theme` de `src/app/globals.css` (`bg-tg-acento`, `text-tg-fraco-2`).
`src/lib/toga/tokens.ts` guarda **apenas** o que a folha de estilo não alcança:
cor escolhida por índice, valor calculado em runtime e cor dentro de gradiente.
Cor nova que possa ser classe **tem** que ser classe.

**O acento divergiu do protótipo, e é a prova de que o token valeu a pena.** O
`TOGA v2` desenha em roxo `#3a3960`; o produto é `Ipsis` e o acento saiu da logo,
vermelho `#b3141f`. A troca mexeu em **um** bloco `@theme` e em três gradientes
de `tokens.ts` — as ~200 ocorrências de `bg-tg-acento` e `text-tg-acento-txt`
seguiram intactas, porque o que mudou foi o valor e não o nome. É exatamente o
que esta seção argumenta: paleta em hexadecimal espalhado pelo JSX teria feito
do rebranding uma varredura de 200 pontos, com telas ficando para trás.

Uma consequência que não era óbvia: `--color-tg-falha-*` nasceu junto. Antes o
aviso de erro usava `supressao`, e com o acento em vermelho ele passou a morar a
dois centímetros de um botão vermelho de ação. Erro e ação com o mesmo matiz na
mesma altura da tela é ambiguidade, e a saída foi tinta dessaturada mais filete
lateral — não um matiz novo. `supressao` foi dessaturado ~30% pela mesma razão:
apesar do nome vir do par diff (`supressao`/`insercao`), quem ele pinta hoje é o
erro e a ação destrutiva de `/clientes` e `/configuracoes` — `insercao` não é
usado por ninguém, e a tela de diff que o nome sugere nunca existiu.

**A marca segue a mesma regra, em `src/lib/toga/marca.ts`.** Nome, inicial,
ramo e descrição ficam ali e em nenhum outro lugar; `titulo('Jurisprudência')` monta
o título da aba. O argumento é o do `@theme`: o nome estava escrito em 27 pontos
— título de página, `aria-label`, texto de botão, `creator` do `.docx` —, e é
assim que uma tela fica com o nome antigo depois de uma troca de marca. Não é
arquivo de configuração: não se lê de variável de ambiente e não há tela para
editar, porque marca é decisão de produto, muda em commit e se revisa em diff.

**O arquivo já pagou o preço dele duas vezes.** O nome passou de `Toga` para
`LJ` e de `LJ` para `Ipsis`, e nas duas o diff da interface foi de duas linhas —
`nome` e `inicial`. O que sobrou de trabalho em cada rebranding foi o que mora
fora do alcance dele e não deve entrar: o nome do pacote, a URL do deploy, o
`AGENTE` que a vigília apresenta ao Planalto e a prosa dos documentos. Chave de
`localStorage` é o caso limite — carrega prefixo de marca morta (`toga:`,
`jesbick:`) e **não se renomeia**: é identificador de dado guardado, como
`dispositivos.id`, e trocá-lo apagaria em silêncio favorito e preferência de
quem já usava o produto.

### O movimento

O vocabulário vem do documento com os nomes dele (`tgUp`, `tgIn`, `tgPop`…) e as
classes são `tg-sobe`, `tg-entra`, `tg-desliza`, `tg-pipoca`, mais `.tgb` e
`.tgc` para o toque de botão e de cartão. Quatro peças foram acrescentadas onde a
tela mudava sem avisar:

| Classe      | Onde                                                                           | Por quê                                                                                               |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `tg-tela`   | `Casca`, com `key` no caminho                                                  | uma navegação trocava o conteúdo sem nenhum sinal de que trocou                                       |
| `tg-lista`  | achados da vigília, cartões de jurisprudência, índice de artigos, dispositivos | o olho lê de cima para baixo em vez de topar com um bloco pronto                                      |
| `tg-abre`   | cartão de dosimetria no chat                                                   | ele saltava de 48 px para 300 px num quadro e empurrava a conversa                                    |
| `tg-realce` | dispositivo em destaque                                                        | toda citação abre o artigo inteiro, e num artigo de trinta blocos o fundo estático não diz onde olhar |

Três decisões dentro disso:

- **`tg-lista` anima só os dez primeiros.** O índice do CPP tem 825 linhas, e 825
  elementos com `transform` na mesma frame travam a rolagem. O sinal é para a
  primeira tela; o resto já está lá quando se chega nele.
- **`tg-abre` usa `grid-template-rows: 0fr → 1fr`**, que é o único jeito de animar
  até "a altura que o conteúdo tiver" sem medir em JavaScript — e o conteúdo
  fechado leva `inert`, senão trocar desmontagem por animação viraria um defeito
  de acesso: o que está escondido continuaria no caminho do Tab.
- **As regras de movimento reduzido passaram a zerar o _atraso_ também.** Duração
  0,01 ms com atraso intacto não é "sem movimento": é o conteúdo chegando 234 ms
  depois e piscando. Valia para as duas portas — a media query e o
  `data-movimento="reduzido"` das Configurações.

Nada disso é movimento decorativo: cada um marca uma mudança que aconteceu de
verdade. Continua valendo a regra da tela de Fontes — barra de progresso não
chega a 100% antes do resultado, e esqueleto só onde a espera existe.

### As oito telas

| Rota              | Tela                                            | De onde vêm os dados                       |
| ----------------- | ----------------------------------------------- | ------------------------------------------ |
| `/consulta`       | chat, painel de fonte, dosimetria e histórico   | `/api/busca` + `conversas`                 |
| `/jurisprudencia` | entendimento consolidado + precedentes do STJ   | `teses.jurisprudencia` + `precedentes_stj` |
| `/dosimetria`     | cálculo trifásico ao vivo                       | aritmética local, sem banco                |
| `/vademecum`      | grade de ramos + leitor                         | índice do acervo, em disco                 |
| `/decretos`       | acervo estadual do Paraná + leitor              | `decretos_pr` (migration 0018)             |
| `/clientes`       | cadastro do escritório                          | `clientes` (RLS por sessão)                |
| `/fontes`         | vigília sobre a data de corte                   | `vigilia_*` (migration 0012)               |
| `/configuracoes`  | perfil, garantias, fontes, aparência, segurança | `perfil` + `leis` do banco                 |

**A lateral colapsa** para uma trilha de 64px, por `⌘B` ou pelo botão ao lado da
marca, com a preferência guardada em `localStorage`. Não contradiz a largura
fixa: são dois valores fixos, 246 e 64, e não uma lateral fluida. Só a partir de
`lg` — abaixo disso ela já é uma gaveta, e recolher gaveta não quer dizer nada.

Na trilha somem rótulos, histórico e busca; ficam a marca, "Nova consulta", os
seis quadradinhos com `title` e o botão da conta, reduzido ao avatar.

A lateral tem seis itens: Consulta, Jurisprudência, Dosimetria, Vade Mecum,
Clientes e Fontes e atualizações. O documento desenha seis também, mas não os
mesmos: a vigília voltou a pedido e Configurações saiu, também a pedido — ela
se alcança pelo botão da conta, que é onde se procura por ajuste de conta em
qualquer produto.

**O rodapé da lateral é a conta**, e não o cartão "Base conferida" que ficava
ali. A rolagem é do miolo — marca, navegação, busca e histórico andam juntos —
e o rodapé fica fora dela: sair da sessão é a única ação que precisa estar
sempre alcançável, e um `overflow` em volta dele cortaria o menu de 230px na
trilha de 64. O menu abre para cima e traz Configurações e Sair.

**A data de corte deixou a casca, a pedido, e continua no produto.** Ela está na
pílula "Corte 28/02/2025" da caixa de consulta, no painel de procedência de cada
dispositivo, no subtítulo de `/leis` e de `/fontes`, no rodapé de toda página do
`.docx` e na tela de entrada. O que saiu foi a moldura que a repetia em todas as
telas — não o dado, que continua saindo de `leis.vigencia_ate` e de
`artigos.conferido_em`.

**O `⌄` ao lado da marca não existe mais.** Era um menu de dois itens que
ninguém abria, no canto mais nobre da lateral. `/leis` e `/pecas` continuam fora
da lateral por serem **destino, não ponto de partida**, e continuam alcançáveis:
`/leis` pela migalha do artigo, por `/fontes`, pelas Configurações, pelo link
cruzado do Vade Mecum e pela página de 404; `/pecas` pelo rodapé de toda resposta
da Consulta. As três — com Configurações — estão na paleta do ⌘K. Com elas
ficam `/artigo/[id]` e `/dispositivo/[id]`, que não são navegação: são o alvo
dos links de citação, e removê-los quebraria a decisão nº 1.

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

| Seção do documento     | Aqui                   | Por quê                                                |
| ---------------------- | ---------------------- | ------------------------------------------------------ |
| Perfil e OAB           | Perfil e OAB           | igual; guardado no banco, ancorado na conta            |
| Fontes e sincronização | Fontes e data de corte | não há coletor; há corpus                              |
| Alertas                | Aparência              | nada notifica; a interface tem duas preferências reais |
| Segurança              | Segurança              | sessão, senha, encerrar em todos os aparelhos          |
| IA e citações          | —                      | removida a pedido; ver abaixo                          |
| Escritório e cobrança  | —                      | multiusuário e billing são fora de escopo              |

**Nenhum interruptor da tela é decorativo.** Existem dois, e os dois mexem em
coisa visível na hora: "lateral recolhida" (a mesma preferência do `⌘B`) e
"reduzir movimento" (põe `data-movimento="reduzido"` no `<html>`, que
`globals.css` trata com as mesmas regras da media query de
`prefers-reduced-motion`). O resto das linhas é leitura, com pílula de estado no
lugar do interruptor — a diferença entre "ajustável" e "garantido" fica na forma,
não numa nota de rodapé.

**A seção "IA e citações" foi removida a pedido**, e com ela quatro outros blocos
de texto que só se liam: o "Recorte do produto" do Perfil, a linha de atalhos e a
nota de rodapé da Aparência, e o parágrafo do `argumentacao.revisado_em` em
`/pecas`. A tela ficou com o que se ajusta e o que se consulta.

**O que elas afirmavam continua verdadeiro; o que dizia deixou de estar na
tela** — com duas exceções que já tinham envelhecido e saíram junto. Uma das
cinco garantias dizia "nenhuma chamada a modelo em runtime — a prosa da consulta
é composta de fatos sobre a própria busca", e isso deixou de valer quando
`/api/consulta/aovivo` virou o caminho padrão. O parágrafo de `/pecas` descrevia
uma costura offline com revisão humana em `argumentacao.revisado_em` que nunca
existiu — a tabela está vazia e sem uso, e está nas pendências deste documento.

As garantias em si não dependiam da tela: quem as segura é
`tests/citacao.test.ts`, os triggers do banco e a recusa de montar peça com
citação órfã — nenhum deles tem interruptor, e nenhum deles precisava de vitrine.

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
conta, e para aí: o `.docx` continua saindo com "Autos nº __**" e "Advogado(a) —
OAB/** nº ______" como campos a preencher. Preencher o cabeçalho de uma peça a
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
  dígito verificador é conta, e `tests/clientes.test.ts` (16 asserções, offline)
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

**As cinco fontes do desenho existem, e entrou uma sexta.** Quatro rodam em
Python, em `coletores/` — detalhe completo em `coletores/README.md`.

| Fonte        | O que entrega                                            | Onde roda         |
| ------------ | -------------------------------------------------------- | ----------------- |
| **Planalto** | texto compilado; alteração **já em vigor**, por artigo   | Python (scraping) |
| Câmara       | proposições e situação da tramitação                     | Vercel (TS)       |
| Senado       | processos e `normaGerada`, com data de publicação no DOU | Vercel (TS)       |
| DOU          | confirma publicação da norma e guarda o endereço oficial | Python            |
| DataJud      | contagem de processos por assunto                        | Python            |
| **STJ**      | precedentes qualificados, com a situação de cada tema    | Python            |

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
Câmara e Senado contam o que foi _proposto_; só o texto compilado mostra o que
_está em vigor_. Na primeira execução ele encontrou **63 alterações posteriores à
data de corte**, entre elas a Lei 15.581/2025 (art. 23 da Lei de Drogas) e a Lei
15.358/2026 (art. 40-A) — duas que nenhuma API de proposição reportaria como
alteração consumada. **A fotografia de 28/02/2025 já está furada, e o projeto não
sabia.**

As 63 estão hoje incorporadas ao corpus, por `data/curadoria/redacoes.yaml` — ver
"O corpus atualizado". O achado continua na tela, com selo verde de "no corpus":
o fato de a lei ter mudado não deixa de ser verdade porque o corpus a alcançou, e
apagar a linha faria a tela esquecer o que aconteceu.

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
`lib/vigilia/alvos.ts`, puro e offline, com 35 asserções em `tests/vigilia.test.ts`
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
nada. `.venv/Scripts/python -m coletores --seco` faz o mesmo com as seis fontes,
incluindo o scraping — é como se confere o que o filtro está pegando antes de
encher a tabela. `--tudo` faz a carga inicial, que nenhum dos dois crons faz.

`.venv/Scripts/python -m pytest coletores -q` roda as 108 asserções do lado
Python, offline e sem segredo, como as dez suítes do vitest.

### Jurisprudência: precedentes qualificados do STJ

`precedentes_stj` (migration 0014), 61 temas do Portal de Dados Abertos do STJ,
sob licença Creative Commons Atribuição. A tela `/jurisprudencia` sai de 15
entradas escritas à mão para 76.

**Por que temas e não ementas, que é a fonte óbvia.** As ementas do STJ também
são abertas e há muito mais delas — 718 sobre a Lei 11.343 num único mês, só na
Quinta Turma. Mas o dump de ementas não tem campo de vigência: medido em
14/08/2026, `tema` e `termosAuxiliares` vêm vazios em 3.326 de 3.326 registros.
Uma ementa de junho pode ter sido superada em agosto e o arquivo não diz.

Indexá-las seria construir, ao lado de um corpus auditado e datado, uma base
incapaz de dizer se o que mostra ainda vale — a decisão nº 3 perdida pela porta
dos fundos, com acórdão no lugar de lei. O dataset de temas tem `situacao`,
`entendimentoAnterior` e o histórico de mudança: é o análogo honesto de
`leis.vigencia_ate`.

**O caso que fixou as regras é o Tema 600** — _"o tráfico privilegiado não é
equiparado a hediondo"_. É a resposta mais procurada do recorte e está
`Revisado`. Dos 61 temas, 14 estão cancelados ou sobrestados.

**O recorte foi medido, não estimado.** Só drogas dá 34 temas; aceitar qualquer
artigo do Código Penal dá 87, sendo 53 sobre homicídio, roubo e estelionato. A
lista fechada de parte geral em `data/curadoria/precedentes.yaml` (dosimetria,
atenuantes, concurso, prescrição) traz 27 que valem para qualquer defesa —
o Tema 585, sobre compensar confissão com reincidência, serve tanto a um tráfico
quanto a um roubo.

**No contexto do chat entram só 18: trânsito em julgado E com tese firmada.**
Os 39 sem tese têm apenas a `questao` — a pergunta que o STJ vai responder, não
a resposta —, e um modelo com uma questão submetida na frente escreve como se
ela estivesse decidida. Os afetados, sobrestados e revisados continuam na TELA,
com selo âmbar: lá são informação sob ressalva; na prosa virariam afirmação.

A consequência é visível e é o desenho funcionando: perguntado se o tráfico
privilegiado é hediondo, o chat continua dizendo que não sabe, porque o Tema 600
está revisado. Já "inquéritos em curso afastam o § 4º?" — que antes não tinha
resposta — passou a ser respondida pelo Tema 1139.

**Sem embedding novo e sem tocar em `busca_hibrida`.** Os precedentes já estão
pendurados no grafo de artigos da decisão nº 1, então o alcance é por
interseção: o tema entra quando compartilha artigo com um dispositivo
recuperado — e são os artigos do contexto **já filtrado pelo piso de fusão**.

No contexto eles usam tag própria, `<precedente situacao="...">`, nunca
`<dispositivo>`. São duas autoridades: uma diz o que a lei escreve, a outra como
o STJ a lê. O efeito apareceu na saída sem ser pedido — o modelo passou a
escrever "a resposta aqui é jurisprudencial, porque o dispositivo legal só
descreve os requisitos".

**Mudança de situação vira achado da vigília.** O upsert sobrescrevia `situacao`
em silêncio, e um tema saindo de trânsito em julgado para cancelado é o mesmo
tipo de evento que uma lei alterada. `situacoes_atuais()` lê o estado anterior
ANTES de gravar; `mudancas()` é pura e distingue os três casos — saiu do
contexto, entrou no contexto, mudou entre duas situações não citáveis.
`CITAVEL` existe nos dois runtimes e um teste falha se divergirem.

**Nada disto vira fundamento de peça.** Tabela separada, sem FK para
`dispositivos`, fora da minuta. Precedente interpreta a lei e a interpretação
muda; o `.docx` continua citando só dispositivo conferido e datado. É a mesma
separação do acervo Vade Mecum.

**Os seis que o grafo não alcançava entraram por curadoria.** Seis dos dezoito
citáveis não tinham artigo vinculado: apareciam na tela e nunca no chat. Não era
descuido do extrator — `artigos_de` recusa atribuir artigo quando a frase numera
mais de um diploma, e uma tese que cita "o art. 42 do Código Penal" e o "Decreto
n. 11.846/2023" produziria `lei_11343_2006_art42`, um id que existe, aponta para
o artigo errado e não levantaria suspeita de ninguém. A recusa está certa; o que
faltava era o caminho para quem lê a tese decidir.

`vinculos`, em `data/curadoria/precedentes.yaml`, é esse caminho — e é o mesmo
desenho de `rubricas.yaml`: o que a extração não alcança é escrito à mão, em
arquivo versionado, com um `porque` por linha. **O vínculo curado vence a
extração automática**, e não por preferência: quem leu a tese inteira foi a
curadoria, e `artigos_de` leu uma frase.

O efeito é verificável: "indulto e tráfico" agora alcança o Tema 1336, e
"confissão compensa reincidência" alcança o Tema 585 — as duas respostas exatas,
sem embedding novo e sem tocar em `busca_hibrida`. `coletores/tests/test_stj.py`
confere que todo id curado existe no corpus e tem a forma de id de artigo.

### O chat é a tela principal

Duas coisas moram nele além da busca, e as duas seguem a mesma regra: nada de
cálculo nem de estado duplicado.

**Dosimetria dentro da resposta.** Um cartão recolhido aparece em toda resposta
**de crime que a calculadora dosa**, e não só nas que pedem cálculo: a pergunta
de um advogado raramente diz "calcule a pena" — ele pergunta sobre o § 4º, e a
pena é a consequência que ele quer ver. Condicionar a palavra de dosimetria
erraria justamente aí.

**O "de crime que a calculadora dosa" foi conserto, não cautela.** O cartão saa
sob TODA resposta com o selo "art. 33 · 5 a 15 anos". Era verdade enquanto o
produto inteiro era tráfico, e virou a pena de um crime exibida sob a resposta de
outro assim que a busca alcançou o art. 157 e o art. 217-A. Quem decide é a
**pergunta**, não os dispositivos recuperados — medido contra a busca real,
"pena para porte de muitas armas" traz o art. 28 da Lei de Drogas entre os dez
primeiros, então olhar a lei do contexto manteria o cartão justamente no caso que
motivou o conserto. Sem crime reconhecido não há cartão: `crimeDaPergunta`
devolve `null`, e o erro é enviesado para esconder.

**A conta é de oito crimes**: os cinco da Lei de Drogas (arts. 33 a 37) e três
do Código Penal (furto, roubo e o art. 217-A). Os três últimos já viviam no
projeto — estão no corpus, e roubo majorado e art. 217-A entraram na busca e na
peça por pedido explícito. Nenhum outro entra sem o mesmo pedido: calculadora
que aceita qualquer artigo e ignora metade da terceira fase é larga por fora e
vazia por dentro.

O que muda por crime são quatro números e uma lista; o que não muda — as três
fases, o art. 59, a Súmula 231, as faixas de regime — não está na tabela. Três
travas nasceram de misturar duas leis, e elas são o coração disto:

1. **Cada causa fica na lei que a criou.** O art. 40 diz "as penas previstas nos
   arts. 33 a 37 **desta** Lei": a majorante da escola não alcança um roubo, e o
   concurso de agentes do art. 157 não alcança um tráfico. O caso que fundou a
   trava é o § 4º, que se restringe ao "caput e § 1º **deste** artigo" — nem
   associação nem financiamento o recebem. A trava está em `calcula()`, não só
   na tela: a tela pode esconder a chave, mas o cartão do chat monta a entrada
   em código e passaria direto.
2. **O nono vetor só existe na Lei de Drogas.** "Natureza e quantidade da droga"
   é o art. 42, e não é circunstância de um furto — sai da tela e sai da conta.
3. **O art. 217-A não recebe majorante nenhuma.** Os §§ 3º e 4º são
   **qualificadoras** — outras faixas de pena, 12 a 24 e 20 a 40 —, não frações
   sobre a provisória. Modelá-las como causa de aumento daria um número
   plausível e errado.

**As faixas não são digitadas de memória.** Cada crime carrega o id do artigo no
corpus, e um teste lê o preceito secundário de `data/normalizado/` e compara —
o desenho de `tests/citacao.test.ts` aplicado a número em vez de id. Ele pagou o
preço na primeira execução: o art. 33 escreve "reclusão de 5 … anos" e os arts.
34 a 37 escrevem "reclusão, de 3 … anos," — o preceito não é redigido igual na
mesma lei. E pegou duas faixas que a memória erraria: roubo está em **6 a 10** e
o art. 217-A em **10 a 18**, elevados por leis posteriores à fotografia.

A multa mudou de origem, não de espécie: os crimes de droga trazem a faixa no
próprio preceito; os do CP dizem só "e multa", e quem dá o intervalo é o art. 49
do CP (10 a 360 dias-multa). O memorial imprime qual, porque vai para dentro de
uma peça.

A conta vem de `lib/toga/dosimetria.ts`, **a mesma** que a tela de Dosimetria
usa. Antes a aritmética morava dentro do componente da tela; duas cópias
divergiriam na primeira correção, e divergir aqui é a tela dizer uma pena e o
cartão dizer outra sobre o mesmo caso. `tests/dosimetria.test.ts` (52 asserções)
tranca as regras que a conta tem de respeitar: Súmula 231 na segunda fase, peso
dobrado do art. 42 na primeira, terceira fase podendo cair abaixo do mínimo, e
as três travas acima.

**O memorial de cálculo passou a existir.** O botão que o oferecia acendia
"Gerando memorial…" por 1400 ms e passava a "Memorial pronto ✓" sem nada ter sido
gerado — um visto de conclusão sobre trabalho que não aconteceu, que é o mesmo
defeito de classe que a barra de progresso chegando a 100% antes do resultado.
`memorialDe()` mora ao lado de `calcula()`, pelo motivo de sempre: conta e
descrição da conta em arquivos diferentes divergem na primeira correção. O botão
copia para a área de transferência e o rótulo volta a "Copiar" assim que a
entrada muda — dizer "copiado" sobre um cálculo que já não é o da tela seria o
mesmo teatro por outro caminho. Cinco asserções conferem que o texto repete os
números que `calcula` devolveu, e não é fixo.

`leDaConversa()` lê da pergunta os fatos que sabe representar — "reincidente",
"primário", "3 kg", "perto de escola", "concurso de agentes". É reconhecimento de
termo, não interpretação: **o que não é reconhecido não vira suposição**, e os
chips mostram o que foi lido para o usuário conferir.

**Ela parte do neutro, e não do padrão da ferramenta.** `ENTRADA_PADRAO` traz
confissão e privilégio ligados — legítimo em `/dosimetria`, onde as duas chaves
aparecem marcadas e se desligam. Dentro da resposta do chat a suposição é
invisível: medido, pergunta sem nenhum fato reconhecível exibia "1a 8m", o
cenário mais favorável que a calculadora sabe produzir, e o cabeçalho recolhido
mostra só o número. Com `ENTRADA_NEUTRA`, sem fato lido a conta dá o mínimo do
caput — o que se pode afirmar de um caso sobre o qual nada se sabe.

**Termo negado não vira fato.** "O réu **não** é reincidente" ligava a
reincidência, que agrava a pena e desliga o § 4º: o erro na pior direção
possível, porque vira o fato favorável escrito no desfavorável negado. A janela
da negação para na pontuação forte — "não cabe o § 4º. Réu reincidente" são
duas afirmações, e a segunda vale.

**A quantidade é lida, não só casada.** A regra ligava o vetor do art. 42 em
qualquer menção a `kg` e ignorava grama: "500 gramas" não ligava nada e "0,5 kg"
ligava, sobre a mesma apreensão. `emGramas()` normaliza as duas unidades e fica
com a maior quantidade citada — "300 g de cocaína e 2 kg de maconha" é apreensão
de 2,3 kg. O piso é `EXPRESSIVA`, um quilo, e **o número não está na lei**: o
art. 42 manda considerar "a natureza e a quantidade" sem fixar medida. É
convenção desta calculadora, do mesmo tipo que o 1/8 por vetor negativo — e o
critério não mudou: um quilo era o que o `kg` solto já dizia sem escrever.
Termo qualitativo ("grande quantidade") não passa pela balança, porque quem o
escreveu já afirmou o que o vetor registra.

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
- **O cartão "Base sincronizada" virou "Base conferida", e depois saiu.** Ele
  nunca sincronizou nada — carregava a data de corte, que é a decisão nº 3 —, e
  desocupou o pé da lateral a pedido, para o botão da conta. A data continua em
  cinco lugares do produto; ver "As sete telas", acima.
- **`/dosimetria` abre no tráfico, e não no roubo do documento.** O protótipo dosa
  o art. 157 do CP; o recorte é o art. 33 da Lei 11.343, e é nele que a tela
  abre. Não é troca cosmética: o tráfico tem o art. 42, que manda a natureza e a
  quantidade da droga **preponderarem** sobre o art. 59 — daí o nono vetor, com
  peso dobrado, que nenhum crime do CP tem. O roubo do documento existe hoje,
  por pedido, ao lado de outros sete — mas como crime que se escolhe no seletor,
  com a lista de causas dele, e não como o crime da tela.

`prefers-reduced-motion` desliga todo o movimento. O documento não trata disso —
protótipo não precisa; produto precisa.

### Acesso: o que o protótipo não desenha e o produto precisa ter

Uma auditoria no navegador (Chromium com sessão real, em 1440, 1024, 390 e 320)
mediu o que nenhuma suíte alcançava. O documento de design não trata de nada
disto, pela mesma razão de `prefers-reduced-motion`: protótipo não tem foco,
não tem teclado e não tem dedo.

**A regra que organiza esta seção:** movimento e forma vieram do documento;
acesso não veio de lugar nenhum, e por isso cada item aqui carrega o número que
o motivou. Sem número, "melhorar a acessibilidade" vira lista de desejos.

**Gaveta aberta é diálogo modal.** O menu da conta e a paleta do ⌘K já eram —
`aria-expanded`, `role`, Esc, foco que volta ao gatilho. A gaveta da lateral não
tinha nada disso, e é a única das três que só existe no toque. Medido antes:
abrir não movia o foco e eram **onze paradas de Tab pelo conteúdo coberto pelo
véu**; Esc não fazia nada; fechar largava o foco no `<body>`; e com ela FECHADA
sobravam dez e tantas paradas em `x = -234`, porque `-translate-x-full` esconde
do olho e não do Tab.

`useEstreito()` é a peça que faltava, e ela **precisa ser JavaScript**: `inert`,
`role="dialog"` e armadilha de foco não existem em CSS, e a `aside` é o MESMO
elemento nos dois modos — sem essa pergunta, inertizar a gaveta fechada
desligaria a navegação do desktop. O foco vai para a própria `aside` e não para
o primeiro link: assim o leitor de tela anuncia o rótulo antes da primeira
parada.

**Link de pular para o conteúdo.** A moldura é a mesma em toda tela e o teclado
a percorria inteira a cada navegação: **29 paradas até o campo de pergunta, 8
com o atalho**. `tabIndex={-1}` no `<main>` é o que faz o salto pousar — sem ele
o link move o scroll e não o foco, e a tecla seguinte continua na lateral.

**Uma região viva, montada sempre.** A que existia dizia "Consultando o corpus
curado" e vivia DENTRO do bloco de espera, desmontando com ele — região viva que
nasce e morre com o estado que anuncia não anuncia nada, porque o navegador
precisa dela já presente para notar a mudança. A chegada da resposta passava em
silêncio. Ela anuncia quantos parágrafos e quantas fontes, não o texto: a
resposta está ali para ser lida no ritmo de quem lê.

**Erro de formulário aponta, marca e leva o foco.** `/clientes` recusava com uma
caixa vermelha e nada mais — zero `role="alert"`, zero `aria-invalid`, foco no
`<body>`. Por isso `critica()` devolve `Critica` e não `string`: a mensagem já
nomeava o campo na prosa, o que serve para quem lê a tela e não serve para a
tela. Um segundo mapa de mensagem para campo seria duas cópias da mesma regra
divergindo na primeira correção, então as duas metades saem juntas de onde a
regra mora. Sem campo apontado — rede, sessão — o foco não é roubado de ninguém.

**Contraste: subiu o que carrega significado.** O pior par media 1.92:1. O ramo
inteiro NÃO subiu, e é decisão: são quatro degraus entre 3.5 e 2.6, e levar
todos a 4.5 os transformaria no mesmo cinza — a hierarquia de ênfase do TOGA v2
desapareceria para resolver um problema que ela não tem, porque ali embaixo
moram dica, placeholder e seta. Subiu `tg-suave` (o tom mais claro que ainda
pinta conteúdo) e, onde um tom decorativo pintava informação, mudou o **uso**: o
o subtítulo de todo cabeçalho, o crédito de procedência
do acervo e o status de `/fontes`.

**Alvo de toque cresce sem o desenho crescer.** Hambúrguer e avatar continuam
com os 32px do documento e recebem 44 de área por um `::after` de `-inset-1.5`;
crescer o botão levaria o `hover:bg` junto e pintaria um quadrado de 44. Onde o
controle é uma pílula, o `max-sm` folga de verdade — no desktop o ponteiro
acerta 29px e a densidade é parte do desenho. O caso que mais dói é o segmentado
da dosimetria: três alvos colados de 29px em 390px de tela, e errar um deles
**muda a pena que a tela mostra**.

**Duas armadilhas que custaram caro, anotadas onde aconteceram:**

1. **Efeito colateral dentro de updater de estado** produz um sintoma idêntico
   ao defeito que se está consertando. O StrictMode invoca o updater duas vezes
   de propósito, e a segunda passagem já encontra a bandeira ligada. Foi assim
   que o passo repetido "continuou repetindo" depois de consertado.
2. **Botão que troca de `type` dentro do próprio clique.** O de parar a consulta
   alternava entre `button` e `submit`; clicar mudava `ocupado` para falso, o
   React reescrevia o `type` ainda dentro do despacho, e o navegador executava a
   ação padrão do botão que encontrava ENTÃO — submetendo o formulário e
   reenviando a consulta que o usuário mandou cancelar. O cancelamento nunca
   falhou; ele era desfeito. `type="button"` sempre, e o Enter continua no
   `onSubmit`, que não depende do botão.

**Parar a consulta age na hora, e não espera o `fetch` reclamar.** A requisição
morre mesmo — `net::ERR_ABORTED` —, mas o `await leitor.read()` do laço de
streaming fica pendurado sem resolver nem rejeitar, então um `catch` esperando
`AbortError` nunca roda. `cancelado` é o mesmo desenho de `vivo.current`, que o
arquivo já usava para o desmonte. Desistência não cai na rede de segurança:
compor uma resposta ali seria entregar o que quem cancelou disse não querer.

**O cartão de compartilhamento é gerado, não é um PNG no repositório.** É o
argumento de `marca.ts`: nome, inicial e descrição moram num lugar só, e um PNG
os traria desenhados dentro dele — a próxima troca de marca deixaria o cartão
com o nome antigo, que é o mais silencioso dos defeitos de rebranding, porque
ninguém revisa uma imagem em diff. Sem fonte baixada, pela mesma restrição que
recusou o `next/font`. `/opengraph-image` está em `PUBLICAS`, e isso é o desenho
funcionando: rota nova nasce fechada, e esta existe para ser buscada por quem
não tem sessão — protegida, devolvia 307 e o cartão saía sem imagem.

## Convenções

- Ids textuais estáveis em toda parte: `lei_11343_2006_art33_p4`,
  `dl_2848_1940_art59_inc4`. São chave de citação — **nunca renumerar**.
- Seed idempotente: upsert por id. Rodar duas vezes não duplica nada.
- Curadoria manual mora em `data/curadoria/*.yaml`, versionada e revisável em
  diff. Nunca digitar conteúdo curado direto numa migration.
- Migrations são aditivas e numeradas em `supabase/migrations/`.

## Ordem de trabalho

Incrementos verificáveis, parando ao fim de cada um para demonstração:

1. schema + seed — feito: 3 leis, 1340 artigos, 3771 dispositivos, todos com vetor
2. rubricas — feito: 421 oficiais + 38 curadas, com 173 variantes
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

**Isso agora roda sozinho em todo PR** (`.github/workflows/verificacao.yml`).
Sete PRs entraram no `main` sem verificação automática nenhuma, e a única razão
de não ter custado nada é que alguém rodou o comando à mão todas as vezes — que
é a garantia que some no dia cansado. São dois jobs, pela mesma razão que
`npm run verificar` não chama o pytest: separados, rodam em paralelo e o
vermelho aponta o lado certo sem ninguém abrir o log.

Sem segredo, sem rede, sem banco — o que é o que permite o arquivo existir sem
dar a um PR de fork acesso à service role. Fora dele ficam `npm run e2e` (fala
com o Supabase de verdade, e quebraria sempre que o plano gratuito pausasse o
projeto: falha vermelha que não é defeito do código ensina todo mundo a ignorar
o CI) e `next build` (precisa das variáveis para importar `lib/supabase.ts`, e
pegaria pouco além do que o `tsc` já pega).

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

As dez suítes (234 asserções) rodam **offline**, sem segredo: `citacao`, `peca`,
`redacao` e `vigilia` leem `data/normalizado/`, `vademecum` lê o acervo em disco,
`decretos` lê `data/decretos_pr/`, e `dosimetria`, `historico`, `clientes` e
`consulta` testam função pura.

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
> que são as que podem errar em silêncio, continuam rodando sempre. **O lado
> vitest recebeu o mesmo conserto** (`seComCorpus`, em `citacao`, `peca`,
> `redacao` e `vigilia`): num clone sem corpus são 190 asserções passando e 31
> anunciadas como puladas, em vez de nove suítes vermelhas.
>
> Medido escondendo `data/normalizado/` e rodando o vitest: 8 arquivos passam, 1
> é pulado inteiro (`peca`), zero falham. É o que permite o CI existir sem
> segredo — ver `.github/workflows/verificacao.yml`. `consulta`
> é a que tranca o contrato da geração ao vivo — validação e leitura incremental —
> sem chamar modelo nenhum. O que fala com o Supabase é verificado contra o banco
> de verdade, não em teste offline.

`npm run verificar` **não roda o lado Python**, e a separação é proposital: o
vitest não deve depender de um venv que pode não existir na máquina de quem só
mexe na interface. Os coletores têm a própria suíte, com o mesmo critério —
offline, sem segredo:

```
.venv/Scripts/python -m pytest coletores -q      # 108 asserções
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
- **545 divergências tipográficas entre o Vade Mecum e o Planalto**, listadas em
  `data/vigilia/redacoes.propostas.yaml`. Não são mudança de lei: são ortografia
  anterior ao Acordo do lado do Planalto (`seqüestro`, `Assembléias`, `argüir`) e
  segmentação diferente em artigo cujo inciso o Planalto imprime dentro do
  parágrafo. Ficam no relatório de propósito — lista escondida é lista que
  ninguém audita, e é ali que um erro do extrator apareceria.
- **Cinco achados da vigília não recebem o selo "no corpus", e é atribuição, não
  falta.** A vigília atribui a anotação de procedência ao artigo corrente, e
  quando ela vem impressa na linha da rubrica do artigo SEGUINTE (o art. 121-B, o
  338-A, o 350-A), o achado nomeia o artigo anterior, que não mudou. A tela erra
  para o lado seguro: diz "pendente" sobre o que já está feito.
- **`argumentacao` continua vazia e sem uso.** A costura offline por
  `scripts/argumentar.ts` não existe, e hoje não é necessária: a argumentação da
  peça vive em `teses.template_md`, escrita à mão. `uso_llm` saiu desta lista —
  é o teto mensal do botão "gerar ao vivo", ver "Nenhuma chamada a LLM no
  caminho padrão".
- **A geração ao vivo só existe na Consulta.** A minuta continua sem modelo
  nenhum, e não é lacuna a preencher sem pedido. **Cinco das 21 teses aguardam
  revisão de advogado** — marcadas em `teses.revisao`, com selo no checklist e
  aviso no rodapé do `.docx`. As outras dezesseis não têm registro de revisão,
  que não é o mesmo que ter sido conferidas.
- **`/sumulas` foi removida** a pedido, para o sistema ficar só com o que se usa.
  Saiu por inteiro: rota, componente e módulo de dados (`lib/toga/sumulas.ts`).
  Nada mais a importava. O `/fontes` que saiu junto **voltou com outro trabalho**
  — é a vigília do corpus, e tem seção própria acima; o que não voltou foi o
  painel de diagnóstico do normalize, cuja fonte segue em
  `data/normalizado/relatorio.json`, fora da tela.
- **Nenhuma rota dinâmica tem `loading.tsx`, e só uma precisaria.** Tudo sob
  `(app)` é renderizado sob demanda desde a autenticação, e oito telas fazem
  `await` no Supabase no servidor — `/fontes` dispara seis consultas em
  `Promise.all`. Medido com o `.next` quente: a troca leva 166 a 444 ms, e nesse
  intervalo nada na tela diz que há espera. Fica na lista porque o número muda
  com o banco frio, que é justamente o estado em que um portfólio é aberto.
  `/jurisprudencia` é a única com esqueleto.
- **Contraste: o ramo abaixo de `tg-suave` continua abaixo de 4.5:1.** É
  deliberado — ver "Acesso", acima —, e vale enquanto esses tons pintarem dica,
  placeholder e seta. Uso novo que ponha informação em `tg-fraco-*` ou
  `tg-tenue*` reabre o problema, e nenhum teste pega isso.
- **`/fontes` ainda tem três alvos abaixo de 32px no toque**, contra 304 antes.
  Os que sobraram são links de 11px dentro de linha de texto, isentos pela WCAG
  2.5.8 e já com a área ampliada por `py-2 -my-2`.
- **Leitor de tela real nunca foi usado.** O ARIA desta seção foi conferido no
  DOM e no navegador; como ele soa no NVDA ou no VoiceOver é conferência que
  ainda não aconteceu.
- **Precedente do STJ não guarda mais id de artigo inexistente.** Eram 28 ids em
  21 dos 72 temas — números do CPC lidos como se fossem da Lei de Drogas ou do
  CP. A pendência registrava um impasse: filtrar contra o corpus exigiria
  `data/normalizado/`, ausente no GitHub Actions onde a coleta roda, e filtrar
  só onde o arquivo existe faria o coletor se comportar diferente em dois
  ambientes. **O impasse some quando se muda de lugar**: a tabela `artigos` está
  no banco, e o banco é o mesmo em qualquer ambiente. Um trigger na escrita
  (migration 0022) filtra o que não resolve, no mesmo desenho de
  `valida_ids_dispositivo`. O coletor continua gravando o que extraiu — ele não
  tem como saber —, e a escrita recusa. Filtra o vínculo, não a linha: derrubar
  o tema por causa de um id ruim descartaria a tese junto.

  **A causa em `artigos_de` continua de pé, e é outra pendência.** Ela recusa
  atribuir quando a frase NUMERA dois diplomas, e não recusa quando o segundo é
  apenas NOMEADO ("art. 1.030 do CPC"). O trigger cobre o efeito; a extração
  ainda produz o ruído, agora descartado na porta.

- **A dosimetria dosa oito crimes, e não um artigo qualquer.** Os cinco da Lei
  de Drogas e três do Código Penal. Estender exige, por crime, a faixa conferida
  contra o corpus e a lista de causas da terceira fase — sem isso a calculadora
  aceitaria o artigo e ignoraria metade da conta. Fora do que a busca e a peça já
  alcançam, nenhum entra sem pedido explícito.
- **"Porte para consumo pessoal" já alcança o art. 28, e o diagnóstico anterior
  estava errado.** A pendência dizia "rubrica faltando"; medido em 23/08/2026, a
  rubrica `porte de droga para consumo pessoal` estava lá desde sempre, com o
  cluster certo. O que faltava eram variantes **curtas**: o match é por
  igualdade da consulta inteira ou pelo termo contido nela a partir de 12
  caracteres, e todos os termos curados eram MAIS LONGOS que a pergunta — termo
  de 35 caracteres não cabe dentro de uma consulta de 26, e igual não é. Uma
  rubrica escrita na forma completa do instituto não alcança quem digita a forma
  abreviada, que é como as pessoas escrevem. Com `consumo pessoal` (15) entre as
  variantes, a consulta devolve o art. 28 caput, § 2º e § 1º, via rubrica, a
  0,053.

  **Uma variante foi escrita, medida e retirada, e o registro importa mais que a
  correção.** `porte de droga` (14) casa por "contido" e fez
  "porte de droga para venda" — que é tráfico — devolver o art. 28 em primeiro
  lugar, com peso dominante. É a classe de erro que a pendência do corte de 12
  caracteres descreve, aparecendo em uma tarde. Ficou a forma qualificada,
  `porte de droga para consumo`, que não cabe dentro da pergunta de venda.

  **O preço:** `porte de droga` sozinho não alcança mais o art. 28 — cai em
  léxico e vetor, e o piso marca o contexto como fraco. É o erro na direção
  certa: perder um acerto custa uma recuperação fraca declarada; dominar com a
  rubrica errada afirma outro crime.

- **O corte de 12 caracteres da rubrica contida deixou de mandar na consulta,
  e a saída não foi mexer no número.** A pendência dizia que o corte fora
  calibrado contra o peso quebrado, e que rever o número ou exigir concordância
  de outra perna era decisão de medida. Medido em 02/09/2026, o problema não era
  o comprimento: era o match contido ter o MESMO poder do exato — inclusive o
  passe livre na ordenação. 0020 separa os dois (metade do peso, sem passe
  livre); ver "Busca", acima. O corte de 12 continua onde estava, porque agora
  ele decide outra coisa.

  **A segunda metade do conserto foi curadoria, e repetiu a lição do art. 28.**
  A pergunta medida também não achava `busca domiciliar sem mandado` porque
  falava em "entrada na residência", e a rubrica só conhecia "entrada em
  domicílio". Com as variantes novas, a mesma pergunta devolve o art. 240, § 1º
  do CPP em primeiro, e a confissão — que a frase de fato menciona — fica
  presente e subordinada. **Duas vezes seguidas o defeito foi a rubrica escrita
  na forma institucional não alcançar quem escreve de outro jeito**; é
  propriedade do arquivo, não caso isolado.

- **O piso de quantidade expressiva é convenção, não lei.** `EXPRESSIVA` é um
  quilo, e o art. 42 não fixa medida nenhuma. Está escrito onde mora e vale só
  para a leitura automática da conversa — na ferramenta, quem marca o vetor é o
  usuário. Piso diferente por droga (cocaína e maconha não pesam igual no
  processo) seria mais fiel e exigiria curadoria que ninguém conferiu.
- **O acervo de decretos do Paraná está cheio.** 1.496 decretos e 28.315 blocos,
  **12.694 deles com vetor**, colhidos de 17.765 atos vistos entre 2022 e 2026.
  Eram 1.989 e 30.779 até 01/09/2026, quando o corte de espaço tirou as 493
  homologações de emergência e deixou de embutir bloco com menos de 150
  caracteres — ver "Decretos estaduais do Paraná", acima. Bloco sem vetor não é
  pendência: é decisão, e ele continua alcançável pelo léxico e pela súmula. A coleta levou duas sessões, com um bloqueio de IP no
  meio (`Erro 403 — Acesso temporariamente bloqueado`), que é o motivo de ela ser
  retomável por `--pular-prontos`. Reprocessar tudo a partir do cache em disco
  custa segundos; recolher da fonte custa ~2 h.
- **Nenhum decreto do acervo tem data de publicação divergente hoje, e já teve
  um.** O 4.895 era listado em 2024, com epígrafe de 2024 e `21/02/2021` na
  coluna de data — e saiu em 01/09/2026 junto com as outras 492 homologações de
  emergência. A regra que ele motivou continua de pé: o ano do id vem da
  epígrafe, a data fica como a fonte a deu, e a tela diz "data divergente na
  fonte" em vez de exibir a contradição calada. `tests/decretos.test.ts` trava o
  número em zero — se subir, a fonte passou a divergir em atos que ficaram.
- **As telas do acervo foram auditadas em 320, 390 e 768 px**, num navegador de
  verdade, com o acervo real — eram 1.989 decretos na data da auditoria, hoje
  são 1.496. Não vaza horizontalmente em nenhuma das três, a gaveta fica fora da
  tela quando fechada, os cartões cabem e o filtro por ano devolve a contagem
  certa (306 de 1989 em 2022, na medição daquele dia). O que a auditoria
  achou está consertado: o peso da lista, a concordância de "redação compilada",
  o `<summary>` de filtros que não parecia tocável no celular e o "voltar" do
  cabeçalho com 23 px de altura em 390.

  **A suíte de navegador passou a rodar, e isso fechou a lacuna.** Com a conta
  descartável em `.env.local`, `npm run e2e` roda os 24 casos com sessão real —
  os dez do acervo e os catorze do resto do produto. Todos passam.

- **A perna de súmula do acervo estadual não dispara em pergunta em forma de
  pergunta.** `websearch_to_tsquery` exige todas as palavras, e nenhuma ementa
  contém "qual" ou "trata" — sobra a perna semântica, e o acerto fica com o
  mesmo score do erro. O contexto marca isso como fraco e o modelo se comporta,
  mas a recuperação seria melhor com semântica OR na perna de súmula. Mexer nisso
  é mudar a RPC, e não se muda peso de fusão no escuro: pede medição antes.
- **A Lei de Execução Penal não está no projeto, e trazê-la é decisão de
  procedência, não de trabalho.** Ela não está no corpus, não está no acervo de
  75 e não está no PDF do Vade Mecum — as quatro ocorrências no PDF são
  referências feitas por outras leis. O levantamento completo, com as três
  origens possíveis e o que cada uma cobra da decisão nº 1, está em
  `docs/lep-levantamento.md`.
