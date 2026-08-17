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
// A porta é fixa de propósito. `next dev` pula para a próxima porta livre quando
// a 3000 está ocupada, e um `baseURL` que aponta para uma porta que o servidor
// não pegou falha com "connection refused" — erro que não diz nada sobre o teste.
//
// **`PORTA_E2E` existe porque "fixa" + `reuseExistingServer` mente quando há mais
// de uma cópia do repositório.** Com dois `git worktree`, um servidor da outra
// pasta já ouvindo na 3100 é reaproveitado sem aviso, e a suíte passa a exercitar
// código que não é o desta árvore. Custou uma investigação inteira: o teste dizia
// que um botão novo não existia, e ele existia — o servidor é que era outro. Quem
// roda em worktree paralelo define `PORTA_E2E` e volta a testar o próprio código.
// =============================================================================

import { defineConfig, devices } from '@playwright/test'

const PORTA = Number(process.env.PORTA_E2E ?? 3100)

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
  // Os prazos são largos porque o servidor é o `next dev`, que compila cada rota
  // na PRIMEIRA visita. Numa suíte com `.next` quente nada chega perto disto — a
  // execução inteira leva ~40 s. Mas na primeira execução depois de a pasta ser
  // apagada, uma rota pesada sozinha come dezenas de segundos, e com 30 s/10 s a
  // suíte falhava em quatro testes por motivo que não era o deles: dois estouram
  // o prazo do teste e dois clicam antes de o React hidratar, o que não vira
  // erro, vira asserção que não confere.
  //
  // O prazo generoso não esconde defeito: teste que trava de verdade continua
  // falhando, só que 90 s depois em vez de 30. Diagnóstico enganoso custa mais
  // que um minuto de espera — e é justo o que o `globalSetup` acima existe para
  // não deixar acontecer de novo.
  timeout: 90_000,
  expect: { timeout: 20_000 },

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
