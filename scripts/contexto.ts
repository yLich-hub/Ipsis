// =============================================================================
// scripts/contexto.ts — o que o modelo recebe, pergunta a pergunta
//
//   npm run contexto -- "o que é tráfico privilegiado" "e se ele for reincidente?"
//   npm run contexto -- "..." "..." --cru        # despeja o bloco literal
//   npm run contexto -- "..." --qtd 12 --lei dl_2848_1940
//
// Existe pelo mesmo motivo de `scripts/busca.ts`: afinar sem front-end e provar
// que as peças estão de pé. Só que uma camada acima — a busca já tinha CLI, o
// CONTEXTO não tinha, e é ele que decide o que a resposta pode dizer.
//
// Foi escrito para conferir o fio da conversa (`lib/consulta/fio.ts`), que é
// invisível em teste offline: a herança de id só se manifesta contra o banco.
// As perguntas são encadeadas na ordem em que vêm, como uma conversa de verdade.
//
// **Não chama modelo nenhum e não gasta.** Roda a busca, o piso de fusão, a
// herança e a montagem — tudo que decide o contexto — e para antes da geração.
// O único custo é o embedding da consulta, que é o mesmo do runtime.
//
// **A herança daqui é aproximada, e a aproximação está declarada.** No produto,
// o fio herda os ids que a RESPOSTA citou (`comp.fontes`), e saber quais são
// exigiria chamar o modelo. Aqui se herda o topo do contexto, que é de onde as
// fontes citadas saem na prática. Serve para ver o mecanismo funcionando; não
// substitui abrir a Consulta.
// =============================================================================

import { config } from 'dotenv'
import type { Troca } from '../src/lib/consulta/fio.ts'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '..', '.env.local'), quiet: true })

const args = process.argv.slice(2)
const perguntas = args.filter((a) => !a.startsWith('--'))
const cru = args.includes('--cru')

const valorDe = (bandeira: string): string | null => {
  const i = args.indexOf(bandeira)
  if (i === -1) return null
  const v = args[i + 1]
  return v && !v.startsWith('--') ? v : null
}

const qtd = Number(valorDe('--qtd') ?? 8)
const lei = valorDe('--lei')

if (perguntas.length === 0) {
  console.error('uso: npm run contexto -- "primeira pergunta" ["seguinte" ...] [--cru] [--qtd N] [--lei <id>]')
  process.exit(1)
}

// Depois do dotenv: `lib/supabase.ts` lança no import quando falta variável.
const { consultar, lerDispositivos } = await import('../src/lib/busca/consultar.ts')
const { filtraContexto, montarContexto } = await import('../src/lib/consulta/aovivo.ts')
const { idsHerdados, montarFio, saneiaFio } = await import('../src/lib/consulta/fio.ts')
const { precedentesPara } = await import('../src/lib/vigilia/precedentes.ts')
const { soArtigo } = await import('../src/lib/vigilia/alvos.ts')

/** Quantas fontes uma resposta exibe, e portanto quantos ids o fio leva adiante. */
const FONTES_POR_RESPOSTA = 4

const curto = (t: string, n = 62) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

let fio: Troca[] = []

for (const [i, q] of perguntas.entries()) {
  console.log('')
  console.log('═'.repeat(78))
  console.log(`  TROCA ${i + 1}  ·  ${q}`)
  console.log('═'.repeat(78))

  const busca = await consultar({ q, lei, qtd })
  if (busca.erro) {
    console.error(`· a busca falhou: ${busca.erro}`)
    process.exit(1)
  }

  const { itens, fraco } = filtraContexto(busca.itens, busca.direta)
  const herdados = await lerDispositivos(idsHerdados(fio, itens.map((x) => x.dispositivo_id)))
  const precedentes = await precedentesPara([
    ...new Set([...itens, ...herdados].map((x) => soArtigo(x.dispositivo_id))),
  ])

  console.log('')
  console.log(`  a busca desta pergunta  ·  ${busca.itens.length} achados, ${itens.length} acima do piso` +
    `${busca.direta ? ' (endereço direto, sem piso)' : ''}${fraco ? '  ⚠ RECUPERAÇÃO FRACA' : ''}`)
  for (const a of itens) {
    console.log(`    ${a.score.toFixed(4)}  ${a.via_rubrica ? '◆' : ' '} ${curto(a.citacao)}`)
  }
  if (itens.length === 0) console.log('    (nada)')

  console.log('')
  if (fio.length === 0) {
    console.log('  herdado do fio          ·  primeira pergunta, não há fio')
  } else {
    console.log(`  herdado do fio          ·  ${herdados.length} dispositivo(s), de ${fio.length} troca(s)`)
    for (const h of herdados) console.log(`      ⤷        ${curto(h.citacao)}`)
    if (herdados.length === 0) console.log('      (a busca desta pergunta já trouxe tudo que o fio tinha)')
  }

  if (precedentes.length > 0) {
    console.log('')
    console.log(`  precedentes do STJ      ·  ${precedentes.length}`)
    for (const p of precedentes) console.log(`               ${p.rotulo} — ${curto(p.tese, 50)}`)
  }

  const total = itens.length + herdados.length
  console.log('')
  console.log(`  → o modelo receberia ${total} dispositivo(s) e ${precedentes.length} precedente(s).`)

  if (cru) {
    const idsH = new Set(herdados.map((h) => h.dispositivo_id))
    console.log('')
    console.log('  ─── bloco literal ───────────────────────────────────────────────────')
    console.log(montarContexto([...itens, ...herdados], idsH))
    console.log(montarFio(fio))
  }

  // A próxima troca herda daqui. Ver a ressalva no cabeçalho: no produto quem
  // define esta lista é a resposta, não o contexto.
  fio = saneiaFio([
    ...fio,
    {
      pergunta: q,
      ids: [...itens, ...herdados].slice(0, FONTES_POR_RESPOSTA).map((x) => x.dispositivo_id),
    },
  ])
}

console.log('')
