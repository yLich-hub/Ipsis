// =============================================================================
// A marca, num lugar só
//
// Mesmo argumento do bloco `@theme` em `globals.css`: o documento de design
// repete o hexadecimal do acento em 200 lugares e aqui ele é um token; o nome do
// produto estava escrito em 27, e agora é um. Trocar a marca era um
// localizar-e-substituir que atravessa título de página, `aria-label`, texto de
// botão e metadado do `.docx` — e é assim que uma tela fica com o nome antigo
// depois da troca, que é a mesma classe de erro que a folha de estilo evita.
//
// **Não é um arquivo de configuração.** Não se lê de variável de ambiente e não
// há tela para editar: a marca é decisão de produto, muda em commit e se revisa
// em diff, como a curadoria.
//
// `inicial` é o que vai no quadrado da lateral e da tela de entrada — hoje uma
// letra em serifada sobre gradiente, não um SVG. Quando virar logotipo de
// verdade, é aqui que ele entra, e as duas telas o herdam juntas.
// =============================================================================

export const MARCA = {
  nome: 'Toga',
  /** A letra do quadrado da marca. Serifada, sobre `GRADIENTE_MARCA`. */
  inicial: 'T',
  /** Linha de apoio embaixo do nome, na lateral. */
  tagline: 'Advocacia criminal',
  /** Pílula ao lado do nome nas telas de autenticação. */
  ramo: 'Penal',
  /** Complemento do título da aba na raiz e na descrição das telas públicas. */
  descricao: 'consulta e peças em tráfico de drogas',
} as const

/**
 * O título da aba: `Jurisprudência — Toga`.
 *
 * Existe para o sufixo não ser digitado em cada `metadata`. O separador é o
 * travessão, e é ele que o navegador trunca por último quando a aba encolhe —
 * por isso o nome da tela vem primeiro, e não a marca.
 */
export const titulo = (tela: string) => `${tela} — ${MARCA.nome}`
