// =============================================================================
// A checagem que roda antes de tudo: o `.next` serve JavaScript?
//
// `next build` e `next dev` compartilham a pasta `.next`, e a saída de produção
// deixa o servidor de desenvolvimento sem os chunks que ele espera. O sintoma é
// cruel: a página responde 200, o HTML do servidor chega inteiro e a tela fica
// bonita — mas `main-app.js` volta 404, o React nunca hidrata, e nenhum clique
// vira estado. A suíte falha em cinco telas diferentes, com dez mensagens que
// falam de seletor e de timeout, e nenhuma que fale da causa.
//
// Isso já custou duas execuções inteiras e uma conclusão errada ("a suíte está
// quebrada", quando o quebrado era o `.next`). Vinte linhas aqui trocam esse
// labirinto por uma frase.
//
// **Não conserta nada de propósito.** Apagar o `.next` na marra faria toda
// execução recompilar cada rota, e a suíte passaria de 43 segundos a alguns
// minutos — pagando o preço do caso raro sempre. Detectar custa uma requisição.
// =============================================================================

import type { FullConfig } from '@playwright/test'

/** O que o navegador precisa buscar para hidratar, extraído do HTML de verdade. */
const SCRIPT_RE = /<script[^>]+src="([^"]*\/_next\/static\/[^"]+)"/g

const RECADO = `
  O .next está servindo uma árvore que o next dev não reconhece: o HTML chega,
  mas o JavaScript da página volta 404. Nada hidrata, e todo teste de interação
  falha por motivo que não é o dele.

  Acontece quando "next build" roda entre duas execuções da suíte — produção e
  desenvolvimento dividem a mesma pasta.

  Conserto:  rm -rf .next   (PowerShell: Remove-Item .next -Recurse -Force)
`

export default async function confereBuild(config: FullConfig) {
  const base = config.projects[0]?.use?.baseURL ?? 'http://localhost:3100'

  // Uma tela pública: a checagem não pode depender de haver sessão, porque ela
  // roda antes do projeto que faz login.
  const pagina = await fetch(`${base}/login`)
  const html = await pagina.text()

  const scripts = [...html.matchAll(SCRIPT_RE)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s))
  if (scripts.length === 0) return // sem script no HTML não há o que conferir

  // Só os primeiros: se o `.next` está podre, ele está podre para todos, e cada
  // requisição a mais é tempo tirado de quem só queria rodar os testes.
  const amostra = scripts.slice(0, 4)
  const quebrados: string[] = []

  await Promise.all(
    amostra.map(async (src) => {
      const url = src.startsWith('http') ? src : `${base}${src}`
      try {
        const r = await fetch(url)
        if (!r.ok) quebrados.push(`${r.status} ${src}`)
      } catch (e) {
        quebrados.push(`${(e as Error).message} ${src}`)
      }
    }),
  )

  if (quebrados.length > 0) {
    throw new Error(`${RECADO}\n  Não carregaram:\n    ${quebrados.join('\n    ')}\n`)
  }
}
