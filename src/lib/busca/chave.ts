// =============================================================================
// A chave do cache de embedding — pura, e num arquivo só dela.
//
// **Ela mora aqui, e não em `consultar.ts`, pelo mesmo motivo de
// `lib/peca/resolver.ts` não importar cliente nenhum:** `lib/supabase.ts` lança
// no import quando falta variável de ambiente, e um teste que exigisse segredo
// não rodaria no CI — que é justamente onde este contrato precisa ser trancado.
// Separar é o que permite `tests/acesso.test.ts` conferi-lo offline.
// =============================================================================

import { semAcento } from '@/lib/formato'

/**
 * A chave do cache, e a mesma normalização que o teto conta.
 *
 * Minúscula, espaço colapsado e acento fora: "Tráfico Privilegiado" e
 * "trafico  privilegiado" são a mesma pergunta e não devem custar dois
 * embeddings. O acento sai por `semAcento`, e não por uma segunda cópia da mesma
 * regra — a busca já normaliza assim no resto do produto.
 *
 * **O risco desta função é colapsar demais, não de menos.** Duas perguntas
 * distintas na mesma chave fazem o cache devolver o vetor de uma na busca da
 * outra, e a tela responde sobre o crime errado sem erro nenhum. Por isso ela é
 * conservadora: nada de tirar pontuação, nada de radicalizar palavra. Só o que
 * é indiscutivelmente a mesma pergunta escrita de outro jeito.
 */
export const chaveDeEmbedding = (consulta: string): string =>
  semAcento(consulta).replace(/\s+/g, ' ').trim()
