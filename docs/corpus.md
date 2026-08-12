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
| `data/lei11343.json` | Lei Antidrogas 11.343/2006 | `lei_11343_2006` | integral · 93 arts. | `vade_parser.py` |
| `data/codigo_penal.json` | Código Penal (DL 2.848/1940) | `dl_2848_1940` | integral · 416 arts. | `vade_parser.py` |
| `data/cpp_subconjunto.json` | CPP (DL 3.689/1941) | `dl_3689_1941` | **parcial** · ~25 arts. | curadoria manual |

Os JSONs são **fonte imutável**. A limpeza acontece em `scripts/normalize.ts`,
nunca editando os JSONs no lugar. Isso é o que permite reexecutar a pipeline
inteira e comparar resultados quando uma regra muda.

---

## O que a auditoria encontrou

| Classe | Ocorrências | Detecção | Correção |
|---|--:|---|---|
| **A.** Rubrica marginal colada | 379 + 64 headings | heurística | automática, com diff revisado |
| **B.** Marcador de nota de rodapé | 8 | heurística | automática |
| **C.** Ordinal como letra `o` | 119 | determinística | automática |
| **D.** Nota do Editor no texto legal | 11 blocos | determinística | **curadoria** |
| **E.** Parágrafo inexistente | 8 blocos | determinística | **curadoria** |
| **E'.** Parágrafo com sufixo colapsado | 29 colisões | determinística | automática |

Total: **506 alterações** registradas, cada uma com o antes e o depois em
[`data/normalizado/auditoria.md`](../data/normalizado/auditoria.md).

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

| | Lei 11.343 | Código Penal | Total |
|---|--:|--:|--:|
| Artigos | 93 | 416 | **509** |
| Dispositivos | 387 | 1.245 | **1.632** |
| Artigos revogados | 10 | 19 | 29 |
| Rubricas oficiais | 0 | 414 | **414** |
| Embeddings | 387 | 1.245 | **1.632** |

Verificações que `normalize.ts` faz e que abortam a execução:

- nenhum id de dispositivo repetido
- nenhum `NE:` remanescente
- nenhuma entrada de curadoria órfã ou desatualizada

E que ele reporta sem abortar, para revisão humana:

- conflito de rubrica (duas origens disputando o mesmo dispositivo) — **0**
- suspeitos de truncamento — **0**
- headings sem corte — **51**, todos conferidos

---

## Reproduzir

```bash
npm run normalize    # data/*.json + curadoria → data/normalizado/
npm run audit        # o diff das 506 alterações, para revisão humana
npm run seed         # → banco, uma transação, idempotente
npm run embed        # só o que teve embed_hash alterado
```

`npm run audit -- --tudo` mostra todas as alterações sem amostragem.
