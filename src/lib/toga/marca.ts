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
// `inicial` é o que vai no quadrado da lateral e da tela de entrada — hoje
// serifada sobre gradiente, não um SVG. Quando virar logotipo de verdade, é
// aqui que ele entra, e as duas telas o herdam juntas.
//
// `inicial` tem DUAS letras, e isso tem consequência de layout: nos três
// quadrados que a desenham (lateral, tela de entrada, avatar de Configurações) e
// no avatar do assistente, o corpo cai ~20% e entra `tracking-[0.01em]`, senão as
// duas letras se encostam.
//
// **Este arquivo já sobreviveu a dois rebrandings** — `Toga` → `LJ` → `Ipsis` —,
// e é o argumento do topo medido em campo: o nome trocou duas vezes sem que
// nenhuma tela ficasse para trás, porque só existe um lugar onde ele está
// escrito. `nome` e `inicial` mudam juntos e por decisão, não por configuração.
//
// **Há UMA exceção, e ela está anotada aqui para não ser descoberta tarde:**
// `src/app/icon.svg` desenha a mesma inicial no mesmo gradiente, e um arquivo
// SVG não importa TypeScript. Trocar `inicial` exige abrir aquele arquivo junto,
// senão a aba do navegador fica com a marca antiga — que é exatamente o defeito
// que este módulo existe para impedir, sobrevivendo no único lugar fora do
// alcance dele. A alternativa era gerar o ícone por `ImageResponse`, que traz
// runtime e fonte para dentro do build; para duas letras, não compensa.
// =============================================================================

export const MARCA = {
  nome: 'Ipsis',
  /** As letras do quadrado da marca. Serifadas, sobre `GRADIENTE_MARCA`. */
  inicial: 'IP',
  // `tagline` morava aqui e saiu com a única tela que a desenhava: numa marca
  // curta a linha de apoio ficava mais larga que o nome e truncava na lateral.
  // Campo que ninguém lê é o mesmo defeito que este arquivo evita, do outro lado.
  /** Pílula ao lado do nome nas telas de autenticação. */
  ramo: 'Penal',
  /** Complemento do título da aba na raiz e na descrição das telas públicas. */
  descricao: 'consulta e peças em tráfico de drogas',
} as const

/**
 * O título da aba: `Jurisprudência — Ipsis`.
 *
 * Existe para o sufixo não ser digitado em cada `metadata`. O separador é o
 * travessão, e é ele que o navegador trunca por último quando a aba encolhe —
 * por isso o nome da tela vem primeiro, e não a marca.
 */
export const titulo = (tela: string) => `${tela} — ${MARCA.nome}`
