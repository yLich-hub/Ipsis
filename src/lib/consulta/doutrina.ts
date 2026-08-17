// =============================================================================
// Doutrina — referência com origem, nunca reprodução
//
// O molde `doutrina` de `classifica()` existia e só sabia recusar: reconhecia a
// intenção e devolvia um "não hospedo, não indexo, não resumo". Recusa correta e
// ramo morto — o classificador enxergava um pedido que o produto não atendia.
//
// Este arquivo é a outra metade da regra do CLAUDE.md, que nunca foi escrita:
// **"entregar entendimento consolidado extraído de jurisprudência e link para
// fonte legítima"**. O entendimento já existe (`precedentes_stj` e
// `teses.jurisprudencia`, que continuam sendo recuperados neste molde). O que
// faltava era o link.
//
// --- o que este arquivo NÃO faz ----------------------------------------------
//
// Não colhe, não guarda e não resume. Devolve endereço de busca. A distinção da
// Lei 9.610/98 é a razão: lei e decisão judicial não são obra protegida (art.
// 8º, IV) e por isso o corpus as hospeda inteiras; doutrina é obra protegida, e
// o que a lei autoriza expressamente é a CITAÇÃO de passagem com indicação de
// autor e origem (art. 46, III) — não o resumo reescrito, que é o mesmo risco
// por outra forma. Mandar o usuário à fonte não reproduz nada.
//
// --- por que só uma fonte, e não as cinco ------------------------------------
//
// Porque foi a única que passou na conferência, e a regra aqui é a do acervo
// Vade Mecum: endereço que não foi verificado fica ausente, em vez de ser
// montado por dedução. Medido em 17/08/2026, com o mesmo agente `compatible`
// que a vigília usa:
//
//   BDJur (STJ)   DSpace 7. A rota humana `/search` devolve a casca Angular de
//                 2.375 bytes para qualquer consulta — o que se conferiu foi a
//                 consulta que essa casca dispara, na API REST: 372 itens para
//                 "tráfico privilegiado", 266 para "estupro de vulnerável", 77
//                 para "roubo majorado" e 0 para uma palavra inventada. O
//                 parâmetro é honrado, e o escopo abaixo é a comunidade
//                 Doutrina, não a base inteira.
//   SciELO        403 para cliente que não é navegador, com e sem User-Agent
//                 declarado. Não deu para conferir que a consulta é honrada.
//   Oasisbr       sem resposta dentro de 30 s, duas tentativas.
//   LexML         devolve "Verificação de segurança — Senado Federal", a mesma
//                 barreira de JavaScript que já tirou o LexML dos coletores.
//
// As três de fora não são acusação de nada: um advogado no navegador
// provavelmente as abre sem problema. Só não passaram pela conferência que este
// projeto exige antes de imprimir um endereço na tela.
//
// **O OAI-PMH existe e está de pé** — `/server/oai/request?verb=Identify`
// responde `<repositoryName>BDJur</repositoryName>`. É a porta para um coletor
// de metadados no futuro, e o desenho dele já está decidido: Python em
// `coletores/`, proposta em `data/vigilia/`, curadoria humana em
// `data/curadoria/`, tabela própria sem FK para `dispositivos` — a mesma
// separação do acervo Vade Mecum. Enquanto isso não existir, nada é colhido.
// =============================================================================

export type FonteDeDoutrina = {
  nome: string
  /** O que o usuário encontra ali, em uma linha. */
  nota: string
  url: string
}

/** A comunidade "Doutrina" do BDJur, conferida pela API de comunidades. */
const ESCOPO_DOUTRINA = 'cdb150cd-70f0-497e-a395-ca7e869309de'

/** Consulta longa demais vira URL gigante sem melhorar a busca do DSpace. */
const LIMITE = 120

/**
 * Endereços de busca para o termo consultado.
 *
 * Vazio quando não há o que buscar — e vazio é resposta legítima: a tela não
 * desenha a seção, em vez de mostrar um link que abre uma busca sem termo.
 */
export function fontesDeDoutrina(consulta: string): FonteDeDoutrina[] {
  const termo = consulta.trim().replace(/\s+/g, ' ').slice(0, LIMITE)
  if (!termo) return []

  const q = encodeURIComponent(termo)

  return [
    {
      nome: 'BDJur — Biblioteca Digital do STJ',
      nota: 'coleção de Doutrina: livros digitais, artigos de revistas jurídicas e trabalhos acadêmicos',
      url: `https://bdjur.stj.jus.br/search?scope=${ESCOPO_DOUTRINA}&query=${q}`,
    },
  ]
}
