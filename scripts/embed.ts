// =============================================================================
// scripts/embed.ts — vetores de dispositivos.texto_embed
//
//   npm run embed            # só o que está sem vetor
//   npm run embed -- --tudo  # refaz todos (troca de modelo, por exemplo)
//
// O seed zera `embedding` apenas quando `embed_hash` muda, então rodar isto
// depois de um re-seed custa zero na maior parte das vezes.
//
// O que é embutido é `texto_embed`, não `texto`: um "§ 4º Nos delitos definidos
// no caput..." isolado gera vetor inútil. Ver CLAUDE.md.
// =============================================================================

import OpenAI from 'openai'

import { encerra, sql } from './db.ts'

const MODELO = 'text-embedding-3-small' // 1536 dims, igual à coluna
const LOTE = 96
const TUDO = process.argv.includes('--tudo')

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente em .env.local.')
  process.exit(1)
}
const openai = new OpenAI()

type Pendente = { id: string; texto_embed: string }

try {
  const pendentes = (await sql<Pendente[]>`
    select id, texto_embed
    from public.dispositivos
    ${TUDO ? sql`` : sql`where embedding is null`}
    order by lei_id, artigo_id, ordem
  `) as unknown as Pendente[]

  if (!pendentes.length) {
    console.log('nada a fazer — todo dispositivo já tem vetor.')
    await encerra()
  }

  const tokensAprox = Math.round(
    pendentes.reduce((s, p) => s + p.texto_embed.length, 0) / 4,
  )
  console.log(
    `${pendentes.length} dispositivos · ~${(tokensAprox / 1000).toFixed(0)}k tokens · ` +
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
      update public.dispositivos d
      set embedding = x.emb::extensions.vector
      from unnest(${lote.map((p) => p.id)}::text[], ${vetores}::text[]) as x(id, emb)
      where d.id = x.id
    `

    feitos += lote.length
    process.stdout.write(`\r  ${feitos}/${pendentes.length}`)
  }

  const [{ s }] = (await sql`select public.saude() as s`) as unknown as [
    { s: Record<string, unknown> },
  ]
  console.log(`\n\ncom_embedding: ${s.com_embedding} de ${s.dispositivos}`)
  await encerra()
} catch (e) {
  await encerra(e)
}
