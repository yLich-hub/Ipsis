// =============================================================================
// Playwright — o que só acontece no navegador
//
// As nove suítes do vitest rodam offline e cobrem função pura; os testes de tela
// que existiam antes disto liam o HTML do servidor por `fetch`, e HTML de
// servidor não tem `localStorage`, não tem `⌘B` e não tem clique. Tudo o que o
// TOGA v2 faz de mais característico — a lateral que recolhe, a preferência que
// atravessa navegação, a estrela que enche a faixa de favoritas, o vetor que
// muda a pena na hora — era exatamente o que nenhum teste alcançava.
//
// **Estes testes falam com o Supabase de verdade**, porque a sessão é cookie
// assinado pelo servidor de Auth e não há como forjá-la offline. É a diferença
// deles para o resto da suíte, e é por isso que eles não entram no
// `npm run verificar`: quem mexe só na interface não deve precisar de segredo
// para rodar o que roda sem rede.
//
//   npm run e2e            # os testes
//   npm run e2e -- --ui    # o modo interativo, para depurar um seletor
//
// A porta é 3100 e é fixa de propósito. `next dev` pula para a próxima porta
// livre quando a 3000 está ocupada, e um `baseURL` que aponta para uma porta que
// o servidor não pegou falha com "connection refused" — erro que não diz nada
// sobre o teste.
// =============================================================================

import { defineConfig, devices } from '@playwright/test'

const PORTA = 3100

export default defineConfig({
  testDir: './e2e',
  // Antes de qualquer teste: o `.next` está servindo JavaScript? Um `next build`
  // entre duas execuções deixa o servidor de desenvolvimento sem os chunks, o
  // React não hidrata, e a suíte inteira falha falando de seletor e de timeout.
  // Detecta e diz o que fazer — não conserta, porque o conserto (apagar o
  // `.next` sempre) cobraria recompilação em toda execução. Ver o arquivo.
  globalSetup: './e2e/confere-build.ts',
  // Um trabalhador só: os testes compartilham a mesma conta e as mesmas linhas
  // no banco (a agenda de clientes, o histórico). Paralelizar faria um teste
  // apagar a linha que o outro acabou de criar.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: 'pt-BR',
    // Rastro só do que falhou: o zip de trace é pesado e ninguém abre o do teste
    // que passou.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // A sessão é criada uma vez, pela tela de login de verdade, e reusada. Além
    // de economizar um login por arquivo, é o que faz o formulário de entrada
    // ser exercitado a cada execução em vez de nunca.
    { name: 'entrada', testMatch: /entrada\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.sessao.json' },
      dependencies: ['entrada'],
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
