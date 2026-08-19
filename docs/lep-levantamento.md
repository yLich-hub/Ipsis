# Trazer a Lei de Execução Penal para o corpus — levantamento

Documento de decisão. Ele responde o que existe hoje, quais fontes foram
verificadas, o que a LEP exigiria, e sob qual condição ela entra.

Escrito em 19/08/2026, a pedido, depois de um pedido de contexto sobre "artigos
da LEP, agravo em execução penal". **Revisado no mesmo dia**, depois de baixar e
abrir as fontes candidatas — a primeira versão dizia "não trazer agora" porque a
origem coerente dependia de um PDF que ninguém tinha verificado existir. Ele
existe. O que mudou não foi a análise: foi o fato.

---

## A decisão

> **O corpus aceita uma lei com fotografia de agosto de 2023 ao lado de três com
> fotografia de fevereiro de 2025 — desde que a data vire um dado explícito do
> corpus, e não uma inconsistência silenciosa.**

É a condição inteira, e ela é mais exigente do que parece: não basta gravar a
data certa em `leis.vigencia_ate`, que o schema já suporta. O que a condição
cobra está na seção "A condição, traduzida em requisitos", mais abaixo.

## O que existe hoje

A LEP não está em lugar nenhum do projeto. Três verificações:

| Onde                                             | Resultado                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Corpus citável (`leis`)                          | Três leis: 11.343/2006, CP e CPP. **Sem LEP.**                                                                              |
| Acervo de leitura (`/vademecum`, 75 legislações) | Tem CP, CPP, Código Penal **Militar** e Lei das Execuções **Fiscais**. **Sem LEP.**                                         |
| PDF do Vade Mecum, 1ª ed. (801 páginas)          | Quatro ocorrências de "Lei de Execução Penal", **todas referências feitas por outras leis**. A lei em si não está impressa. |

O `vade_parser.py` extrai de um PDF; se o texto não está no PDF, não há o que
extrair. Daí a pergunta que este documento passou a responder: **existe um PDF
que sirva?**

## As fontes verificadas

Não por reputação — cada uma foi baixada e aberta.

### Vade Mecum do Senado, 2ª edição (junho/2025) — não serve

Baixada pelo navegador (o repositório do Senado está atrás de verificação por
JavaScript, o mesmo obstáculo que tirou o LexML dos coletores). Varridas as 801
páginas: **sete ocorrências de "Lei de Execução Penal", todas referências feitas
por outras leis** — o CPP citando-a, a Lei Maria da Penha alterando o art. 152
dela. Idêntico à 1ª edição.

O sumário anunciado da 3ª edição (janeiro/2026) também não a lista. **Trocar de
edição do Vade Mecum não resolve.**

### Código Penal e de Processo Penal, Edições Câmara — serve

_Série Legislação n. 12, 4ª edição, atualizada até 1º/8/2023, 351 páginas._

**A LEP está impressa por inteiro**, a partir da página 241, com texto extraível
e limpo — título, ementa, data de publicação no DOU e os artigos em sequência.
Publicação oficial, com edição declarada.

Duas coisas que só aparecem abrindo o arquivo:

- **A data anda para trás.** 1º/8/2023 é **anterior** à fotografia do projeto. A
  LEP entraria como a lei mais velha do corpus. É exatamente a inconsistência
  que a decisão acima proíbe deixar silenciosa.
- **O layout é outro.** O Vade Mecum imprime em duas colunas; a Câmara, em
  coluna única com linhas de largura cheia. O `vade_parser.py` é afinado para o
  primeiro, e o CLAUDE.md diz para não reescrevê-lo.

### Volume autônomo da LEP, Edições Câmara — não serve

A edição mais recente localizada no repositório é a **2ª, de 2009**, com
menção a uma atualizada até 03/01/2022. Mais velha que a anterior, e a LEP foi
alterada em 2024, 2025 e 2026 — inclusive pela Lei 15.358/2026.

### O texto compilado do Planalto — recusado, e continua recusado

O pipeline existe (`coletores/redacao.py`), mas foi desenhado para **atualizar**
artigo que já passou por olho humano, não para importar lei nova. Hoje toda
divergência vira proposta e só entra depois de conferência registrada, com data
e endereço por entrada.

Importar a LEP inteira por aí é conferir 204 artigos à mão — o padrão que o
projeto aplica a 47 hoje — ou aceitar raspagem como origem primária. A segunda
não quebra nada visível no dia seguinte, e é por isso que é perigosa: o `.docx`
continuaria dizendo "conferido" sobre texto que ninguém conferiu.

**Com a origem da Câmara disponível, esta deixou de ser necessária.** O Planalto
volta ao papel que já tem: a vigília, que avisa quando a fotografia envelhece — e
avisaria bastante, já que a fotografia da LEP nasceria com três anos.

### Digitar o subconjunto — encerrada

Recusada quando o CPP entrou, e a decisão está escrita: digitar à mão seria
produzir texto legal fora da fonte, que é o que a decisão nº 1 proíbe.

## A auditoria do PDF da Câmara

Feita antes de decidir o tamanho do extrator, medindo com as **mesmas expressões
regulares do `vade_parser.py`** — mesma régua, não uma parecida.

A LEP ocupa as **páginas 241 a 272** (32 páginas), com **206 blocos de artigo**,
numeração de 1 a 195 mais 11 com sufixo, e **nenhuma lacuna na sequência**. A
extração cobriria a lei inteira.

### Quatro das cinco classes de artefato não existem aqui

| Classe do Vade Mecum         | Ocorrências na Câmara |
| ---------------------------- | --------------------- |
| B. Marcador de rodapé colado | **0**                 |
| C. Ordinal como letra `o`    | **0** — usa `º`       |
| D. Nota do editor no texto   | **0**                 |
| E. Parágrafo fantasma        | **0**                 |
| A. Rubrica marginal colada   | **0** reais           |

A classe A merece nota: a varredura apontou 18, e todas eram **cabeçalhos de
seção**, não rubricas. A causa é outra e está abaixo.

### Três coisas novas, e só uma é trabalho

1. **Hifenização no fim da linha — 177 ocorrências.** O Vade Mecum não hifeniza;
   a Câmara justifica coluna única e quebra palavra. As amostras são separações
   comuns: `crimi-` + `nal`, `iden-` + `tificação`. **A checagem de composto
   legítimo no fim de linha deu zero** — existem 115 hífens de composto dentro do
   texto, e nenhum na quebra. A regra de junção é segura como medido, e mesmo
   assim deve relatar em vez de presumir, no estilo do resto do pipeline.
2. **Divisores em caixa mista.** O Vade Mecum imprime `SEÇÃO II`; a Câmara
   imprime `Seção II – Da Assistência Material`. `STRUCT_RE` é sensível à caixa e
   não casa, então o cabeçalho gruda no bloco anterior — foi isso que a classe A
   apontou. O conserto é `re.IGNORECASE`, e ele é seguro porque a expressão já
   exige romano ou dígito logo depois: `seção para gestante` e `título executivo
judicial`, que aparecem em texto corrido, continuam recusados.
3. **Anotações entre parênteses — 11**, sendo 10 `(Vetado)` e uma
   `(Revogado pela Lei nº 9.268, de 1º/4/1996)`. **Isto já é regra do projeto**:
   artigo vetado ou revogado entra com `artigos.revogado = true`. A Câmara ainda
   informa a lei revogadora, que é mais do que o Vade Mecum dá.

### O que a auditoria mudou na estimativa

Antes dela, "revalidar as cinco classes do zero" parecia o grosso do trabalho.
**É quase nada.** Somado a coluna única não ter detecção de coluna nem
reconstrução de ordem de leitura — que são a parte difícil do parser atual —, o
extrator novo é **uma regra nova (des-hifenização), um flag (`re.IGNORECASE`) e o
mesmo contrato de saída**.

A ressalva: o que foi auditado é o trecho da LEP. Apontar o mesmo extrator para
as outras partes do volume da Câmara pediria auditoria própria.

## A condição, traduzida em requisitos

"A data vira um dado explícito do corpus" tem quatro consequências concretas. As
duas primeiras o projeto já tem; as duas últimas não existem e são o preço.

1. **Data por lei — já existe.** `leis.vigencia_ate` é por lei, e `/fontes`,
   `/configuracoes` e a lista de cada lei já a leem do banco. Acompanham
   sozinhas.
2. **Data por artigo — já existe.** `artigos.conferido_em`, `alterado_por` e
   `fonte_redacao` vieram com `redacoes.yaml`, e o rodapé do `.docx` já sabe
   imprimir mais de uma data, escolhendo a mais antiga entre as citadas.
3. **`DATA_DE_CORTE` deixa de poder ser uma constante — não existe.** Hoje a
   lateral, a tela de entrada e a pílula da caixa de consulta imprimem um valor
   único, de `lib/vigilia/alvos.ts`. Com duas fotografias, esse valor vira
   meia-verdade em toda tela que não tem dispositivo em mãos. Onde não há
   dispositivo, o texto tem de deixar de afirmar uma data e passar a afirmar a
   **mais antiga**, dizendo que é a mais antiga.
4. **Procedência por lei — não existe.** `leis` guarda cobertura e vigência, e
   não guarda **de onde o texto veio**. Com três leis do Vade Mecum do Senado e
   uma das Edições Câmara, a diferença de origem passa a existir e ficaria
   invisível. Isto é coluna nova, migration nova e um lugar na tela — e é o
   coração da condição: informação verdadeira que ninguém vê é o mesmo que
   informação ausente.

O item 4 é o que separa "aceitar a data" de "tornar a data explícita". Sem ele, o
corpus fica exatamente com a inconsistência silenciosa que a decisão recusa.

## O trabalho, na ordem em que aconteceria

1. **Procedência antes do texto.** Coluna de origem em `leis`, migration,
   preenchimento das três atuais e exibição — ver requisito 4. Vem primeiro de
   propósito: se vier depois, existe uma janela em que o corpus está inconsistente
   e a tela não diz.
2. **`DATA_DE_CORTE` deixa de ser afirmação única** — ver requisito 3.
3. **Extração.** Arquivo separado, **nunca parametrizar o `vade_parser.py`** —
   enfiar um segundo layout dentro dele é reescrevê-lo com outro nome, e o ativo
   real é o contrato de saída, que qualquer extrator pode emitir. Com a
   auditoria feita, é pequeno: sem detecção de coluna, sem ordem de leitura,
   quatro das cinco classes ausentes, uma regra nova e um flag.
4. **Normalização**, com o diff de `npm run audit` revisado à mão.
5. **Curadoria de rubricas — a parte que ninguém estima direito.** A Câmara
   também não imprime rubrica marginal. "Agravo em execução", "progressão de
   regime", "falta grave", "remição" não aparecem escritos assim no texto da lei.
   **Estimo de 15 a 25 rubricas curadas**, com variantes e cluster.
6. **Seed e embeddings.** Mecânico.
7. **Vigília.** O filtro precisa reconhecer a Lei 7.210/1984 nas ementas, nos
   dois runtimes, com as mesmas ementas reais nos dois testes. Aqui ela trabalha
   mais que nas outras leis: a fotografia nasce com três anos.
8. **Precedentes.** A LEP tem muito precedente qualificado do STJ — progressão,
   falta grave, remição. O filtro de `precedentes.yaml` precisaria de uma
   terceira regra, ao lado de `drogas` e `parte_geral_cp`.

**Teses e casos ficam fora, e é decisão separada.** A peça do projeto é resposta
à acusação, fase de conhecimento; agravo em execução é outra peça, em outro
momento processual, e segunda peça está fora de escopo. Trazer a LEP para
consulta não obriga a trazê-la para a peça.

## Um achado que não é sobre a LEP

A 2ª edição do Vade Mecum (junho/2025) é uma **fotografia mais nova das três leis
que já estão no corpus**. Ela não resolve execução penal, mas resolveria parte do
que hoje é consertado à mão em `redacoes.yaml` — e move a data de corte para
frente em vez de para trás.

É outra conversa, e provavelmente mais barata que a LEP. Vale decidir antes:
atualizar as três primeiro deixa a diferença entre elas e a LEP ainda maior, o
que torna o requisito 4 mais urgente, não menos.

## Fontes

- Vade Mecum do Senado Federal, 1ª ed. (fevereiro/2025) — a fotografia atual do
  projeto.
- Vade Mecum do Senado Federal, 2ª ed. (junho/2025) —
  `www2.senado.leg.br/bdsf/bitstream/handle/id/757308/`
- Código Penal e de Processo Penal, Série Legislação n. 12, 4ª ed., Edições
  Câmara, atualizada até 1º/8/2023 — `bd.camara.leg.br`
- Lei de Execução Penal, Edições Câmara, 2ª ed., 2009 — `bd.camara.leg.br`

Os dois PDFs baixados para conferência foram apagados; nada disso entrou no
repositório.
