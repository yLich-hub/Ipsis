// =============================================================================
// scripts/normalize.ts — JSON do parser  →  linhas prontas para o banco
//
//   npm run normalize
//
// Não toca no banco e não edita os JSONs de entrada. Lê data/*.json, aplica as
// limpezas A/B/C do CLAUDE.md e escreve data/normalizado/. O que sai daqui é
// revisado por `npm run audit` ANTES de qualquer seed.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml, stringify as toYaml } from 'yaml'

import {
  analisaParagrafo,
  chave,
  detectaEstruturaFinal,
  detectaRubricaFinal,
  montaCitacao,
  normalizaOrdinais,
  partesNumeroArtigo,
  removeNotaRodape,
  romanoParaArabico,
  separaHeading,
  sha256,
  slug,
  tiraMarcador,
} from '../src/lib/normalizacao.ts'
import type {
  Alteracao,
  ArtigoBruto,
  CorteHeading,
  IncisoBruto,
  LeiBruta,
  LeiNormalizada,
  LinhaArtigo,
  LinhaDispositivo,
  LinhaRubricaOficial,
  Relatorio,
  TipoDispositivo,
} from '../src/lib/tipos.ts'

const RAIZ = resolve(import.meta.dirname, '..')
const ENTRADA = resolve(RAIZ, 'data')
const SAIDA = resolve(RAIZ, 'data/normalizado')
const CURADORIA = resolve(RAIZ, 'data/curadoria')

/** Fotografia do Vade Mecum Senado Federal, 1ª ed. Vai a banner na UI. */
const VIGENCIA_ATE = '2025-02-28'

const LEIS = [
  {
    arquivo: 'lei11343.json',
    id: 'lei_11343_2006',
    apelido: 'Lei de Drogas',
    sufixoCitacao: 'da Lei nº 11.343/2006',
    cobertura: 'integral' as const,
    coberturaNota: null,
    ordem: 1,
    obrigatorio: true,
  },
  {
    arquivo: 'codigo_penal.json',
    id: 'dl_2848_1940',
    apelido: 'Código Penal',
    sufixoCitacao: 'do Código Penal',
    cobertura: 'integral' as const,
    coberturaNota: null,
    ordem: 2,
    obrigatorio: true,
  },
  {
    arquivo: 'cpp_subconjunto.json',
    id: 'dl_3689_1941',
    apelido: 'CPP',
    sufixoCitacao: 'do Código de Processo Penal',
    cobertura: 'parcial' as const,
    coberturaNota:
      'Subconjunto curado: apenas os dispositivos que o recorte de tráfico de drogas utiliza. ' +
      'Cada artigo traz a data em que foi conferido contra o texto oficial.',
    ordem: 3,
    obrigatorio: false,
  },
]

// -----------------------------------------------------------------------------
// Bloco: um dispositivo em construção, ainda mutável.
// -----------------------------------------------------------------------------
type Bloco = {
  id: string
  artigo: ArtigoBruto
  artigoRow: LinhaArtigo
  tipo: TipoDispositivo
  numero: string | null
  rotulo: string
  paiId: string | null
  ordem: number
  /** exatamente o que o parser produziu — rede de segurança da auditoria */
  bruto: string
  texto: string
  rubrica: string | null
  /** partes intermediárias da citação: ['§ 4º', 'I', 'a'] */
  cadeia: string[]
}

const ehRevogado = (t: string) => /^\(?\s*\(?\s*(revogad|vetad)/i.test(t.trim())

// -----------------------------------------------------------------------------
// Headings: limpeza + curadoria
// -----------------------------------------------------------------------------
type Override = { bruto: string; heading: string; rubrica: string | null }

function leYaml<T>(nome: string): T[] {
  const f = resolve(CURADORIA, nome)
  if (!existsSync(f)) return []
  return (parseYaml(readFileSync(f, 'utf8')) ?? []) as T[]
}

function carregaCuradoriaHeadings(): Map<string, Override> {
  return new Map(leYaml<Override>('headings.yaml').map((o) => [o.bruto, o]))
}

// -----------------------------------------------------------------------------
// Curadoria: notas do editor e emendas de fronteira de bloco
//
// As duas são intervenções manuais sobre o texto legal. Por isso nenhuma delas é
// silenciosa: entrada que não casa aborta o script, e nota que sobrou aborta o
// script. Texto legal corrompido não pode chegar ao banco por omissão.
// -----------------------------------------------------------------------------
type NotaEditor = { dispositivo: string; marcadores: number[]; remover: string }
type Emenda = { artigo: string; paragrafo_indice: number; comeca_com: string; motivo: string }

const NOTAS = new Map(leYaml<NotaEditor>('notas_editor.yaml').map((n) => [n.dispositivo, n]))
const notasUsadas = new Set<string>()

const EMENDAS = new Map<string, Emenda[]>()
for (const e of leYaml<Emenda>('emendas.yaml')) {
  EMENDAS.set(e.artigo, [...(EMENDAS.get(e.artigo) ?? []), e])
}
const emendasUsadas = new Set<string>()
const chaveEmenda = (e: Emenda) => `${e.artigo}#${e.paragrafo_indice}`

const MARCA_NOTA = /\bNE\s*:/

function aplicaNotaEditor(id: string, texto: string): { texto: string; n: number } {
  const nota = NOTAS.get(id)
  if (!nota) return { texto, n: 0 }
  if (!texto.includes(nota.remover)) {
    throw new Error(
      `notas_editor.yaml: o trecho de ${id} não casa mais com o texto do parser.\n` +
        `  esperado: ${nota.remover}\n  no bloco: ${texto.slice(0, 220)}…`,
    )
  }
  notasUsadas.add(id)
  return {
    texto: texto.replace(nota.remover, '').replace(/\s{2,}/g, ' ').trim(),
    n: nota.marcadores.length,
  }
}

function resolveHeadings(doc: LeiBruta, leiId: string, curadoria: Map<string, Override>) {
  const cortes: CorteHeading[] = []
  /** heading bruto → { heading limpo, rubrica extraída } */
  const mapa = new Map<string, { heading: string; rubrica: string | null }>()
  /** artigo.id → rubrica herdada do heading imediatamente acima dele */
  const rubricaDoHeading = new Map<string, string>()

  for (const a of doc.artigos) {
    // Da mais específica para a mais genérica: a seção é impressa logo acima do
    // artigo, então é ela que carrega a rubrica quando as duas estão poluídas.
    for (const nivel of ['secao', 'capitulo', 'titulo'] as const) {
      const bruto = a.contexto?.[nivel]
      if (!bruto || mapa.has(bruto)) continue

      const over = curadoria.get(bruto)
      const corte = over
        ? { heading: over.heading, rubrica: over.rubrica, regra: 'curadoria' as const }
        : separaHeading(bruto)

      mapa.set(bruto, { heading: corte.heading, rubrica: corte.rubrica })
      cortes.push({
        lei_id: leiId,
        nivel,
        bruto,
        heading: corte.heading,
        rubrica: corte.rubrica,
        regra: corte.regra,
        primeiro_artigo: a.id,
      })

      if (corte.rubrica && !rubricaDoHeading.has(a.id)) {
        rubricaDoHeading.set(a.id, corte.rubrica)
      }
    }
  }

  return { mapa, rubricaDoHeading, cortes }
}

// -----------------------------------------------------------------------------
// Montagem dos blocos, em ordem de documento
// -----------------------------------------------------------------------------
function montaBlocos(
  a: ArtigoBruto,
  artigoRow: LinhaArtigo,
  emendas: Emenda[],
  alteracoes: Alteracao[],
  suspeitos: Relatorio['suspeitos'],
): Bloco[] {
  const blocos: Bloco[] = []
  let ordem = 0
  const caputId = `${a.id}_caput`

  // Onde os próximos incisos vão se pendurar. Muda a cada parágrafo real — e
  // deliberadamente NÃO muda num parágrafo falso, que é continuação do anterior.
  let paiIncisos = caputId
  let prefixoIncisos = a.id
  let cadeiaIncisos: string[] = []

  const push = (b: Omit<Bloco, 'artigo' | 'artigoRow' | 'ordem' | 'texto' | 'rubrica'>) => {
    blocos.push({ ...b, artigo: a, artigoRow, ordem: ++ordem, texto: b.bruto, rubrica: null })
  }

  push({
    id: caputId,
    tipo: 'caput',
    numero: null,
    rotulo: 'caput',
    paiId: null,
    bruto: a.caput,
    cadeia: [],
  })

  const empilhaIncisos = (incisos: IncisoBruto[]) => {
    for (const inc of incisos) {
      const incId = `${prefixoIncisos}_inc${romanoParaArabico(inc.numero)}`
      push({
        id: incId,
        tipo: 'inciso',
        numero: inc.numero,
        rotulo: inc.numero,
        paiId: paiIncisos,
        bruto: inc.texto,
        cadeia: [...cadeiaIncisos, inc.numero],
      })
      for (const al of inc.alineas ?? []) {
        const letra = /^([a-z])\s*\)/.exec(al)?.[1] ?? '?'
        push({
          id: `${incId}_al${letra}`,
          tipo: 'alinea',
          numero: letra,
          rotulo: `${letra})`,
          paiId: incId,
          bruto: al,
          cadeia: [...cadeiaIncisos, inc.numero, letra],
        })
      }
    }
  }

  // Incisos que vêm antes de qualquer parágrafo pendem do caput.
  empilhaIncisos(a.incisos)

  const falsos = new Map(emendas.map((e) => [e.paragrafo_indice, e]))

  a.paragrafos.forEach((p, idx) => {
    const emenda = falsos.get(idx)

    if (emenda) {
      const texto = p.texto.trim()
      if (!texto.startsWith(emenda.comeca_com)) {
        throw new Error(
          `emendas.yaml: ${a.id}#${idx} não começa com o esperado.\n` +
            `  esperado: ${emenda.comeca_com}\n  encontrado: ${texto.slice(0, 120)}…`,
        )
      }
      emendasUsadas.add(chaveEmenda(emenda))

      // Devolve o texto ao bloco anterior em ordem de documento — caput, outro
      // parágrafo ou inciso, conforme o caso.
      const anterior = blocos.at(-1)!
      const antes = anterior.bruto
      anterior.bruto = `${anterior.bruto} ${texto}`
      alteracoes.push({
        dispositivo_id: anterior.id,
        regra: 'emenda',
        antes,
        depois: anterior.bruto,
        motivo: emenda.motivo.trim(),
      })

      // Os incisos que o parser pendurou no fantasma voltam ao pai corrente.
      empilhaIncisos(p.incisos)
      return
    }

    // Assinatura de parágrafo falso: tirado o marcador, o bloco começa em
    // minúscula ou em pontuação. Parágrafo de verdade nunca faz isso — quando
    // acontece, o "§ No" era remissão no meio de uma frase, e o dispositivo
    // anterior está truncado. Não corrige sozinho: aponta o que curar.
    if (/^[a-zà-ÿ,;.)]/.test(tiraMarcador(p.texto, 'paragrafo'))) {
      suspeitos.push({
        dispositivo_id: `${a.id}#${idx}`,
        motivo: 'parágrafo começa em minúscula — candidato a emendas.yaml',
        trecho: p.texto.slice(0, 110),
      })
    }

    const { numero, sufixoId, rotulo } = analisaParagrafo(p.texto, p.numero)
    const parId = `${a.id}_p${sufixoId}`
    push({
      id: parId,
      tipo: 'paragrafo',
      numero,
      rotulo,
      paiId: caputId,
      bruto: p.texto,
      cadeia: [rotulo],
    })

    paiIncisos = parId
    prefixoIncisos = parId
    cadeiaIncisos = [rotulo]
    empilhaIncisos(p.incisos)
  })

  return blocos
}

// -----------------------------------------------------------------------------
// Processamento de uma lei
// -----------------------------------------------------------------------------
function processa(
  cfg: (typeof LEIS)[number],
  doc: LeiBruta,
  curadoria: Map<string, Override>,
) {
  const alteracoes: Alteracao[] = []
  const conflitos: string[] = []
  const suspeitos: Relatorio['suspeitos'] = []
  const contagem: Record<Alteracao['regra'], number> = {
    ordinal: 0,
    nota_rodape: 0,
    nota_editor: 0,
    rubrica_marginal: 0,
    estrutura: 0,
    emenda: 0,
  }

  const { mapa, rubricaDoHeading, cortes } = resolveHeadings(doc, cfg.id, curadoria)

  // --- artigos + blocos ------------------------------------------------------
  const artigos: LinhaArtigo[] = []
  const blocos: Bloco[] = []

  doc.artigos.forEach((a, i) => {
    const { base, sufixo } = partesNumeroArtigo(a.artigo)
    const limpo = (k: 'titulo' | 'capitulo' | 'secao') => {
      const bruto = a.contexto?.[k]
      return bruto ? (mapa.get(bruto)?.heading ?? bruto) : null
    }
    const row: LinhaArtigo = {
      id: a.id,
      lei_id: cfg.id,
      numero: a.artigo,
      numero_base: base,
      numero_sufixo: sufixo,
      ordem: i + 1,
      titulo: limpo('titulo'),
      capitulo: limpo('capitulo'),
      secao: limpo('secao'),
      rubrica: null,
      revogado: ehRevogado(a.caput),
      conferido_em: (a as { conferido_em?: string }).conferido_em ?? null,
    }
    artigos.push(row)
    blocos.push(...montaBlocos(a, row, EMENDAS.get(a.id) ?? [], alteracoes, suspeitos))
  })
  contagem.emenda = alteracoes.filter((x) => x.regra === 'emenda').length

  // --- passada única, em ordem de documento ---------------------------------
  //
  // A rubrica marginal que sobra no fim do bloco i pertence ao bloco i+1 —
  // inclusive quando i+1 é um parágrafo do mesmo artigo. Por isso a varredura é
  // sobre a lei inteira achatada, não artigo a artigo.
  let pendente: string | null = null
  let origemPendente: string | null = null

  for (const b of blocos) {
    // 1. rubrica herdada: heading tem prioridade sobre o bloco anterior, porque
    //    o Vade Mecum imprime a rubrica logo abaixo do heading.
    const doHeading = b.tipo === 'caput' ? rubricaDoHeading.get(b.artigo.id) : undefined
    if (doHeading && pendente && chave(doHeading) !== chave(pendente)) {
      conflitos.push(
        `${b.id}: heading propõe "${doHeading}", bloco anterior (${origemPendente}) propõe "${pendente}"`,
      )
    }
    const herdada = doHeading ?? pendente
    if (herdada) {
      b.rubrica = herdada
      if (b.tipo === 'caput') b.artigoRow.rubrica = herdada
    }
    pendente = null
    origemPendente = null

    // 2. curadoria: nota do editor emendada no texto legal, às vezes no meio da
    //    frase. Sai primeiro, porque muda o fim do bloco — que é justamente onde
    //    a regra da rubrica marginal vai olhar.
    let t = b.tipo === 'caput' ? b.bruto : tiraMarcador(b.bruto, b.tipo)

    const ed = aplicaNotaEditor(b.id, t)
    if (ed.n) {
      contagem.nota_editor += ed.n
      alteracoes.push({ dispositivo_id: b.id, regra: 'nota_editor', antes: t, depois: ed.texto })
      t = ed.texto
    }
    if (MARCA_NOTA.test(t)) {
      throw new Error(
        `nota do editor não tratada em ${b.id}. Acrescente a entrada em ` +
          `data/curadoria/notas_editor.yaml.\n  ${t.slice(0, 240)}…`,
      )
    }

    // 3. limpezas C e B
    const ord = normalizaOrdinais(t)
    if (ord.n) {
      contagem.ordinal += ord.n
      alteracoes.push({ dispositivo_id: b.id, regra: 'ordinal', antes: t, depois: ord.texto })
      t = ord.texto
    }

    const tiraNota = () => {
      const nota = removeNotaRodape(t)
      if (!nota.n) return
      contagem.nota_rodape += nota.n
      alteracoes.push({ dispositivo_id: b.id, regra: 'nota_rodape', antes: t, depois: nota.texto })
      t = nota.texto
    }
    tiraNota()

    // 4. divisor estrutural vazado ("…reincidência. PARTE ESPECIAL")
    const est = detectaEstruturaFinal(t)
    if (est) {
      contagem.estrutura++
      alteracoes.push({ dispositivo_id: b.id, regra: 'estrutura', antes: t, depois: est.texto })
      t = est.texto
    }

    // 5. limpeza A2 — o fragmento sai daqui e entra no próximo bloco
    const rub = detectaRubricaFinal(t)
    if (rub) {
      contagem.rubrica_marginal++
      alteracoes.push({
        dispositivo_id: b.id,
        regra: 'rubrica_marginal',
        antes: t,
        depois: rub.texto,
        rubrica: rub.rubrica,
      })
      t = rub.texto
      pendente = rub.rubrica
      origemPendente = b.id
      // Tirada a rubrica, o marcador de nota que estava entre ela e o texto
      // legal ("…prescrição.4 Modo de conversão") virou fim de bloco.
      tiraNota()
    }

    b.texto = t.trim()
  }

  if (pendente) {
    conflitos.push(`rubrica "${pendente}" sobrou no fim de ${origemPendente} — sem bloco seguinte`)
  }

  // Depois da limpeza, um bloco que continua sem pontuação terminal é candidato
  // a truncamento do parser — foi assim que o art. 37 da Lei de Drogas apareceu.
  // Não é erro fatal (há dispositivos que legitimamente terminam em "e" ou ","
  // dentro de enumeração), mas vai para a auditoria.
  for (const b of blocos) {
    if (b.tipo === 'alinea' || b.tipo === 'inciso') continue
    if (/[.:;!?)»”"]\s*$/.test(b.texto)) continue
    suspeitos.push({
      dispositivo_id: b.id,
      motivo: 'sem pontuação terminal depois da limpeza',
      trecho: `…${b.texto.slice(-90)}`,
    })
  }

  // fecha o destino de cada rubrica removida, agora que a cadeia está montada
  const porOrigem = new Map(blocos.map((b, i) => [b.id, i]))
  for (const alt of alteracoes) {
    if (alt.regra !== 'rubrica_marginal') continue
    const i = porOrigem.get(alt.dispositivo_id)
    alt.destino = i !== undefined ? (blocos[i + 1]?.id ?? '—') : '—'
  }

  // --- linhas finais ---------------------------------------------------------
  const dispositivos: LinhaDispositivo[] = blocos.map((b) => {
    const caput = blocos.find((x) => x.artigo.id === b.artigo.id && x.tipo === 'caput')!
    // O contexto mais específico é o que melhor ancora o vetor: a seção diz
    // "Das Penas Privativas de Liberdade" onde o capítulo só diz "Das Espécies
    // de Pena".
    const contexto = [
      b.artigoRow.secao ?? b.artigoRow.capitulo ?? b.artigoRow.titulo,
      b.artigoRow.rubrica,
    ]
    const cabeca = `Art. ${b.artigo.artigo}. ${caput.texto}`

    // O que é embutido não é `texto`: um "§ 4º Nos delitos definidos no caput..."
    // isolado gera vetor inútil. Ver CLAUDE.md.
    const texto_embed = [
      ...contexto,
      b.tipo === 'caput' ? null : b.rubrica,
      cabeca,
      b.tipo === 'caput' ? null : `${b.rotulo} ${b.texto}`,
    ]
      .filter((x): x is string => Boolean(x))
      .join('\n')

    return {
      id: b.id,
      artigo_id: b.artigo.id,
      lei_id: cfg.id,
      tipo: b.tipo,
      numero: b.numero,
      rotulo: b.rotulo,
      pai_id: b.paiId,
      ordem: b.ordem,
      texto: b.texto,
      texto_bruto: b.bruto,
      rubrica: b.rubrica,
      citacao: montaCitacao(b.artigo.artigo, b.cadeia, cfg.sufixoCitacao),
      texto_embed,
      embed_hash: sha256(texto_embed),
      revogado: b.artigoRow.revogado || ehRevogado(b.texto),
    }
  })

  // dispositivos.id é PK e é a chave de citação — id repetido derruba o seed e,
  // pior, faria duas citações diferentes apontarem para o mesmo lugar.
  const repetidos = dispositivos
    .map((d) => d.id)
    .filter((id, i, todos) => todos.indexOf(id) !== i)
  if (repetidos.length) {
    throw new Error(
      `ids de dispositivo repetidos em ${cfg.id}: ${[...new Set(repetidos)].join(', ')}`,
    )
  }

  // --- rubricas oficiais -----------------------------------------------------
  //
  // "Disposições gerais" é rubrica de vários artigos: uma linha em `rubricas`,
  // N em `rubrica_dispositivos`. Daí agrupar por termo normalizado.
  const porTermo = new Map<string, LinhaRubricaOficial>()
  for (const b of blocos) {
    if (!b.rubrica) continue
    const k = chave(b.rubrica)
    const atual = porTermo.get(k)
    if (atual) atual.dispositivos.push(b.id)
    else
      porTermo.set(k, {
        termo: b.rubrica,
        slug: slug(b.rubrica),
        tipo: 'dispositivo',
        origem: 'oficial',
        dispositivos: [b.id],
      })
  }

  const normalizada: LeiNormalizada = {
    lei: {
      id: cfg.id,
      nome: doc.nome,
      apelido: cfg.apelido,
      fonte: doc.fonte,
      vigencia_ate: VIGENCIA_ATE,
      cobertura: cfg.cobertura,
      cobertura_nota: cfg.coberturaNota,
      total_artigos: artigos.length,
      ordem: cfg.ordem,
    },
    artigos,
    dispositivos,
    rubricas: [...porTermo.values()],
  }

  return { normalizada, alteracoes, cortes, conflitos, contagem, suspeitos }
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------
mkdirSync(SAIDA, { recursive: true })
mkdirSync(CURADORIA, { recursive: true })

const curadoria = carregaCuradoriaHeadings()
const relatorio: Relatorio = {
  gerado_em: new Date().toISOString(),
  leis: [],
  alteracoes: [],
  headings: [],
  conflitos: [],
  suspeitos: [],
}

for (const cfg of LEIS) {
  const caminho = resolve(ENTRADA, cfg.arquivo)
  if (!existsSync(caminho)) {
    if (cfg.obrigatorio) throw new Error(`fonte obrigatória ausente: ${caminho}`)
    console.warn(`· ${cfg.arquivo} ausente — pulando (${cfg.id})`)
    continue
  }

  const doc = JSON.parse(readFileSync(caminho, 'utf8')) as LeiBruta
  const r = processa(cfg, doc, curadoria)

  writeFileSync(
    resolve(SAIDA, `${cfg.id}.json`),
    JSON.stringify(r.normalizada, null, 2),
    'utf8',
  )

  relatorio.leis.push({
    lei_id: cfg.id,
    artigos: r.normalizada.artigos.length,
    dispositivos: r.normalizada.dispositivos.length,
    revogados: r.normalizada.artigos.filter((a) => a.revogado).length,
    rubricas_oficiais: r.normalizada.rubricas.length,
    contagem: r.contagem,
  })
  relatorio.alteracoes.push(...r.alteracoes)
  relatorio.headings.push(...r.cortes)
  relatorio.conflitos.push(...r.conflitos)
  relatorio.suspeitos.push(...r.suspeitos)

  console.log(
    `✓ ${cfg.id.padEnd(16)} ${String(r.normalizada.artigos.length).padStart(3)} artigos · ` +
      `${String(r.normalizada.dispositivos.length).padStart(4)} dispositivos · ` +
      `${String(r.normalizada.rubricas.length).padStart(3)} rubricas`,
  )
}

// Curadoria obsoleta é tão perigosa quanto curadoria ausente: uma entrada que
// deixou de casar significa que o texto mudou embaixo dela sem ninguém olhar.
// Só vale checar as leis que foram efetivamente processadas.
const leisProcessadas = new Set(relatorio.leis.map((l) => l.lei_id))
const daLeiProcessada = (id: string) => [...leisProcessadas].some((l) => id.startsWith(l))

const notasOrfas = [...NOTAS.keys()].filter((k) => daLeiProcessada(k) && !notasUsadas.has(k))
const emendasOrfas = [...EMENDAS.values()]
  .flat()
  .map(chaveEmenda)
  .filter((k) => daLeiProcessada(k) && !emendasUsadas.has(k))
if (notasOrfas.length || emendasOrfas.length) {
  throw new Error(
    'curadoria que não casou com nenhum dispositivo:\n' +
      [...notasOrfas.map((k) => `  notas_editor.yaml → ${k}`),
       ...emendasOrfas.map((k) => `  emendas.yaml → ${k}`)].join('\n'),
  )
}

writeFileSync(resolve(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2), 'utf8')

// Proposta de corte de heading: as regras acertam a maioria, mas ~10 headings do
// CP têm rubrica em Title Case e escapam. Este arquivo existe para virar
// data/curadoria/headings.yaml depois da revisão humana.
writeFileSync(
  resolve(SAIDA, 'headings.propostas.yaml'),
  toYaml(
    relatorio.headings.map((h) => ({
      bruto: h.bruto,
      heading: h.heading,
      rubrica: h.rubrica,
      regra: h.regra,
      artigo: h.primeiro_artigo,
    })),
  ),
  'utf8',
)

const naoSegmentados = relatorio.headings.filter((h) => h.regra === 'nao-segmentado').length
console.log(
  `\n→ data/normalizado/  ·  ${relatorio.alteracoes.length} alterações  ·  ` +
    `${relatorio.headings.length} headings (${naoSegmentados} sem corte)  ·  ` +
    `${relatorio.conflitos.length} conflitos  ·  ${relatorio.suspeitos.length} suspeitos`,
)
console.log('  revise com: npm run audit')
