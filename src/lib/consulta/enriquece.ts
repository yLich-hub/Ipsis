// =============================================================================
// Enriquecimento — o banco sobrescreve tudo que não é argumentação
//
// O modelo devolveu dois campos por fonte: um número e um `doc_id`. Rótulo,
// linha de apoio, selo de vigência, cobertura e o texto do dispositivo saem
// daqui, do `Achado` que a busca recuperou. Vigência é dado, não opinião.
//
// A saída é um `RespostaComposta` — o MESMO tipo que `comporResposta()` produz.
// Não é coincidência: é o que permite a tela ter um renderizador só, e é o que
// permite o caminho ao vivo cair para o composto sem que nada na interface saiba
// que caiu. Se os dois tipos divergissem, a queda seria visível como um pulo de
// layout, que é a pior forma de o usuário descobrir que algo falhou.
//
// Puro, offline, sem cliente: mesma razão de `valida.ts`.
// =============================================================================

import type { Achado } from '@/lib/busca/consultar'
import type { RespostaIA } from '@/lib/consulta/contrato'
import type { Fonte, Paragrafo, Passo, RespostaComposta } from '@/lib/toga/resposta'
import { dataBR } from '@/lib/formato'

/** No máximo quatro cartões de fonte, como no caminho composto. */
const MAX_FONTES = 4

const CITACAO_CURTA = (a: Achado) => a.citacao.replace(/\s+/g, ' ').trim()

/**
 * Tira do texto os `doc_id` que o modelo às vezes escreve entre colchetes.
 *
 * A instrução do sistema já proíbe, e na maior parte das vezes basta. Isto é a
 * segunda linha, e é limpeza de formatação, não de conteúdo: o id continua na
 * resposta, no campo `citations`, que é de onde sai o superíndice. Deixar
 * `[lei_11343_2006_art35_caput]` no meio da frase seria mostrar ao advogado a
 * tubulação do sistema.
 *
 * Não é validação — id inventado já foi recusado por `valida.ts` antes de
 * chegar aqui, e uma resposta que só erra a formatação não merece ser derrubada.
 */
const limpaIds = (t: string) =>
  t
    .replace(/[[(]\s*(?:[a-z]+_[a-z0-9_-]*\d[a-z0-9_-]*)(?:\s*,\s*[a-z0-9_-]+)*\s*[\])]/gi, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

/**
 * Monta a resposta final a partir do JSON validado e dos dispositivos que a
 * busca recuperou.
 *
 * A ordem das fontes é a que o modelo escolheu — é a única coisa que ele decide
 * sobre a lista, e é uma decisão legítima: qual dispositivo sustenta mais a
 * resposta. O conteúdo de cada cartão, não.
 */
export function enriquece(
  dados: RespostaIA,
  achados: Achado[],
  passos: Passo[],
): RespostaComposta {
  const porId = new Map(achados.map((a) => [a.dispositivo_id, a]))

  // Só as fontes que resolvem para um achado — a validação já garante que todas
  // resolvem, e este filtro é a segunda linha, para o caso de alguém chamar
  // `enriquece` sem validar antes.
  const usadas = dados.sources
    .map((f) => ({ f, a: porId.get(f.doc_id) }))
    .filter((x): x is { f: (typeof dados.sources)[number]; a: Achado } => !!x.a)
    .slice(0, MAX_FONTES)

  /** Do id que o modelo usou para o número que a tela mostra. */
  const numeroDe = new Map(usadas.map((x, i) => [x.f.id, String(i + 1)]))

  const fontes: Fonte[] = usadas.map((x, i) => ({
    n: String(i + 1),
    titulo: CITACAO_CURTA(x.a),
    sub:
      x.a.rubrica_termo && x.a.papel
        ? `rubrica “${x.a.rubrica_termo}” · ${x.a.papel}`
        : (x.a.artigo_rubrica ?? x.a.lei_apelido),
    // Selo e tom do banco, nunca do modelo. É a decisão nº 3 virando código no
    // caminho ao vivo exatamente como vira no caminho composto.
    selo: x.a.revogado
      ? 'Revogado'
      : x.a.cobertura === 'parcial'
        ? 'Cobertura parcial'
        : 'Em vigor',
    tom: x.a.revogado || x.a.cobertura === 'parcial' ? 'ambar' : 'verde',
    id: x.a.dispositivo_id,
  }))

  const paras: Paragrafo[] = dados.paragraphs
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({
      t: limpaIds(p.text),
      // O marcador exibido é o número do cartão, não o id que o modelo usou —
      // eles coincidem quase sempre, e "quase" não é o bastante para um
      // superíndice que precisa abrir o painel certo.
      cite: numeroDe.get(p.citations[0] ?? -1) ?? null,
    }))

  const primeiro = usadas[0]?.a

  return {
    passos,
    paras,
    fontes,
    sugestoes: dados.followups.map((s) => s.trim()).filter(Boolean).slice(0, 3),
    // O medidor de confiança continua contando dispositivo em vigor, e não lendo
    // o `confidence` do modelo: o número que a tela mostra é verificável na
    // mesma tela, e a autoavaliação de um modelo não é.
    primarias: usadas.filter((x) => !x.a.revogado).length,
    vigencia: primeiro ? dataBR(primeiro.vigencia_ate) : null,
    erro: null,
  }
}
