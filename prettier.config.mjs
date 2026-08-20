// =============================================================================
// Estilo de formatação — o que o código já usa, escrito onde a ferramenta lê
//
// Este arquivo não mudou o estilo de nada: ele registra o que os 97 arquivos de
// `src/` já praticam. Existe porque a ausência dele era uma armadilha armada.
//
// **O que aconteceu.** Sem configuração, `npx prettier --write` roda com os
// padrões da ferramenta — aspas duplas e ponto e vírgula —, e reescreve o
// arquivo inteiro na primeira execução. Aconteceu aqui, em dois arquivos, e o
// diff de 836 linhas escondia as 40 que importavam. O mesmo vale para o editor
// de quem clonar o projeto com "formatar ao salvar" ligado: sem este arquivo, a
// primeira gravação troca a convenção do repositório em silêncio.
//
// **O estilo não foi escolhido, foi medido.** Rodando o prettier contra `src/`
// com várias larguras e comparando com o que está no disco: 100 é a que menos
// diverge (43 arquivos), contra 68 em 90 e 57 em 110. Aspas simples e ausência
// de ponto e vírgula não têm dúvida — nenhum arquivo do projeto usa o contrário.
//
// **O repositório não é formatado pelo prettier, e continua não sendo.** Os 43
// arquivos que divergem divergem por pouco — 3 a 18 linhas, sempre quebra de
// linha que alguém preferiu manual. Não há `prettier --write` no `npm run
// verificar` e não há prettier no CI: a verificação é `eslint`, `tsc` e
// `vitest`, e formatação não entra em nenhum dos três. Quem quiser rodar a
// ferramenta agora ao menos parte da convenção certa.
//
// `endOfLine: 'lf'` é o mesmo que o `.gitattributes` já impõe. Alguns arquivos
// estão em CRLF no disco do Windows; o git os normaliza na gravação, e o
// prettier passa a concordar com ele em vez de brigar.
//
// Prettier **não é dependência do projeto** — não está no `package.json`, e não
// foi acrescentado só por causa deste arquivo. Ele serve ao editor, que traz o
// seu, e ao `npx` de quem chamar a ferramenta à mão.
// =============================================================================

/** @type {import('prettier').Config} */
const config = {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  endOfLine: 'lf',
}

export default config
