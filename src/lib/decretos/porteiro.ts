// =============================================================================
// O porteiro do acervo estadual — quando um decreto do Paraná entra no contexto
// do chat.
//
// Por regra em TypeScript, sem chamada de modelo, como `lib/busca/intencao.ts` e
// pelas mesmas razões: precisa ser determinístico, rodar antes da rede e ser
// auditável numa linha de tela.
//
// **Por que existe um porteiro, e não uma quarta perna na busca.** O recorte do
// produto é tráfico de drogas, e a pergunta típica não tem nada com norma
// administrativa estadual. Sem porta, uma consulta sobre tráfico privilegiado
// voltaria com regulamento de regime de trabalho de professor no contexto — e o
// custo não é só ruído: cada bloco a mais é texto dentro de uma chamada paga, e
// o modelo é obrigado a ancorar todo parágrafo numa das fontes recebidas. Dar-lhe
// fonte irrelevante é convidá-lo a usá-la.
//
// **O erro é enviesado para NÃO abrir**, ao contrário do filtro da vigília.
// Lá um achado a mais custa uma linha que se lê e descarta; aqui um decreto a
// mais entra no contexto de uma resposta sobre crime, ao lado do texto legal, e
// disputa a atenção do modelo. Quem quiser decreto pede decreto — e a tela
// `/decretos` continua inteira para quem preferir procurar com a mão.
// =============================================================================

import { semAcento } from '@/lib/formato'

export type Porta = {
  /** O acervo estadual entra no contexto desta pergunta? */
  abre: boolean
  /** O que abriu a porta — para a regra ser auditável na tela, como `intencao.sinal`. */
  sinal: string
}

/**
 * "decreto", mas nunca "decreto-lei".
 *
 * O Código Penal é o Decreto-Lei 2.848/1940 e o CPP é o 3.689/1941: são as duas
 * leis mais citadas do produto, e as duas se escrevem com a palavra "decreto"
 * dentro. Sem a exclusão, "o que diz o decreto-lei 3.689 sobre flagrante?"
 * abriria o acervo estadual — a pergunta mais central do projeto arrastando
 * consigo um corpus que não tem nada a ver com ela.
 */
const DECRETO = /\bdecretos?\b(?!\s*-?\s*lei)/

/** Marcas do Executivo estadual do Paraná. */
const ESTADUAL = [
  'parana',
  'legislacao estadual',
  'norma estadual',
  'decreto estadual',
  'governo do estado',
  'casa civil',
  'executivo estadual',
]

/**
 * Decide se o acervo estadual entra.
 *
 * Puro e offline. Recebe a pergunta como o usuário a escreveu.
 */
export function querDecretos(pergunta: string): Porta {
  const q = semAcento(pergunta.trim())
  if (!q) return { abre: false, sinal: '' }

  if (DECRETO.test(q)) return { abre: true, sinal: 'a pergunta fala em decreto' }

  const estadual = ESTADUAL.find((t) => q.includes(t))
  if (estadual) return { abre: true, sinal: `termo estadual "${estadual}"` }

  return { abre: false, sinal: '' }
}

/**
 * A consulta que vai para `busca_decretos` — a pergunta menos o que abriu a
 * porta.
 *
 * **Medido em 22/08/2026, e o número é o argumento.** As três pernas da RPC
 * usam `websearch_to_tsquery`, que exige TODAS as palavras. Uma pergunta de
 * verdade — "qual decreto do Paraná trata do porte de arma dos policiais
 * penais?" — não casa súmula nenhuma, porque nenhuma ementa contém "qual" nem
 * "trata". Sobra a perna semântica sozinha, e aí TODO resultado cai no degrau
 * de uma perna só: 1/61, 1/62, 1/63… Medido, os três perfis ficaram
 * indistinguíveis — a pergunta certa e a que o acervo não responde devolviam
 * exatamente a mesma escada de scores, e o piso cortava as duas.
 *
 * O que sai são as palavras que abriram a porta, e elas saem porque **não
 * discriminam nada aqui dentro**: num acervo em que todo ato é um decreto do
 * Executivo do Paraná, "decreto", "Paraná" e "estadual" aparecem em toda parte
 * e não separam um ato de outro. Elas serviram para decidir SE o acervo entra;
 * decidir QUAL ato entra é trabalho das outras palavras.
 *
 * Não é remoção de stopword — disso o `to_tsvector` já cuida. É remoção do
 * termo que é uniforme neste corpus, que é a mesma razão de ninguém buscar
 * "lei" dentro de um acervo de leis.
 */
const UNIFORMES = /\b(decretos?|estaduais?|estadual|parana|paranaense|governo do estado|casa civil|executivo estadual|legislacao|norma)\b/g

export function consultaDoAcervo(pergunta: string): string {
  const limpa = semAcento(pergunta)
    .replace(UNIFORMES, ' ')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Sobrou pouco? Então a pergunta ERA só a porta ("tem decreto do Paraná?") e
  // não há o que procurar de específico. Devolve a pergunta inteira: a perna
  // semântica ainda tem o que fazer com ela, e mandar string vazia à RPC
  // devolveria o acervo inteiro em ordem arbitrária.
  return limpa.length >= 6 ? limpa : semAcento(pergunta).trim()
}
