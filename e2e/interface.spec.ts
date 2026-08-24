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

    // **Esta asserção mudou de alvo, e a mudança é um teste envelhecido sendo
    // corrigido.** Ela exigia `[title*="Base conferida"]` — o cartão que ficava
    // no pé da lateral e carregava a data de corte. Ele SAIU a pedido, e o
    // rodapé passou a ser a conta; a data continua no produto, em cinco outros
    // lugares (a pílula da caixa de consulta, a procedência de cada
    // dispositivo, `/leis`, `/fontes` e o rodapé do `.docx`), mas não aqui.
    //
    // O que se testa na trilha agora é o que ela de fato promete: o botão da
    // conta sobrevive ao recolhimento, reduzido ao avatar. É a única ação que
    // precisa estar sempre alcançável — sair da sessão.
    // Pelo nome acessível, e não por `aria-haspopup`: o botão de dev tools do
    // Next tem o mesmo atributo, e o seletor casava dois elementos.
    await expect(page.getByRole('button', { name: /^Conta de/ })).toBeVisible()

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

    await page.getByRole('switch', { name: /Reduzir movimento/ }).click()
    await expect(html).toHaveAttribute('data-movimento', 'reduzido')

    await page.reload()
    await expect(html).toHaveAttribute('data-movimento', 'reduzido')

    // Devolve ao padrão: os testes compartilham o mesmo navegador e o mesmo
    // `localStorage`, e deixar o movimento desligado mudaria o que os outros
    // veem.
    await page.getByRole('button', { name: /Aparência/ }).click()
    await page.getByRole('switch', { name: /Reduzir movimento/ }).click()
    await expect(html).not.toHaveAttribute('data-movimento', 'reduzido')
  })

  test('o interruptor da lateral e o ⌘B são a mesma preferência', async ({ page }) => {
    await page.goto('/configuracoes')
    await page.getByRole('button', { name: /Aparência/ }).click()

    // A Casca e a tela de Configurações são árvores diferentes; é o evento
    // `toga:preferencias` que faz uma reagir à outra sem recarregar. Sem ele,
    // este clique só apareceria na próxima navegação.
    //
    // `switch`, e não `button`: a linha ganhou `role="switch"` com
    // `aria-checked` quando o interruptor passou a anunciar o próprio estado ao
    // leitor de tela — antes ele chegava como "Lateral recolhida" e nada mais.
    // O teste seguia procurando o papel antigo.
    await page.getByRole('switch', { name: /Lateral recolhida/ }).click()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()

    await page.getByRole('switch', { name: /Lateral recolhida/ }).click()
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

    // Só o link de conversa, pelo `?c=`. Sem esse recorte a sugestão de partida
    // "Dosimetria da pena na Lei de Drogas" também casaria.
    const conversas = page.locator('a[href*="/consulta?c="]')
    const enderecos = () => conversas.evaluateAll((ns) => ns.map((n) => n.getAttribute('href')!))

    // O histórico de ANTES. É o que permite reconhecer, depois, qual linha é
    // desta execução.
    //
    // A versão anterior apagava a primeira da lista e exigia `toHaveCount(0)` —
    // isto é, que o histórico inteiro ficasse vazio no fim. Isso não testa o
    // histórico: testa que a conta estava zerada antes de começar. Qualquer
    // conversa preexistente derrubava o teste sem nada estar quebrado, e falha
    // vermelha que não é defeito do código é o jeito mais rápido de ensinar
    // todo mundo a ignorar o CI. Pior: com resíduo na conta, ele APAGAVA uma
    // conversa que não era dele.
    // Esperar o histórico assentar antes de fotografar: a lateral o carrega
    // depois de montar, e fotografar cedo demais devolvia lista vazia — aí toda
    // conversa preexistente contava como "nova" (medido: 10).
    //
    // Duas leituras iguais seguidas, e não "espere aparecer alguma": em conta
    // sem histórico nenhum a segunda forma esperaria para sempre.
    let ultima = -1
    await expect
      .poll(
        async () => {
          const n = (await enderecos()).length
          const estavel = n === ultima
          ultima = n
          return estavel
        },
        { timeout: 20_000, intervals: [400] },
      )
      .toBe(true)

    const antes = await enderecos()

    await page.getByLabel('Sua consulta').fill('dosimetria da pena')
    await page.getByRole('button', { name: 'Enviar consulta' }).click()

    // A linha nova, e exatamente uma.
    await expect
      .poll(async () => (await enderecos()).filter((h) => !antes.includes(h)).length, {
        timeout: 30_000,
      })
      .toBe(1)

    const novo = (await enderecos()).find((h) => !antes.includes(h))!
    const minha = page.locator(`a[href="${novo}"]`)

    // Limpa o que o teste criou: o histórico não tem teto, e uma execução por
    // dia deixaria a lateral cheia de "dosimetria da pena". O botão de apagar
    // é o da MESMA linha — `..` sobe para a `div.group` que embrulha o link e o
    // botão. `getByRole(...).first()` pegaria o de outra conversa.
    await minha.hover()
    await minha.locator('..').getByRole('button', { name: /Apagar conversa/ }).click()

    await expect(minha).toHaveCount(0)
    // E o resto do histórico continua onde estava: apagar a linha do teste não
    // pode levar junto o que já existia.
    await expect.poll(async () => (await enderecos()).length).toBe(antes.length)
  })
})

test.describe('menu da conta', () => {
  // O menu abria e os dois itens não faziam nada. Não era o `onClick`: o
  // `backdrop-blur` do header cria contexto de empilhamento, então o `z-20` do
  // menu ficava preso nele, e a área de conteúdo — que vem depois no DOM —
  // pintava por cima da camada inteira. Sendo transparente, ela deixava o menu
  // À VISTA e engolia o clique.
  //
  // É o tipo de defeito que este arquivo existe para pegar: não quebra tipo,
  // não quebra build, e o HTML de servidor não sabe o que é clique.
  test('“Configurações” leva à tela, e clicar fora fecha', async ({ page }) => {
    await page.goto('/consulta')

    await page.getByRole('button', { name: /Conta de/ }).click()
    const item = page.getByRole('menuitem', { name: 'Configurações' })
    await expect(item).toBeVisible()

    // A trava contra a regressão exata: quem está no ponto do item tem de ser o
    // item. Um `click()` do Playwright rola e força o alvo; `elementFromPoint`
    // é o que o dedo do usuário encontraria.
    const dono = await item.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('a')?.tagName
    })
    expect(dono).toBe('A')

    await item.click()
    await page.waitForURL('**/configuracoes')

    // Clicar fora fecha. A sobreposição `fixed inset-0` que fazia isso media o
    // header e não a tela — mesmo `backdrop-filter`, que também torna o header
    // bloco de contenção de `fixed`. Hoje é ouvinte no documento.
    await page.getByRole('button', { name: /Conta de/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Configurações' })).toBeVisible()
    await page.mouse.click(640, 500)
    await expect(page.getByRole('menuitem', { name: 'Configurações' })).toBeHidden()
  })

  test('“Sair” encerra a sessão e devolve ao login', async ({ page }) => {
    // O logout é interceptado de propósito. `signOut()` do Supabase revoga os
    // refresh tokens da conta no servidor, e a suíte inteira reusa uma sessão
    // guardada em `e2e/.sessao.json` — sair de verdade aqui derrubaria todos os
    // outros testes e exigiria login novo a cada execução.
    //
    // O que este teste cobre é o que pode quebrar do nosso lado: o clique
    // chegar ao botão, o estado "Saindo…" aparecer e a tela voltar ao login.
    // Que o Supabase revoga sessão quando recebe a chamada é responsabilidade
    // dele, e não é o que regride aqui.
    let pedido = false
    await page.route('**/auth/v1/logout*', (rota) => {
      pedido = true
      return rota.fulfill({ status: 204, body: '' })
    })

    await page.goto('/consulta')
    await page.getByRole('button', { name: /Conta de/ }).click()
    await page.getByRole('menuitem', { name: /Sair/ }).click()

    // Regex, e não glob: o destino é `/login?recado=saiu` — a saída deliberada
    // se distingue da sessão expirada por esse parâmetro (ver `ProvedorSessao`),
    // e `'**/login'` não casa com query string.
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('recado=saiu')
    expect(pedido).toBe(true)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
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
