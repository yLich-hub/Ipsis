// =============================================================================
// scripts/decretos.ts — a RPC do acervo estadual pela linha de comando
//
//   npm run decretos -- "conselho estadual de políticas sobre drogas"
//   npm run decretos -- "regulamento do ICMS" --ano 2025
//   npm run decretos -- "sistema penitenciário" --sem-vetor
//
// Mesmo papel de `scripts/busca.ts` para o corpus: provar que as três pernas de
// `busca_decretos` estão de pé e afinar os pesos sem precisar de front-end.
//
// **Nenhum teste offline pega uma regressão na fusão**, e não há como: ela mora
// no SQL da migration 0018 e só aparece contra o banco. É a mesma situação de
// `busca_hibrida`, e a mesma resposta — um comando que imprime score e perna
// lado a lado, para a conferência ser possível.
// =============================================================================

import OpenAI from 'openai'

import { encerra, sql } from './db.ts'

const argv = process.argv.slice(2)
const consulta = argv.filter((a) => !a.startsWith('--') && !/^\d{4}$/.test(a))[0]
const semVetor = argv.includes('--sem-vetor')
const ano = argv.includes('--ano') ? Number(argv[argv.indexOf('--ano') + 1]) : null

if (!consulta) {
  console.error('uso: npm run decretos -- "sua consulta" [--ano 2025] [--sem-vetor]')
  process.exit(1)
}

const dataBR = (d: unknown) => {
  const t = d instanceof Date ? d : new Date(String(d))
  return [t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear()]
    .map((n, i) => (i < 2 ? String(n).padStart(2, '0') : n))
    .join('/')
}

type Achado = {
  bloco_id: string
  numero: string
  ano: number
  sumula: string
  publicado_em: unknown
  conferido_em: unknown
  rotulo: string
  texto: string
  score: string
  via_sumula: boolean
}

try {
  let vetor: string | null = null
  if (!semVetor && process.env.OPENAI_API_KEY) {
    const r = await new OpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: consulta,
    })
    vetor = JSON.stringify(r.data[0]?.embedding ?? [])
  }

  const t0 = Date.now()
  const itens = (await sql<Achado[]>`
    select * from public.busca_decretos(
      ${consulta}, ${vetor}::extensions.vector, 10, ${ano}
    )
  `) as unknown as Achado[]
  const ms = Date.now() - t0

  console.log(
    `\n"${consulta}"${ano ? ` · ano ${ano}` : ''} · ${itens.length} resultado(s) · ${ms}ms` +
      `${vetor ? '' : ' · SEM a perna semântica'}\n`,
  )

  for (const [i, a] of itens.entries()) {
    console.log(
      `${String(i + 1).padStart(2)}. Decreto ${a.numero}/${a.ano}` +
        `${a.rotulo ? `, ${a.rotulo}` : ''}` +
        `   score ${Number(a.score).toFixed(6)}${a.via_sumula ? ' · via súmula' : ''}`,
    )
    console.log(`    ${a.sumula.slice(0, 96)}`)
    console.log(`    ${a.texto.replace(/\s+/g, ' ').slice(0, 96)}`)
    console.log(
      `    publicado ${dataBR(a.publicado_em)} · lido em ${dataBR(a.conferido_em)}\n`,
    )
  }

  if (itens.length === 0) {
    console.log('  (nada. O acervo está semeado? npm run seed-decretos)')
  }

  await encerra()
} catch (e) {
  await encerra(e)
}
