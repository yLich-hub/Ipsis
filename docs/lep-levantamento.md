# Trazer a Lei de Execução Penal para o corpus — levantamento

Documento de decisão, não plano de execução. Ele responde três perguntas: o que
existe hoje, o que a LEP exigiria, e qual pergunta de fundo precisa ser
respondida antes de qualquer linha de código.

Escrito em 19/08/2026, a pedido, depois de um pedido de contexto sobre "artigos
da LEP, agravo em execução penal".

---

## O que existe hoje

**A LEP não está em lugar nenhum do projeto.** Três verificações:

| Onde                                             | Resultado                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus citável (`leis`)                          | Três leis: 11.343/2006, CP e CPP. **Sem LEP.**                                                                                                                                                    |
| Acervo de leitura (`/vademecum`, 75 legislações) | Tem CP, CPP, Código Penal **Militar** e Lei das Execuções **Fiscais**. **Sem LEP.**                                                                                                               |
| PDF do Vade Mecum do Senado (801 páginas)        | Quatro ocorrências de "Lei de Execução Penal", **todas referências feitas por outras leis** — o CPP citando-a, a Lei Maria da Penha alterando o art. 152 dela. **A lei em si não está impressa.** |

A terceira linha é a que decide, e é o motivo de este documento existir. O
`vade_parser.py` extrai de um PDF; se o texto não está no PDF, não há o que
extrair.

## Por que isso não é "rodar o parser mais uma vez"

O CPP entrou no corpus barato porque **já estava no mesmo PDF** — bastou apontar
o parser para as páginas 366 a 422. É o precedente que torna tentador achar que
a LEP é igual. Não é: ali havia fonte auditada e datada; aqui não há fonte
nenhuma.

A LEP precisaria vir de outro lugar, e é aí que ela encosta na **decisão nº 1**
do projeto — o texto legal nunca é gerado, ele é lido de uma fonte conferida.

## As três origens possíveis, e o que cada uma custa

### A. Uma segunda fotografia (outro PDF do Vade Mecum, ou edição mais nova)

**A mais barata e a mais coerente.** Se a LEP estiver numa edição do Vade Mecum
do Senado, o caminho é o mesmo do CPP: achar o intervalo de páginas, rodar o
parser, normalizar, semear, embutir.

- Preserva a procedência: mesma editora, mesma curadoria, data de corte
  declarada.
- **Cria uma segunda data de corte.** Uma edição diferente tem outra data, e o
  projeto já lida com isso por artigo (`artigos.conferido_em`) — mas hoje
  `leis.vigencia_ate` é por lei, e a lateral e a tela de entrada leem uma
  constante única (`DATA_DE_CORTE`). Duas fotografias diferentes tornam essa
  constante uma meia-verdade.
- Risco baixo, trabalho médio. **Depende de a LEP estar impressa em alguma
  edição acessível** — isso não foi verificado, porque só há um PDF aqui.

### B. O texto compilado do Planalto

O pipeline existe: `coletores/redacao.py` já lê a página compilada do Planalto,
com armadilhas de HTML resolvidas e testes cobrindo cada uma.

**Mas ele foi desenhado para atualizar artigo que já passou por olho humano, não
para importar lei nova.** A diferença não é técnica, é de garantia: hoje toda
divergência entre o Planalto e o corpus vira **proposta**
(`data/vigilia/redacoes.propostas.yaml`) e só entra depois de conferência
registrada em `data/curadoria/redacoes.yaml`, com data e endereço por entrada.

Importar a LEP inteira por esse caminho significaria uma de duas coisas:

1. **Conferir 204 artigos à mão**, um a um, com registro de conferência — que é
   o padrão que o projeto aplica a 47 artigos hoje. É trabalho real e não é
   automatizável, porque a conferência é justamente o que a máquina não faz.
2. **Aceitar raspagem como origem primária** para uma lei — e aí o corpus passa
   a ter uma lei cuja procedência é diferente das outras três, sem que nada na
   tela diga isso.

A opção 2 é a que eu recomendo **recusar**. Ela não quebra nada visível no dia
seguinte, e é exatamente por isso que é perigosa: o `.docx` continuaria dizendo
"corpus conferido" sobre um texto que ninguém conferiu.

### C. Digitar o subconjunto que interessa

Já foi tentado e já foi recusado neste projeto, e a decisão está escrita no
CLAUDE.md a respeito do CPP: _"Digitar à mão seria produzir texto legal fora da
fonte, que é exatamente o que a decisão nº 1 proíbe."_

Não há por que reabrir.

## O trabalho, se a origem for resolvida

Assumindo a origem A (a única que eu recomendaria), na ordem:

1. **Extração** — achar o intervalo de páginas, rodar `vade_parser.py`, conferir
   os artefatos conhecidos (rubrica marginal colada, nota de rodapé, ordinais,
   parágrafo fantasma). A LEP tem 204 artigos; é menor que o CPP (825) e maior
   que a Lei de Drogas (94).
2. **Normalização** — `scripts/normalize.ts` com as regras existentes, mais o
   diff de `npm run audit` revisado à mão. As cinco classes de artefato do PDF
   valem aqui igual.
3. **Curadoria de rubricas** — e esta é a parte que ninguém estima direito. O
   Vade Mecum **não imprime rubrica marginal fora do Código Penal**: zero na Lei
   de Drogas, sete no CPP. A LEP viria com zero, e sem rubrica a busca erra em
   silêncio. "Agravo em execução", "progressão de regime", "falta grave",
   "remição", "livramento condicional" não aparecem escritos assim no texto da
   lei — são exatamente o tipo de apelido que a decisão nº 2 existe para
   resolver. **Estimo de 15 a 25 rubricas curadas**, escritas à mão, cada uma
   com variantes e cluster de dispositivos.
4. **Seed e embeddings** — mecânico.
5. **Teses e casos** — se a LEP for para chegar na peça. Hoje a peça é uma só,
   resposta à acusação (art. 396-A do CPP), que é fase de conhecimento. **Agravo
   em execução é outra peça, em outro momento processual** — e "segunda peça
   processual" está na lista de fora de escopo do CLAUDE.md. Trazer a LEP para
   consulta não obriga a trazê-la para a peça, e as duas decisões devem ser
   tomadas separadas.
6. **Vigília** — o filtro de `alvos.ts` e `vigilia.yaml` precisa reconhecer a
   Lei 7.210/1984 nas ementas, nos dois runtimes (TS e Python), com as mesmas
   ementas reais nos dois testes.
7. **Precedentes** — a LEP tem muito precedente qualificado do STJ (progressão,
   falta grave, remição). O filtro de `precedentes.yaml` precisaria de uma
   terceira regra, ao lado de `drogas` e `parte_geral_cp`.

## O que muda na tela, e é o que menos se lembra

- **`leis.cobertura`** — se a extração for parcial, toda tela que mostra
  dispositivo da LEP exibe o aviso. O mecanismo existe e está sem uso desde que
  o CPP virou integral.
- **A data de corte** — ver a ressalva da opção A. Se a origem tiver data
  diferente, `DATA_DE_CORTE` deixa de ser uma constante honesta e vira "a data
  de três das quatro leis".
- **O rodapé do `.docx`** — ele já sabe imprimir mais de uma data (aprendeu
  quando `redacoes.yaml` entrou). Isso ajuda, mas o rodapé fala da peça, e a
  peça não cita LEP.
- **`/fontes` e `/configuracoes`** — leem `leis` do banco, então acompanham
  sozinhas.

## A pergunta de fundo

Não é "quanto trabalho dá". É esta:

> **O corpus aceita uma lei cuja procedência é diferente das outras três?**

Se a resposta for não, a LEP só entra quando houver uma fotografia que a
contenha — e o projeto continua honesto dizendo que não cobre execução penal.

Se a resposta for sim, o projeto precisa de uma coisa que hoje não tem: **um
lugar na tela que diga de onde veio cada lei**, artigo por artigo, com a mesma
firmeza com que hoje diz a data. Sem isso, a diferença de procedência existe e é
invisível — e informação verdadeira que ninguém vê é o mesmo que informação
ausente.

## Recomendação

**Não trazer a LEP agora.** Não por preguiça de escopo, mas porque a única
origem coerente (opção A) depende de um PDF que ninguém verificou existir, e as
outras duas cobram um preço na decisão nº 1 que o resto do projeto inteiro foi
construído para não pagar.

**O que dá para fazer sem isso**, e que atende boa parte de quem pergunta sobre
execução: reconhecer o limite na resposta. A Consulta já sabe dizer que o
contexto não cobre um assunto — foi conferido com a Súmula 512 do STJ. Uma
pergunta sobre agravo em execução hoje recebe uma resposta que não inventa; o
que ela não recebe é um encaminhamento. **Um molde novo em
`lib/busca/intencao.ts` que reconheça vocabulário de execução penal e diga, em
uma linha, que o corpus cobre conhecimento e não execução** custa pouco e é
honesto — e é reversível no dia em que a LEP entrar.
