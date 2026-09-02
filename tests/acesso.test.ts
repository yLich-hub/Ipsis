// =============================================================================
// tests/acesso.test.ts — as regras de acesso que erram em silêncio
//
// As três coisas trancadas aqui têm o mesmo modo de falha: nada quebra, nada
// avisa, e a tela continua parecendo certa enquanto a porta está aberta. É a
// mesma razão de `tests/vigilia.test.ts` existir para o filtro da vigília.
//
//   1. **O matcher do middleware.** Ele decide por EXTENSÃO do caminho, e num
//      segmento dinâmico é o chamador quem escolhe o fim do caminho. Antes do
//      conserto, `/api/peca/caso.txt` pulava o porteiro e `/api/peca/x` não —
//      diferença invisível em qualquer tela. O regex é copiado do arquivo e a
//      primeira asserção confere que continua sendo o mesmo texto: um teste que
//      valida uma cópia divergente não valida nada.
//
//   2. **A lista de rotas públicas.** Rota nova nasce fechada, e é fácil abrir
//      uma sem perceber ao mexer no arquivo. As duas que gastam dinheiro ou
//      geram peça têm de continuar fora dela.
//
//   3. **A normalização da chave do cache de embedding.** Ela decide quando
//      duas perguntas são a mesma. Frouxa demais, o cache devolve o vetor de
//      outra pergunta — e a busca responde sobre outro assunto sem erro nenhum.
//
// Offline e sem segredo, como as outras dez suítes.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { chaveDeEmbedding } from '../src/lib/busca/chave'
import { ehPublica, destinoSeguro } from '../src/lib/auth/rotas'

const raiz = resolve(import.meta.dirname, '..')

// -----------------------------------------------------------------------------
// 1. O matcher do middleware
// -----------------------------------------------------------------------------
const MATCHER =
  '/((?!_next/static|_next/image|favicon\\.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'

/** O middleware roda para este caminho? */
const rodaMiddleware = (caminho: string) => new RegExp(`^${MATCHER}$`).test(caminho)

describe('matcher do middleware', () => {
  it('é literalmente o mesmo que está em src/middleware.ts', () => {
    const fonte = readFileSync(resolve(raiz, 'src/middleware.ts'), 'utf8')
    // No arquivo o regex vive dentro de uma string TS, então as barras estão
    // escapadas duas vezes. É essa forma que se procura.
    expect(fonte).toContain(MATCHER.replaceAll('\\', '\\\\'))
  })

  it('nunca pula uma rota de API, mesmo quando o caminho termina em extensão', () => {
    // Este é o achado. `/api/peca/[casoId]` recebe o id do chamador, e o id
    // podia terminar em `.txt` — e aí o porteiro não rodava.
    for (const ext of ['txt', 'xml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico']) {
      expect(rodaMiddleware(`/api/peca/caso.${ext}`), `.${ext}`).toBe(true)
    }
    expect(rodaMiddleware('/api/peca/caso_flagrante_via_publica')).toBe(true)
    expect(rodaMiddleware('/api/consulta/aovivo')).toBe(true)
    expect(rodaMiddleware('/api/vigilia/coletar')).toBe(true)
    expect(rodaMiddleware('/api/health')).toBe(true)
  })

  it('continua pulando o estático, que é o motivo de a exclusão existir', () => {
    expect(rodaMiddleware('/_next/static/chunks/main.js')).toBe(false)
    expect(rodaMiddleware('/favicon.ico')).toBe(false)
    expect(rodaMiddleware('/logo.svg')).toBe(false)
    expect(rodaMiddleware('/sitemap.xml')).toBe(false)
  })

  it('roda para as telas, que é onde a decisão de sessão acontece', () => {
    for (const p of ['/', '/consulta', '/clientes', '/configuracoes', '/pecas', '/opengraph-image']) {
      expect(rodaMiddleware(p), p).toBe(true)
    }
  })
})

// -----------------------------------------------------------------------------
// 2. A lista de rotas públicas
// -----------------------------------------------------------------------------
describe('rotas públicas', () => {
  it('não deixa passar o que gasta modelo ou gera peça', () => {
    expect(ehPublica('/api/consulta/aovivo')).toBe(false)
    expect(ehPublica('/api/peca/caso_flagrante_via_publica')).toBe(false)
    expect(ehPublica('/clientes')).toBe(false)
    expect(ehPublica('/configuracoes')).toBe(false)
    expect(ehPublica('/consulta')).toBe(false)
  })

  it('mantém públicas as quatro que precisam ser, e só elas', () => {
    // `/api/busca` e `/api/vigilia/coletar` são públicas por decisão escrita —
    // a segunda troca a sessão por `Authorization: Bearer $CRON_SECRET`.
    for (const p of ['/login', '/cadastro', '/esqueci-senha', '/redefinir-senha']) {
      expect(ehPublica(p), p).toBe(true)
    }
    expect(ehPublica('/api/health')).toBe(true)
    expect(ehPublica('/api/busca')).toBe(true)
    expect(ehPublica('/api/vigilia/coletar')).toBe(true)
    expect(ehPublica('/opengraph-image')).toBe(true)
  })

  it('não confunde prefixo com rota: /api/buscar não é /api/busca', () => {
    expect(ehPublica('/api/buscar')).toBe(false)
    expect(ehPublica('/loginfalso')).toBe(false)
  })

  it('o destino pós-login continua recusando URL absoluta', () => {
    expect(destinoSeguro('https://malicioso.exemplo')).toBe('/consulta')
    expect(destinoSeguro('//malicioso.exemplo')).toBe('/consulta')
    expect(destinoSeguro('/clientes')).toBe('/clientes')
  })
})

// -----------------------------------------------------------------------------
// 3. A chave do cache de embedding
// -----------------------------------------------------------------------------
describe('chave do cache de embedding', () => {
  it('junta o que é a mesma pergunta escrita de outro jeito', () => {
    const alvo = chaveDeEmbedding('tráfico privilegiado')
    expect(chaveDeEmbedding('Tráfico Privilegiado')).toBe(alvo)
    expect(chaveDeEmbedding('  trafico   privilegiado  ')).toBe(alvo)
    expect(chaveDeEmbedding('TRAFICO PRIVILEGIADO')).toBe(alvo)
  })

  it('separa o que é pergunta diferente', () => {
    // O risco do cache é este: colapsar duas perguntas distintas devolve o vetor
    // de uma na busca da outra, e a tela responde sobre o crime errado sem erro.
    const distintas = [
      'tráfico privilegiado',
      'tráfico de pessoas',
      'associação para o tráfico',
      'porte de droga para consumo',
      'busca domiciliar sem mandado',
    ].map(chaveDeEmbedding)
    expect(new Set(distintas).size).toBe(distintas.length)
  })

  it('não perde a pontuação que muda o sentido', () => {
    expect(chaveDeEmbedding('o réu é reincidente')).not.toBe(
      chaveDeEmbedding('o réu não é reincidente'),
    )
  })
})
