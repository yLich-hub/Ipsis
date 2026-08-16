// =============================================================================
// scripts/instantaneo.mjs — as sete telas num arquivo só, para passe de design
//
//   npm run instantaneo
//
// Gera `Design_system/estado-atual.html`: o HTML que o servidor de fato produz,
// com o CSS compilado embutido e sem uma linha de script. É o material para
// mandar a quem for mexer no visual.
//
// **Por que não mandar o protótipo em vez disto.** `Design_system/TOGA v2 -
// Assistente Jurídico.dc.html` é de onde o projeto partiu, não onde ele está — e
// o projeto recusou partes dele de propósito, com motivo escrito no CLAUDE.md
// ("Onde o desenho foi recusado"). Quem melhorar o protótipo vai propor de volta
// o comparador de redações, o "Sincronizar agora" e os 1,2 milhão de documentos,
// que são as telas mais bonitas de fazer e as que este produto não tem.
//
// O arquivo carrega, no topo, as três restrições que não se negociam por
// estética. Pixel não explica intenção: sem elas, a primeira sugestão razoável é
// encher o vazio de `/fontes` com um gráfico — sem saber que o vazio ali é a
// recusa de inventar dado.
//
// Exige o app de pé e uma sessão: as sete telas ficam atrás de login. As
// credenciais são as mesmas do Playwright, e vêm do ambiente, nunca do código.
// =============================================================================

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(RAIZ, '.env.local') })

// Porta própria: 3000 costuma estar ocupada, e o `next dev` pula para a próxima
// livre sem avisar quem espera numa URL fixa.
const PORTA = Number(process.env.PORTA_INSTANTANEO ?? 3100)
const BASE = `http://localhost:${PORTA}`
const SAIDA = path.join(RAIZ, 'Design_system', 'estado-atual.html')

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA

if (!URL_SUPABASE || !CHAVE) {
  console.error('faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}
if (!EMAIL || !SENHA) {
  console.error(
    'defina E2E_EMAIL e E2E_SENHA — as sete telas exigem sessão. Ver e2e/README.md.',
  )
  process.exit(1)
}

/** As sete da lateral, na ordem em que aparecem nela. */
const TELAS = [
  ['/consulta', 'Consulta', 'chat, painel de fonte, dosimetria e histórico · a tela principal'],
  ['/jurisprudencia', 'Jurisprudência', 'entendimento consolidado + precedentes do STJ'],
  ['/dosimetria', 'Dosimetria', 'cálculo trifásico ao vivo, sem banco'],
  ['/vademecum', 'Vade Mecum', 'grade de ramos + leitor · 75 legislações, lidas do disco'],
  ['/clientes', 'Clientes', 'cadastro do escritório · RLS por sessão'],
  ['/fontes', 'Fontes e atualizações', 'vigília sobre a data de corte'],
  ['/configuracoes', 'Configurações', 'perfil, garantias, fontes, aparência, segurança'],
]

// --- servidor -----------------------------------------------------------------

async function noAr() {
  try {
    await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

async function sobeServidor() {
  if (await noAr()) {
    console.log(`· reusando o servidor já em ${BASE}`)
    return null
  }
  console.log(`· subindo o next dev em ${PORTA}…`)
  const p = spawn('npm', ['run', 'dev', '--', '-p', String(PORTA)], {
    cwd: RAIZ,
    shell: true,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await noAr()) return p
  }
  p.kill()
  throw new Error('o servidor não subiu em 60s')
}

// --- sessão -------------------------------------------------------------------

/**
 * O cookie no formato do `@supabase/ssr`: a sessão inteira em base64url, com
 * prefixo, fatiada em 3180 caracteres. Montá-lo à mão evita subir um navegador
 * só para capturar HTML de servidor.
 */
async function cookieDeSessao() {
  const r = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CHAVE, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const s = await r.json()
  if (!s.access_token) throw new Error(`login falhou: ${s.error_description ?? s.msg ?? r.status}`)

  const ref = new URL(URL_SUPABASE).hostname.split('.')[0]
  const valor = 'base64-' + Buffer.from(JSON.stringify(s), 'utf8').toString('base64url')
  const partes = []
  for (let i = 0; i < valor.length; i += 3180) partes.push(valor.slice(i, i + 3180))
  return partes.length === 1
    ? `sb-${ref}-auth-token=${partes[0]}`
    : partes.map((p, i) => `sb-${ref}-auth-token.${i}=${p}`).join('; ')
}

// --- captura ------------------------------------------------------------------

const BRIEF = `
<section class="brief">
  <h1>TOGA v2 — estado atual das sete telas</h1>
  <p class="sub">
    Captura do HTML que o servidor de fato produz, com o CSS compilado do projeto.
    Não é o protótipo de origem: é o que está no ar hoje, depois das divergências
    deliberadas em relação ao desenho original.
  </p>

  <h2>Três coisas que não são negociáveis por estética</h2>
  <ol>
    <li>
      <b>A data de corte é visível o tempo todo.</b> O corpus é uma fotografia de
      28/02/2025, e citar redação revogada em peça criminal é grave. Ela aparece na
      lateral, na caixa de consulta, ao lado de cada dispositivo e no rodapé do
      <code>.docx</code> — inclusive na lateral recolhida, onde vira o ponto vivo com a
      data no <code>title</code>. Recolher menu não é motivo para ela sumir.
    </li>
    <li>
      <b>Nada de dado inventado para encher tela.</b> Sem contagem plausível, sem gráfico
      de série que não existe, sem "última sincronização". Onde há espaço vazio, quase
      sempre é recusa: o protótipo original desenhava 1,2 milhão de documentos, 214
      diplomas e um comparador de redações lado a lado, e os três foram removidos porque
      o produto não tem isso. <b>Preencher esse vazio é o erro mais fácil de cometer aqui.</b>
    </li>
    <li>
      <b>Movimento só onde algo mudou de verdade.</b> Barra de progresso não chega a 100%
      antes do resultado; esqueleto só onde a espera existe; nenhum botão finge trabalho.
      <code>prefers-reduced-motion</code> desliga tudo, e a preferência das Configurações
      também.
    </li>
  </ol>

  <h2>A linguagem, em uma linha cada</h2>
  <ul>
    <li><b>Duas famílias, dois papéis.</b> Inter Tight é a voz da interface (rótulo, botão, metadado); Source Serif 4 é a voz do texto jurídico (lei, ementa, súmula, resposta). A divisão separa, sem moldura, o que o produto <i>afirma</i> do que o produto <i>cita</i>.</li>
    <li><b>Tema claro.</b> Fundo <code>#f7f8fa</code>, lateral <code>#f1f2f6</code>, acento roxo <code>#3a3960</code>.</li>
    <li><b>Lateral de largura fixa</b>, 246px, ou 64px recolhida. São dois valores fixos, não uma lateral fluida: os painéis (420px no chat, 352px na dosimetria, 404px no Vade Mecum) foram medidos contra os 246.</li>
    <li><b>Cor mora no <code>@theme</code> de <code>src/app/globals.css</code></b>, uma vez só. Cor que puder ser classe tem que ser classe.</li>
  </ul>

  <h2>O que esta captura não mostra</h2>
  <p>
    É estática: sem hover, sem foco, sem os estados de carregamento, sem a digitação
    token a token da resposta e sem as animações de entrada. As telas aparecem no estado
    em que abrem, com os dados reais do banco. Larguras fixadas em 1440px, que é a medida
    do desenho.
  </p>
</section>`

const CASCA = `
  /* Casca da própria captura — nada disto é do produto. */
  body { margin: 0; background: #e8eaef; }
  .brief, .rotulo { font-family: 'Inter Tight', system-ui, sans-serif; }
  .brief { max-width: 900px; margin: 0 auto; padding: 56px 32px 8px; color: #22252c; }
  .brief h1 { font-size: 28px; margin: 0 0 8px; letter-spacing: -.01em; }
  .brief .sub { color: #5b6068; font-size: 15px; line-height: 1.6; margin: 0 0 32px; }
  .brief h2 { font-size: 15px; margin: 28px 0 10px; }
  .brief li { font-size: 14px; line-height: 1.65; margin-bottom: 10px; color: #4c515c; }
  .brief code { background: #dfe2e8; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
  .tela { margin: 40px auto 0; max-width: 1440px; }
  .rotulo { padding: 0 4px 10px; }
  .rotulo b { font-size: 15px; color: #16181d; }
  .rotulo span { font-size: 13px; color: #6b7079; margin-left: 10px; }
  .rotulo code { font-size: 12px; color: #8b8f9a; }
  .moldura {
    width: 1440px; height: 940px; overflow: hidden;
    border-radius: 14px; background: #f7f8fa;
    box-shadow: 0 1px 2px rgb(18 20 30 / .08), 0 24px 60px -30px rgb(18 20 30 / .5);
  }
  .moldura > div { width: 1440px; height: 940px; position: relative; }

  /* Duas fugas da moldura, que só aparecem numa captura como esta.

     "h-dvh" é a altura da JANELA, não a do quadro: a casca do app mede 100dvh e
     vazaria para fora dos 940px.

     "fixed" idem. A lateral é fixed abaixo de lg e lg:static acima, mas a media
     query olha a largura da JANELA, não a da moldura — numa janela estreita as
     sete laterais viriam para cima da página, empilhadas. Virar absolute ancora
     cada uma no próprio quadro. */
  .moldura .h-dvh, .moldura .min-h-dvh { height: 940px !important; min-height: 940px !important; }
  .moldura .fixed { position: absolute !important; }
  footer { text-align: center; padding: 48px 0 64px; color: #8b8f9a; font-size: 12.5px; }`

async function main() {
  const servidor = await sobeServidor()
  try {
    const cookie = await cookieDeSessao()
    const pega = (c) => fetch(`${BASE}${c}`, { headers: { cookie } })

    const primeiro = await (await pega('/consulta')).text()
    if (primeiro.length < 5000) throw new Error('a sessão não pegou: /consulta veio vazia')

    let css = ''
    const folhas = [...primeiro.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
    for (const [, href] of folhas) {
      css += (await (await fetch(href.startsWith('http') ? href : `${BASE}${href}`)).text()) + '\n'
    }
    console.log(`· css: ${folhas.length} folha(s), ${(css.length / 1024).toFixed(0)} KB`)

    const secoes = []
    for (const [rota, nome, nota] of TELAS) {
      const html = await (await pega(rota)).text()
      // Fora tudo que é runtime: o que sobra é marcação e classe, que é o que
      // interessa a um passe de design — e o que mantém o arquivo abrível.
      const corpo = (html.split(/<body[^>]*>/)[1]?.split('</body>')[0] ?? '')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<template[\s\S]*?<\/template>/g, '')
        .replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/g, '')
      secoes.push({ rota, nome, nota, corpo })
      console.log(`  ${rota.padEnd(18)} ${(corpo.length / 1024).toFixed(0)} KB`)
    }

    const doc = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>TOGA v2 — estado atual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
${css}
</style>
<style>${CASCA}
</style>
</head>
<body>
${BRIEF}
${secoes
  .map(
    (s) => `
<section class="tela">
  <div class="rotulo"><b>${s.nome}</b><span>${s.nota}</span> <code>${s.rota}</code></div>
  <div class="moldura"><div>${s.corpo}</div></div>
</section>`,
  )
  .join('\n')}
<footer>Captura de ${new Date().toISOString().slice(0, 10)} · dados reais do banco · 1440×940 · gerado por <code>npm run instantaneo</code></footer>
</body>
</html>`

    fs.writeFileSync(SAIDA, doc)
    console.log(`\n→ ${path.relative(RAIZ, SAIDA)}  ${(doc.length / 1024).toFixed(0)} KB`)
  } finally {
    if (servidor) servidor.kill()
  }
}

await main()
