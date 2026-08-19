# Decisões de arquitetura

Registro do que foi decidido, e principalmente **por quê**. Uma decisão sem o
motivo escrito vira dogma na primeira vez que alguém tenta mudá-la.

---

## 1. O texto legal nunca é gerado pelo modelo

**Contexto.** A minuta precisa citar dispositivos. A saída natural seria pedir ao
modelo que escrevesse a peça inteira, citações incluídas.

**Decisão.** Toda citação resolve para um `dispositivos.id` no banco. Os
templates de tese contêm marcadores `{{cite:lei_11343_2006_art33_p4}}`, e o
renderizador substitui pelo texto **lido do banco**, com link para
`/dispositivo/[id]`. O modelo escreve apenas a argumentação *entre* as citações.

**Por quê.** Alucinação de citação em peça criminal não é um bug de UX — é uma
peça protocolada com fundamento inexistente. O custo do erro é assimétrico
demais para depender de verificação probabilística.

**Como é garantido.**

| Camada | Mecanismo | Estado |
|---|---|---|
| Banco | triggers `valida_ids_dispositivo` e `valida_citacoes` recusam `INSERT`/`UPDATE` com id inexistente, com `errcode = foreign_key_violation` | ativo |
| Build | `tests/citacao.test.ts` varre todos os `{{cite:}}` e todos os ids de `fundamentos` e `imputacao` da curadoria, e falha o build | ativo · 16 asserções |
| Runtime | `lib/peca/resolver.ts` não tem caminho para emitir texto legal que não venha de `SELECT`; citação órfã lança `CitacaoOrfa` e a rota devolve 500 com os ids | ativo |

O Postgres não faz FK de marcador dentro de texto, então o trigger é o que
fecha essa lacuna na camada de armazenamento. Ver
[`0001_schema.sql`](../supabase/migrations/0001_schema.sql).

**Consequência aceita.** Não dá para gerar peça sobre dispositivo que não está
no banco. É por isso que a cobertura é explícita, e não silenciosa.

---

## 2. A camada de rubricas é o coração da busca

**Contexto.** Advogado não busca pelo texto da lei. Busca pelo apelido do
instituto.

**O problema, em um exemplo.** "Tráfico privilegiado" não aparece em lugar
nenhum do art. 33, § 4º. "Roubo majorado" não aparece no art. 157. Busca por
palavra-chave no texto puro **não acha o que o usuário procura**.

E busca semântica sozinha também não resolve. Medido neste corpus:

```
consulta: "reduzir a pena de quem é primário e não integra organização criminosa"

 1. art. 149-A, § 2º, do Código Penal      ← tráfico de PESSOAS privilegiado
 2. art. 33, § 4º, da Lei nº 11.343/2006   ← tráfico de DROGAS (o alvo)
```

A redação dos dois dispositivos é quase idêntica, então o vetor erra o crime.
Nenhum ajuste de `k` conserta isso: a informação que distingue os dois não está
no texto embutido.

**Decisão.** Tabela `rubricas` com match exato normalizado (sem acento, caixa
baixa) e **peso dominante** na fusão. Quando o termo do instituto bate, ele
encabeça o resultado — não é um candidato entre outros.

**Duas origens.**

| `origem` | O que é | Volume |
|---|---|---|
| `oficial` | rubrica marginal extraída do PDF, já ligada ao dispositivo exato | 421 termos |
| `curada` | termo coloquial escrito à mão para o recorte de tráfico | 38 termos · 173 variantes |

Uma rubrica aponta para N dispositivos via `rubrica_dispositivos`, com `papel`
(`principal` / `correlato` / `requisito`) e `peso`. "Dosimetria da pena" é um
cluster ordenado — art. 42 da Lei de Drogas como principal, arts. 59 e 68 do CP
como correlatos — não um artigo só.

---

## 3. A data de corte é visível o tempo todo

**Contexto.** Os JSONs são uma fotografia de **fevereiro de 2025** (Vade Mecum
Senado Federal, 1ª ed.).

**Decisão.** `leis.vigencia_ate` é renderizado em banner global **e** ao lado de
cada dispositivo. Nunca sai da tela.

**Por quê.** Citar redação revogada em peça criminal é grave. Um sistema que
mostra texto legal sem dizer de quando ele é transfere ao usuário um risco que
ele não tem como avaliar.

O mesmo raciocínio vale para cobertura: `leis.cobertura` é `integral` (Lei
11.343, Código Penal e CPP) ou `parcial`. Todo dispositivo
de lei parcial exibe o aviso. O banco recusa `cobertura = 'parcial'` sem nota
explicativa — é a mesma classe de erro que redação revogada sem aviso:

```sql
constraint leis_cobertura_nota_ck
  check (cobertura = 'integral' or nullif(btrim(cobertura_nota), '') is not null)
```

**Armadilha encontrada na prática.** O driver devolve `date` como `Date` à
meia-noite UTC; `toLocaleDateString('pt-BR')` puxa para UTC−3 e imprime `27/02`
no lugar de `28/02`. Numa data de corte de redação legal isso não é cosmético.
Formatar sempre pelos getters UTC.

---

## 4. Nenhuma conexão direta ao Postgres em runtime

**Contexto.** Deploy na Vercel, funções serverless.

**Decisão.** Em runtime o app fala com o banco só por PostgREST/HTTPS
(`supabase-js`). Conexão direta ao Postgres existe apenas em `scripts/`, que
rodam na máquina local, pelo pooler em modo transaction (porta 6543).

**Por quê.** Cada invocação serverless abre sua própria conexão; o pool do
Postgres esgota. Como a busca é uma **RPC única**, o custo dessa restrição é
zero: uma chamada de rede, não três.

**O que a conexão direta compra nos scripts.** Transação explícita — e é ela que
faz as constraints `deferrable initially deferred` valerem alguma coisa. Via
PostgREST cada `upsert` é sua própria transação e a checagem volta a ser
imediata, o que quebra qualquer reordenação num re-seed.

---

## 5. Nenhuma rota sem sessão gasta com modelo

**Contexto.** Esta decisão já se chamou "nenhuma chamada a LLM em runtime", e a
premissa dela era que o app fosse público e sem autenticação. A autenticação
entrou; a regra não caiu, mas deixou de ser absoluta.

**Decisão.** A regra é **"nenhuma rota que responda sem sessão pode gastar com
modelo"**. Sob ela, duas escolhas opostas convivem:

| | Modelo em runtime? | Por quê |
|---|---|---|
| **Minuta** (`/api/peca/[casoId]`) | **não** | a argumentação está escrita à mão em `teses.yaml`; `teses.revisao` marca as que aguardam revisão, e o rodapé do `.docx` as declara |
| **Chat** (`/api/consulta/aovivo`) | **sim** | a prosa composta respondia a mesma coisa para toda pergunta |

**Por que a minuta continua sem modelo.** Não é economia: é que não há frase na
peça que alguém não tenha lido antes. Revisão humana de cada linha é padrão
profissional real para peça jurídica, e o texto legal vem do banco de qualquer
forma.

**Por que o chat passou a ter.** A versão anterior compunha a prosa a partir de
*fatos sobre a busca* — qual molde a classificação reconheceu, se a rubrica
bateu, quantos dispositivos vieram. Era verdadeira, verificável na mesma tela, e
**respondia a mesma coisa para toda pergunta**. Explicar o próprio pipeline é bom
como rodapé; não serve como resposta a quem perguntou a diferença entre
associação e concurso de pessoas.

O que a geração **não** afrouxou: o conteúdo jurídico continua vindo do texto do
dispositivo lido do banco, e toda citação é conferida contra o contexto
recuperado antes de a tela ver.

**Os três freios.** A rota exige sessão; há limite por IP na memória do processo;
e há teto mensal no banco, `consome_uso_llm()`, que decide e escreve na mesma
instrução — duas requisições simultâneas não passam juntas pela última vaga.

**Sem modelo de reserva, e é decisão.** A recomendação usual é declarar um
segundo modelo para quando o primeiro recusa. Aqui já existe reserva melhor:
`comporResposta()`, que não custa nada e não pode falhar. Pagar uma segunda
chamada para recuperar o que uma função pura entrega seria trocar o
determinístico pelo caro.

**A demonstração nunca depende do caminho ao vivo funcionar.** Sem chave, a rota
devolve 503 e a resposta composta continua na tela. As duas produzem o mesmo
`RespostaComposta`, e é isso que permite um renderizador só e uma queda sem pulo
de layout.

**Exceção antiga, que continua valendo.** Embeddings de consulta em runtime são
aceitáveis: `text-embedding-3-small` custa fração de centavo por milhão de
buscas. O corpus inteiro (3.771 dispositivos) custou **US$ 0,008**.

> `argumentacao` e a policy `leitura_revisada` continuam no schema e continuam
> vazias. Elas eram a peça de `scripts/argumentar.ts`, que nunca foi escrito
> porque a argumentação encontrou lugar melhor: `teses.template_md`. A policy não
> incomoda e documenta a intenção; a tabela está na lista de pendências.

---

## 6. O demo precisa sobreviver à inatividade

**Contexto.** O plano gratuito do Supabase pausa projetos após alguns dias sem
atividade. Um portfólio é justamente um link clicado semanas depois.

**Decisão.** Duas defesas somadas:

1. Vercel Cron diário batendo em `/api/health`, que chama `public.saude()`.
2. `/vademecum`, que lê 75 legislações **do disco**, sem tocar o Supabase.

**Por quê a segunda.** A primeira é uma aposta em uma política de terceiro que
pode mudar. Se o banco cair mesmo assim, o acervo continua inteiro — só a busca e
as telas de corpus degradam.

> A segunda defesa já foi "páginas dos três casos renderizadas estaticamente", e
> deixou de existir quando a autenticação entrou: ler cookie torna a rota
> dinâmica, e tudo sob `(app)/` passou a ser servido sob demanda. Está registrado
> como consequência aceita. Conferido no `next build`: das 26 rotas, só `/` e
> `/_not-found` saem estáticas.
>
> O acervo assumiu o papel sem ter sido projetado para isso — ele lê do disco
> porque é espelho de terceiro que não pode virar corpus citável, e o efeito
> colateral é ser a única parte do produto imune ao banco pausado.

O mesmo princípio aparece na RPC: `p_embedding` aceita `null`, e a busca degrada
para rubrica + lexical se a API de embeddings estiver fora.

---

## 7. Curadoria em YAML versionado, nunca em migration

**Contexto.** A limpeza do corpus precisou de 30 intervenções manuais sobre o
texto legal (ver [corpus.md](corpus.md)).

**Decisão.** Curadoria mora em `data/curadoria/*.yaml`, versionada e revisável
em diff, com o motivo escrito por extenso em cada entrada. Migrations são
aditivas e contêm apenas estrutura.

**Por quê.** Uma intervenção manual em texto legal precisa de três coisas:
alguém consegue **revisar** (diff), alguém consegue **entender** (motivo), e o
sistema consegue **detectar** quando ela deixou de fazer sentido. Conteúdo
digitado dentro de uma migration não tem nenhuma das três.

**Como a terceira é garantida.** Toda entrada de curadoria tem trava:

- `notas_editor.yaml` — `normalize.ts` aborta se o trecho a remover não casar
  mais, e aborta também se sobrar qualquer `NE:` depois de aplicar tudo.
- `emendas.yaml` — campo `comeca_com` verificado antes de aplicar.
- Entrada órfã (que não casou com nada) também aborta.

Curadoria obsoleta é tão perigosa quanto curadoria ausente: significa que o
texto mudou embaixo dela sem ninguém olhar.
