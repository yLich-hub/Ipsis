// =============================================================================
// scripts/vademecum.ts — acervo de consulta  →  data/vademecum/
//
//   npm run vademecum
//
// Importa as 75 legislações do repositório RenanSantos7/Vade-Mecum (CC0), onde
// cada lei é um objeto `ILei` com o texto num único bloco HTML raspado do
// Planalto. Roda offline, como todo scripts/*, e escreve arquivo estático —
// nada disso toca banco, embedding ou busca.
//
// POR QUE ESTE ACERVO É SEPARADO DO CORPUS CURADO
// -----------------------------------------------
// O texto vem de espelho de terceiro, sem data de vigência conferida. O corpus
// curado (Lei 11.343, CP, CPP) tem data de corte auditada e id de citação
// estável, porque dele saem os fundamentos das peças. Misturar os dois faria
// texto sem procedência virar citação em peça criminal — exatamente o erro que
// a decisão nº 3 do CLAUDE.md existe para impedir.
//
// A separação é estrutural, não uma convenção que alguém precise lembrar:
//   · os ids daqui ('cf', 'cdc') não casam o padrão do corpus ('dl_2848_1940');
//   · nada é escrito em `dispositivos`, então a busca híbrida não enxerga;
//   · seed.ts e embed.ts não leem data/vademecum/.
// tests/vademecum.test.ts trava as três coisas.
//
// O SHA de origem é fixado abaixo. Não usar 'main': o commit é o que dá uma
// data honesta para exibir na tela, e é o que torna a importação reprodutível.
// =============================================================================

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sanitizeHtml from 'sanitize-html'
import { parse as parseYaml } from 'yaml'

import { chave, slug } from '../src/lib/normalizacao.ts'
import type { AreaAcervo, IndiceAcervo, LeiAcervo, TopicoSumario } from '../src/lib/tipos.ts'

const RAIZ = resolve(import.meta.dirname, '..')
const SAIDA = resolve(RAIZ, 'data/vademecum')
const CURADORIA = resolve(RAIZ, 'data/curadoria/vademecum.yaml')

/** Espelho fixado. Ver cabeçalho: 'main' quebraria a reprodutibilidade. */
const ORIGEM = {
  repo: 'RenanSantos7/Vade-Mecum',
  url: 'https://github.com/RenanSantos7/Vade-Mecum',
  sha: '0632f305acd5d22b456577d2c87956e981743df2',
  commit_em: '2025-05-03',
  licenca: 'CC0-1.0',
} as const

const PASTA = 'src/dados/leis'
const CONCORRENCIA = 6

// -----------------------------------------------------------------------------
// Curadoria: rótulos de área, área de quem veio sem, link oficial que faltou e
// o apontamento para o corpus curado. Ver data/curadoria/vademecum.yaml.
// -----------------------------------------------------------------------------
type Curadoria = {
  areas: { chave: string; rotulo: string; descricao?: string }[]
  area_por_lei?: Record<string, string>
  link_oficial?: Record<string, string>
  corpus?: Record<string, string>
  apelido?: Record<string, string>
  id_por_lei?: Record<string, string>
}

const curadoria = parseYaml(readFileSync(CURADORIA, 'utf8')) as Curadoria
const ORDEM_AREA = new Map(curadoria.areas.map((a, i) => [a.chave, i]))
const ROTULO_AREA = new Map(curadoria.areas.map((a) => [a.chave, a.rotulo]))

// -----------------------------------------------------------------------------
// Saneamento
//
// Allowlist de tags de documento. O HTML de origem é de terceiro e vai para
// dangerouslySetInnerHTML — sanear aqui, em build, significa que o arquivo em
// disco já está seguro e revisável em diff, e que runtime nenhum paga por isso.
// -----------------------------------------------------------------------------
const OPCOES: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'div', 'span', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'b', 'strong', 'i', 'em', 'u', 's', 'sup', 'sub', 'small',
    'a', 'ul', 'ol', 'li', 'blockquote',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  ],
  allowedAttributes: {
    // `target` e `rel` precisam estar aqui mesmo saindo do transformTags: o
    // filtro de atributos roda DEPOIS da transformação e removeria os dois,
    // deixando o link sem noopener. tests/vademecum.test.ts cobre isso.
    a: ['href', 'name', 'target', 'rel'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    '*': ['id', 'class'],
  },
  // `style` fica de fora de propósito: é vetor de exfiltração por url() e a
  // tipografia do acervo é nossa, não a do PDF de origem.
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Link para fora do domínio. `noopener` porque target=_blank sem ele dá à
    // página aberta acesso a window.opener; `nofollow` porque são links de
    // terceiro que não estamos endossando.
    a: (nome, attribs) => ({
      tagName: 'a',
      attribs: attribs.href
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
        : attribs,
    }),
  },
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
}

// -----------------------------------------------------------------------------
// Extração do módulo TS
//
// O arquivo é `const x:ILei = { ...campos..., conteudo: \`...html...\` }`. Não
// dá para importar: é TS com import de tipo e 800 KB de template literal. Parse
// por recorte, com verificação em cada passo — arquivo que não casa aborta a
// importação inteira em vez de entrar torto.
// -----------------------------------------------------------------------------
type Bruto = {
  arquivo: string
  id: string
  titulo: string
  alias: string | null
  area: string
  jurisdicao: string
  num_lei: string | null
  ementa: string | null
  link_da_lei: string | null
  relacionadas: { id: string; nome: string }[]
  html: string
}

function extrai(arquivo: string, fonte: string): Bruto {
  // A anotação `:ILei` não é universal no fonte — lacinfo.ts e l6766.ts
  // declaram o objeto sem tipo. Casar pela declaração, não pelo tipo.
  const abre = fonte.search(/(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::\s*ILei\s*)?=\s*\{/)
  if (abre < 0) throw new Error(`${arquivo}: não achei a declaração do objeto da lei`)

  const marcaConteudo = fonte.indexOf('conteudo', abre)
  if (marcaConteudo < 0) throw new Error(`${arquivo}: não achei o campo conteudo`)

  const craseAbre = fonte.indexOf('`', marcaConteudo)
  const craseFecha = fonte.lastIndexOf('`')
  if (craseAbre < 0 || craseFecha <= craseAbre) {
    throw new Error(`${arquivo}: template literal de conteudo malformado`)
  }
  const html = fonte.slice(craseAbre + 1, craseFecha)
  if (html.trim().length < 200) throw new Error(`${arquivo}: conteudo vazio ou curto demais`)

  // Cabeçalho = campos escalares. `linksRelacionados` sai antes porque tem
  // `id:` e `nome:` dentro, e roubaria o match do id da lei.
  const bruto = fonte.slice(abre, marcaConteudo)
  const blocoLinks = bruto.match(/linksRelacionados\s*:\s*\[([\s\S]*?)\]/)
  const cabecalho = bruto.replace(/linksRelacionados\s*:\s*\[[\s\S]*?\]/, '')

  const campo = (nome: string): string | null =>
    cabecalho.match(new RegExp(`\\b${nome}\\s*:\\s*(['"])([\\s\\S]*?)\\1`))?.[2]?.trim() || null

  const id = campo('id') ?? arquivo.replace(/\.ts$/, '')
  const titulo = campo('titulo') ?? campo('alias')
  if (!titulo) throw new Error(`${arquivo}: sem titulo`)

  const relacionadas: { id: string; nome: string }[] = []
  const pares = (blocoLinks?.[1] ?? '').matchAll(
    /\{\s*id\s*:\s*(['"])(.*?)\1\s*,\s*nome\s*:\s*(['"])(.*?)\3/g,
  )
  for (const par of pares) {
    // O fonte tem lixo de digitação nos rótulos ('Código Penal Militar</').
    const nome = (par[4] ?? '').replace(/<\/?$/, '').trim()
    if (par[2] && nome) relacionadas.push({ id: par[2], nome })
  }

  return {
    arquivo,
    id,
    titulo,
    alias: campo('alias'),
    area: campo('area') ?? '',
    jurisdicao: campo('jurisdicao') ?? 'nacional',
    num_lei: campo('numLei'),
    ementa: campo('ementa'),
    link_da_lei: campo('linkDaLei'),
    relacionadas,
    html,
  }
}

// -----------------------------------------------------------------------------
// Sumário
//
// O menu lateral navega por Livro/Título/Capítulo. Os headings existem no HTML
// (h1/h2/h3) mas sem id — a âncora é injetada aqui, em build, para o leitor não
// precisar mexer no DOM depois de montado.
// -----------------------------------------------------------------------------
const soTexto = (h: string) =>
  h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function ancoras(html: string): { html: string; sumario: TopicoSumario[] } {
  const sumario: TopicoSumario[] = []
  const usados = new Map<string, number>()

  const comId = html.replace(
    /<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (inteiro, nivel: string, attrs: string, dentro: string) => {
      const titulo = soTexto(dentro)
      if (!titulo) return inteiro

      const base = slug(titulo).slice(0, 60) || 'secao'
      const repetido = usados.get(base) ?? 0
      usados.set(base, repetido + 1)
      const id = repetido ? `${base}-${repetido + 1}` : base

      sumario.push({ nivel: Number(nivel), titulo, id })
      const semId = attrs.replace(/\s*id\s*=\s*(['"]?)[^'">\s]*\1/g, '')
      return `<h${nivel} id="${id}"${semId}>${dentro}</h${nivel}>`
    },
  )

  return { html: comId, sumario }
}

// -----------------------------------------------------------------------------
// Link para o texto oficial.
//
// Só vale link que veio no espelho ou que foi curado à mão. Nada de derivar a
// URL do número da lei: o padrão do Planalto é regular o bastante para tentar,
// e é justamente aí que mora o erro grave — 'itcmd' é a Lei 4.261/1989 do Rio
// de Janeiro e 'estsppi' é lei complementar do Piauí. Normas estaduais não
// estão no ccivil_03, e a URL derivada cairia numa lei FEDERAL de mesmo número.
// Link errado que abre um texto legal plausível é pior que link nenhum.
//
// 42 das 75 leis ficam sem link, porque o espelho não trouxe. A tela diz isso
// em vez de inventar destino. Preencher à mão em data/curadoria/vademecum.yaml,
// conferindo com `npm run vademecum -- --verificar-links`.
// -----------------------------------------------------------------------------
function linkOficial(b: Bruto, html: string): string | null {
  // Só o link do próprio cabeçalho da lei. Nada de "primeiro link do Planalto
  // que aparecer": em lacinfo.ts o primeiro é a Mensagem de Veto.
  const subtit = html.match(/<p[^>]*id=["']?subtit["']?[^>]*>([\s\S]*?)<\/p>/i)
  const bruto =
    curadoria.link_oficial?.[b.id] ??
    b.link_da_lei ??
    subtit?.[1]?.match(/href=["']([^"']+)["']/i)?.[1] ??
    null

  // O espelho é de 2025 mas guarda link http:// do Planalto. Subir para https
  // evita mandar o leitor a uma página sem TLS para conferir texto legal.
  return bruto?.replace(/^http:\/\/(www\.)?planalto\.gov\.br/i, 'https://www.planalto.gov.br') ?? null
}

// -----------------------------------------------------------------------------
// Rede
// -----------------------------------------------------------------------------
const cru = (caminho: string) =>
  `https://raw.githubusercontent.com/${ORIGEM.repo}/${ORIGEM.sha}/${caminho}`

async function baixa(caminho: string): Promise<string> {
  const r = await fetch(cru(caminho))
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`)
  return r.text()
}

async function emLotes<T, R>(itens: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < itens.length; i += n) {
    saida.push(...(await Promise.all(itens.slice(i, i + n).map(f))))
  }
  return saida
}

// -----------------------------------------------------------------------------
// npm run vademecum -- --verificar-links
//
// Confere todo link_oficial do índice contra a página real: 200 e o número da
// lei aparecendo no corpo. Vale para os links que vieram do espelho tanto
// quanto para os curados à mão — nenhum dos dois foi verificado na origem.
//
// Passo separado, e não parte da importação, porque depende de alcançar o
// planalto.gov.br. O ambiente onde o acervo foi importado não alcança.
// -----------------------------------------------------------------------------
if (process.argv.includes('--verificar-links')) {
  const { leis: doIndice } = JSON.parse(
    readFileSync(resolve(SAIDA, 'indice.json'), 'utf8'),
  ) as IndiceAcervo

  const comLink = doIndice.filter((l) => l.link_oficial)
  console.log(`Conferindo ${comLink.length} links · ${doIndice.length - comLink.length} sem link\n`)

  const problemas: string[] = []
  await emLotes(comLink, CONCORRENCIA, async (l) => {
    const numero = (l.num_lei ?? '').match(/([\d.]{3,})/)?.[1]?.replace(/\./g, '')
    try {
      const r = await fetch(l.link_oficial!, { redirect: 'follow' })
      if (!r.ok) return problemas.push(`${l.id}: HTTP ${r.status} · ${l.link_oficial}`)

      const corpo = Buffer.from(await r.arrayBuffer()).toString('latin1')
      const comPonto = numero && numero.length > 3
        ? `${numero.slice(0, -3)}.${numero.slice(-3)}`
        : numero
      if (numero && !corpo.includes(numero) && !corpo.includes(comPonto!)) {
        problemas.push(`${l.id}: a página não menciona a lei ${l.num_lei} · ${l.link_oficial}`)
      }
    } catch (e) {
      problemas.push(`${l.id}: ${(e as Error).message} · ${l.link_oficial}`)
    }
  })

  if (problemas.length) {
    throw new Error(`${problemas.length} links com problema:\n  ${problemas.join('\n  ')}`)
  }
  console.log(`✓ ${comLink.length} links conferidos`)
  process.exit(0)
}

// -----------------------------------------------------------------------------
// Execução
// -----------------------------------------------------------------------------
console.log(`Vade Mecum · ${ORIGEM.repo}@${ORIGEM.sha.slice(0, 7)} (${ORIGEM.commit_em})\n`)

const arvore = (await (
  await fetch(`https://api.github.com/repos/${ORIGEM.repo}/git/trees/${ORIGEM.sha}?recursive=1`)
).json()) as { tree?: { path: string; type: string }[] }

const arquivos = (arvore.tree ?? [])
  .filter((t) => t.type === 'blob' && t.path.startsWith(`${PASTA}/`) && t.path.endsWith('.ts'))
  .map((t) => t.path)
  .sort()

if (arquivos.length === 0) throw new Error('a árvore do repositório veio vazia — sem rede?')
console.log(`${arquivos.length} arquivos em ${PASTA}/`)

const brutos = await emLotes(arquivos, CONCORRENCIA, async (caminho) => {
  const nome = caminho.slice(PASTA.length + 1)
  return extrai(nome, await baixa(caminho))
})

// O id vira URL. O fonte tem ids em caixa mista e com erro de digitação
// ('EstatutoIdodo', 'LAPop'), que não podem virar /vademecum/EstatutoIdodo —
// daí o slug, com remapeamento curado para os casos que o slug não conserta.
const idFinal = new Map(brutos.map((b) => [b.id, curadoria.id_por_lei?.[b.id] ?? slug(b.id)]))

// Id duplicado quebraria a rota /vademecum/[leiId] em silêncio.
const vistos = new Map<string, string>()
for (const b of brutos) {
  const id = idFinal.get(b.id)!
  const antes = vistos.get(id)
  if (antes) throw new Error(`id '${id}' repetido em ${antes} e ${b.arquivo}`)
  vistos.set(id, b.arquivo)
}

mkdirSync(SAIDA, { recursive: true })

const leis: LeiAcervo[] = []
const semArea: string[] = []
const semLink: string[] = []

for (const b of brutos) {
  const id = idFinal.get(b.id)!
  let html = sanitizeHtml(b.html, OPCOES)

  // O título da lei vira <h1> da tela, pelo Cabecalho — repetido no corpo só
  // empurra o art. 1º para baixo da dobra.
  html = html.replace(/<p[^>]*id=["']?titulo["']?[^>]*>[\s\S]*?<\/p>/i, '')

  const link = linkOficial(b, html)
  if (!link) semLink.push(id)

  const { html: comAncoras, sumario } = ancoras(html)
  const corpo = comAncoras.trim()

  const area = chave(curadoria.area_por_lei?.[b.id] ?? b.area)
  if (!area || !ORDEM_AREA.has(area)) semArea.push(`${b.id} (${b.area || 'vazio'})`)

  writeFileSync(resolve(SAIDA, `${id}.html`), `${corpo}\n`, 'utf8')

  leis.push({
    id,
    titulo: b.titulo,
    apelido: curadoria.apelido?.[b.id] ?? b.alias ?? b.titulo,
    area,
    area_rotulo: ROTULO_AREA.get(area) ?? 'Outras',
    jurisdicao: b.jurisdicao,
    num_lei: b.num_lei,
    ementa: b.ementa,
    link_oficial: link,
    corpus_id: curadoria.corpus?.[b.id] ?? null,
    artigos: (corpo.match(/<span class="artigo">/g) ?? []).length,
    bytes: Buffer.byteLength(corpo, 'utf8'),
    // Links mortos existem no fonte ('cppm' e 'drogas' não têm arquivo).
    relacionadas: b.relacionadas
      .filter((r) => idFinal.has(r.id) && r.id !== b.id)
      .map((r) => ({ id: idFinal.get(r.id)!, nome: r.nome })),
    sumario,
  })
}

// Curadoria ausente é o mesmo problema de curadoria obsoleta: um dado torto que
// ninguém olhou. Abortar é mais barato que descobrir na tela.
// Área desconhecida aborta: sem ela a lei não aparece em grupo nenhum do
// catálogo, e sumir em silêncio é o pior desfecho possível.
if (semArea.length) {
  throw new Error(
    `sem área conhecida (${semArea.length}) → area_por_lei:\n` +
      `${semArea.map((s) => `    ${s}`).join('\n')}\n\n` +
      '  curar em data/curadoria/vademecum.yaml',
  )
}

leis.sort((a, b) =>
  (ORDEM_AREA.get(a.area) ?? 99) - (ORDEM_AREA.get(b.area) ?? 99) ||
  a.apelido.localeCompare(b.apelido, 'pt-BR'))

const areas: AreaAcervo[] = curadoria.areas
  .filter((a) => leis.some((l) => l.area === a.chave))
  .map((a) => ({
    chave: a.chave,
    rotulo: a.rotulo,
    descricao: a.descricao ?? null,
    total: leis.filter((l) => l.area === a.chave).length,
  }))

const indice: IndiceAcervo = { origem: ORIGEM, areas, leis }
writeFileSync(resolve(SAIDA, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`, 'utf8')

// Idempotência, como no seed: rodar duas vezes tem que dar o mesmo diretório.
// Um id renomeado na curadoria deixa o arquivo antigo para trás, e ele seguiria
// servindo em /vademecum/<id-velho> sem constar do índice.
//
// Comparação sem caixa de propósito: o NTFS não distingue 'L8212.html' de
// 'l8212.html', então o arquivo escrito agora e o arquivo velho do id antigo
// são o MESMO — e a versão sensível a caixa apagava o que acabara de gravar.
const esperados = new Set(leis.map((l) => `${l.id}.html`.toLowerCase()))
const orfaos = readdirSync(SAIDA).filter(
  (f) => f.endsWith('.html') && !esperados.has(f.toLowerCase()),
)
for (const f of orfaos) unlinkSync(resolve(SAIDA, f))
if (orfaos.length) console.log(`  removidos ${orfaos.length} arquivos órfãos: ${orfaos.join(', ')}`)

// -----------------------------------------------------------------------------
// Relatório
// -----------------------------------------------------------------------------
for (const a of areas) {
  const dela = leis.filter((l) => l.area === a.chave)
  console.log(
    `  ${a.rotulo.padEnd(26)} ${String(dela.length).padStart(2)} leis · ` +
      `${String(dela.reduce((s, l) => s + l.artigos, 0)).padStart(5)} artigos`,
  )
}

const mb = leis.reduce((s, l) => s + l.bytes, 0) / 1048576
console.log(
  `\n→ data/vademecum/  ·  ${leis.length} leis  ·  ` +
    `${leis.reduce((s, l) => s + l.artigos, 0)} artigos  ·  ` +
    `${leis.reduce((s, l) => s + l.sumario.length, 0)} tópicos de sumário  ·  ` +
    `${mb.toFixed(2)} MB`,
)
console.log('  o acervo é de leitura: não entra em seed, embed ou busca.')

// Falta visível, não silenciosa: a tela mostra que o link não existe, e o
// número aqui é o quanto de curadoria manual ainda cabe fazer.
if (semLink.length) {
  console.log(
    `\n! ${semLink.length} leis sem link para o texto oficial — o espelho não trouxe.\n` +
      `  ${semLink.join(', ')}\n` +
      '  preencher link_oficial em data/curadoria/vademecum.yaml e conferir com:\n' +
      '  npm run vademecum -- --verificar-links',
  )
}
