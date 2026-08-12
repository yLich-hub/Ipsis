# Acervo Vade Mecum

75 legislações federais para consulta livre em `/vademecum` — Constituição,
Código Civil, CDC, CLT, CPC, CTN, ECA, LGPD e o resto do vade mecum usual.

Este documento existe por uma razão só: **o acervo não é o corpus curado**, e a
diferença entre os dois é a diferença entre ler uma lei e citá-la numa peça.

---

## Por que existe

O recorte do Jesbick é tráfico de drogas, e o corpus curado atende exatamente
isso: Lei 11.343, Código Penal e o subconjunto do CPP. Fora daí não havia onde
consultar nada — e consulta ampla é o gesto mais comum de quem trabalha com
direito. O acervo cobre esse gesto sem alargar o recorte, porque não participa
de nada que produza peça.

## De onde vem

Espelho do Planalto importado do repositório
[RenanSantos7/Vade-Mecum](https://github.com/RenanSantos7/Vade-Mecum) (CC0), no
commit `0632f30`, de **03/05/2025**. Lá cada lei é um objeto `ILei` com o texto
num único bloco HTML, raspado da página do Planalto por um script de console.

O SHA é **fixado** em `scripts/vademecum.ts`, não `main`: é o commit que dá uma
data honesta para exibir na tela e o que torna a importação reprodutível.

Nenhum código do repositório de origem foi copiado — a interface é reimplementada
no stack deste projeto. O que se importa é texto de lei federal, domínio público
por força do art. 8º, I da Lei 9.610/1998. (A licença do repositório de origem é
contraditória: o arquivo `LICENSE` é CC0 1.0 e o README diz "GNU". Mais uma razão
para não depender do código dele.)

---

## A separação, e por que ela é estrutural

O acervo é texto sem data de vigência conferida, vindo de espelho de terceiro.
Se pudesse virar fundamento de peça, o projeto perderia a decisão nº 3 — citar
redação revogada em peça criminal é grave, e a data de corte é justamente o que o
corpus curado carrega e o acervo não.

A separação não é convenção que alguém precise lembrar:

| Trava | Onde |
|---|---|
| Ids do acervo (`cf`, `cdc`) não casam o padrão do corpus (`dl_2848_1940`) | `tests/vademecum.test.ts` |
| Nada é escrito em `dispositivos` — a busca híbrida não tem o que enxergar | `scripts/seed.ts` não lê `data/vademecum/` |
| Sem embedding: o acervo não entra no índice semântico | `scripts/embed.ts` não lê `data/vademecum/` |
| `seed.ts`, `embed.ts`, `normalize.ts` e `busca/consultar.ts` não podem citar "vademecum" | teste falha no CI |

E o que o leitor vê:

- selo `acervo` no cabeçalho de toda tela;
- aviso âmbar fixo, sem botão de fechar, dizendo que não é fonte de citação;
- link para o texto oficial no Planalto quando existe;
- no CP e no CPP, **link cruzado para o corpus curado** — as duas leis existem
  dos dois lados, e só um deles é citável.

---

## Os 42 links que faltam

33 leis trazem o link do Planalto no próprio espelho. As outras 42 não trazem
nada: o cabeçalho é texto puro (`Lei nº 8.069, de 13 de Julho de 1990.`).

**Não derivar a URL do número da lei.** O padrão do `ccivil_03` é regular o
bastante para tentar, e é aí que mora o erro grave: `itcmd` é a Lei 4.261/1989 do
**Rio de Janeiro** e `estsppi` é lei complementar do **Piauí**. Norma estadual não
está no Planalto, e a URL montada pelo número abriria a lei federal homônima — um
texto legal plausível e errado, que é o pior desfecho possível.

Enquanto não houver curadoria, a tela **diz que o link falta**, em vez de apontar
para destino chutado. Para preencher: `link_oficial` em
`data/curadoria/vademecum.yaml`, conferindo cada um, e depois

```bash
npm run vademecum -- --verificar-links
```

que exige HTTP 200 **e** o número da lei aparecendo no corpo da página — vale
para os links do espelho tanto quanto para os curados, já que nenhum dos dois foi
verificado na origem.

---

## Pipeline

```bash
npm run vademecum
```

`scripts/vademecum.ts` baixa os 75 arquivos do SHA fixado e, para cada um:

1. **extrai** os campos do literal `ILei` e o template literal `conteudo`;
2. **saneia** com `sanitize-html`, allowlist de tags de documento — o HTML é de
   terceiro e vai para `dangerouslySetInnerHTML`, então sanear em build significa
   que o arquivo em disco já está seguro e revisável em diff;
3. **injeta âncoras** nos `h1`–`h4`, que viram o sumário lateral;
4. **resolve** o link oficial, a área e o id de URL (o fonte tem caixa mista e um
   typo: `EstatutoIdodo`).

Saída: `data/vademecum/<id>.html` e `data/vademecum/indice.json`. Idempotente —
rodar duas vezes dá o mesmo diretório, e id renomeado na curadoria leva o arquivo
antigo junto.

Aborta se alguma lei ficar sem área conhecida: some do catálogo em silêncio é o
pior desfecho. Link faltando não aborta — é reportado e aparece na tela.

## Runtime

`src/lib/vademecum.ts` lê do disco, sem Supabase. É a única parte do produto que
continua inteira com o banco pausado — e o plano gratuito pausa por inatividade.
O índice fica em cache de módulo; o HTML não, porque são 9,4 MB somados e a
Constituição sozinha tem 831 KB.

`next.config.mjs` declara `outputFileTracingIncludes` para `data/vademecum/**`:
o rastreador da Vercel não enxerga `readFileSync` com caminho montado em
variável, e sem isso o acervo quebraria só em produção.

## Leitura

A lei inteira numa página, sem paginar por título — é o que faz o `Ctrl+F` do
navegador varrer o código todo, que é como se consulta vade mecum. O sumário
lateral (`components/vademecum/sumario.tsx`) navega por Livro/Título/Capítulo com
realce da seção em leitura.

A busca interna usa a **CSS Custom Highlight API**: as ocorrências viram `Range` e
o destaque sai por `::highlight()`, sem tocar no DOM. Envolver ocorrência em
`<mark>` num documento de 831 KB obrigaria o navegador a remontar a árvore a cada
tecla — e quebraria as âncoras do sumário. Onde a API não existe, a barra se
apaga e manda usar o `Ctrl+F`.

Favoritos ficam em `localStorage`: é preferência de um usuário só, sem valor fora
do navegador, e não pode ser o que traz a dependência de banco de volta à única
tela que sobrevive ao banco pausado.
