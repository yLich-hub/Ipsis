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
import type { AchadoDecreto } from '@/lib/decretos/formato'
import type { Citavel } from '@/lib/vigilia/precedentes'
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
  precedentes: Citavel[] = [],
  decretos: AchadoDecreto[] = [],
): RespostaComposta {
  const porId = new Map(achados.map((a) => [a.dispositivo_id, a]))
  const porPrecedente = new Map(precedentes.map((p) => [p.docId, p]))
  const porDecreto = new Map(decretos.map((d) => [d.bloco_id, d]))

  // Um `source` resolve para um dispositivo OU para um precedente. A validação
  // já garante que todos resolvem; este filtro é a segunda linha, para o caso
  // de alguém chamar `enriquece` sem validar antes. Os dois são
  // citáveis; o que muda é o cartão que a tela desenha — e o selo, que no
  // dispositivo vem da vigência e no precedente vem da situação no STJ.
  const resolvidas = dados.sources
    .map((f, i) => ({
      f,
      a: porId.get(f.doc_id),
      p: porPrecedente.get(f.doc_id),
      d: porDecreto.get(f.doc_id),
      i,
    }))
    .filter(
      (x): x is {
        f: (typeof dados.sources)[number]
        a: Achado | undefined
        p: Citavel | undefined
        d: AchadoDecreto | undefined
        i: number
      } => !!x.a || !!x.p || !!x.d,
    )

  /**
   * A PRIMEIRA citação de cada parágrafo — e só ela.
   *
   * O corte em quatro cartões é antigo e continua certo: lista maior deixa de
   * ser lida. O que estava errado era cortar pelo fim. O modelo lista as fontes
   * por importância, mas nada o obriga a citar as quatro primeiras — numa
   * consulta real por "art. 33 da Lei de Drogas" ele devolveu oito fontes e
   * citou `[[1], [2,3,4,5,6], [7,8]]`. O terceiro parágrafo apontava para a
   * sétima, que o corte descartava, e ficava sem superíndice: ancorado nos
   * dados e órfão na tela, justamente depois de a âncora virar obrigatória.
   *
   * **Priorizar "toda fonte citada" não resolve**, e essa foi a primeira
   * tentativa: naquele caso as oito estavam citadas, então o critério não
   * decidia nada e o corte continuava caindo nas quatro primeiras.
   *
   * O conjunto certo é o das primeiras citações, porque é exatamente o que
   * `numeroDe` consulta logo abaixo. E ele cabe por construção: o esquema pede
   * de 2 a 4 parágrafos, então são no máximo 4 — o mesmo `MAX_FONTES`.
   */
  const principais = new Set(
    dados.paragraphs
      .filter((p) => p.text.trim().length > 0)
      .map((p) => p.citations[0])
      .filter((c): c is number => c !== undefined),
  )

  // Ordena por "é primeira citação de algum parágrafo?" para escolher quem
  // sobrevive ao corte, e depois devolve os sobreviventes à ordem original.
  // Assim a lista continua sendo a que o modelo escolheu — a única decisão que
  // ele toma sobre ela — e nenhum parágrafo perde o marcador por posição.
  const usadas = resolvidas
    .slice()
    .sort((x, y) => Number(principais.has(y.f.id)) - Number(principais.has(x.f.id)) || x.i - y.i)
    .slice(0, MAX_FONTES)
    .sort((x, y) => x.i - y.i)

  /** Do id que o modelo usou para o número que a tela mostra. */
  const numeroDe = new Map(usadas.map((x, i) => [x.f.id, String(i + 1)]))

  const fontes: Fonte[] = usadas.map((x, i) => {
    // Precedente: o selo é a situação no STJ, que é o análogo da vigência.
    if (x.p) {
      return {
        n: String(i + 1),
        titulo: `${x.p.rotulo} do STJ`,
        sub: 'precedente qualificado — jurisprudência, não texto de lei',
        selo: x.p.situacao,
        tom: 'verde' as const,
        id: x.p.docId,
      }
    }

    // Decreto estadual: o selo diz o que se sabe — a redação lida e o dia da
    // leitura —, e o tom é âmbar porque este acervo pede conferência por
    // definição. Não existe "Em vigor" aqui: a vigência do ato não foi medida,
    // e um selo verde afirmaria justamente o que a migration 0018 recusa
    // afirmar.
    if (x.d) {
      return {
        n: String(i + 1),
        titulo: `Decreto ${x.d.numero}/${x.d.ano}${x.d.rotulo ? `, ${x.d.rotulo}` : ''}`,
        sub: 'decreto estadual do Paraná — acervo de consulta, não citável em peça',
        selo: `redação ${x.d.versao}`,
        tom: 'ambar' as const,
        id: x.d.bloco_id,
      }
    }

    const a = x.a!
    return {
      n: String(i + 1),
      titulo: CITACAO_CURTA(a),
      sub:
        a.rubrica_termo && a.papel
          ? `rubrica “${a.rubrica_termo}” · ${a.papel}`
          : (a.artigo_rubrica ?? a.lei_apelido),
      // Selo e tom do banco, nunca do modelo. É a decisão nº 3 virando código no
      // caminho ao vivo exatamente como vira no caminho composto.
      selo: a.revogado
        ? 'Revogado'
        : a.cobertura === 'parcial'
          ? 'Cobertura parcial'
          : 'Em vigor',
      tom: a.revogado || a.cobertura === 'parcial' ? ('ambar' as const) : ('verde' as const),
      id: a.dispositivo_id,
    }
  })

  const paras: Paragrafo[] = dados.paragraphs
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({
      t: limpaIds(p.text),
      // O marcador exibido é o número do cartão, não o id que o modelo usou —
      // eles coincidem quase sempre, e "quase" não é o bastante para um
      // superíndice que precisa abrir o painel certo.
      cite: numeroDe.get(p.citations[0] ?? -1) ?? null,
    }))

  // A data de corte é do CORPUS. Precedente tem situação, não vigência — e
  // pegar a dele aqui carimbaria a resposta com a data errada.
  const primeiro = usadas.find((x) => x.a)?.a

  return {
    passos,
    paras,
    fontes,
    sugestoes: dados.followups.map((s) => s.trim()).filter(Boolean).slice(0, 3),
    // O medidor de confiança continua contando dispositivo em vigor, e não lendo
    // o `confidence` do modelo: o número que a tela mostra é verificável na
    // mesma tela, e a autoavaliação de um modelo não é.
    // Decreto NÃO conta como primária, e a exclusão é a mesma decisão de ele
    // não entrar na peça: o medidor mede quanto da resposta se apoia no corpus
    // curado e datado. Contar norma administrativa estadual ali inflaria o
    // número que a tela oferece como garantia.
    primarias: usadas.filter((x) => (x.a && !x.a.revogado) || x.p).length,
    vigencia: primeiro ? dataBR(primeiro.vigencia_ate) : null,
    erro: null,
  }
}
