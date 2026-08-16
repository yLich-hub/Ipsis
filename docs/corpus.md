# O corpus: da extração do PDF ao banco

Este é o documento mais importante do projeto. A parte difícil do Jesbick não é
o RAG — é garantir que o texto legal que sai na peça seja o texto legal.

O corpus vem de um Vade Mecum em PDF de duas colunas com rubricas na margem.
Extração de PDF jurídico não é um problema resolvido, e o parser deixou cinco
classes distintas de artefato. Três estavam previstas. **Duas só apareceram
quando a auditoria começou a contradizer os números esperados** — e são as duas
que poriam texto corrompido dentro de uma peça protocolada.

---

## Fontes

| Arquivo | Lei | `id` | Cobertura | Origem |
|---|---|---|---|---|
| `data/lei11343.json` | Lei Antidrogas 11.343/2006 | `lei_11343_2006` | integral · 94 arts. | `vade_parser.py` + Planalto |
| `data/codigo_penal.json` | Código Penal (DL 2.848/1940) | `dl_2848_1940` | integral · 421 arts. | `vade_parser.py` + Planalto |
| `data/codigo_processo_penal.json` | CPP (DL 3.689/1941) | `dl_3689_1941` | integral · 825 arts. | `vade_parser.py` + Planalto |

Os JSONs são **fonte imutável**. A limpeza acontece em `scripts/normalize.ts`,
nunca editando os JSONs no lugar. Isso é o que permite reexecutar a pipeline
inteira e comparar resultados quando uma regra muda — e ela é determinística:
reexecutar devolve os três arquivos byte a byte idênticos.

> **O CPP deixou de ser subconjunto digitado à mão.** Este documento já
> prescreveu digitar ~25 artigos em `data/cpp_subconjunto.json` e marcar
> `cobertura = parcial`. A premissa era que o Vade Mecum não trazia o CPP, e ela
> não se sustentou: ele está no mesmo PDF, e o mesmo parser o extrai inteiro, com
> a mesma data de corte.
>
> Digitar à mão seria **produzir texto legal fora da fonte**, que é exatamente o
> que a decisão nº 1 proíbe. O arquivo nunca chegou a existir. A máquina de
> `cobertura = parcial` continua no schema e nas telas, sem nenhuma lei a usar
> por enquanto.
>
> Intervalo conferido no PDF: **CPP = páginas 366 a 422**. Não use 423 — a página
> só carrega o título do Código Tributário Nacional, que vaza para dentro do art.
> 811. Nem 424, que traz o índice sistemático do CTN e vaza 8 mil caracteres para
> o mesmo artigo.

A coluna "Origem" ganhou o Planalto porque o corpus tem uma **segunda fonte**: 47
artigos estão hoje na redação posterior à fotografia, conferidos contra o texto
compilado e registrados em `data/curadoria/redacoes.yaml`. Ver
[Redação posterior](#redação-posterior-à-data-de-corte).

---

## O que a auditoria encontrou

| Classe | Ocorrências | Detecção | Correção |
|---|--:|---|---|
| **A.** Rubrica marginal colada | 385 | heurística | automática, com diff revisado |
| **B.** Marcador de nota de rodapé | 58 | heurística | automática |
| **C.** Ordinal como letra `o` | 179 | determinística | automática |
| **D.** Nota do Editor no texto legal | 42 | determinística | **curadoria** |
| **E.** Parágrafo inexistente | 11 | determinística | **curadoria** |
| **F.** Divisor estrutural vazado | 2 | heurística | automática |
| | **677** | | *limpeza do PDF* |
| **Redação posterior à data de corte** | 161 | comparação | **curadoria** |
| | **838** | | *total* |

Cada uma com o antes e o depois em
[`data/normalizado/auditoria.md`](../data/normalizado/auditoria.md).

> **Os números vêm de `data/normalizado/relatorio.json`, não da memória.** Foram
> corrigidos depois de uma auditoria encontrar divergência entre o que este
> documento afirmava e o que o pipeline registrava. São a contagem de
> `alteracoes[]` — **uma entrada por dispositivo e regra**. O `contagem` por lei,
> no mesmo relatório, conta ocorrências e dá outro número (909): um dispositivo
> com três ordinais corrigidos é 3 ali e 1 aqui.
>
> Ao reexecutar `npm run normalize`, conferir se estes números mudaram.

A última linha não conserta artefato do PDF: é a regra `redacao`, que aplica o
texto novo de 25 leis posteriores. Ver
[Redação posterior](#redação-posterior-à-data-de-corte).

**E'** — parágrafo com sufixo colapsado no mesmo id (`§ 4º`, `4º-A`, `4º-B`,
`4º-C` chegando todos como `numero: "4"`) — não aparece na tabela porque foi
resolvida em código, antes de virar alteração registrada. Confiar no
comportamento antigo colapsava 29 dispositivos distintos; o art. 155 do CP tem
exatamente esses quatro.

---

## A. Rubrica marginal colada

O Vade Mecum imprime a rubrica do dispositivo na margem. O parser a absorve no
**fim do bloco anterior**.

```
Art. 1º  Não há crime sem lei anterior que o defina. Não há pena sem
         prévia cominação legal. Lei penal no tempo
                                  └──────────────┘
                                  rubrica do art. 2º
```

**Regra determinística:** o fragmento no fim do dispositivo *i*, na ordem do
documento, é a rubrica do dispositivo *i+1* — inclusive quando *i+1* é um
parágrafo ou inciso do mesmo artigo.

Essa última parte não é detalhe. O art. 14 do CP confirma:

```
Art. 14  Diz-se o crime: Crime consumado     →  rubrica do INCISO I
   I – ... definição legal; Tentativa        →  rubrica do INCISO II
  II – ... vontade do agente. Pena de tentativa  →  rubrica do PARÁGRAFO ÚNICO
```

A cadeia inicial do Código Penal saiu correta ponta a ponta: `art. 2º → "Lei
penal no tempo"`, `art. 3º → "Lei excepcional ou temporária"`, `art. 13 § 2º →
"Relevância da omissão"`, `art. 59 → "Fixação da pena"`.

**A limpeza é uma feature.** As rubricas removidas viram a tabela `rubricas` com
`origem = 'oficial'`, já ligadas ao dispositivo exato — que é a camada mais
importante da busca.

### Heurística e seus limites

Fragmento após pontuação de fim de frase, sem pontuação terminal própria,
iniciando em maiúscula, até 130 caracteres, sem `Pena –`, sem remissão a
dispositivo.

Duas armadilhas encontradas ao calibrar:

- `Pena de multa` **é** rubrica (art. 58), mas `Pena – reclusão, de...` não é. O
  travessão é o que separa os dois casos.
- O guard anti-remissão usava `/\bart\b/`. O `\b` do JavaScript só conhece
  `[A-Za-z0-9_]`, então ele **casa dentro de "artístico"** — e derrubava a
  rubrica do art. 164, "Dano em coisa de valor artístico, arqueológico ou
  histórico". Passou a exigir o número depois da abreviação.

Por ser heurística, `scripts/audit.ts` gera o diff `texto_bruto → texto` de
todas as alterações para revisão, e `dispositivos.texto_bruto` guarda sempre o
original.

### Rubrica colada no heading

Mesmo artefato, outra manifestação:

```
CAPÍTULO III – Da Aplicação da Pena Fixação da pena
               └── heading ──────┘ └── rubrica ──┘
```

Aqui a assinatura é tipográfica: heading do Vade Mecum é *Title Case* (toda
palavra maiúscula ou conectivo); rubrica é *sentence case*. Duas regras, nesta
ordem:

| Regra | Como funciona | Acertos |
|---|---|--:|
| `sentence-case` | acha a primeira minúscula não-conectiva e recua até a última maiúscula | 46 |
| `repeticao` | último token maiúsculo que já apareceu no heading (`Do Furto Furto`) | 8 |
| `curadoria` | rubrica de uma palavra em Title Case, invisível às duas | 10 |
| — | heading genuinamente limpo | 51 |

A regra `repeticao` produziu **um** falso positivo: `Da Aplicação da Lei Penal
Anterioridade da Lei` termina em "Lei", que já aparece antes, e ela cortou só a
última palavra. Corrigido em
[`data/curadoria/headings.yaml`](../data/curadoria/headings.yaml), onde a
curadoria sempre vence a heurística.

Os 33 headings da Lei 11.343 estão todos limpos — o artefato é exclusivo do
Código Penal, o que bate com a diferença de diagramação entre as duas partes do
volume.

---

## B. Marcador de nota de rodapé

Dígito de 1–2 casas grudado logo após pontuação, em fim de bloco:

```
"...integre organização criminosa.2"
"...prevenção do crime:5"
"...em legítima defesa;1"
```

O caractere antes da pontuação não pode ser dígito — é o que impede comer o
final de `1.500`. E o marcador tem que estar em fim de bloco, o que impede tocar
em `art. 33`.

Um caso exigiu ordem de operações: em `"…suspensivas da prescrição.4 Modo de
conversão"`, o marcador fica **entre** o texto legal e a rubrica. A regra da
rubrica passou a tolerar o dígito no meio, e a remoção do marcador roda de novo
depois que a rubrica sai.

---

## C. Ordinal como letra `o`

`§ 1o` → `§ 1º`, `Lei no 9.099` → `Lei nº 9.099`.

São 566 ocorrências brutas no PDF, das quais a maioria é o marcador `§ 1o` no início do
bloco — esse vira `rotulo` na extração da estrutura, não precisa de substituição.
Restam 119 dentro do texto.

A regra `no` → `nº` é a perigosa: **`"no 1º grau"` é português legítimo**, não
abreviação de número. Ela só dispara depois de palavra que anuncia diploma legal
(`Lei`, `Decreto`, `Súmula`…) ou diante de separador de milhar. Preferir deixar
passar a corromper texto legal.

---

## D. Nota do Editor dentro do texto legal

**Não estava previsto.** Não é o marcador da classe B — é o **corpo** da nota,
emendado dentro da frase:

```
"…transferidos a terceiros a título gratuito ou mediante contraprestação
 6 NE: ver ADPF no 569. irrisória, a partir do início da atividade criminal."
 └──────── nota do editor ────────┘
```

O texto legal é "…mediante contraprestação **irrisória**, a partir do início da
atividade criminal". A nota foi cravada no meio de um sintagma nominal.

São 11 blocos (1 na Lei 11.343, 10 no CP), 15 ocorrências. Os marcadores são
**sequenciais no documento** (1–2 e 1–13), o que dá uma verificação de
completude independente da heurística.

**Por que é curadoria e não regex.** Uma das notas é:

```
10 NE: conforme determinação do art. 2o da Lei no 7.209/1984, em razão do
cancelamento das referências a valores de multas, a expressão "multa de" foi
substituída por "multa".
```

Ela contém `art. 2o` e `Lei no 7.209/1984`. Qualquer regra do tipo "corta até o
primeiro ponto" decepa o texto legal junto. Com 11 blocos no corpus inteiro,
revisar uma vez sai mais barato — e mais seguro — que manter heurística.

Os cortes exatos estão em
[`data/curadoria/notas_editor.yaml`](../data/curadoria/notas_editor.yaml).
**`normalize.ts` aborta** se sobrar qualquer `NE:` depois de aplicar a curadoria,
ou se alguma entrada deixar de casar.

---

## E. Parágrafos que não existem

**Também não estava previsto, e é o mais grave.**

O `PAR_RE` do parser casa qualquer `§ No` em início de linha. Quando a quebra de
linha do PDF cai logo antes de uma **remissão** a parágrafo, a continuação da
frase vira parágrafo novo:

```
art. 37 da Lei de Drogas, como saiu do parser:

  caput:  "Colaborar, como informante, com grupo, organização ou associação
           destinados à prática de qualquer dos crimes previstos nos
           arts. 33, caput e"                              ← truncado
  § 1º:   "§ 1o, e 34 desta Lei: Pena – reclusão, de 2 a 6 anos…"
                                                           ← não existe
```

O art. 37 é o **informante do tráfico** — está dentro do recorte do projeto. Sem
correção, o caput fica mutilado e nasce um `lei_11343_2006_art37_p1` citável em
peça, apontando para um dispositivo que a lei não tem.

Que é caso isolado, e não falha sistemática, se comprova nos arts. 35 e 36:
trazem a mesma remissão inteira num bloco só, porque ali a quebra de linha caiu
em outro ponto.

**Assinatura de detecção:** tirado o marcador, o bloco começa em minúscula ou em
pontuação. Parágrafo de verdade nunca faz isso. `normalize.ts` varre e reporta
como suspeito; a correção fica em
[`data/curadoria/emendas.yaml`](../data/curadoria/emendas.yaml), com o campo
`comeca_com` como trava. São **8 casos**, e o texto reabsorvido volta ao bloco
anterior em ordem de documento — que pode ser o caput, outro parágrafo ou um
inciso.

### E'. Parágrafos com sufixo colapsados

Aparentado, mas determinístico e resolvido em código. O `PAR_RE` captura só o
dígito, então `§ 4º`, `§ 4º-A`, `§ 4º-B` e `§ 4º-C` chegam todos como
`numero: "4"`.

O art. 155 do Código Penal tem exatamente esses quatro. Confiar no número do
parser colapsava **29 dispositivos distintos em ids repetidos** — colisão de
chave primária no seed e, pior, duas citações diferentes apontando para o mesmo
lugar.

A correção lê o número do próprio marcador, com o sufixo. `normalize.ts` recusa
emitir o resultado se sobrar qualquer id repetido.

---

## Não confundir com defeito

Buracos na numeração são legítimos, não perda do parser:

- Lei 11.343 pula 8 → 15 (arts. 9º a 14 revogados pela Lei 13.840/2019)
- Código Penal pula 186 → 196 e 218 → 223

Artigos `(Vetado)` e `(Revogado)` entram no banco com `revogado = true` — são 29
no corpus. Estão lá porque a peça às vezes precisa argumentar sobre a revogação.

---

## O que sai da pipeline

| | Lei 11.343 | Código Penal | CPP | Total |
|---|--:|--:|--:|--:|
| Artigos | 94 | 421 | 825 | **1.340** |
| Dispositivos | 390 | 1.312 | 2.069 | **3.771** |
| Artigos revogados | 10 | 19 | 16 | 45 |
| Rubricas oficiais | 0 | 414 | 7 | **421** |
| Embeddings | 390 | 1.312 | 2.069 | **3.771** |

Verificações que `normalize.ts` faz e que abortam a execução:

- nenhum id de dispositivo repetido
- nenhum `NE:` remanescente
- nenhuma entrada de curadoria órfã ou desatualizada
- nenhuma redação aplicada cujo `era` não case exatamente com o texto atual

E que ele reporta sem abortar, para revisão humana:

- conflito de rubrica (duas origens disputando o mesmo dispositivo) — **0**
- suspeitos de truncamento — **1**: o `art. 761` do CPP, que termina em
  `"art. 82.49"`. O `49` é marcador de rodapé que a regra B recusa remover, por
  ser indistinguível de decimal. Fora do recorte, e listado nas pendências.
- headings sem corte — **155**, todos conferidos

---

## Reproduzir

```bash
npm run normalize    # data/*.json + curadoria → data/normalizado/
npm run audit        # o diff das 838 alterações, para revisão humana
npm run seed         # → banco, uma transação, idempotente
npm run embed        # só o que teve embed_hash alterado
```

`npm run audit -- --tudo` mostra todas as alterações sem amostragem.

Exige o PDF, que não é versionado — ver
[como obtê-lo](../README.md#como-obter-o-pdf-de-origem). Sem rodar isto,
`data/normalizado/` não existe e quatro suítes do vitest se pulam com o motivo
impresso, em vez de falhar.

---

## Redação posterior à data de corte

A vigília encontrou **63 alterações posteriores** à fotografia de 28/02/2025,
duas delas na Lei de Drogas. O conserto que este documento previa era "rodar o
`vade_parser.py` sobre a nova redação", e ele não existe: **o PDF do Vade Mecum
é a fotografia.** A redação nova não está nele e nunca vai estar.

A segunda fonte é o texto compilado do Planalto, e ela entra por um caminho que
preserva as três decisões:

```
coletores/redacao.py         →  data/vigilia/redacoes.propostas.yaml   (proposta)
        ↓ conferência humana, bloco a bloco
data/curadoria/redacoes.yaml →  scripts/normalize.ts → seed            (corpus)
```

**O scraper não escreve texto legal em lugar nenhum.** Ele propõe;
`redacoes.yaml` é curadoria versionada, revisável em diff, com data e endereço da
conferência em cada entrada. É a mesma distância que existe entre
`headings.propostas.yaml` e `headings.yaml`.

Hoje são **47 artigos**, alterados por 25 leis: 37 com blocos reescritos ou
incluídos (125 blocos) e 10 que a lei criou depois da fotografia — entre eles o
art. 40-A da Lei de Drogas.

### As travas, porque isto reescreve texto legal

1. `era` guarda o texto que o corpus tinha, exato. `normalize.ts` **aborta** se
   ele não casar — nenhuma redação se aplica no escuro.
2. Entrada que não casa com dispositivo nenhum aborta o script.
3. `dispositivos.texto_bruto` continua guardando o que o Vade Mecum dizia; o diff
   sai em `npm run audit` sob a regra `redacao`.
4. `tests/redacao.test.ts` confere que o corpus carrega a redação **nova e não a
   antiga**, que o bloco incluído entrou na ordem certa, e que nenhuma anotação
   do Planalto vazou para o texto.

A quarta pegou dois erros reais antes do seed: treze parágrafos novos do art. 310
do CPP entrando de trás para a frente, e a rubrica do artigo seguinte colada no
fim do art. 168-A.

**A conferência é sobre a lei inteira, não sobre a lista da vigília.**
`redacao.py` compara os 1.340 artigos com a página compilada; artigo que ninguém
alterou tem de bater, e quando não bate é o extrator que está errado. Só vira
curadoria a divergência que carrega norma posterior à data de corte — o que sobra
são **545 divergências tipográficas** (`seqüestro`, `Assembléias`, `Decreto-lei`
contra `Decreto-Lei`), que ficam no relatório de propósito.

Rodar de novo hoje devolve **0 blocos a atualizar** nas três leis. É essa a
verificação: o comando é idempotente, e a resposta "nada a fazer" é a prova de
que o corpus está em dia.

```bash
.venv/Scripts/python -m coletores.redacao
```
