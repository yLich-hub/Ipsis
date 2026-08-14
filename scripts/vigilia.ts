// =============================================================================
// npm run vigilia [-- --desde 2025-02-28] [--seco]
//
// A mesma coleta que o cron da Vercel roda, disparada da máquina local. Existe
// por dois motivos práticos:
//
//   1. **a carga inicial.** O cron pede uma janela de 60 dias; a primeira carga
//      precisa da janela inteira desde a data de corte, e ela é grande demais
//      (~4 MB só do Senado) para virar o padrão de toda execução diária;
//   2. **conferir sem gravar.** `--seco` roda tudo — as duas APIs, o filtro, a
//      contagem — e não escreve nada. É como se confere se o filtro do corpus
//      está pegando o que deve antes de encher uma tabela.
//
// Diferente dos outros scripts da pasta, este NÃO usa `scripts/db.ts`: a coleta
// grava por PostgREST, com service role, exatamente como faz na Vercel. Rodar
// localmente por um caminho diferente do de produção testaria outra coisa.
// =============================================================================

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '..', '.env.local'), quiet: true })

const args = process.argv.slice(2)
const seco = args.includes('--seco')
const desde = args[args.indexOf('--desde') + 1]

if (args.includes('--desde') && !/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '')) {
  console.error('· --desde exige data ISO: --desde 2025-02-28')
  process.exit(1)
}

// Importados depois do dotenv: `escrita.ts` lê as variáveis quando é chamado,
// mas os módulos de fonte não dependem de ambiente e a ordem só custaria dúvida.
const { DATA_DE_CORTE, tocaOCorpus, depoisDoCorte } = await import('../src/lib/vigilia/alvos.ts')
const camara = await import('../src/lib/vigilia/camara.ts')
const senado = await import('../src/lib/vigilia/senado.ts')
const { atualizaPendentes, coleta } = await import('../src/lib/vigilia/coletar.ts')

const janela = desde && args.includes('--desde') ? desde : DATA_DE_CORTE

console.log(`· vigília do corpus — janela desde ${janela}${seco ? ' (seco, não grava)' : ''}`)

if (seco) {
  const [c, s] = await Promise.all([camara.colhe(janela), senado.colhe(janela)])

  for (const [nome, colheita] of [
    ['câmara', c],
    ['senado', s],
  ] as const) {
    const candidatos = colheita.itens.filter(
      (i) => depoisDoCorte(i.apresentadoEm) && tocaOCorpus(i.ementa).length > 0,
    )
    console.log(
      `\n· ${nome}: ${colheita.itens.length} vistos, ${candidatos.length} tocam o corpus` +
        (colheita.ok ? '' : ` — FALHOU: ${colheita.erro}`),
    )
    for (const a of candidatos.slice(0, 12)) {
      const leis = tocaOCorpus(a.ementa)
        .map((l) => l.rotulo)
        .join(', ')
      console.log(`  ${a.identificacao.padEnd(16)} ${leis}`)
      console.log(`  ${' '.repeat(16)} ${a.ementa.slice(0, 96)}…`)
    }
    if (candidatos.length > 12) console.log(`  … e mais ${candidatos.length - 12}`)
  }

  process.exit(0)
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '· SUPABASE_SERVICE_ROLE_KEY ausente em .env.local.\n' +
      '  A vigília escreve numa tabela com RLS fechada (migration 0012) e sem sessão\n' +
      '  para ancorar policy. Rode com --seco para conferir o filtro sem gravar.',
  )
  process.exit(1)
}

const resumo = await coleta(janela)
for (const r of resumo.relatos) {
  console.log(
    `· ${r.fonte.padEnd(7)} ${r.ok ? 'ok  ' : 'FALHOU'} ` +
      `${r.vistos} vistos · ${r.candidatos} tocam o corpus · ${r.novos} inéditos · ${r.ms} ms` +
      (r.erro ? `\n  ${r.erro}` : ''),
  )
}

const promovidos = await atualizaPendentes()
console.log(
  `· total: ${resumo.novos} achados novos, ${resumo.normas} já viraram lei, ` +
    `${promovidos} promovidos na reconsulta`,
)

if (resumo.normas > 0) {
  console.log(
    '\n· ATENÇÃO: há norma publicada que altera o corpus. A data de corte de\n' +
      '  28/02/2025 está furada nesses pontos até que o parser rode de novo.',
  )
}
