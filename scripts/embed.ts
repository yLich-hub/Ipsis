// =============================================================================
// scripts/embed.ts — vetores de dispositivos.texto_embed
//
//   npm run embed                 # só o que está sem vetor
//   npm run embed -- --tudo       # refaz todos (troca de modelo, por exemplo)
//   npm run embed -- --decretos   # o acervo de decretos do Paraná
//
// O seed zera `embedding` apenas quando o hash do texto embutido muda, então
// rodar isto depois de um re-seed custa zero na maior parte das vezes.
//
// O que é embutido é `texto_embed`, não `texto`: um "§ 4º Nos delitos definidos
// no caput..." isolado gera vetor inútil. Ver CLAUDE.md.
//
// **As duas tabelas passam pelo mesmo lote, e é decisão.** `dispositivos` e
// `decretos_pr_blocos` são corpora separados — a segunda não é citável em peça
// e nem entra em `busca_hibrida` —, mas o trabalho aqui é idêntico: ler
// `texto_embed`, chamar a OpenAI em lotes de 96, gravar o vetor. Um segundo
// script seria a mesma sequência de retry e de lote escrita duas vezes, para
// divergir na primeira correção. O que muda é uma linha: qual tabela.
// =============================================================================

import OpenAI from 'openai'

import { encerra, sql } from './db.ts'

const MODELO = 'text-embedding-3-small' // 1536 dims, igual à coluna
const LOTE = 96
const TUDO = process.argv.includes('--tudo')
const DECRETOS = process.argv.includes('--decretos')

/** A tabela e a ordem de leitura. É tudo o que difere entre os dois corpora. */
const ALVO = DECRETOS
  ? { tabela: sql`public.decretos_pr_blocos`, ordem: sql`decreto_id, ordem`, nome: 'blocos de decreto' }
  : { tabela: sql`public.dispositivos`, ordem: sql`lei_id, artigo_id, ordem`, nome: 'dispositivos' }

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente em .env.local.')
  process.exit(1)
}
const openai = new OpenAI()

type Pendente = { id: string; texto_embed: string }

try {
  const pendentes = (await sql<Pendente[]>`
    select id, texto_embed
    from ${ALVO.tabela}
    ${TUDO ? sql`where texto_embed is not null` : sql`where embedding is null and texto_embed is not null`}
    order by ${ALVO.ordem}
  `) as unknown as Pendente[]

  if (!pendentes.length) {
    console.log(`nada a fazer — todo registro de ${ALVO.nome} já tem vetor.`)
    await encerra()
  }

  const tokensAprox = Math.round(
    pendentes.reduce((s, p) => s + p.texto_embed.length, 0) / 4,
  )
  console.log(
    `${pendentes.length} ${ALVO.nome} · ~${(tokensAprox / 1000).toFixed(0)}k tokens · ` +
      `~US$ ${((tokensAprox / 1_000_000) * 0.02).toFixed(4)} em ${MODELO}`,
  )

  let feitos = 0
  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE)

    // Uma falha de rede no meio de 17 lotes não pode obrigar a refazer tudo:
    // cada lote é gravado antes do próximo começar.
    let resposta
    for (let tentativa = 1; ; tentativa++) {
      try {
        resposta = await openai.embeddings.create({
          model: MODELO,
          input: lote.map((p) => p.texto_embed),
        })
        break
      } catch (e) {
        if (tentativa >= 4) throw e
        const espera = 2 ** tentativa * 1000
        console.warn(`  · lote ${i / LOTE + 1} falhou (${tentativa}/3), ${espera}ms…`)
        await new Promise((r) => setTimeout(r, espera))
      }
    }

    const vetores = resposta.data
      .sort((a, b) => a.index - b.index)
      .map((d) => JSON.stringify(d.embedding))

    await sql`
      update ${ALVO.tabela} d
      set embedding = x.emb::extensions.vector
      from unnest(${lote.map((p) => p.id)}::text[], ${vetores}::text[]) as x(id, emb)
      where d.id = x.id
    `

    feitos += lote.length
    process.stdout.write(`\r  ${feitos}/${pendentes.length}`)
  }

  // A conferência final tem de olhar a MESMA tabela que acabou de ser escrita.
  // A primeira versão desta linha chamava `public.saude()` nos dois casos, e
  // `saude()` só sabe contar `dispositivos`: a execução que embutiu 9.833
  // blocos de decreto terminou anunciando "com_embedding: 3771 de 3771". Os
  // vetores estavam certos, e o relatório falava de outro corpus — que é o
  // tipo de defeito que este projeto trata como grave, porque a frase é
  // verdadeira e responde à pergunta errada.
  if (DECRETOS) {
    const [c] = (await sql`
      select count(*) filter (where embedding is not null) as com, count(*) as total
      from public.decretos_pr_blocos
    `) as unknown as [{ com: string; total: string }]
    console.log(`\n\ncom_embedding: ${c.com} de ${c.total} blocos de decreto`)
  } else {
    const [{ s }] = (await sql`select public.saude() as s`) as unknown as [
      { s: Record<string, unknown> },
    ]
    console.log(`\n\ncom_embedding: ${s.com_embedding} de ${s.dispositivos} dispositivos`)
  }
  await encerra()
} catch (e) {
  await encerra(e)
}
