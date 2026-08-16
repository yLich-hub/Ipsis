# Busca

Três estratégias fundidas dentro do Postgres, em **uma chamada de rede**.

---

## Por que fundir

Cada estratégia sozinha falha de um jeito diferente, e as falhas não se
sobrepõem.

| Estratégia | Acha | Não acha |
|---|---|---|
| Rubrica | o instituto pelo apelido | qualquer coisa fora do vocabulário curado |
| Lexical | termo literal do texto legal | o apelido que não está no texto |
| Semântica | paráfrase, descrição do caso | distinção entre crimes de redação parecida |

O caso que motiva a fusão está medido em
[decisoes-de-arquitetura.md](decisoes-de-arquitetura.md#2-a-camada-de-rubricas-é-o-coração-da-busca):
consulta semântica por "reduzir a pena de quem é primário e não integra
organização criminosa" devolve o **tráfico de pessoas** (art. 149-A, § 2º, CP)
à frente do tráfico de drogas, porque a redação dos dois é quase idêntica.

---

## A RPC

`public.busca_hibrida` — [`0003_busca.sql`](../supabase/migrations/0003_busca.sql)

```
busca_hibrida(
  p_consulta        text,
  p_embedding       vector(1536) default null,
  p_qtd             integer      default 12,
  p_lei             text         default null,
  p_k               integer      default 60,
  p_peso_rubrica    numeric      default 3.0,
  p_peso_lexical    numeric      default 1.0,
  p_peso_semantico  numeric      default 1.0
)
```

Uma função só, `stable`, `parallel safe`, com `search_path` fixo. Chamada do app
por `supabase.rpc()` sobre PostgREST — sem conexão direta ao Postgres em runtime.

`p_embedding` aceita `null`: a busca degrada para rubrica + lexical, o que mantém
o app de pé se a API de embeddings estiver fora.

### Fusão por Reciprocal Rank Fusion

```
score(d) = Σ  peso_i / (k + posição_i(d))
```

RRF combina **posições**, não scores. É o que torna possível somar um match
exato de rubrica, um `ts_rank_cd` e uma distância de cosseno sem inventar uma
normalização entre escalas incomparáveis.

A rubrica entra com peso **3×**: quando o termo do instituto bate exatamente,
ele é a resposta, não um candidato. Medido:

```
consulta: "fixacao da pena"      (sem acento, de propósito)

 1. art. 59 do Código Penal      score 0.08170  ◆ rubrica "Fixação da pena"
 2. art. 59, IV, do CP           score 0.01639
 3. art. 60 do CP                score 0.01613
```

Cinco vezes o segundo colocado. É o peso dominante funcionando.

---

## As três pernas

### 1. Rubrica — match exato normalizado

```sql
join public.rubricas r
  on r.termo_norm = q.termo
  or q.termo = any (r.variantes_norm)
```

`termo_norm` e `variantes_norm` são **colunas geradas**, calculadas por
`public.norm()` no `INSERT`. O advogado digita "trafico privilegiado" sem
acento; sem normalização, o match falha justamente no caso mais comum.

`unaccent()` é `STABLE` (depende do dicionário resolvido em runtime), então não
entra direto em coluna gerada. Passar o dicionário explicitamente e declarar o
wrapper `IMMUTABLE` resolve:

```sql
create or replace function public.norm(txt text)
returns text language sql immutable parallel safe strict as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, txt))
$$;
```

O planner normalmente faria *inline* dessa função, reexpondo o `unaccent`
`STABLE` — mas `inline_function` se recusa a fazer inline quando a função é
declarada `IMMUTABLE` e o corpo contém função mutável. O wrapper não é truque:
é o padrão documentado.

> **Armadilha da mesma família.** `array_to_string()` também é `STABLE` — sua
> assinatura é `anyarray` e ela invoca a função de saída do tipo do elemento.
> O Postgres não abre exceção para `text[]`. Uma coluna gerada que a use falha
> com `42P17: generation expression is not immutable`. Mesmo remédio.

Um cluster ordenado sai por `papel` e `peso`:

```sql
order by rd.dispositivo_id, (rd.papel = 'principal') desc, rd.peso desc
```

### 2. Lexical — full-text em português, insensível a acento

`'portuguese'` puro não casa "trafico" com "tráfico". A configuração
`public.pt_unaccent` aplica `unaccent` **antes** do stemmer:

```sql
create text search configuration public.pt_unaccent (copy = portuguese);
alter text search configuration public.pt_unaccent
  alter mapping for hword, hword_part, word
  with extensions.unaccent, portuguese_stem;
```

`dispositivos.busca` é `tsvector` gerado, com pesos: rubrica em `A`, texto em
`B`. Índice GIN. A consulta usa `websearch_to_tsquery`, que aceita a sintaxe que
o usuário já conhece de buscador (`"aspas"`, `-exclusão`, `or`).

### 3. Semântica — pgvector

`text-embedding-3-small`, 1536 dimensões, distância de **cosseno**, índice HNSW.

Cosseno e não L2 porque `texto_embed` varia muito de comprimento — caput longo
contra inciso de uma linha — e distância angular é mais estável nesse cenário.

**O que é embutido não é `texto`.** É `texto_embed`:

```
SEÇÃO I – Das Penas Privativas de Liberdade      ← seção, ou capítulo, ou título
Fixação da pena                                   ← rubrica do artigo
Art. 33. Importar, exportar, remeter, …           ← caput do artigo
§ 4º Nos delitos definidos no caput e no § 1º…    ← o dispositivo em si
```

Um `§ 4º Nos delitos definidos no caput...` isolado gera vetor inútil: o
dispositivo não se sustenta fora do contexto do artigo. O contexto usado é
sempre o **mais específico disponível** — a seção diz "Das Penas Privativas de
Liberdade" onde o capítulo só diz "Das Espécies de Pena".

`embed_hash` é `sha256(texto_embed)`. O seed só invalida o vetor quando o hash
muda, então `npm run embed` depois de um re-seed custa zero na maior parte das
vezes.

---

## Classificação de intenção

Por regras em TypeScript, **sem chamada de modelo** — precisa ser determinístico
e rápido, e roda antes da rede. `src/lib/busca/intencao.ts`.

| Molde | Sinal | Resposta |
|---|---|---|
| `dispositivo` | padrão `art\.?\s*\d+`, sigla de lei | texto legal direto |
| `tema` | match em rubrica com `tipo = 'tema'` | cluster ordenado por `papel`/`peso` |
| `processual` | sigla CPP, termos de rito | dispositivos processuais |
| `doutrina` | "doutrina", "segundo", nome de autor | ver restrição abaixo |

### Restrição de doutrina

Doutrina é obra autoral protegida. **Não hospedar, não indexar, não resumir de
forma substitutiva.** Para o molde `doutrina`, o sistema entrega entendimento
consolidado extraído de jurisprudência — acórdão não tem essa proteção — e link
para fonte legítima. `rubricas.explicacao` é texto autoral próprio, curto e
funcional; não é resumo de doutrina.

---

## O que sempre volta junto

A RPC devolve, em toda linha, `vigencia_ate`, `cobertura` e `cobertura_nota`.
Não é conveniência: é o que impede a UI exibir texto legal sem a data de corte
por esquecimento de quem escreveu o componente.

---

## Ferramenta de linha de comando

```bash
npm run busca -- "fixacao da pena"
npm run busca -- "trafico privilegiado" --lei lei_11343_2006
npm run busca -- "furto" --sem-vetor        # isola rubrica + lexical
```

Chama exatamente a mesma RPC que o app chama em runtime — só o transporte é
outro. Existe para afinar os pesos da fusão sem depender de front-end, e para
verificar que as três pernas estão de pé.

---

## Índices

| Índice | Tipo | Serve |
|---|---|---|
| `dispositivos_busca_idx` | GIN | perna lexical |
| `dispositivos_embedding_idx` | HNSW `vector_cosine_ops` | perna semântica |
| `rubricas_termo_norm_uq` | B-tree único | perna de rubrica, caminho quente |
| `rubricas_variantes_norm_idx` | GIN | variantes |
| `rubricas_termo_trgm_idx` | GIN trigram | "você quis dizer" — ainda não usado |
| `artigos_numero_idx` | B-tree | navegação, ordena `7-A` entre 7 e 8 |

Com ~1.900 dispositivos o custo de construção é irrelevante, então
[`0002_indices.sql`](../supabase/migrations/0002_indices.sql) pode rodar antes ou
depois do seed.
