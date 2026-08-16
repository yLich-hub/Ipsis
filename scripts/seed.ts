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

import { parse as parseYaml } from 'yaml'

import { encerra, sql } from './db.ts'
import type {
  CasoCurado,
  LeiNormalizada,
  LinhaRubricaOficial,
  RubricaCurada,
  TeseCurada,
} from '../src/lib/tipos.ts'

const SAIDA = resolve(import.meta.dirname, '..', 'data/normalizado')
const CURADORIA = resolve(import.meta.dirname, '..', 'data/curadoria')
const LEIS = ['lei_11343_2006', 'dl_2848_1940', 'dl_3689_1941']

/** Postgres aceita 65535 parâmetros por statement; 300 linhas fica bem longe. */
const LOTE = 300

async function emLotes<T>(linhas: T[], fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < linhas.length; i += LOTE) await fn(linhas.slice(i, i + LOTE))
}

/**
 * Rubricas curadas. Devolve `null` quando o arquivo não existe — que é diferente
 * de uma lista vazia: arquivo ausente faz o seed pular a curadoria inteira,
 * lista vazia faz a curadoria convergir para "nenhuma". Sem essa distinção, um
 * arquivo perdido apagaria a camada em silêncio.
 */
function leCuradoria<T>(nome: string): T[] | null {
  const f = resolve(CURADORIA, nome)
  if (!existsSync(f)) return null
  return (parseYaml(readFileSync(f, 'utf8')) ?? []) as T[]
}

const leRubricasCuradas = () => leCuradoria<RubricaCurada>('rubricas.yaml')

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
          'titulo', 'capitulo', 'secao', 'rubrica', 'revogado', 'conferido_em',
          'alterado_por', 'fonte_redacao')}
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
          conferido_em  = excluded.conferido_em,
          alterado_por  = excluded.alterado_por,
          fonte_redacao = excluded.fonte_redacao
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
      `✓ rubricas oficiais ${String(rubricas.length).padStart(3)} termos · ` +
        `${String(vinculos.length).padStart(4)} vínculos` +
        (rubricasMortas.length ? `  (removidas: ${rubricasMortas.length})` : ''),
    )

    // --- rubricas curadas ----------------------------------------------------
    //
    // A camada que o CLAUDE.md chama de coração da busca. As oficiais acima
    // vêm da margem impressa do Vade Mecum e cobrem o Código Penal; a Lei de
    // Drogas não tem nenhuma, porque o Vade Mecum não imprime rubrica nela.
    // Sem este bloco, "tráfico privilegiado" devolve o art. 332 do CP.
    const curadas = leRubricasCuradas()

    if (curadas === null) {
      console.warn('· data/curadoria/rubricas.yaml ausente — curadoria não tocada')
    } else {
      // Três travas antes de escrever. Todas abortam a transação inteira: uma
      // rubrica curada errada aponta peça para o dispositivo errado, e isso não
      // pode passar em silêncio.
      const repetidos = curadas
        .map((r) => r.slug)
        .filter((s, i, todos) => todos.indexOf(s) !== i)
      if (repetidos.length) {
        throw new Error(`rubricas.yaml: slug repetido — ${[...new Set(repetidos)].join(', ')}`)
      }

      // `rubricas.slug` é único e o upsert por slug sobrescreve `origem`: uma
      // curada com slug de oficial converteria a oficial em curada, e o delete
      // de oficiais órfãs da próxima execução a apagaria.
      const slugsOficiais = new Set(rubricas.map((r) => r.slug))
      const colididos = curadas.filter((r) => slugsOficiais.has(r.slug))
      if (colididos.length) {
        throw new Error(
          `rubricas.yaml: slug já usado por rubrica oficial — ${colididos.map((r) => r.slug).join(', ')}`,
        )
      }

      // O FK pegaria isso, mas com mensagem que não diz qual linha do YAML está
      // errada. Aqui a mensagem nomeia os ids.
      const alvos = [...new Set(curadas.flatMap((r) => r.dispositivos.map((d) => d.id)))]
      const existentes = new Set(
        (await tx`select id from public.dispositivos where id = any(${alvos})`).map(
          (r) => r.id as string,
        ),
      )
      const ausentes = alvos.filter((id) => !existentes.has(id))
      if (ausentes.length) {
        throw new Error(
          `rubricas.yaml aponta para ${ausentes.length} dispositivo(s) que não existem no banco:\n  ` +
            ausentes.join('\n  '),
        )
      }

      await emLotes(
        curadas.map((r) => ({
          termo: r.termo,
          slug: r.slug,
          tipo: r.tipo,
          origem: 'curada',
          variantes: r.variantes ?? [],
          explicacao: r.explicacao ?? null,
        })),
        (lote) => tx`
          insert into public.rubricas ${tx(lote,
            'termo', 'slug', 'tipo', 'origem', 'variantes', 'explicacao')}
          on conflict (slug) do update set
            termo      = excluded.termo,
            tipo       = excluded.tipo,
            origem     = excluded.origem,
            variantes  = excluded.variantes,
            explicacao = excluded.explicacao
        `,
      )

      const curadasMortas = await tx`
        delete from public.rubricas
        where origem = 'curada' and slug <> all(${curadas.map((r) => r.slug)})
        returning id
      `

      const idPorSlugCurada = new Map<string, number>(
        (await tx`select id, slug from public.rubricas where origem = 'curada'`).map(
          (r) => [r.slug as string, Number(r.id)],
        ),
      )

      // Apagar e reinserir, em vez de só fazer upsert: o upsert deixaria para
      // trás o vínculo de um dispositivo removido do YAML, e a rubrica passaria
      // a apontar para um cluster que a curadoria já não descreve. São poucas
      // dezenas de linhas dentro da transação — o custo é irrelevante e a
      // convergência para o arquivo fica garantida.
      await tx`
        delete from public.rubrica_dispositivos
        where rubrica_id in (select id from public.rubricas where origem = 'curada')
      `

      const vinculosCurados = curadas.flatMap((r) =>
        r.dispositivos.map((d) => ({
          rubrica_id: idPorSlugCurada.get(r.slug)!,
          dispositivo_id: d.id,
          papel: d.papel ?? 'principal',
          peso: d.peso ?? 100,
          nota: d.nota ?? null,
        })),
      )

      await emLotes(vinculosCurados, (lote) => tx`
        insert into public.rubrica_dispositivos ${tx(lote,
          'rubrica_id', 'dispositivo_id', 'papel', 'peso', 'nota')}
      `)

      const variantes = curadas.reduce((n, r) => n + (r.variantes?.length ?? 0), 0)
      console.log(
        `✓ rubricas curadas  ${String(curadas.length).padStart(3)} termos · ` +
          `${String(vinculosCurados.length).padStart(4)} vínculos · ` +
          `${variantes} variantes` +
          (curadasMortas.length ? `  (removidas: ${curadasMortas.length})` : ''),
      )
    }

    // --- teses e casos -------------------------------------------------------
    //
    // Os triggers `teses_valida_fundamentos`, `teses_valida_template` e
    // `casos_valida_imputacao` recusam id de dispositivo inexistente na própria
    // escrita. `tests/citacao.test.ts` faz a mesma conferência antes do build,
    // contra data/normalizado/ — as duas camadas existem porque a primeira roda
    // sem rede e a segunda protege quem escrever direto no banco.
    const teses = leCuradoria<TeseCurada>('teses.yaml')

    if (teses === null) {
      console.warn('· data/curadoria/teses.yaml ausente — teses não tocadas')
    } else {
      await emLotes(
        teses.map((t) => ({
          id: t.id,
          nome: t.nome,
          resumo: t.resumo,
          // `tx.json()` e não JSON.stringify: `db.ts` abre a conexão com
          // `prepare: false` (exigência do pooler em modo transaction), então
          // não há descrição do statement para o driver inferir o tipo da
          // coluna. Uma string crua entra como escalar jsonb — o valor vira a
          // string "{...}" em vez do objeto, e `teses.gatilho` para de casar
          // com `casos.fatos` no checklist.
          gatilho: tx.json(t.gatilho ?? {}),
          fundamentos: t.fundamentos,
          jurisprudencia: tx.json(t.jurisprudencia ?? []),
          template_md: t.template_md,
          ordem: t.ordem,
          ativo: t.ativo ?? true,
        })),
        (lote) => tx`
          insert into public.teses ${tx(lote,
            'id', 'nome', 'resumo', 'gatilho', 'fundamentos', 'jurisprudencia',
            'template_md', 'ordem', 'ativo')}
          on conflict (id) do update set
            nome           = excluded.nome,
            resumo         = excluded.resumo,
            gatilho        = excluded.gatilho,
            fundamentos    = excluded.fundamentos,
            jurisprudencia = excluded.jurisprudencia,
            template_md    = excluded.template_md,
            ordem          = excluded.ordem,
            ativo          = excluded.ativo
        `,
      )

      const tesesMortas = await tx`
        delete from public.teses where id <> all(${teses.map((t) => t.id)})
        returning id
      `

      const comJuris = teses.filter((t) => (t.jurisprudencia ?? []).length).length
      console.log(
        `✓ teses             ${String(teses.length).padStart(3)} teses · ` +
          `${comJuris} com jurisprudência` +
          (tesesMortas.length ? `  (removidas: ${tesesMortas.length})` : ''),
      )
    }

    const casos = leCuradoria<CasoCurado>('casos.yaml')

    if (casos === null) {
      console.warn('· data/curadoria/casos.yaml ausente — casos não tocados')
    } else {
      await emLotes(
        casos.map((c) => ({
          id: c.id,
          titulo: c.titulo,
          fatos: tx.json(c.fatos ?? {}),
          narrativa: c.narrativa,
          imputacao: c.imputacao,
          ordem: c.ordem,
        })),
        (lote) => tx`
          insert into public.casos ${tx(lote,
            'id', 'titulo', 'fatos', 'narrativa', 'imputacao', 'ordem')}
          on conflict (id) do update set
            titulo    = excluded.titulo,
            fatos     = excluded.fatos,
            narrativa = excluded.narrativa,
            imputacao = excluded.imputacao,
            ordem     = excluded.ordem
        `,
      )

      const casosMortos = await tx`
        delete from public.casos where id <> all(${casos.map((c) => c.id)})
        returning id
      `

      console.log(
        `✓ casos             ${String(casos.length).padStart(3)} casos` +
          (casosMortos.length ? `  (removidos: ${casosMortos.length})` : ''),
      )
    }
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
