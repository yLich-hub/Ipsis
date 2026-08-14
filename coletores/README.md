# Coletores da vigília do corpus

Cinco fontes, uma pergunta: **a fotografia de 28/02/2025 envelheceu?**

O corpus citável deste projeto é uma extração do Vade Mecum do Senado com data
de corte em 28/02/2025 (decisão nº 3, no `CLAUDE.md`). Citar redação revogada em
peça criminal é grave. Estes coletores não corrigem o corpus — eles avisam
quando ele precisa ser reconferido.

## A regra que não se negocia

**Nada aqui escreve em `dispositivos`, `artigos` ou `leis`.**

Duas destas fontes servem texto de lei em prato feito: o Planalto tem o texto
compilado das três leis, e o DOU tem o texto publicado de cada norma. É tentador
e está errado. O texto legal do banco vem de `vade_parser.py` → `normalize.ts` →
`seed.ts`, com conferência humana no meio, e a decisão nº 1 diz que ele vem de
uma fonte só. Se um scraper pudesse alimentar `dispositivos`, `leis.vigencia_ate`
deixaria de ser verdade e nenhum dispositivo citado numa peça teria passado por
revisão — a decisão nº 3 estaria perdida pela porta dos fundos.

A vigília avisa; quem corrige é gente, rodando o parser sobre a nova redação e
conferindo o diff. É por isso que o filtro daqui pode ser heurístico sem
estragar nada.

## Como rodar

```bash
python -m venv .venv
.venv/Scripts/pip install -r coletores/requirements.txt   # Windows
.venv/bin/pip install -r coletores/requirements.txt       # Unix

.venv/Scripts/python -m coletores --seco                  # tudo, sem gravar
.venv/Scripts/python -m coletores --fonte planalto --seco # uma fonte só
.venv/Scripts/python -m coletores --para-disco            # data/vigilia/*.json
.venv/Scripts/python -m coletores --tudo                  # carga completa, grava
.venv/Scripts/python -m pytest coletores -q               # 35 asserções, offline
```

`--seco` roda rede, extração, filtro e contagem sem escrever em lugar nenhum. É
como se confere o que o filtro está pegando antes de encher uma tabela.

Gravar exige `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` — a tabela
tem RLS fechada para `anon` e `authenticated` (migration 0012) e a coleta não tem
sessão para ancorar policy.

**Na sua máquina, as duas saem do `.env.local`**, que a CLI lê sozinha; não
precisa exportar nada. No GitHub Actions elas vêm dos secrets do repositório, e
variável já definida no ambiente sempre vence o arquivo.

## As cinco fontes

| Fonte | O que entrega | Chave |
|---|---|---|
| **Planalto** | texto compilado; alteração **já em vigor**, por artigo | — (scraping) |
| **Câmara** | proposições e situação da tramitação | — |
| **Senado** | processos e `normaGerada`, com data de publicação no DOU | — |
| **DOU** | confirma a publicação da norma e guarda o endereço oficial | — |
| **DataJud** | contagem de processos por assunto | pública, fixa |

**O Planalto é o mais importante dos cinco.** Câmara e Senado contam o que foi
*proposto*; só o texto compilado mostra o que *está em vigor*. Na primeira
execução ele encontrou 63 alterações posteriores à data de corte, entre elas a
Lei 15.581/2025 (art. 23 da Lei de Drogas) e a Lei 15.358/2026 (art. 40-A) —
duas que nenhuma API de proposição reportaria como alteração consumada.

### O DOU tem dois caminhos, e o bom é opcional

A busca web do `in.gov.br` **não serve para robô**, e isso foi medido, não
suposto: os resultados são montados por JavaScript (o coletor lê o
`<script type="application/json">`, que é mais robusto que raspar a lista), o
parâmetro `q` não filtra — `q="LEI Nº 15.581"` devolve vinte portarias sem
relação — e o recorte por data traz a Seção 1 do dia em páginas de 50 que não dá
para percorrer. Em três dias em que sabidamente saiu uma lei, nenhuma aparece nas
primeiras 50 entradas.

O caminho certo é o **INLABS**: edição inteira do Diário em XML, gratuita desde
01/01/2020, com cada ato num `<article>` que traz `artType` e `name`. Ele exige
cadastro gratuito e entrega ZIP — duas objeções que só valem no runtime
TypeScript da Vercel. Aqui, `zipfile` e `xml.etree` são biblioteca padrão e o
Actions tem disco e tempo. É exatamente por isso que os coletores pesados moram
em Python.

```bash
export INLABS_EMAIL=...      # cadastro gratuito em inlabs.in.gov.br
export INLABS_SENHA=...
```

Sem essas duas variáveis, `inlabs.py` não roda e a confirmação cai para a busca
web; sem as duas coisas, o achado fica sem confirmação — e "sem confirmação"
nunca vira "não publicou". Nenhuma demonstração depende disso.

> **Procedência:** o fluxo do `inlabs.py` segue os scripts oficiais da Imprensa
> Nacional e **não foi executado ponta a ponta** durante a implementação, porque
> o cadastro é pessoal. O que está garantido e testado é a degradação: sem
> credencial, sem rede ou com ZIP inesperado, tudo devolve vazio.

**O DataJud não participa da detecção de alteração**, e não por limitação de
tempo: ele devolve capa e movimentação processual, não ementa nem inteiro teor,
e nada em processo judicial altera o texto de uma lei. O card do TOGA v2 promete
"metadados e ementas"; a metade das ementas não existe na API. O que ele
responde de verdade — quanto o recorte pesa no Judiciário — vai para
`vigilia_jurimetria`, como estatística.

**O que ficou de fora, e por quê**

- **LexML** (o substituto oficial do Planalto): o SRU/CQL responde atrás de
  verificação de segurança com JavaScript. Fonte que só funciona no navegador
  não serve para coleta automatizada.
- **Ementa de acórdão**: nem STF nem STJ têm API pública de jurisprudência.
- **STF no DataJud**: `api_publica_stf` devolve 404. Não é falha transitória — o
  Supremo não se submete ao controle administrativo do CNJ e não está na base.

## Onde cada andar roda

| | Vercel Cron (TypeScript) | GitHub Actions (Python) |
|---|---|---|
| fontes | Câmara, Senado | as cinco |
| frequência | diária, 09:20 UTC | diária, 06:40 UTC |
| por quê | cabe numa função serverless e mantém a tela viva sem depender de nada fora da Vercel | scraping de 900 KB por lei e consulta Elasticsearch não cabem — nem devem — no runtime que serve a tela |

**Os dois filtros não divergem por construção.** `data/curadoria/vigilia.yaml` é
a fonte única dos padrões; `coletores/config.py` o lê em tempo de execução, e
`tests/vigilia.test.ts` falha se `src/lib/vigilia/alvos.ts` se afastar de
qualquer linha dele. As duas suítes de teste usam as mesmas ementas reais: se
uma passar e a outra falhar, a divergência aparece na hora.

## As três armadilhas que custaram caro

Estão anotadas no código, e vale saber que existem antes de mexer nele.

1. **User-Agent.** O Planalto derruba a conexão para agente que não comece por
   `Mozilla` — ConnectionError em 0,4 s. A saída não foi fingir ser Chrome:
   `Mozilla/5.0 (compatible; Toga-vigilia/1.0; ...)` passa pelo filtro de
   prefixo e continua dizendo quem é. Ver `rede.py`.

2. **`get_text("\n")` do BeautifulSoup.** Insere quebra entre todo nó de texto,
   inclusive entre tags inline, e a anotação do Planalto vive dentro de `<a>`
   com `<span>` no meio. Encontrava 11 das 283 anotações. Ver `_por_bloco` em
   `planalto.py`.

3. **O separador de bloco não pode ser `\n`.** Os nós de texto do Planalto já
   contêm quebra de formatação: `(Incluído pela Lei \r\n\tnº 15.581, de 2025)`.
   Separar blocos com `\n` parte a anotação de novo. Daí o `\x1e`.

As três tinham o mesmo modo de falha: nenhum erro, nenhuma exceção, uma lista
vazia e a tela afirmando que o corpus está em dia.
