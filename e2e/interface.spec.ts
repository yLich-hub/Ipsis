// =============================================================================
// O que só existe no navegador
//
// Cada bloco aqui cobre um comportamento que nenhum teste anterior alcançava,
// porque todos liam HTML de servidor: `localStorage` não existe lá, `⌘B` não
// existe lá, e clique não existe lá. A escolha do que testar não foi "cobrir a
// tela" — foi pegar o que **muda de estado e persiste**, que é onde defeito de
// interface se esconde sem quebrar build nem tipo.
// =============================================================================

import { expect, test } from '@playwright/test'

test.describe('lateral', () => {
  test('recolhe pelo botão e a escolha atravessa a navegação', async ({ page }) => {
    await page.goto('/consulta')

    const lateral = page.getByRole('navigation', { name: 'Telas' })
    await expect(lateral.getByText('Consulta em chat')).toBeVisible()

    await page.getByRole('button', { name: 'Recolher menu' }).click()

    // Na trilha os rótulos somem, mas os alvos continuam lá — é `lg:hidden` no
    // texto, não desmontagem do link. Testar pelo texto visível é o que
    // distingue "recolheu" de "sumiu".
    await expect(lateral.getByText('Consulta em chat')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()

    // A decisão nº 3 não se recolhe junto: na trilha a data vira o ponto vivo,
    // com a data no `title`.
    await expect(page.locator('[title*="Base conferida"]')).toBeVisible()

    // Persistência: outra tela, mesma preferência.
    await page.getByRole('link', { name: 'Dosimetria' }).click()
    await page.waitForURL('**/dosimetria')
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()

    await page.getByRole('button', { name: 'Expandir menu' }).click()
    await expect(lateral.getByText('Consulta em chat')).toBeVisible()
  })

  test('⌘B faz o mesmo que o botão', async ({ page }) => {
    await page.goto('/consulta')
    const lateral = page.getByRole('navigation', { name: 'Telas' })

    await page.keyboard.press('ControlOrMeta+b')
    await expect(lateral.getByText('Consulta em chat')).toBeHidden()

    await page.keyboard.press('ControlOrMeta+b')
    await expect(lateral.getByText('Consulta em chat')).toBeVisible()
  })
})

test.describe('preferências', () => {
  test('“reduzir movimento” marca o <html> e sobrevive ao recarregamento', async ({ page }) => {
    await page.goto('/configuracoes')
    await page.getByRole('button', { name: /Aparência/ }).click()

    const html = page.locator('html')
    await expect(html).not.toHaveAttribute('data-movimento', 'reduzido')

    await page.getByRole('button', { name: /Reduzir movimento/ }).click()
    await expect(html).toHaveAttribute('data-movimento', 'reduzido')

    await page.reload()
    await expect(html).toHaveAttribute('data-movimento', 'reduzido')

    // Devolve ao padrão: os testes compartilham o mesmo navegador e o mesmo
    // `localStorage`, e deixar o movimento desligado mudaria o que os outros
    // veem.
    await page.getByRole('button', { name: /Aparência/ }).click()
    await page.getByRole('button', { name: /Reduzir movimento/ }).click()
    await expect(html).not.toHaveAttribute('data-movimento', 'reduzido')
  })

  test('o interruptor da lateral e o ⌘B são a mesma preferência', async ({ page }) => {
    await page.goto('/configuracoes')
    await page.getByRole('button', { name: /Aparência/ }).click()

    // A Casca e a tela de Configurações são árvores diferentes; é o evento
    // `toga:preferencias` que faz uma reagir à outra sem recarregar. Sem ele,
    // este clique só apareceria na próxima navegação.
    await page.getByRole('button', { name: /Lateral recolhida/ }).click()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()

    await page.getByRole('button', { name: /Lateral recolhida/ }).click()
    await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible()
  })
})

test.describe('favoritos do acervo', () => {
  test('estrelar uma lei faz a faixa aparecer no catálogo', async ({ page }) => {
    // A faixa `ListaFavoritas` existia pronta e não estava montada: a estrela
    // gravava no `localStorage` e nada lia de volta. Este teste é o que impede
    // a regressão de voltar em silêncio, porque ela não quebra tipo nem build.
    await page.goto('/vademecum')
    await expect(page.getByText('Favoritas')).toBeHidden()

    await page.goto('/vademecum/cf')
    // O nome acessível vem do `<span class="sr-only">`, não do `title`: quando o
    // botão tem conteúdo de texto, ele ganha do atributo no cálculo do nome.
    await page.getByRole('button', { name: 'Favoritar' }).click()
    await expect(page.getByRole('button', { name: 'Nos favoritos' })).toBeVisible()

    await page.goto('/vademecum')
    await expect(page.getByText('Favoritas')).toBeVisible()

    // Desfaz, e a faixa some junto.
    await page.goto('/vademecum/cf')
    await page.getByRole('button', { name: 'Nos favoritos' }).click()
    await page.goto('/vademecum')
    await expect(page.getByText('Favoritas')).toBeHidden()
  })
})

test.describe('dosimetria', () => {
  test('mexer num vetor muda a pena na hora', async ({ page }) => {
    await page.goto('/dosimetria')

    const pena = page.locator('p.tg-pipoca')
    const antes = await pena.textContent()

    // Culpabilidade desfavorável: um vetor negativo sobe a pena-base.
    // `Segmentado` é `radiogroup`/`radio`, não um grupo de botões — o componente
    // expõe estado de escolha, que é o certo para três opções exclusivas.
    await page
      .getByRole('radiogroup', { name: 'Culpabilidade' })
      .getByRole('radio', { name: 'Desfavorável' })
      .click()

    await expect(pena).not.toHaveText(antes ?? '')
    // Texto exato: a legenda da fração ("…por vetor negativo") também casa
    // /vetor negativo/, e o contador é o que interessa aqui.
    await expect(page.getByText('1 vetor negativo', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Zerar' }).click()
    await expect(pena).toHaveText(antes ?? '')
  })

  test('o memorial é copiado de verdade, e o rótulo volta quando a conta muda', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/dosimetria')

    await page.getByRole('button', { name: 'Copiar memorial de cálculo' }).click()
    await expect(page.getByRole('button', { name: 'Memorial copiado ✓' })).toBeVisible()

    // O conteúdo importa: o botão antigo fingia por 1400 ms e não produzia nada.
    const copiado = await page.evaluate(() => navigator.clipboard.readText())
    expect(copiado).toContain('MEMORIAL DE CÁLCULO DA PENA')
    expect(copiado).toContain('1ª FASE')
    expect(copiado).toContain('3ª FASE')
    expect(copiado).toContain('Calculadora, não parecer')

    // Mudar a conta invalida a cópia, e o rótulo tem de dizer isso.
    // `Segmentado` é `radiogroup`/`radio`, não um grupo de botões — o componente
    // expõe estado de escolha, que é o certo para três opções exclusivas.
    await page
      .getByRole('radiogroup', { name: 'Culpabilidade' })
      .getByRole('radio', { name: 'Desfavorável' })
      .click()
    await expect(page.getByRole('button', { name: 'Copiar memorial de cálculo' })).toBeVisible()
  })
})

test.describe('consulta', () => {
  test('uma pergunta devolve resposta com fontes rastreáveis', async ({ page }) => {
    await page.goto('/consulta')

    await page.getByLabel('Sua consulta').fill('tráfico privilegiado')
    await page.getByRole('button', { name: 'Enviar consulta' }).click()

    // O passo é real, não enfeite: sai do pipeline enquanto ele roda.
    await expect(page.getByText(/Fundindo rubrica, léxico e vetor/)).toBeVisible()

    // A fonte só aparece depois de a resposta fechar e passar na validação.
    await expect(page.getByText('art. 33, § 4º, da Lei nº 11.343/2006').first()).toBeVisible({
      timeout: 25_000,
    })

    // O aviso de origem é a única linha da tela que existe para não mentir, e
    // tem duas redações: a composta nega que houve modelo, a gerada nomeia o
    // modelo e afirma que não houve internet. Qual das duas aparece depende de
    // haver `OPENAI_API_KEY` no ambiente, então o teste aceita as duas — o que
    // ele não aceita é nenhuma.
    await expect(
      page.getByText(
        /Nenhum parágrafo acima foi escrito por modelo|A argumentação acima foi escrita/,
      ),
    ).toBeVisible()
  })

  test('a conversa entra no histórico da lateral', async ({ page }) => {
    await page.goto('/consulta')
    await page.getByLabel('Sua consulta').fill('dosimetria da pena')
    await page.getByRole('button', { name: 'Enviar consulta' }).click()

    // Só o link de conversa, pelo `?c=`. Sem esse recorte a sugestão de partida
    // "Dosimetria da pena na Lei de Drogas" também casaria — e ela **volta** à
    // lateral assim que o histórico fica vazio, que é justamente o estado que
    // este teste verifica no fim.
    const conversa = page.locator('a[href*="/consulta?c="]')
    await expect(conversa.first()).toBeVisible({ timeout: 25_000 })

    // Limpa o que o teste criou: o histórico não tem teto, e uma execução por
    // dia deixaria a lateral cheia de "dosimetria da pena".
    await conversa.first().hover()
    await page.getByRole('button', { name: /Apagar conversa/ }).first().click()
    await expect(conversa).toHaveCount(0)
  })
})

test.describe('clientes', () => {
  test('cadastra, aparece na lista e apaga', async ({ page }) => {
    const nome = `Cliente E2E ${Date.now()}`
    await page.goto('/clientes')

    await page.getByRole('button', { name: 'Novo cliente' }).click()
    await page.getByLabel('Nome').fill(nome)
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    await expect(page.getByText(nome)).toBeVisible()

    // Recarrega: se o cliente só existisse no estado do React, ele sumiria aqui.
    // É o que separa "a tela mostrou" de "o banco guardou".
    await page.reload()
    await expect(page.getByText(nome)).toBeVisible()

    // Apagar é em dois tempos — `Apagar` arma, `Confirmar` executa. Um clique só
    // não apaga ninguém, que é o desejável numa agenda de pessoas de fora.
    await page.getByRole('button', { name: `Apagar ${nome}` }).click()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText(nome)).toBeHidden()
  })
})
