// =============================================================================
// A sessão dos testes, criada pela tela de login de verdade.
//
// Poderia ser um cookie montado à mão a partir de um token pedido ao Supabase
// Auth por HTTP — seria mais rápido e não testaria nada. Passando pelo
// formulário, o caminho de entrada inteiro é exercitado a cada execução: o
// componente cliente, o `signInWithPassword`, o middleware escrevendo os cookies
// na resposta, e o desvio para `/consulta`.
//
// A conta vem do ambiente, e não do código. Sem `E2E_EMAIL`/`E2E_SENHA` a suíte
// para e diz o que falta, em vez de tentar entrar com credencial inventada e
// falhar com "e-mail ou senha incorretos", que mandaria procurar o defeito no
// lugar errado.
// =============================================================================

import { expect, test as setup } from '@playwright/test'

const ARQUIVO = 'e2e/.sessao.json'

setup('entra pelo formulário e guarda a sessão', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const senha = process.env.E2E_SENHA

  expect(
    email && senha,
    'defina E2E_EMAIL e E2E_SENHA no ambiente — ver e2e/README.md',
  ).toBeTruthy()

  await page.goto('/login')

  // A tela de entrada carrega a marca e a data de corte. Se a segunda sumir, é a
  // decisão nº 3 furando na primeira tela que alguém vê.
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

  await page.getByLabel('E-mail').fill(email!)
  await page.getByLabel('Senha').fill(senha!)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // O destino padrão de quem entra é `/consulta` — `DESTINO_PADRAO`, em
  // `lib/auth/rotas.ts`.
  await page.waitForURL('**/consulta')
  await expect(page.getByRole('navigation', { name: 'Telas' })).toBeVisible()

  await page.context().storageState({ path: ARQUIVO })
})
