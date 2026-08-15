// =============================================================================
// A validação que torna o RAG obrigatório — no servidor, antes de a tela ver
//
// Esta é a peça que faz a diferença entre "pedimos ao modelo que não alucine" e
// "resposta com citação inventada não chega ao usuário". Ela é pura de propósito:
// não importa cliente nenhum, não toca banco, e por isso `tests/consulta.test.ts`
// a exercita offline, sem segredo, no CI — a mesma razão que separa
// `lib/peca/resolver.ts` de `lib/peca/montar.ts`.
//
// Quatro recusas, e a quarta é a que não estava no contrato pedido:
//
// 1. **Forma.** O que voltou tem de ter a forma do esquema. Structured outputs
//    já garante isso na prática; conferir de novo custa microssegundos e cobre o
//    caminho em que o esquema muda e alguém esquece de atualizar o tipo.
// 2. **doc_id no contexto.** Todo `sources[].doc_id` tem de ser um dispositivo
//    RECUPERADO nesta consulta. Id que não veio da busca é alucinação, mesmo que
//    exista no banco: significaria que o modelo o produziu de memória.
// 3. **Citação resolvível.** Todo índice em `citations` tem de apontar para um
//    `sources[].id` que existe. Marcador que não abre nada é pior que nenhum.
// 4. **Transcrição de lei.** Se um parágrafo repete doze palavras seguidas do
//    texto de um dispositivo do contexto, o modelo transcreveu a lei em vez de
//    argumentar — e a decisão nº 1 diz que texto legal nunca é gerado. Doze é
//    longo o bastante para não pegar o nome de um instituto ("associação para o
//    tráfico") nem uma expressão consagrada, e curto o bastante para pegar a
//    cópia de um caput.
// 5. **Parágrafo sem âncora.** Todo parágrafo tem de citar ao menos uma fonte.
//
// A quinta entrou depois, e fecha a última fresta do RAG. As quatro primeiras
// garantem que o que o modelo CITA veio da busca; nenhuma delas obrigava a
// citar. Um parágrafo com `citations: []` passava por todas — e é exatamente
// nele que caberia uma afirmação inteira apoiada em treinamento, do tipo "o
// porte ilegal é punido com reclusão de 2 a 4 anos": curta, correta no mundo,
// impossível de conferir nesta tela, e invisível para as outras quatro recusas.
//
// O esquema dizia "vazio é legítimo: nem todo parágrafo cita". Era verdade como
// descrição de estilo e falso como garantia: transformava a ancoragem em algo
// que só o prompt segurava. O resto deste arquivo existe porque prompt não é
// garantia — não fazia sentido abrir exceção justo aqui.
//
// **O custo é real e foi aceito.** Um parágrafo de fecho ("se quiser, detalho a
// dosimetria") passa a precisar de citação, e citar ali é ligeiramente
// artificial. Mas o campo `followups` já existe para o que é navegação, e a
// prosa é para argumentação jurídica — que, por definição, se apoia em
// dispositivo. Medido contra perguntas reais antes de entrar: nenhuma resposta
// legítima foi recusada.
//
// A rota trata a recusa como o contrato pede: regenera uma vez com a violação
// nomeada e, se falhar de novo, cai para a resposta composta — que não depende
// de modelo nenhum.
// =============================================================================

import type { RespostaIA } from '@/lib/consulta/contrato'

/** Um dispositivo recuperado pela busca — o universo do que pode ser citado. */
export type Recuperado = { docId: string; texto: string }

export type Violacao = {
  codigo:
    | 'forma'
    | 'doc_id_fora_do_contexto'
    | 'citacao_orfa'
    | 'transcreveu_lei'
    | 'paragrafo_sem_ancora'
    | 'vazia'
  detalhe: string
}

export type Veredito =
  | { ok: true; dados: RespostaIA }
  | { ok: false; violacoes: Violacao[] }

/** Quantas palavras seguidas em comum já denunciam transcrição. */
const JANELA = 12

/**
 * Normaliza para comparação: sem acento, sem pontuação, minúsculo, espaço
 * único. Sem isso, "§ 4º" e "§4o" seriam textos diferentes e a checagem de
 * transcrição passaria por cima de uma cópia literal.
 */
export function normaliza(t: string): string {
  return t
    .normalize('NFD')
    // Escape numérico, e não os caracteres combinantes literais: eles são
    // invisíveis no editor e um `git diff` ou um copiar-e-colar os come.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * O parágrafo repete uma sequência longa de algum dispositivo do contexto?
 *
 * Devolve o `docId` do dispositivo copiado, ou `null`. Compara por janelas
 * deslizantes de `JANELA` palavras — é O(n) sobre o texto recuperado, e o texto
 * recuperado são oito dispositivos, não o corpus.
 */
export function transcreveuLei(paragrafo: string, contexto: Recuperado[]): string | null {
  const palavras = normaliza(paragrafo).split(' ').filter(Boolean)
  if (palavras.length < JANELA) return null

  const janelas = new Set<string>()
  for (let i = 0; i + JANELA <= palavras.length; i++) {
    janelas.add(palavras.slice(i, i + JANELA).join(' '))
  }

  for (const r of contexto) {
    const lei = normaliza(r.texto).split(' ').filter(Boolean)
    for (let i = 0; i + JANELA <= lei.length; i++) {
      if (janelas.has(lei.slice(i, i + JANELA).join(' '))) return r.docId
    }
  }
  return null
}

/** Confere a forma antes de confiar nos campos. */
function temForma(v: unknown): v is RespostaIA {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>

  const paras = o.paragraphs
  if (!Array.isArray(paras)) return false
  for (const p of paras) {
    if (!p || typeof p !== 'object') return false
    const q = p as Record<string, unknown>
    if (typeof q.text !== 'string') return false
    if (!Array.isArray(q.citations) || q.citations.some((c) => !Number.isInteger(c))) return false
  }

  const fontes = o.sources
  if (!Array.isArray(fontes)) return false
  for (const f of fontes) {
    if (!f || typeof f !== 'object') return false
    const g = f as Record<string, unknown>
    if (!Number.isInteger(g.id) || typeof g.doc_id !== 'string') return false
  }

  if (!['alta', 'média', 'baixa'].includes(o.confidence as string)) return false
  if (!Array.isArray(o.followups) || o.followups.some((s) => typeof s !== 'string')) return false

  return true
}

export function valida(bruto: unknown, contexto: Recuperado[]): Veredito {
  if (!temForma(bruto)) {
    return { ok: false, violacoes: [{ codigo: 'forma', detalhe: 'o JSON não tem a forma do esquema' }] }
  }

  const r = bruto
  const violacoes: Violacao[] = []

  const comTexto = r.paragraphs.filter((p) => p.text.trim().length > 0)
  if (comTexto.length === 0) {
    violacoes.push({ codigo: 'vazia', detalhe: 'nenhum parágrafo com texto' })
  }

  // --- 2. todo doc_id tem de ter vindo da busca -------------------------------
  const permitidos = new Set(contexto.map((c) => c.docId))
  for (const f of r.sources) {
    if (!permitidos.has(f.doc_id)) {
      violacoes.push({
        codigo: 'doc_id_fora_do_contexto',
        detalhe: `doc_id "${f.doc_id}" não está entre os dispositivos recuperados`,
      })
    }
  }

  // --- 3. toda citação tem de resolver ---------------------------------------
  const ids = new Set(r.sources.map((f) => f.id))
  for (const p of r.paragraphs) {
    for (const c of p.citations) {
      if (!ids.has(c)) {
        violacoes.push({
          codigo: 'citacao_orfa',
          detalhe: `o parágrafo cita a fonte ${c}, que não existe em sources`,
        })
      }
    }
  }

  // --- 4. o modelo não transcreve lei ----------------------------------------
  for (const p of r.paragraphs) {
    const copiado = transcreveuLei(p.text, contexto)
    if (copiado) {
      violacoes.push({
        codigo: 'transcreveu_lei',
        detalhe: `um parágrafo repete o texto de ${copiado}; o texto legal é transcrito pelo sistema, não por você`,
      })
    }
  }

  // --- 5. todo parágrafo tem âncora ------------------------------------------
  //
  // Confere sobre `comTexto`, e não sobre `r.paragraphs`: parágrafo vazio já é
  // recusado pela regra da resposta vazia, e acusá-lo duas vezes só encheria a
  // mensagem de correção com ruído que atrapalha a segunda tentativa.
  comTexto.forEach((p, i) => {
    if (p.citations.length === 0) {
      violacoes.push({
        codigo: 'paragrafo_sem_ancora',
        detalhe:
          `o parágrafo ${i + 1} não cita fonte nenhuma; todo parágrafo tem de apontar para ` +
          `ao menos um dispositivo do contexto`,
      })
    }
  })

  return violacoes.length === 0 ? { ok: true, dados: r } : { ok: false, violacoes }
}

/** A recusa vira instrução de correção para a segunda tentativa. */
export function recado(violacoes: Violacao[]): string {
  const linhas = violacoes.map((v) => `- ${v.detalhe}`).join('\n')
  return `A resposta anterior foi recusada pela validação do servidor:\n${linhas}\n\nRefaça, corrigindo exatamente esses pontos. Use apenas os doc_id do contexto e não transcreva o texto da lei.`
}
