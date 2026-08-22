# Testes de navegador

As nove suítes do vitest rodam offline e cobrem função pura; os testes de tela
que existiam antes destes liam o HTML do servidor por `fetch`. HTML de servidor
não tem `localStorage`, não tem `⌘B` e não tem clique — então tudo o que o TOGA
v2 faz de mais característico não era verificado por ninguém:

- a lateral que recolhe e **mantém a escolha** ao mudar de tela;
- "reduzir movimento", que põe `data-movimento="reduzido"` no `<html>` e
  atravessa o recarregamento;
- o interruptor de Configurações e o `⌘B` sendo **a mesma preferência**, o que só
  funciona por causa do evento `toga:preferencias` (as duas árvores são
  diferentes);
- a estrela do Vade Mecum enchendo a faixa de favoritas do catálogo;
- um vetor da dosimetria mudando a pena na hora, e o memorial sendo **copiado de
  verdade** — o botão antigo fingia por 1400 ms;
- uma consulta indo até as fontes numeradas, com o aviso de origem na tela;
- a conversa entrando no histórico da lateral;
- o cadastro de cliente sobrevivendo a um recarregamento, e o apagar em dois
  tempos;
- **o acervo de decretos do Paraná** (`decretos.spec.ts`): o item na lateral e na
  gaveta do celular, o leitor abrindo por um id com dois-pontos, a recusa de
  afirmar vigência, e a janela de desenho da lista — 1.989 linhas desenhadas 60
  por vez, com o filtro ainda enxergando todas. Uma janela que corta sem se
  anunciar é uma lista que mente sobre o próprio tamanho, e isso passa em `tsc`,
  passa em vitest e só aparece com um dedo na tela.

## Como rodar

Ponha as duas variáveis no `.env.local`, ao lado dos outros segredos do projeto
— o `playwright.config.ts` lê o arquivo:

```
E2E_EMAIL=teste@exemplo.com
E2E_SENHA=...
```

E então:

```
npm run e2e
npm run e2e -- --ui                    # interativo, para depurar seletor
npm run e2e -- e2e/decretos.spec.ts    # um arquivo só
```

Variável já definida no ambiente vence o arquivo, para rodar com outra conta
numa execução só:

```powershell
$env:E2E_EMAIL = '...'; $env:E2E_SENHA = '...'; npm run e2e
```

O Playwright sobe o `next dev` sozinho na porta **3100** e reusa um servidor que
já esteja lá. Na primeira vez, instale o navegador:

```
npx playwright install chromium
```

## Por que fora do `npm run verificar`

Estes testes falam com o Supabase de verdade: a sessão é um cookie assinado pelo
servidor de Auth e não há como forjá-la offline. Quem mexe só na interface não
deve precisar de segredo nem de rede para rodar o que roda sem os dois — por isso
`verificar` continua sendo lint + `tsc` + vitest, e este comando é separado.

## A conta

`E2E_EMAIL` e `E2E_SENHA` vêm do ambiente — do `.env.local`, que o
`playwright.config.ts` carrega, ou de variáveis exportadas na mão. Nunca do
código. Sem eles a suíte para
e diz o que falta, em vez de tentar entrar com credencial inventada e falhar com
"e-mail ou senha incorretos" — que mandaria procurar o defeito no lugar errado.

Use uma conta de teste, não a sua: os testes **escrevem** (criam e apagam um
cliente, criam e apagam uma conversa, marcam e desmarcam um favorito). Tudo é
desfeito no próprio teste, mas uma falha no meio pode deixar resíduo.

`e2e/.sessao.json` guarda o cookie de sessão e está no `.gitignore` — versioná-lo
seria publicar credencial.

## Uma escolha de desenho

O login acontece **pelo formulário**, em `entrada.setup.ts`, e não por um cookie
montado a partir de um token pedido ao Supabase por HTTP. O atalho seria mais
rápido e não testaria nada; passando pela tela, o caminho de entrada inteiro é
exercitado a cada execução — componente cliente, `signInWithPassword`, o
middleware escrevendo os cookies na resposta e o desvio para `/consulta`.
