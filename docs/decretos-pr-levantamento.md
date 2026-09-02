# Decretos estaduais do Paraná — levantamento e arquitetura

Documento de decisão, escrito em 21/08/2026 a pedido. Ele responde três coisas:
**dá para fazer**, **o que a fonte entrega de verdade** e **sob qual desenho
isto entra sem derrubar as três decisões do projeto**.

**Revisado no mesmo dia, durante a implementação.** Três números e uma
arquitetura mudaram depois de o código rodar contra a fonte real — o recorte
normativo é maior do que a projeção, o teste do recorte mudou de runtime, e a
fonte revelou um limite que nenhuma medição de leitura tinha mostrado: ela
**bloqueia por volume**. O que mudou não foi a análise; foram os fatos, e eles
estão marcados abaixo onde aconteceram.

Os blocos 0 a 5 estão implementados, verificados e **com o acervo cheio**:
1.496 decretos e 28.315 blocos, 12.694 deles com vetor, colhidos de 17.765 atos
entre 2022 e 2026.

> **Corrigido em 01/09/2026.** A coleta original trouxe 1.989 decretos e 30.779
> blocos, todos com vetor — e isso pôs o banco em 841 MB, acima dos 500 MB do
> plano gratuito do Supabase, com `decretos_pr_blocos` sozinha ocupando 85% do
> total. Dois cortes medidos devolveram o projeto a 353 MB: as 493 homologações
> de emergência municipal saíram do recorte, e bloco com menos de 150 caracteres
> deixou de receber vetor (migration 0019). As sete consultas de controle
> mantiveram o mesmo decreto no topo, com score igual ou melhor. Os números finais estão em "O que a coleta inteira devolveu", no
> fim deste documento.

---

## O pedido

Decretos do Estado do Paraná, de 2022 a 2026, vindos de `legislacao.pr.gov.br`
(`tipoAto=11`, `orgaoUnidade=1100`), com duas entregas:

1. **Busca manual**, como a tela de Jurisprudência, com item próprio na lateral.
2. **No contexto do chat**, para a Consulta responder sobre eles.

## A resposta curta

**Dá.** A fonte é melhor do que aparenta: é HTML servido pelo servidor, sai com
`curl`, tem texto integral estruturado em `Art.`/`§`, e — o que mais importa —
tem **versão compilada**, que é o análogo estadual do texto compilado do
Planalto que o projeto já sabe tratar.

**Mas o pedido ao pé da letra traz 17.778 atos, e ~96% deles não são norma.**
São nomeações e exonerações de servidores, com nome completo de pessoa física.
Isso não é detalhe de volume: muda o que a tela é, o que o chat responde e que
tipo de dado o banco passa a guardar. O recorte normativo — o que um advogado
consultaria — é de **cerca de 600 atos em cinco anos**, e é sobre ele que a
arquitetura abaixo foi desenhada.

---

## A fonte, conferida endpoint por endpoint

Tudo abaixo foi executado, não lido em documentação. A sessão é um `jsessionid`
que a primeira resposta já entrega; um cookie jar basta.

| O que                  | Como                                                                                                       | Resultado                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Índice de anos         | `GET listarAtosAno.do?action=iniciarProcesso&tipoAto=11&orgaoUnidade=1100&retiraLista=true&site=1`         | 200, 110 KB de HTML servido          |
| Listagem mês a mês     | `POST listarAtosAno.do?action=listarAtos&anoAto=2025&mesAto=1&isPaginado=true` + os 9 campos do formulário | 200, 38 KB, 326 registros, 7 páginas |
| Paginação              | mesmo POST com `&indice=N&totalRegistros=326`                                                              | funciona                             |
| Ato individual         | `GET listarAtosAno.do?action=exibir&codAto=351933`                                                         | 200, 31 KB                           |
| **Ato para impressão** | `GET listarAtosAno.do?action=exibirImpressao&codAto=351933`                                                | 200, 21 KB, **é o alvo do coletor**  |
| Versões do texto       | `&tipoVisualizacao=compilado \| alterado \| original`                                                      | os três respondem                    |
| `robots.txt`           | —                                                                                                          | 404: não há regra de crawl declarada |

**A listagem é a espinha.** Ela devolve, por linha: `codAto` (a chave do banco
de lá), epígrafe (`Decreto 8812 - 31 de Janeiro de 2025`), **súmula** e data de
publicação. Os quatro campos que a tela de busca precisa saem daí, sem abrir ato
nenhum — o texto integral só é buscado para o que passa no recorte.

**`tipoVisualizacao=compilado` é o que torna isto aceitável.** Sem ele, o projeto
estaria guardando a redação original de um decreto de 2022 e chamando aquilo de
vigente, que é a decisão nº 3 perdida na entrada. Com ele, cada ato entra com a
última alteração publicada e um `conferido_em` próprio — exatamente o que
`data/curadoria/redacoes.yaml` fez pelos 47 artigos federais.

**Duas armadilhas já conhecidas, e são as mesmas do Planalto:**

1. **`<strike>`.** A folha de estilo da página de impressão traz
   `strike .tbato { text-decoration: line-through; }` — o texto revogado
   continua no HTML, riscado. `coletores/redacao.py` já o derruba antes de
   qualquer leitura, pelo mesmo motivo: sem isso, duas redações se emendam numa
   frase só.
2. **Entidades HTML.** A página imprime `&ccedil;`, `&ordm;`, `&sect;`. É
   `html.unescape`, não decodificação de charset — mas o coletor tem de tratá-lo
   explicitamente, porque `§` e `º` são justamente os marcadores de bloco.

**O que NÃO funcionou, e por isso não se conta com ele:** a busca textual
(`pesquisarAto.do?action=listar&opt=t`) e a busca por tema (`opt=tm`) devolveram
_"Nenhum registro encontrado"_ em todas as tentativas por `curl`, inclusive com
os campos que o JavaScript preenche. Elas funcionam no navegador; por fora dele,
não foram conferidas. **A ingestão não pode depender delas** — o caminho mês a
mês é o que se mediu funcionando, e é o que o coletor usa.

Fica registrado como perda: o site classifica atos em 18 temas, entre eles
_Defesa e Segurança_ e _Justiça e Legislação_, que seriam o recorte pronto. Como
o endpoint não respondeu, o recorte tem de ser feito aqui.

---

## O volume, medido

Contagem por ano, lida do próprio rodapé da listagem:

| Ano                 | Decretos   |
| ------------------- | ---------- |
| 2022                | 2.915      |
| 2023                | 4.519      |
| 2024                | 3.991      |
| 2025                | 3.860      |
| 2026 (até agosto)   | 2.493      |
| **Total 2022–2026** | **17.778** |

Para saber **o que** são esses atos, janeiro/2025 foi lido inteiro — as 7
páginas, 326 súmulas, classificadas por padrão de abertura:

| Espécie                                      | Atos  | %        |
| -------------------------------------------- | ----- | -------- |
| Nomeação                                     | 130   | 39,9%    |
| Exoneração                                   | 61    | 18,7%    |
| Designação                                   | 22    | 6,7%     |
| Retificação                                  | 10    | 3,1%     |
| **Regulamenta / Institui / Dispõe / Aprova** | **7** | **2,1%** |
| **Altera decreto ou lei**                    | **4** | **1,2%** |
| Crédito orçamentário                         | 1     | 0,3%     |
| Outros                                       | 91    | 27,9%    |

Os 91 "outros" foram lidos por amostra e não mudam o quadro: a maioria é
_"Cumprimento de decisão judicial para nomeação de FULANO"_ e movimentação
orçamentária (_"Efetua uma Transposição no Orçamento Fiscal"_).

**Normativo de verdade: 11 de 326, ou 3,4%**, na classificação grosseira acima.

> **Corrigido na implementação.** O recorte de verdade, escrito em
> `data/curadoria/decretos_pr.yaml` e medido contra as mesmas 326 súmulas, deixa
> entrar **25 de 326, ou 7,7%** — o dobro da projeção. A diferença são espécies
> que a leitura por prefixo grosso não separou: `Aprova o Regulamento`,
> `Introduz alterações`, `Homologa situação de emergência`, `Declaração de
utilidade pública`, `Prorroga o prazo`, `Autoriza o funcionamento`. Nenhuma é
> ato de pessoal, e todas são norma.
>
> Projetado sobre os cinco anos, dá **~1.500 decretos**, não 600. Continua
> tratável — é metade do corpus federal, que tem 3.771 dispositivos —, e
> continua sendo um décimo dos 17.778.
>
> Uma segunda medição saiu de graça e vale mais que a primeira: **nenhuma das
> 326 súmulas fica sem casar `entra` ou `sai`**. Não é enfeite estatístico. É a
> prova de que o recorte é uma decisão sobre dado real e não uma peneira com
> buraco no meio, por onde espécie desconhecida passaria sem ninguém ver. Esse
> zero é asserção em `coletores/tests/test_parana.py`.

---

## O que os outros 96% custariam

Não é conservadorismo: são três custos concretos.

**1. A busca fica pior, não melhor.** A perna de rubrica tem peso dominante e
casa termo contido a partir de 12 caracteres. Um corpus em que "Secretaria de
Estado da Educação" aparece dez mil vezes empurra a fusão para atos de pessoal
em qualquer pergunta que toque a palavra. É a classe de erro do art. 149-A que a
decisão nº 2 existe para impedir, com dez mil linhas de munição nova.

**2. O banco passa a guardar dado pessoal de terceiro, em escala.** Hoje a única
tabela com pessoa de fora é `clientes`, que é a agenda do próprio usuário, com
RLS por `auth.uid()` e três regras próprias. Ingerir 17 mil atos de pessoal
significa milhares de nomes completos, cargos e lotações num corpus que a
Consulta lê em voz alta. São atos públicos, publicados no Diário Oficial — não
há ilicitude em lê-los. Mas construir um índice pesquisável de servidores
nomeados e exonerados é **um produto diferente do que este projeto é**, e não foi
o que o pedido descreveu.

**3. A decisão nº 3 fica sem resposta para eles.** Um decreto de nomeação de 2022
"vige"? A pergunta não faz sentido, e a tela teria de mostrar alguma coisa no
lugar da vigência de 96% das linhas.

---

## Onde isto entra: tabela própria, nunca `dispositivos`

**Decreto estadual não entra em `dispositivos`.** A razão é a mesma que já
manteve fora os precedentes do STJ e o acervo Vade Mecum, e aqui ela é ainda mais
direta: `dispositivos.id` é a chave de citação da peça, e toda citação da minuta
resolve para lá. Um decreto do Executivo estadual não é fundamento de resposta à
acusação por tráfico — e se pudesse virar um por descuido de modelagem,
`tests/citacao.test.ts`, os triggers e `montarPeca` estariam guardando um
universo que passou a incluir norma administrativa estadual.

O desenho é o de `precedentes_stj`: **tabela separada, sem FK para
`dispositivos`, fora da minuta, com id em espaço próprio** (`decpr:<codAto>`),
que nunca casa o padrão do corpus.

```
decretos_pr          — um por ato: número, ano, epígrafe, súmula, publicação,
                       versão lida (compilado), conferido_em, situação, url
decretos_pr_blocos   — um por Art./§/inciso: rótulo, texto, texto_embed, embedding
```

Dois níveis pela mesma razão que `artigos`/`dispositivos` são dois: o vetor de um
`§ 2º` solto é inútil, e `texto_embed` precisa carregar epígrafe + súmula + caput
do artigo em volta. É o argumento de `dispositivos.texto_embed`, repetido.

---

## As três decisões, aplicadas a este pedido

**Decisão nº 1 — o texto legal nunca é gerado pelo modelo.** Vale igual. O texto
do decreto vem do banco, a tela `/decretos/[id]` mostra o bloco íntegro, e a
recusa de transcrição de `valida.ts` passa a valer também para os blocos de
decreto — eles entram em `recuperados` com o texto, como os precedentes já entram
com a tese.

**Decisão nº 2 — a camada de rubricas é o coração da busca.** Decreto não tem
rubrica marginal. **O análogo é a súmula**, que a própria fonte imprime em campo
separado: _"Regulamenta a alteração do regime de trabalho dos professores da Rede
Estadual de Educação Básica."_ É ela que faz alguém achar o decreto sem saber o
número, e por isso ela é campo de primeira classe — indexada, mostrada na lista e
embutida no `texto_embed` de todo bloco.

**Decisão nº 3 — a data de corte é visível o tempo todo.** É aqui que este pedido
cobra mais caro, e a resposta honesta tem duas metades:

- O que **dá** para afirmar: a data de publicação do ato, a versão lida
  (compilado) e a data em que o coletor a leu (`conferido_em`). É o mesmo regime
  de `artigos.conferido_em`, que o projeto já imprime na tela e no rodapé do
  `.docx`.
- O que **não** dá, hoje: dizer que um decreto **não foi revogado**. A página
  risca o texto alterado, mas se ela sinaliza revogação total do ato **não foi
  conferido** — nenhum decreto sabidamente revogado foi aberto nesta medição.
  Enquanto isso não for medido, a tela e o contexto dizem _"redação compilada,
  lida em DD/MM/AAAA"_ e **não** dizem "em vigor". Afirmar vigência não conferida
  é exatamente o dado plausível e falso que o projeto recusa.

Isso vira o primeiro item de trabalho do Bloco 1, e é barato: abrir uma dúzia de
decretos revogados conhecidos e ver o que a página mostra.

---

## A arquitetura, em sete blocos verificáveis

Na ordem de trabalho do projeto: cada bloco termina em algo que se demonstra.

### Bloco 0 — o recorte, em curadoria

`data/curadoria/decretos_pr.yaml`: os padrões de súmula que **entram**
(`Regulamenta`, `Institui`, `Dispõe sobre`, `Aprova o Regulamento`, `Altera o
Decreto`, `Revoga`) e os que **saem** (`Nomeação`, `Exoneração`, `Designa`,
`Cumprimento de decisão judicial`, `Abre crédito`, `Efetua uma Transposição`).

Mesmo desenho de `data/curadoria/vigilia.yaml`: os padrões moram num YAML
versionado, revisável em diff, e o erro é enviesado para o **falso positivo** —
decreto administrativo que entra custa uma linha na lista; decreto normativo que
fica de fora é a resposta que o chat não dá.

`coletores/tests/test_parana.py` roda os padrões contra as **326 súmulas reais
de janeiro/2025**, guardadas em `coletores/tests/amostras/`, e falha se o
recorte mudar sem que alguém tenha olhado.

> **Corrigido na implementação: o teste é do lado Python, não do TypeScript.**
> A primeira versão deste plano dizia `tests/decretos.test.ts`, por analogia com
> `tests/vigilia.test.ts` — e a analogia não se sustenta. A vigília tem suíte
> nos dois runtimes porque o filtro dela **roda nos dois**: TypeScript no cron
> da Vercel, Python no scraping. O recorte dos decretos roda num lugar só, o
> coletor. Duplicá-lo em TS criaria a segunda cópia que aqueles testes existem
> para trancar.
>
> O lado TypeScript ganhou trabalho próprio e diferente:
> `tests/decretos.test.ts` confere o acervo **como dado** — id no espaço
> `decpr:`, ordem densa dos blocos, nenhuma marcação HTML sobrevivente,
> preâmbulo fora dos dispositivos, versão sempre `compilado`. São as
> invariantes que o seed assume e a migration 0018 exige.
>
> **Os nomes de pessoa da amostra estão mascarados como `[NOME]`.** As súmulas
> são públicas e vêm do Diário Oficial, mas versionar uma lista de servidores
> nomeados e exonerados neste repositório seria fazer, em miniatura, o que o
> recorte existe para evitar. A máscara não altera o que se mede: o recorte casa
> o começo da súmula, e o nome nunca está lá.

### Bloco 1 — o coletor, em Python

`coletores/parana.py`, ao lado dos seis que já existem, porque isto é trabalho de
lote: 17.778 linhas de listagem e ~600 páginas de ato não cabem — nem devem — no
runtime que serve a tela. Roda pelo GitHub Actions, como o Planalto.

Ele lista mês a mês, aplica o recorte do Bloco 0 **na súmula**, e só então abre
`action=exibirImpressao` dos aprovados. Saída:
`data/vigilia/decretos_pr.propostas.yaml` — proposta, não corpus, como
`redacao.py` faz.

Três travas, herdadas de `redacao.py`: `<strike>` fora antes de qualquer leitura;
User-Agent na forma `compatible`; e pausa entre requisições — 600 páginas de um
servidor estadual pedem educação, não pressa.

`coletores/tests/test_parana.py`, offline, sobre HTML real salvo em fixture.

### Bloco 2 — a migration

`0018_decretos_pr.sql`: as duas tabelas, RLS em somente-leitura como as demais
tabelas de consulta, índice `tsvector` sobre o texto do bloco e `ivfflat` sobre o
embedding. Aditiva e idempotente, como todas.

### Bloco 3 — seed e embeddings

`scripts/seed-decretos.ts` e reaproveitamento de `scripts/embed.ts`, que já só
reembute o que teve o hash de `texto_embed` alterado. Custo: ~600 atos, talvez
6.000 blocos, em `text-embedding-3-small` — fração de dólar, uma vez.

### Bloco 4 — a busca

**RPC própria, `busca_decretos`, não uma quarta perna em `busca_hibrida`.**
Misturar dois corpora numa fusão RRF só quebraria a única coisa que a fusão sabe
fazer: o piso de contexto é calculado a partir de `p_k` e dos pesos das três
pernas atuais, e mexer nisso reabre a classe de bug que `0017` acabou de fechar.

São duas chamadas de rede em vez de uma, e a regra do projeto ("uma chamada, não
três") continua respeitada no espírito: elas são independentes e vão em
`Promise.all`, então a latência é a maior das duas, não a soma.

### Bloco 5 — a tela

`/decretos`, com a forma de `/jurisprudencia`: facetas à esquerda (ano, espécie),
campo de filtro, cartões com epígrafe + súmula + data, e `/decretos/[id]` como
leitor. Item novo na lateral — `TELAS`, em `casca.tsx`, com um matiz livre — e
entrada na paleta do ⌘K.

Selo de procedência em toda linha, e ele diz o que se mediu: **"redação
compilada, lida em DD/MM/AAAA"**, com link para o ato na fonte. Não diz "em
vigor".

### Bloco 6 — o chat

Tag própria, `<decreto>`, nunca `<dispositivo>` — a mesma separação de
`<precedente>`, e por uma razão ainda mais forte: são **hierarquias normativas
diferentes**. Um decreto do Executivo estadual não revoga lei federal, não
tipifica crime e não muda pena, e o modelo precisa saber disso na marcação, não
só no prompt.

O contrato (`contrato.ts`) ganha a regra correspondente, `valida.ts` aceita o
`doc_id` do decreto porque ele veio da busca, e `enriquece.ts` sobrescreve
epígrafe, súmula e procedência a partir do banco — nada disso é pedido ao modelo.

**A entrada é fechada por porteiro, e essa é a decisão de produto do bloco.**
Decreto estadual só entra no contexto quando a pergunta o chama — `intencao.ts`
ganha um molde novo, por regra em TS e sem chamada de modelo, olhando por
"decreto", "Paraná", "estadual", número de decreto — **e** o resultado precisa
passar por um piso próprio, com teto de 4 blocos. Sem isso, uma pergunta sobre
tráfico privilegiado voltaria com regulamento de regime de trabalho de professor
no contexto, e a resposta pioraria.

### Bloco 7 — a vigília (opcional, e só depois)

`/fontes` já sabe dizer "esta fonte foi coletada em tal dia". Decreto novo
publicado é o mesmo tipo de evento que lei alterada, e o coletor do Bloco 1 roda
incremental sem nada a mais. Fica por último porque é acabamento: sem ele, o
corpus de decretos simplesmente tem a data em que foi coletado.

---

## O bloqueio da fonte — o fato que só apareceu escrevendo o coletor

Nenhuma medição de leitura mostra isto, e é o limite prático da ingestão:
**`legislacao.pr.gov.br` bloqueia por volume, por IP.**

Depois de cerca de quarenta requisições em rajada — as próprias medições que
levantaram o volume, disparadas sem intervalo —, a fonte passou a responder:

    Erro 403 — Acesso temporariamente bloqueado.

Servido pela própria aplicação (`Server: WildFly/11`), não por CDN, e apanhando
até o GET inicial da tela. Não é sessão nem cookie: uma sessão nova, com o GET
de `iniciarProcesso` antes do POST, leva 403 igual.

**Três consequências, e as três viraram código.**

1. **O respiro subiu para 4 s** por requisição neste host, em
   `coletores/rede.py` — o dobro do Planalto. Com ~1.900 requisições para os
   cinco anos, a ingestão passa de duas horas. É o preço de a fonte ser o que é,
   e é melhor que o preço de insistir.

2. **403 para a execução**, em vez de virar falha de um mês. É a exceção
   `Bloqueado`, em `coletores/parana.py`: não se tenta a próxima página, não se
   tenta o próximo mês. Insistir depois do bloqueio é o que transforma
   "temporariamente" em permanente.

3. **Ano lido pela metade não é gravado.** Esta é a que importa, e ela nasceu de
   um defeito real. A primeira versão engolia o erro do mês e seguia — e gravou
   quatro arquivos de ano silenciosamente errados, dois deles dizendo
   `"no_recorte": 0` para anos inteiros que ninguém tinha conseguido ler. Nada
   quebrou, nada avisou. Semeado, o acervo afirmaria na tela que 2023 e 2024 não
   tiveram decreto normativo nenhum.

   O conserto é o princípio de `montarPeca` aplicado à coleta: **sem modo
   degradado**. O arquivo do ano carrega `completo`, `scripts/seed-decretos.ts`
   recusa semear ano incompleto, e `tests/decretos.test.ts` exige que a marca
   exista. A coleta virou retomável (`--pular-prontos`), porque com bloqueio por
   volume a ingestão é uma maratona em sessões, não uma corrida só.

**Isto não muda a arquitetura, e muda o cronograma.** O acervo enche em
sessões, não numa execução — e é por isso que `data/decretos_pr/` é versionado:
uma vez colhido, ninguém precisa colher de novo.

## Duas coisas que só a coleta inteira revelou

**1. O número do decreto não é chave única — a fonte republica atos.** Seis
pares em 2023: `codAto` diferente, data de publicação posterior, mesma epígrafe.
Quatro trazem " - Republicado" no fim da epígrafe; dois não trazem nada, e só a
data denuncia. Sem tratar, `decpr:<ano>:<numero>` colide e o seed decide pela
ordem do arquivo qual texto fica — inclusive a publicação superada. Fica a mais
recente, e o descarte vai relatado em `republicados`, no arquivo do ano.

**2. Um bloco de decreto estoura o modelo de embedding.** `text-embedding-3-small`
recusa entrada acima de 8.192 tokens, e o Regulamento do ICMS tem um `Art. 1º`
de **27.838 caracteres** — ele internaliza dezenas de Convênios ICMS de uma vez.
São 8 blocos acima de 8.000 caracteres em 15.025. O corte é só do que vai para o
vetor; `texto` continua inteiro no banco e na tela. Truncar o texto exibido
quebraria a decisão nº 1; truncar a entrada do embedding é o custo de o artigo
ser grande demais para o modelo.

Nenhuma das duas aparece lendo a fonte por amostragem. As duas apareceram
rodando o pipeline inteiro contra os cinco anos — e as duas foram pegas por
teste, não por leitura de tela.

## O que eu recomendo

1. **Recorte normativo, não os 17.778.** ~600 atos, súmula como camada de
   apelido, atos de pessoal fora. Se em algum momento a pergunta for "quando o
   servidor X foi nomeado", isso é outro produto e merece outra decisão.
2. **Fora da peça.** Decreto estadual não vira `{{cite:}}` e não entra no
   `.docx`. Tabela separada é o que garante isso por construção.
3. **Nada de afirmar vigência antes de medir revogação.** Uma dúzia de decretos
   revogados abertos à mão responde isso em meia hora, e é o primeiro trabalho do
   Bloco 1.

## O que preciso que você decida antes do Bloco 0

- **O recorte** — normativo (~600), tudo (17.778), ou normativo restrito a
  Defesa e Segurança + Justiça (menos ainda, e mais perto do que a advocacia
  criminal usa).
- **O `orgaoUnidade=1100`** da sua URL foi mantido em toda medição, e é o filtro
  que o site aplica por padrão. Não foi conferido o que ele exclui — se houver
  decreto relevante fora dele, o recorte muda.
- **A lateral tem seis itens hoje.** "Decretos PR" seria o sétimo, e o CLAUDE.md
  registra que o desenho original tinha seis. Entra assim mesmo, ou desloca
  algum?

---

## O que a coleta inteira devolveu

Colhido em 21/08/2026, em duas sessões — a fonte bloqueou por volume no meio da
primeira, e a coleta é retomável por isso.

| Ano       | No recorte | De         | %         | Blocos     | Republicações |
| --------- | ---------- | ---------- | --------- | ---------- | ------------- |
| 2022      | 306        | 2.909      | 10,5%     | 7.865      | 2             |
| 2023      | 608        | 4.518      | 13,5%     | 7.889      | 6             |
| 2024      | 425        | 3.987      | 10,7%     | 5.192      | 0             |
| 2025      | 436        | 3.858      | 11,3%     | 6.529      | 0             |
| 2026      | 214        | 2.493      | 8,6%      | 3.304      | 0             |
| **Total** | **1.989**  | **17.765** | **11,2%** | **30.779** | **8**         |

O recorte real ficou em 11,2%, contra os 7,7% de janeiro/2025 e os 3,4% da
projeção grosseira. Continua sendo um nono do que a janela publica, e são 30.779
vetores — oito vezes os 3.771 do corpus federal, por um acervo que não é
citável em peça. Custo dos embeddings: cerca de US$ 0,06.

A busca, medida contra o banco cheio:

| Consulta                                      | Topo                                                  | Score               |
| --------------------------------------------- | ----------------------------------------------------- | ------------------- |
| `conselho estadual de políticas sobre drogas` | Decreto 2.186/2023 — composição do CONESD             | 0,0621 · via súmula |
| `regulamento do ICMS`                         | Decreto 5.317/2024 — crédito presumido                | 0,0396 · via súmula |
| `polícia penal`                               | Decreto 2.759/2023 — porte de arma a policiais penais | 0,0467 · via súmula |

As três acertam pela súmula, que é o que a decisão nº 2 do projeto prevê para
quem procura pelo apelido do instituto e não pelo número do ato.
