// =============================================================================
// scripts/audit.ts — revisão humana da limpeza, antes do seed
//
//   npm run audit              # resumo + tudo que é raro, ordinais amostrados
//   npm run audit -- --tudo    # todas as alterações, sem amostragem
//
// A limpeza da rubrica marginal é heurística e tem falso positivo. Este script
// é o passo em que uma pessoa olha as 351 alterações do CP antes de qualquer
// coisa entrar no banco. Ele não conserta nada — ele mostra.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Alteracao, Relatorio } from '../src/lib/tipos.ts'

const SAIDA = resolve(import.meta.dirname, '..', 'data/normalizado')
const TUDO = process.argv.includes('--tudo')
const AMOSTRA = TUDO ? Infinity : 20

const arquivo = resolve(SAIDA, 'relatorio.json')
if (!existsSync(arquivo)) {
  console.error('relatorio.json não existe. Rode `npm run normalize` primeiro.')
  process.exit(1)
}
const r = JSON.parse(readFileSync(arquivo, 'utf8')) as Relatorio

const linhas: string[] = []
const p = (s = '') => {
  linhas.push(s)
  console.log(s)
}

/** Mostra só a vizinhança do que mudou — o resto do dispositivo é ruído. */
function destaque(antes: string, depois: string, ctx = 55): string {
  let i = 0
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++
  let j = 0
  while (
    j < antes.length - i &&
    j < depois.length - i &&
    antes[antes.length - 1 - j] === depois[depois.length - 1 - j]
  )
    j++

  const pre = antes.slice(Math.max(0, i - ctx), i)
  const pos = antes.slice(antes.length - j, antes.length - j + ctx)
  const remoto = antes.slice(i, antes.length - j)
  const novo = depois.slice(i, depois.length - j)

  const reticencia = (s: string, ini: boolean) =>
    (ini && i - ctx > 0 ? '…' : '') + s + (!ini && j - ctx > 0 ? '…' : '')

  return (
    `${reticencia(pre, true)}[- ${remoto.trim() || '∅'} -]` +
    `[+ ${novo.trim() || '∅'} +]${reticencia(pos, false)}`
  )
}

// -----------------------------------------------------------------------------
p('# Auditoria da normalização')
p()
p(`gerado em ${r.gerado_em}`)
p()

p('## Contagem por lei')
p()
p('| lei | artigos | revogados | dispositivos | rubricas | ordinais | notas rodapé | notas editor | emendas | rubrica marginal |')
p('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|')
for (const l of r.leis) {
  p(
    `| ${l.lei_id} | ${l.artigos} | ${l.revogados} | ${l.dispositivos} | ${l.rubricas_oficiais} | ` +
      `${l.contagem.ordinal} | ${l.contagem.nota_rodape} | ${l.contagem.nota_editor} | ` +
      `${l.contagem.emenda} | ${l.contagem.rubrica_marginal} |`,
  )
}
p()
p(
  'Referência do CLAUDE.md: 351 rubricas marginais no CP e 0 na Lei 11.343; ' +
    '6 notas de rodapé; 547 ordinais. Divergência grande é sinal de regra errada, não de dado errado.',
)
p()

// -----------------------------------------------------------------------------
if (r.conflitos.length) {
  p('## ⚠ Conflitos')
  p()
  p('Duas origens disputam a rubrica do mesmo dispositivo. Resolver antes do seed.')
  p()
  for (const c of r.conflitos) p(`- ${c}`)
  p()
}

if (r.suspeitos.length) {
  p('## Suspeitos de truncamento')
  p()
  p(
    'Dispositivos que, depois de toda a limpeza, continuam sem pontuação terminal. ' +
      'Foi assim que o art. 37 da Lei de Drogas apareceu partido. Nem todo suspeito é ' +
      'defeito — enumeração pode terminar em "e". Confira contra o PDF.',
  )
  p()
  for (const s of r.suspeitos) p(`- \`${s.dispositivo_id}\` ${s.trecho}`)
  p()
}

// -----------------------------------------------------------------------------
p('## Headings')
p()
const porRegra = new Map<string, typeof r.headings>()
for (const h of r.headings) {
  const lista = porRegra.get(h.regra) ?? []
  lista.push(h)
  porRegra.set(h.regra, lista)
}

for (const regra of ['nao-segmentado', 'sentence-case', 'repeticao', 'curadoria'] as const) {
  const lista = porRegra.get(regra) ?? []
  if (!lista.length) continue

  p(`### ${regra} — ${lista.length}`)
  p()
  if (regra === 'nao-segmentado') {
    p(
      'Nenhuma rubrica extraída. Ou o heading está limpo (esperado na Lei 11.343), ' +
        'ou a rubrica é Title Case e escapou das duas regras. Confira contra o PDF e, ' +
        'se houver rubrica, copie a entrada de `headings.propostas.yaml` para ' +
        '`data/curadoria/headings.yaml` já corrigida.',
    )
    p()
  }
  for (const h of lista) {
    if (regra === 'nao-segmentado') p(`- \`${h.primeiro_artigo}\` ${h.bruto}`)
    else p(`- \`${h.primeiro_artigo}\` ${h.heading}  **+ rubrica:** _${h.rubrica}_`)
  }
  p()
}

// -----------------------------------------------------------------------------
const grupos: [Alteracao['regra'], string][] = [
  ['emenda', 'Fronteira de bloco corrigida (curadoria)'],
  ['nota_editor', 'Nota do Editor removida do texto legal (curadoria)'],
  ['nota_rodape', 'Marcador de nota de rodapé removido'],
  ['estrutura', 'Divisor estrutural removido do fim do dispositivo'],
  ['rubrica_marginal', 'Rubrica marginal removida do fim do dispositivo'],
  ['ordinal', 'Ordinal normalizado'],
]

for (const [regra, titulo] of grupos) {
  const lista = r.alteracoes.filter((a) => a.regra === regra)
  p(`## ${titulo} — ${lista.length}`)
  p()
  if (regra === 'rubrica_marginal') {
    p('`[- removido -]` sai do dispositivo e vira a rubrica do dispositivo em **→**.')
    p()
  }
  const mostra = lista.slice(0, AMOSTRA)
  for (const a of mostra) {
    p(`- \`${a.dispositivo_id}\``)
    p(`  ${destaque(a.antes, a.depois)}`)
    if (a.rubrica) p(`  → rubrica _"${a.rubrica}"_ para \`${a.destino}\``)
  }
  if (lista.length > mostra.length) {
    p()
    p(`_(${lista.length - mostra.length} omitidas — \`npm run audit -- --tudo\`)_`)
  }
  p()
}

writeFileSync(resolve(SAIDA, 'auditoria.md'), linhas.join('\n'), 'utf8')
console.error(`\n→ data/normalizado/auditoria.md`)
