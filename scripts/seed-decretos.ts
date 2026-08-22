// =============================================================================
// scripts/seed-decretos.ts — o acervo de decretos do Paraná vai para o banco
//
//   npm run seed-decretos            # todos os anos em data/decretos_pr/
//   npm run seed-decretos -- --ano 2025
//
// Lê o que `coletores/parana.py` colheu e versionou em `data/decretos_pr/`.
// Idempotente por upsert de id, como `seed.ts`: rodar duas vezes não duplica.
//
// **Ano incompleto não é semeado.** O coletor grava `completo: false` quando
// alguma listagem de mês falhou, e a razão está no docstring de `colhe`: a
// fonte bloqueia por volume, e a primeira versão do coletor engoliu o bloqueio
// e gravou dois anos inteiros dizendo "nenhum decreto normativo". Semear isso
// poria no banco uma afirmação que ninguém fez — e, pior, uma que a tela
// repetiria com cara de dado.
//
// **Nada aqui toca `dispositivos`, `artigos` ou `leis`.** É a mesma regra da
// vigília, e a mesma do acervo Vade Mecum: decreto estadual não é corpus
// citável. Ver o cabeçalho de `supabase/migrations/0018_decretos_pr.sql`.
// =============================================================================

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { encerra, sql } from './db.ts'

const ACERVO = resolve(import.meta.dirname, '..', 'data', 'decretos_pr')

type Bloco = { id: string; ordem: number; rotulo: string; texto: string }
type Decreto = {
  id: string
  numero: string
  ano: number
  epigrafe: string
  sumula: string
  preambulo: string
  publicado_em: string
  diario: string | null
  cod_ato: string
  url: string
  versao: string
  conferido_em: string
  blocos: Bloco[]
}
type Arquivo = {
  ano: number
  colhido_em: string
  vistos: number
  no_recorte: number
  completo?: boolean
  decretos: Decreto[]
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * O que vai para o vetor.
 *
 * Epígrafe e súmula entram em TODO bloco, e não é redundância: um `§ 2º Para os
 * fins deste Decreto, considera-se…` isolado gera vetor inútil, porque não diz
 * de que decreto é nem sobre o que ele dispõe. É exatamente o argumento de
 * `dispositivos.texto_embed`, que carrega capítulo e caput do artigo pela mesma
 * razão.
 */
/**
 * Teto do que se manda embutir, em caracteres.
 *
 * **Imposto pela fonte, não escolhido.** `text-embedding-3-small` recusa
 * entrada acima de 8.192 tokens, e a primeira execução real morreu com
 * `400 Invalid 'input[4]': maximum input length is 8192 tokens` — algo que
 * nenhum dispositivo do corpus federal tinha provocado em 3.771 vetores.
 *
 * O que provoca é o Regulamento do ICMS: um `Art. 1º` que internaliza dezenas
 * de Convênios ICMS de uma vez chega a **27.838 caracteres** num bloco só. São
 * 8 blocos acima de 8.000 caracteres em 15.025 — 0,05% do acervo.
 *
 * 8.000 dá folga contra o pior caso do português acentuado (~3 caracteres por
 * token), em que 8.192 tokens já seriam alcançados por volta de 24 mil
 * caracteres.
 *
 * **O corte é só do que vai para o VETOR.** `texto` continua inteiro no banco e
 * inteiro na tela — o que se perde é alcance semântico do fim de um artigo
 * gigante, não texto legal. Truncar o texto exibido seria a decisão nº 1 do
 * projeto quebrada; truncar a entrada do embedding é o custo de o artigo ser
 * grande demais para o modelo.
 */
const TETO_EMBED = 8_000

const paraEmbed = (d: Decreto, b: Bloco) => {
  const inteiro = [`${d.epigrafe}.`, d.sumula, [b.rotulo, b.texto].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join('\n')
  return inteiro.length <= TETO_EMBED ? inteiro : `${inteiro.slice(0, TETO_EMBED)}…`
}

const alvo = (() => {
  const i = process.argv.indexOf('--ano')
  return i > 0 ? Number(process.argv[i + 1]) : null
})()

try {
  const arquivos = readdirSync(ACERVO)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .filter((f) => alvo === null || f === `${alvo}.json`)
    .sort()

  if (!arquivos.length) {
    throw new Error(
      `nenhum arquivo de acervo em ${ACERVO}.\n` +
        'Rode antes: .venv/Scripts/python -m coletores.parana --pular-prontos',
    )
  }

  let totalAtos = 0
  let totalBlocos = 0
  const pulados: string[] = []

  for (const nome of arquivos) {
    const a = JSON.parse(readFileSync(resolve(ACERVO, nome), 'utf8')) as Arquivo

    if (a.completo !== true) {
      pulados.push(`${a.ano} (colheita incompleta)`)
      continue
    }
    if (!a.decretos.length) {
      pulados.push(`${a.ano} (nenhum decreto no recorte)`)
      continue
    }

    const blocos = a.decretos.flatMap((d) =>
      d.blocos.map((b) => {
        const texto_embed = paraEmbed(d, b)
        return {
          id: b.id,
          decreto_id: d.id,
          ordem: b.ordem,
          rotulo: b.rotulo,
          texto: b.texto,
          texto_embed,
          texto_hash: sha256(texto_embed),
        }
      }),
    )

    await sql.begin(async (tx) => {
      await tx`
        insert into public.decretos_pr ${tx(
          a.decretos.map((d) => ({
            id: d.id,
            numero: d.numero,
            ano: d.ano,
            epigrafe: d.epigrafe,
            sumula: d.sumula,
            preambulo: d.preambulo,
            publicado_em: d.publicado_em,
            diario: d.diario,
            cod_ato: d.cod_ato,
            url: d.url,
            versao: d.versao,
            conferido_em: d.conferido_em,
          })),
          'id', 'numero', 'ano', 'epigrafe', 'sumula', 'preambulo',
          'publicado_em', 'diario', 'cod_ato', 'url', 'versao', 'conferido_em',
        )}
        on conflict (id) do update set
          numero       = excluded.numero,
          ano          = excluded.ano,
          epigrafe     = excluded.epigrafe,
          sumula       = excluded.sumula,
          preambulo    = excluded.preambulo,
          publicado_em = excluded.publicado_em,
          diario       = excluded.diario,
          cod_ato      = excluded.cod_ato,
          url          = excluded.url,
          versao       = excluded.versao,
          conferido_em = excluded.conferido_em
      `

      for (let i = 0; i < blocos.length; i += 500) {
        await tx`
          insert into public.decretos_pr_blocos ${tx(
            blocos.slice(i, i + 500),
            'id', 'decreto_id', 'ordem', 'rotulo', 'texto', 'texto_embed', 'texto_hash',
          )}
          on conflict (id) do update set
            decreto_id  = excluded.decreto_id,
            ordem       = excluded.ordem,
            rotulo      = excluded.rotulo,
            texto       = excluded.texto,
            texto_embed = excluded.texto_embed,
            texto_hash  = excluded.texto_hash,
            -- Mesma regra da tabela dispositivos: o vetor só é invalidado
            -- quando o texto embutido muda. Sem isto, um re-seed obrigaria a
            -- refazer todos os embeddings do acervo.
            embedding   = case
              when public.decretos_pr_blocos.texto_hash = excluded.texto_hash
              then public.decretos_pr_blocos.embedding
              else null
            end
        `
      }

      // Decreto que saiu do recorte sai do banco. O cascade leva os blocos.
      const mortos = await tx`
        delete from public.decretos_pr
        where ano = ${a.ano} and id <> all(${a.decretos.map((d) => d.id)})
        returning id
      `
      if (mortos.length) console.log(`  ${a.ano}: ${mortos.length} removido(s) do recorte`)
    })

    totalAtos += a.decretos.length
    totalBlocos += blocos.length
    console.log(`  ${a.ano}: ${a.decretos.length} decretos, ${blocos.length} blocos`)
  }

  if (pulados.length) {
    console.log(`\nnão semeados: ${pulados.join(', ')}`)
  }

  const [contagem] = (await sql`
    select
      (select count(*) from public.decretos_pr)                                as atos,
      (select count(*) from public.decretos_pr_blocos)                         as blocos,
      (select count(*) from public.decretos_pr_blocos where embedding is null) as sem_vetor
  `) as unknown as [{ atos: string; blocos: string; sem_vetor: string }]

  console.log(
    `\ntotal no banco: ${contagem.atos} decretos, ${contagem.blocos} blocos ` +
      `(${contagem.sem_vetor} sem vetor)`,
  )
  if (Number(contagem.sem_vetor) > 0) {
    console.log('próximo passo: npm run embed -- --decretos')
  }
  console.log(`semeados nesta execução: ${totalAtos} decretos, ${totalBlocos} blocos`)

  await encerra()
} catch (e) {
  await encerra(e)
}
