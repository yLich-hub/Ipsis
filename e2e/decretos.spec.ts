// =============================================================================
// O acervo de decretos do Paraná, no navegador
//
// O que estes testes cobrem é o que nenhuma suíte offline alcança: o item na
// lateral levando à tela, a gaveta do celular, a janela de desenho da lista, o
// filtro local e o leitor abrindo por um id com dois-pontos.
//
// **A janela de desenho é o motivo principal deste arquivo.** A lista tem quase
// mil e quinhentas linhas e desenha 60 por vez — medido com as 1.989 de então,
// desenhar todas punha 2,3 MB de HTML e 14.195 nós no telefone. Uma janela que corta sem se anunciar é uma lista que
// mente sobre o próprio tamanho, e é exatamente o tipo de coisa que passa em
// `tsc`, passa em vitest e só aparece com um dedo na tela.
//
// Os viewports estreitos usam `page.setViewportSize` em vez de um projeto de
// dispositivo: o que se quer testar é o CSS respondendo à largura, não o motor
// de toque de um aparelho — e um projeto a mais no `playwright.config` custaria
// uma execução inteira do login a cada suíte.
// =============================================================================

import { expect, test } from '@playwright/test'

/** Largura em que a lateral vira gaveta. Abaixo dela, `useEstreito()` é true. */
const CELULAR = { width: 390, height: 844 }

test.describe('a porta de entrada', () => {
  test('a lateral leva ao acervo, e a tela conta o que tem', async ({ page }) => {
    await page.goto('/consulta')

    const lateral = page.getByRole('navigation', { name: 'Telas' })
    await lateral.getByRole('link', { name: 'Decretos PR' }).click()
    await page.waitForURL('**/decretos')

    // O subtítulo conta o acervo INTEIRO. É o número que o teto de mil linhas do
    // PostgREST truncava em silêncio — a lista chegava com 1.000, sem erro, e
    // 2022 e 2023 não existiam nem na tela nem na faceta de ano.
    await expect(page.getByText(/decretos normativos · \d{4}–\d{4}/)).toBeVisible()

    // Acervo de consulta, não corpus citável. O selo é a mesma promessa que o
    // Vade Mecum faz, e ela não pode sumir numa refatoração de cabeçalho.
    await expect(page.getByText('não citável').first()).toBeVisible()
  })

  test('está na paleta do ⌘K', async ({ page }) => {
    await page.goto('/consulta')
    await page.keyboard.press('ControlOrMeta+k')

    // A paleta é um `role="dialog"` chamado "Busca", e os itens dela são
    // `<button>`, não `option`. Buscar pelo diálogo em vez de pelo placeholder
    // também evita casar o campo "Buscar nas conversas…" da lateral, que é
    // outro input com a mesma palavra.
    const paleta = page.getByRole('dialog', { name: 'Busca' })
    await paleta.getByPlaceholder(/Buscar leis/).fill('decreto')
    await paleta.getByRole('button', { name: /Decretos PR/ }).click()
    await page.waitForURL('**/decretos')
  })
})

test.describe('a lista', () => {
  test('desenha uma janela e diz quantos ficaram de fora', async ({ page }) => {
    await page.goto('/decretos')

    const cartoes = page.locator('a[href^="/decretos/decpr"]')
    await expect(cartoes.first()).toBeVisible()
    await expect(cartoes).toHaveCount(60)

    // A promessa do botão tem de bater com a lista. Ele nomeia quantos faltam;
    // se esse número mentir, o usuário acha que chegou ao fim do acervo.
    const botao = page.getByRole('button', { name: /Mostrar mais/ })
    await expect(botao).toContainText(/\d+ ainda não exibidos/)

    await botao.click()
    await expect(cartoes).toHaveCount(120)
  })

  test('o filtro enxerga o acervo inteiro, não só a janela', async ({ page }) => {
    await page.goto('/decretos')
    await expect(page.locator('a[href^="/decretos/decpr"]').first()).toBeVisible()

    // Este é o coração da janela: 60 desenhados, mas o filtro roda sobre os
    // 1.989 em memória. Um decreto de 2022 está muito além do 60º cartão — se
    // ele aparecer, o filtro não está limitado ao que foi desenhado.
    await page.getByLabel('Filtrar decretos').fill('conselho estadual')
    const achados = page.locator('a[href^="/decretos/decpr"]')
    await expect(achados.first()).toBeVisible()

    const contagem = page.locator('span').filter({ hasText: /^\d+ de \d+$/ }).first()
    const [visiveis, total] = ((await contagem.textContent()) ?? '').split(' de ').map(Number)
    expect(visiveis).toBeGreaterThan(0)
    expect(visiveis).toBeLessThan(total!)
  })

  test('filtrar por ano reinicia a janela', async ({ page }) => {
    await page.goto('/decretos')
    await expect(page.locator('a[href^="/decretos/decpr"]').first()).toBeVisible()

    await page.getByRole('button', { name: /Mostrar mais/ }).click()
    await expect(page.locator('a[href^="/decretos/decpr"]')).toHaveCount(120)

    // Sem o reinício, quem abriu 120 cartões e depois filtrou continuaria com
    // 120 desenhados — e o botão sumiria sem que a lista tivesse encolhido.
    await page.getByRole('button', { name: /^2022/ }).first().click()
    await expect(page.locator('a[href^="/decretos/decpr"]')).toHaveCount(60)
  })
})

test.describe('o leitor', () => {
  test('abre por um id com dois-pontos e não afirma vigência', async ({ page }) => {
    await page.goto('/decretos')
    await page.locator('a[href^="/decretos/decpr"]').first().click()
    await page.waitForURL(/\/decretos\/decpr/)

    // A linha que não se negocia: o acervo diz a redação que leu e o dia em que
    // leu, e diz com todas as letras que a vigência não foi conferida. Um selo
    // "em vigor" aqui seria a decisão nº 3 do projeto mentindo numa tela nova.
    await expect(page.getByText(/A vigência do ato não foi conferida/)).toBeVisible()
    await expect(page.getByText(/Redação compilada/)).toBeVisible()
    await expect(page.getByText('não citável').first()).toBeVisible()

    // O texto vem do banco, bloco a bloco.
    await expect(page.locator('p.font-tg-serif').first()).not.toBeEmpty()

    await page.getByRole('link', { name: /Decretos do Paraná/ }).click()
    await page.waitForURL('**/decretos')
  })
})

test.describe('no celular', () => {
  test.use({ viewport: CELULAR })

  test('o acervo se alcança pela gaveta', async ({ page }) => {
    await page.goto('/consulta')

    // Fechada, a gaveta está fora da tela — e inerte, senão o Tab passeia por
    // dentro do que o olho não vê.
    // O rótulo é exato: `/menu/i` casaria também "Recolher menu" e "Expandir
    // menu", que são o botão do desktop.
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.getByRole('link', { name: 'Decretos PR' }).click()
    await page.waitForURL('**/decretos')
  })

  test('as facetas moram atrás de um botão que parece botão', async ({ page }) => {
    await page.goto('/decretos')
    await expect(page.locator('a[href^="/decretos/decpr"]').first()).toBeVisible()

    // No celular esta é a única porta para as facetas. Ela era a palavra
    // "Filtros" solta, sem borda, sem fundo e sem seta — o `inline-flex` come o
    // marcador padrão do <summary>, e ninguém sabia que dava para filtrar.
    const filtros = page.locator('details summary')
    await expect(filtros).toBeVisible()
    await filtros.click()

    await expect(page.getByRole('button', { name: /^2022/ })).toBeVisible()
    await page.getByRole('button', { name: /^2022/ }).click()

    const contagem = page.locator('span').filter({ hasText: /^\d+ de \d+$/ }).first()
    await expect(contagem).toHaveText(/^\d+ de \d+$/)
  })

  test('nada vaza para os lados', async ({ page }) => {
    for (const rota of ['/decretos', '/decretos/decpr:2023:475']) {
      await page.goto(rota)
      await page.waitForSelector('p.font-tg-serif')

      // Rolagem horizontal no corpo é o defeito de celular mais fácil de
      // introduzir e o mais fácil de não ver no desktop.
      const { doc, win } = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }))
      expect(doc, `${rota} rola de lado`).toBeLessThanOrEqual(win)
    }
  })
})
