// =============================================================================
// scripts/seed.ts — data/normalizado/  →  banco
//
//   npm run seed
//
// Uma transação só, upsert por id. Rodar duas vezes não duplica nada e não
// deixa resto: o que sumiu da fonte é apagado, então o banco converge para o
// arquivo em vez de acumular sedimento de execuções antigas. Foi o que os 4
// parágrafos fantasma removidos por emendas.yaml tornaram concreto.
//
// Não escreve embeddings — isso é `npm run embed`, que só reprocessa o que teve
// embed_hash alterado.
// =============================================================================

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { encerra, sql } from './db.ts'
import type { LeiNormalizada, LinhaRubricaOficial } from '../src/lib/tipos.ts'

const SAIDA = resolve(import.meta.dirname, '..', 'data/normalizado')
const LEIS = ['lei_11343_2006', 'dl_2848_1940', 'dl_3689_1941']

/** Postgres aceita 65535 parâmetros por statement; 300 linhas fica bem longe. */
const LOTE = 300

async function emLotes<T>(linhas: T[], fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < linhas.length; i += LOTE) await fn(linhas.slice(i, i + LOTE))
}

const docs: LeiNormalizada[] = []
for (const id of LEIS) {
  const f = resolve(SAIDA, `${id}.json`)
  if (!existsSync(f)) {
    console.warn(`· ${id}.json ausente — pulando`)
    continue
  }
  docs.push(JSON.parse(readFileSync(f, 'utf8')) as LeiNormalizada)
}
if (!docs.length) {
  console.error('nada em data/normalizado/. Rode `npm run normalize` primeiro.')
  process.exit(1)
}

try {
  await sql.begin(async (tx) => {
    // artigos_ordem_uq e dispositivos_ordem_uq são `deferrable initially
    // deferred`: sem transação explícita isso não vale nada, e reordenar
    // artigos num re-seed colidiria no meio do caminho.
    await tx`set constraints all deferred`

    for (const doc of docs) {
      const { lei, artigos, dispositivos } = doc

      await tx`
        insert into public.leis ${tx([lei],
          'id', 'nome', 'apelido', 'fonte', 'vigencia_ate',
          'cobertura', 'cobertura_nota', 'total_artigos', 'ordem')}
        on conflict (id) do update set
          nome           = excluded.nome,
          apelido        = excluded.apelido,
          fonte          = excluded.fonte,
          vigencia_ate   = excluded.vigencia_ate,
          cobertura      = excluded.cobertura,
          cobertura_nota = excluded.cobertura_nota,
          total_artigos  = excluded.total_artigos,
          ordem          = excluded.ordem
      `

      await emLotes(artigos, (lote) => tx`
        insert into public.artigos ${tx(lote,
          'id', 'lei_id', 'numero', 'numero_base', 'numero_sufixo', 'ordem',
          'titulo', 'capitulo', 'secao', 'rubrica', 'revogado', 'conferido_em')}
        on conflict (id) do update set
          lei_id        = excluded.lei_id,
          numero        = excluded.numero,
          numero_base   = excluded.numero_base,
          numero_sufixo = excluded.numero_sufixo,
          ordem         = excluded.ordem,
          titulo        = excluded.titulo,
          capitulo      = excluded.capitulo,
          secao         = excluded.secao,
          rubrica       = excluded.rubrica,
          revogado      = excluded.revogado,
          conferido_em  = excluded.conferido_em
      `)

      // Some da fonte → some do banco. O cascade leva os dispositivos junto.
      const artigosMortos = await tx`
        delete from public.artigos
        where lei_id = ${lei.id} and id <> all(${artigos.map((a) => a.id)})
        returning id
      `

      // pai_id é auto-referente. Os blocos já vêm em ordem de documento e o pai
      // é sempre anterior ao filho, então inserir na ordem do array basta —
      // inclusive entre lotes.
      await emLotes(dispositivos, (lote) => tx`
        insert into public.dispositivos ${tx(lote,
          'id', 'artigo_id', 'lei_id', 'tipo', 'numero', 'rotulo', 'pai_id',
          'ordem', 'texto', 'texto_bruto', 'rubrica', 'citacao', 'texto_embed',
          'embed_hash', 'revogado')}
        on conflict (id) do update set
          artigo_id   = excluded.artigo_id,
          lei_id      = excluded.lei_id,
          tipo        = excluded.tipo,
          numero      = excluded.numero,
          rotulo      = excluded.rotulo,
          pai_id      = excluded.pai_id,
          ordem       = excluded.ordem,
          texto       = excluded.texto,
          texto_bruto = excluded.texto_bruto,
          rubrica     = excluded.rubrica,
          citacao     = excluded.citacao,
          revogado    = excluded.revogado,
          texto_embed = excluded.texto_embed,
          embed_hash  = excluded.embed_hash,
          -- embedding só é invalidado quando o texto embutido muda; caso
          -- contrário o embed teria de refazer os 1.632 vetores a cada seed.
          embedding   = case
            when public.dispositivos.embed_hash = excluded.embed_hash
            then public.dispositivos.embedding
            else null
          end
      `)

      const mortos = await tx`
        delete from public.dispositivos
        where lei_id = ${lei.id} and id <> all(${dispositivos.map((d) => d.id)})
        returning id
      `

      console.log(
        `✓ ${lei.id.padEnd(16)} ${String(artigos.length).padStart(3)} artigos · ` +
          `${String(dispositivos.length).padStart(4)} dispositivos` +
          (artigosMortos.length || mortos.length
            ? `  (removidos: ${artigosMortos.length} artigos, ${mortos.length} dispositivos)`
            : ''),
      )
    }

    // --- rubricas oficiais ---------------------------------------------------
    //
    // Agrupadas fora do laço porque um mesmo termo pode vir de mais de uma lei:
    // uma linha em `rubricas`, N em `rubrica_dispositivos`.
    const porSlug = new Map<string, LinhaRubricaOficial>()
    for (const doc of docs) {
      for (const r of doc.rubricas) {
        const atual = porSlug.get(r.slug)
        if (atual) atual.dispositivos.push(...r.dispositivos)
        else porSlug.set(r.slug, { ...r, dispositivos: [...r.dispositivos] })
      }
    }
    const rubricas = [...porSlug.values()]

    await emLotes(rubricas, (lote) => tx`
      insert into public.rubricas ${tx(lote, 'termo', 'slug', 'tipo', 'origem')}
      on conflict (slug) do update set
        termo  = excluded.termo,
        tipo   = excluded.tipo,
        origem = excluded.origem
    `)

    // Curadoria (origem = 'curada') é do incremento 2 e não se toca aqui.
    const rubricasMortas = await tx`
      delete from public.rubricas
      where origem = 'oficial' and slug <> all(${rubricas.map((r) => r.slug)})
      returning id
    `

    const idPorSlug = new Map<string, number>(
      (await tx`select id, slug from public.rubricas where origem = 'oficial'`).map(
        (r) => [r.slug as string, Number(r.id)],
      ),
    )

    const vinculos = rubricas.flatMap((r) =>
      r.dispositivos.map((d) => ({
        rubrica_id: idPorSlug.get(r.slug)!,
        dispositivo_id: d,
        papel: 'principal',
        peso: 100,
      })),
    )

    await emLotes(vinculos, (lote) => tx`
      insert into public.rubrica_dispositivos ${tx(lote,
        'rubrica_id', 'dispositivo_id', 'papel', 'peso')}
      on conflict (rubrica_id, dispositivo_id) do update set
        papel = excluded.papel,
        peso  = excluded.peso
    `)

    console.log(
      `✓ rubricas         ${String(rubricas.length).padStart(3)} termos · ` +
        `${String(vinculos.length).padStart(4)} vínculos` +
        (rubricasMortas.length ? `  (removidas: ${rubricasMortas.length})` : ''),
    )
  })

  const saude = await sql`select public.saude() as s`
  console.log('\nsaude():')
  for (const [k, v] of Object.entries(saude[0]?.s as Record<string, unknown>)) {
    console.log(`  ${k.padEnd(14)} ${v}`)
  }
  console.log('\npróximo: npm run embed')
  await encerra()
} catch (e) {
  await encerra(e)
}
