// =============================================================================
// scripts/busca.ts — a RPC de busca pela linha de comando
//
//   npm run busca -- "fixação da pena"
//   npm run busca -- "reduzir pena de traficante primário" --lei lei_11343_2006
//   npm run busca -- "furto" --sem-vetor      # degrada para rubrica + lexical
//
// Existe para afinar os pesos da fusão RRF sem precisar de front-end, e para
// provar que rubrica, lexical e semântica estão os três de pé. É a mesma função
// que o app chama em runtime — aqui só o transporte é outro.
// =============================================================================

import OpenAI from 'openai'

import { encerra, sql } from './db.ts'

const argv = process.argv.slice(2)
const consulta = argv.filter((a) => !a.startsWith('--'))[0]
const semVetor = argv.includes('--sem-vetor')
const lei = argv[argv.indexOf('--lei') + 1]?.startsWith('--')
  ? null
  : (argv.includes('--lei') ? argv[argv.indexOf('--lei') + 1] : null) ?? null

if (!consulta) {
  console.error('uso: npm run busca -- "sua consulta" [--lei <id>] [--sem-vetor]')
  process.exit(1)
}

/**
 * `date` do Postgres não tem fuso, mas o driver devolve Date à meia-noite UTC —
 * e aí toLocaleDateString('pt-BR') puxa para UTC−3 e imprime 27/02 no lugar de
 * 28/02. Numa data de corte de redação legal isso não é detalhe cosmético.
 */
const dataBR = (d: unknown) => {
  const t = d instanceof Date ? d : new Date(String(d))
  return [t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear()]
    .map((n, i) => (i < 2 ? String(n).padStart(2, '0') : n))
    .join('/')
}

try {
  let vetor: string | null = null
  if (!semVetor) {
    const r = await new OpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: consulta,
    })
    vetor = JSON.stringify(r.data[0]!.embedding)
  }

  const linhas = await sql`
    select * from public.busca_hibrida(
      ${consulta},
      ${vetor}::extensions.vector,
      10,
      ${lei}
    )
  `

  console.log(`\n"${consulta}"${lei ? `  [${lei}]` : ''}${semVetor ? '  [sem vetor]' : ''}`)
  console.log('─'.repeat(78))

  if (!linhas.length) console.log('(nada)')
  for (const [i, d] of linhas.entries()) {
    const via = d.via_rubrica ? ` ◆ rubrica "${d.rubrica_termo}" (${d.papel})` : ''
    console.log(
      `\n${String(i + 1).padStart(2)}. ${d.citacao}${d.revogado ? '  [REVOGADO]' : ''}` +
        `\n    score ${Number(d.score).toFixed(5)}${via}` +
        `\n    ${d.artigo_rubrica ? `${d.artigo_rubrica} · ` : ''}${d.capitulo ?? ''}` +
        `\n    ${String(d.texto).slice(0, 150).replace(/\s+/g, ' ')}…` +
        `\n    ${d.lei_apelido} · vigente em ${dataBR(d.vigencia_ate)}` +
        (d.cobertura === 'parcial' ? `  ⚠ cobertura parcial` : ''),
    )
  }
  console.log()
  await encerra()
} catch (e) {
  await encerra(e)
}
