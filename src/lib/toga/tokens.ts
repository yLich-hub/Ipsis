// =============================================================================
// TOGA v2 — os tokens que precisam existir em TypeScript
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

/** O acento, repetido aqui porque entra em gradiente e em `box-shadow` calculado. */
export const ACENTO = '#3a3960'
export const ACENTO_TXT = '#4b4a7a'
export const ACENTO_FRACO = '#ecebf6'
export const ACENTO_CLARO = '#8a86b8'

/**
 * Gradientes da marca. O documento de design usa o mesmo par de roxos em quatro
 * lugares (logo da lateral, avatar do assistente, avatar da conta, cartão de
 * resultado da dosimetria) sempre a 160°, exceto o painel de resultado, a 165°.
 */
export const GRADIENTE_MARCA = 'linear-gradient(160deg,#5b5987,#3a3960)'
export const GRADIENTE_CONTA = 'linear-gradient(160deg,#6d6a9c,#43426b)'
export const GRADIENTE_RESULTADO = 'linear-gradient(165deg,#43426b,#2c2b47)'
export const GRADIENTE_PROGRESSO = 'linear-gradient(90deg,#6d6a9c,#43426b)'

/**
 * Matizes dos quadradinhos de ícone — caso 1 do cabeçalho.
 *
 * São dessaturados de propósito: o documento não desenha glifo nenhum nesses
 * 18×18, só uma cor. Se fossem saturados, seis manchas coloridas competiriam
 * com o único elemento que a lateral precisa destacar, que é o item ativo.
 */
export const MATIZ = {
  lavanda: '#dcdbee',
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
