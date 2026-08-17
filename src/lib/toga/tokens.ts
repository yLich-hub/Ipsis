// =============================================================================
// Ipsis — os tokens que precisam existir em TypeScript
//
// A paleta canônica está em `src/app/globals.css`, no bloco `@theme`, e é de lá
// que sai `bg-tg-acento`, `text-tg-fraco-2` e companhia. Este arquivo NÃO é uma
// segunda cópia: ele guarda só o punhado de valores que a folha de estilo não
// consegue entregar, porque dependem de dados.
//
// São três casos, e nenhum outro deve entrar aqui:
//
// 1. Cor escolhida por índice — o quadradinho de cada item do menu lateral e o
//    ícone de cada ramo do Vade Mecum. São nove matizes dessaturados que só
//    existem para diferenciar linhas; virar nove utilitários do Tailwind seria
//    poluir a paleta com cor que ninguém reusa.
// 2. Valor calculado em tempo de execução — a altura das barrinhas dos
//    coletores sai de aritmética, e `style` é o único caminho.
// 3. Cor usada dentro de um gradiente — Tailwind não interpola tokens dentro de
//    `linear-gradient()` sem `--` explícito, e o gradiente da marca aparece em
//    quatro tamanhos diferentes.
//
// Quem for adicionar cor nova: se ela puder ser uma classe, ela deve ser uma
// classe. Este arquivo é a exceção, não o atalho.
// =============================================================================

/** O acento, tirado da logo. Repetido aqui porque entra em gradiente e sombra. */
export const ACENTO = '#b3141f'
export const ACENTO_CLARO = '#d97b83'

// `ACENTO_TXT` e `ACENTO_FRACO` moravam aqui e não eram usados por ninguém: as
// telas escrevem `text-tg-acento-txt` e `bg-tg-acento-fraco`, que é a regra do
// cabeçalho acima. Duas cópias do mesmo hexadecimal, uma em CSS e outra em TS,
// é exatamente o que este arquivo existe para não ter.

/**
 * Gradientes da marca. O documento de design usa o mesmo par de roxos em quatro
 * lugares (logo da lateral, avatar do assistente, avatar da conta, cartão de
 * resultado da dosimetria) sempre a 160°, exceto o painel de resultado, a 165°.
 *
 * `GRADIENTE_PROGRESSO` saiu: era a barra do painel de coletores do documento,
 * que virou a barra de `/fontes` — e essa é pintada por classe, porque não
 * depende de dado.
 *
 * `GRADIENTE_MARCA` é o vermelho da logo com 8% de variação de luz — em 32px o
 * gradiente não se lê como gradiente, se lê como volume.
 *
 * `GRADIENTE_CONTA` é o único que NÃO é vermelho, e isso é decisão de
 * hierarquia: o avatar da conta fica a 20px do quadrado da marca no cabeçalho, e
 * dois vermelhos vizinhos disputam a mesma atenção. Tinta escura com a inicial
 * branca resolve — é a mesma variante escura que a logo já prevê.
 *
 * `GRADIENTE_RESULTADO` é o painel de pena definitiva. É o único lugar do
 * produto em que o vermelho ocupa uma superfície inteira, e ele ganha esse
 * direito por ser o número que o advogado abriu a tela para ver.
 */
export const GRADIENTE_MARCA = 'linear-gradient(160deg,#c9202c,#93101c)'
export const GRADIENTE_CONTA = 'linear-gradient(160deg,#3b3844,#1c1a24)'
export const GRADIENTE_RESULTADO = 'linear-gradient(165deg,#a5121f,#6b0d16)'

/**
 * Matizes dos quadradinhos de ícone — caso 1 do cabeçalho.
 *
 * São dessaturados de propósito: o documento não desenha glifo nenhum nesses
 * 18×18, só uma cor. Se fossem saturados, seis manchas coloridas competiriam
 * com o único elemento que a lateral precisa destacar, que é o item ativo.
 *
 * `lavanda` mantém o nome da chave (é ela que o mapa de telas da casca
 * referencia) mas passou a ser um rosa: é o quadradinho da Consulta, a tela da
 * marca, e agora ele concorda com o acento.
 */
export const MATIZ = {
  lavanda: '#f8dfe2',
  gelo: '#dfe6ee',
  areia: '#e6e2da',
  sabia: '#dde9e3',
  rosa: '#e7dfe2',
  ardosia: '#dfe1ea',
  lilas: '#e7e0ea',
  musgo: '#e2e7df',
  argila: '#eae0dc',
} as const

export type Matiz = keyof typeof MATIZ

/**
 * Altura e cor das barrinhas de atividade de cada coletor (tela Fontes).
 *
 * Determinístico a partir do índice, e não `Math.random()`: o valor tem de ser
 * o mesmo no HTML do servidor e na primeira renderização do cliente, senão o
 * React acusa divergência de hidratação e o gráfico pisca ao carregar.
 */
export function barrasDoColetor(semente: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    altura: `${28 + ((i * 7 + semente * 13) % 68)}%`,
    // As duas últimas colunas são "hoje": destacadas para a leitura ser
    // "subiu agora", e não "tem uma série aqui".
    cor: i > 9 ? ACENTO_CLARO : MATIZ.lavanda,
  }))
}
