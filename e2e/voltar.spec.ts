// =============================================================================
// O voltar do topo — comportamento que só o navegador prova.
//
// `usePodeVoltar` compara o caminho atual com aquele em que a casca montou, e no
// primeiro render os dois são iguais por construção: nenhum HTML de servidor
// mostra este botão. Ou se exercita uma navegação de verdade, ou não se sabe se
// ele funciona.
//
// A regra que estas asserções trancam é a que impede o pior defeito possível
// aqui: um voltar que leva o usuário PARA FORA do produto. Ele não aparece na
// tela de entrada, e some quando se volta a ela.
// =============================================================================

import { expect, test } from '@playwright/test'

test('o voltar aparece ao navegar e devolve à tela anterior', async ({ page }) => {
  await page.goto('/consulta')
  const voltar = page.getByRole('button', { name: 'Voltar' })

  // Entrada da sessão: não há navegação interna atrás, então não há botão.
  await expect(voltar).toHaveCount(0)

  await page.getByRole('link', { name: /Vade Mecum/ }).first().click()
  await expect(page).toHaveURL(/\/vademecum/)
  await expect(voltar).toBeVisible()

  await voltar.click()
  await expect(page).toHaveURL(/\/consulta/)
  await expect(voltar).toHaveCount(0)
})

test('o voltar atravessa duas telas e não escapa do produto', async ({ page }) => {
  await page.goto('/consulta')
  await page.getByRole('link', { name: /Jurisprudência/ }).first().click()
  await expect(page).toHaveURL(/\/jurisprudencia/)

  await page.getByRole('link', { name: /Dosimetria/ }).first().click()
  await expect(page).toHaveURL(/\/dosimetria/)

  const voltar = page.getByRole('button', { name: 'Voltar' })
  await voltar.click()
  await expect(page).toHaveURL(/\/jurisprudencia/)

  // Ainda dentro do produto, e ainda com saída — a de volta à entrada.
  await expect(voltar).toBeVisible()
  await voltar.click()
  await expect(page).toHaveURL(/\/consulta/)
})
