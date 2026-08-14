// =============================================================================
// Histórico de conversas — o que a lateral lista em "Recentes".
//
// Mora no banco, em `conversas` e `conversa_trocas` (migration 0007), e não em
// `localStorage`. A primeira versão usava o navegador e tinha duas limitações
// que tornavam o histórico diferente do que se espera de um chat: teto de 20
// conversas com despejo silencioso da mais antiga, e nada atravessando
// navegador ou máquina.
//
// **Aqui não há teto e não há expiração.** Conversa some quando o usuário a
// apaga, e só então.
//
// Quem escreve é o cliente do NAVEGADOR, carregando a sessão — é a RLS que
// garante que o histórico é do dono. O cliente anônimo do servidor
// (`lib/supabase.ts`) não enxergaria linha nenhuma, porque a policy exige
// `auth.uid()`.
//
// O que se guarda por troca é a RESPOSTA CRUA da busca, não a prosa já composta.
// A prosa é derivada — `comporResposta()` a reconstrói igual — e guardar o
// derivado dobraria o tamanho e criaria duas versões da mesma frase, uma delas
// congelada no dia em que foi salva.
// =============================================================================

import type { RespostaBusca } from '@/lib/busca/consultar'
import type { RespostaComposta } from '@/lib/toga/resposta'
import { supabaseNavegador } from '@/lib/auth/navegador'

export type Troca = {
  pergunta: string
  /** Resposta crua da busca. É dela que saem as fontes e a composta. */
  bruta: RespostaBusca
  /**
   * A prosa gerada pelo modelo, quando houve.
   *
   * A composta é derivada — `comporResposta()` a reconstrói igual, e guardá-la
   * dobraria o tamanho por nada. A gerada não: pedir de novo ao modelo daria
   * outro texto. Reabrir uma conversa e encontrar uma resposta diferente da que
   * se leu é pior que não ter histórico, então esta é a exceção à regra de só
   * guardar o cru.
   */
  gerada?: RespostaComposta | null
}

/**
 * A coluna `conversa_trocas.resposta` teve duas formas, e as duas continuam
 * válidas na leitura.
 *
 * Antes de a geração existir, ela guardava a `RespostaBusca` crua e nada mais.
 * Agora guarda `{ bruta, gerada }`. Migrar as linhas antigas exigiria um
 * `update` de escrita numa tabela que só o dono enxerga, para ganhar nada:
 * reconhecer as duas formas na leitura custa quatro linhas e não pode falhar.
 *
 * A distinção é a presença da chave `bruta` — `RespostaBusca` não tem esse
 * campo, então não há ambiguidade.
 */
function leResposta(cru: unknown): { bruta: RespostaBusca; gerada: RespostaComposta | null } {
  const o = cru as Record<string, unknown> | null
  if (o && typeof o === 'object' && 'bruta' in o) {
    return {
      bruta: o.bruta as RespostaBusca,
      gerada: (o.gerada as RespostaComposta | null) ?? null,
    }
  }
  return { bruta: cru as RespostaBusca, gerada: null }
}

const gravaResposta = (t: Troca) => ({ bruta: t.bruta, gerada: t.gerada ?? null })

/** Uma conversa na lista da lateral. Não traz as trocas — a lista não precisa delas. */
export type Conversa = {
  id: string
  titulo: string
  criadaEm: string
  atualizadaEm: string
  trocas: number
}

/** Uma conversa aberta, com o conteúdo. */
export type ConversaCompleta = Conversa & { conteudo: Troca[] }

/** Uma faixa de tempo na lateral: "Hoje", "Últimos 7 dias", "março de 2026". */
export type Grupo = { rotulo: string; itens: Conversa[] }

/** Disparado depois de toda escrita, para a lateral se atualizar sem recarregar. */
export const EVENTO_HISTORICO = 'toga:historico'

function avisa() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_HISTORICO))
}

/**
 * Título da conversa: a primeira pergunta, cortada.
 *
 * Corta em palavra inteira — "Dosimetria da pena na Lei de…" é legível,
 * "Dosimetria da pena na Lei de Dro…" com corte no meio da sílaba não é.
 */
export function tituloDe(pergunta: string, limite = 60): string {
  const limpo = pergunta.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite)
  const ultimo = corte.lastIndexOf(' ')
  return `${(ultimo > limite * 0.6 ? corte.slice(0, ultimo) : corte).trimEnd()}…`
}

/**
 * Conversas do usuário, da mais recente para a mais antiga.
 *
 * Devolve lista vazia em qualquer falha, e não lança: histórico é conforto. Se o
 * banco estiver fora, o chat continua respondendo — só a lateral fica sem a
 * lista, o que a própria tela diz.
 */
export async function lista(): Promise<Conversa[]> {
  const { data, error } = await supabaseNavegador()
    .from('conversas')
    .select('id,titulo,criada_em,atualizada_em,conversa_trocas(count)')
    .order('atualizada_em', { ascending: false })

  if (error || !data) return []

  return data.map((c) => ({
    id: c.id as string,
    titulo: c.titulo as string,
    criadaEm: c.criada_em as string,
    atualizadaEm: c.atualizada_em as string,
    // O agregado do PostgREST vem como `[{ count: n }]`.
    trocas: (c.conversa_trocas as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

/** Uma conversa com o conteúdo, para reabrir. `null` se não existir ou não for do usuário. */
export async function busca(id: string): Promise<ConversaCompleta | null> {
  const sb = supabaseNavegador()

  const [{ data: c, error: erroC }, { data: ts, error: erroT }] = await Promise.all([
    sb.from('conversas').select('id,titulo,criada_em,atualizada_em').eq('id', id).maybeSingle(),
    sb
      .from('conversa_trocas')
      .select('pergunta,resposta,ordem')
      .eq('conversa_id', id)
      .order('ordem', { ascending: true }),
  ])

  if (erroC || erroT || !c) return null

  return {
    id: c.id as string,
    titulo: c.titulo as string,
    criadaEm: c.criada_em as string,
    atualizadaEm: c.atualizada_em as string,
    trocas: ts?.length ?? 0,
    conteudo: (ts ?? []).map((t) => ({
      pergunta: t.pergunta as string,
      ...leResposta(t.resposta),
    })),
  }
}

/**
 * Acrescenta uma troca, criando a conversa se ainda não existir.
 *
 * A conversa nasce quando a primeira resposta chega, e não quando o usuário abre
 * a tela: do contrário a lateral encheria de conversas vazias a cada clique em
 * "Nova consulta".
 *
 * Devolve o id da conversa — que é o do banco, e pode não ser o `idSugerido`
 * quando a conversa é nova. Falha em silêncio e devolve `null`: perder o
 * histórico de uma troca é ruim, interromper a conversa por causa disso é pior.
 */
export async function registra(
  idSugerido: string | null,
  troca: Troca,
): Promise<string | null> {
  const sb = supabaseNavegador()

  try {
    let id = idSugerido

    if (id) {
      // Conversa existente: sobe o `atualizada_em` para ela subir na lista.
      const { error } = await sb
        .from('conversas')
        .update({ atualizada_em: new Date().toISOString() })
        .eq('id', id)
      if (error) id = null // sumiu debaixo dos pés (apagada em outra aba)
    }

    if (!id) {
      const { data: dono } = await sb.auth.getUser()
      if (!dono.user) return null

      const { data, error } = await sb
        .from('conversas')
        .insert({ usuario_id: dono.user.id, titulo: tituloDe(troca.pergunta) })
        .select('id')
        .single()
      if (error || !data) return null
      id = data.id as string
    }

    // `ordem` é o próximo índice. Lido antes de inserir porque a unicidade
    // (conversa_id, ordem) é o que impede duas gravações concorrentes de
    // ocuparem a mesma posição — a segunda falha em vez de embaralhar a leitura.
    const { count } = await sb
      .from('conversa_trocas')
      .select('id', { count: 'exact', head: true })
      .eq('conversa_id', id)

    const { error } = await sb.from('conversa_trocas').insert({
      conversa_id: id,
      ordem: count ?? 0,
      pergunta: troca.pergunta,
      resposta: gravaResposta(troca),
    })
    if (error) return null

    avisa()
    return id
  } catch {
    return null
  }
}

/**
 * Busca no histórico por título **e por pergunta de dentro da conversa**.
 *
 * Procurar só no título seria quase inútil: o título é a PRIMEIRA pergunta, e o
 * que se costuma procurar é uma pergunta de seguimento — "onde foi que eu
 * perguntei sobre busca domiciliar?" raramente é o começo do chat.
 *
 * São duas consultas em vez de uma porque o PostgREST não faz `or` que atravesse
 * a tabela embutida. Duas idas paralelas custam menos que uma view nova.
 */
export async function procura(termo: string): Promise<Conversa[]> {
  const t = termo.trim()
  if (!t) return lista()

  const sb = supabaseNavegador()

  // `%` e `_` são curingas do `ilike`, e **escapá-los com barra invertida não
  // funciona por aqui**: conferido contra o banco, `%100\%%` casa exatamente o
  // mesmo que `%100%%`, e `%\_%` devolve tudo — a barra não sobrevive ao
  // PostgREST. Então eles são removidos do termo, não escapados.
  //
  // O efeito é o certo: procurar "100%" procura "100" e acha "Redução de 100% da
  // pena". Um caractere a menos de precisão é muito melhor que uma busca que
  // silenciosamente devolve o histórico inteiro.
  const padrao = `%${t.replace(/[%_\\]/g, '')}%`
  if (padrao === '%%') return lista()

  const [porTitulo, porPergunta] = await Promise.all([
    sb
      .from('conversas')
      .select('id,titulo,criada_em,atualizada_em,conversa_trocas(count)')
      .ilike('titulo', padrao)
      .order('atualizada_em', { ascending: false }),
    sb.from('conversa_trocas').select('conversa_id').ilike('pergunta', padrao).limit(500),
  ])

  const achadas = new Map<string, Conversa>()
  for (const c of porTitulo.data ?? []) {
    achadas.set(c.id as string, {
      id: c.id as string,
      titulo: c.titulo as string,
      criadaEm: c.criada_em as string,
      atualizadaEm: c.atualizada_em as string,
      trocas: (c.conversa_trocas as { count: number }[] | null)?.[0]?.count ?? 0,
    })
  }

  const idsPorPergunta = [
    ...new Set((porPergunta.data ?? []).map((r) => r.conversa_id as string)),
  ].filter((id) => !achadas.has(id))

  if (idsPorPergunta.length) {
    const { data } = await sb
      .from('conversas')
      .select('id,titulo,criada_em,atualizada_em,conversa_trocas(count)')
      .in('id', idsPorPergunta)
    for (const c of data ?? []) {
      achadas.set(c.id as string, {
        id: c.id as string,
        titulo: c.titulo as string,
        criadaEm: c.criada_em as string,
        atualizadaEm: c.atualizada_em as string,
        trocas: (c.conversa_trocas as { count: number }[] | null)?.[0]?.count ?? 0,
      })
    }
  }

  return [...achadas.values()].sort(
    (a, b) => Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm),
  )
}

/**
 * Agrupa por faixa de tempo, como o histórico de qualquer chat.
 *
 * Sem isto, 200 conversas viram uma lista plana de 200 linhas iguais. As faixas
 * existem para o olho encontrar "aquela de terça" sem ler tudo.
 *
 * A lista tem de vir ordenada da mais recente para a mais antiga — os grupos
 * saem na ordem em que aparecem, e não são reordenados depois.
 */
export function agrupa(conversas: Conversa[], agora = new Date()): Grupo[] {
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hoje = inicioDoDia(agora)
  const DIA = 86_400_000

  const rotuloDe = (iso: string): string => {
    const d = new Date(iso)
    const dia = inicioDoDia(d)
    if (dia >= hoje) return 'Hoje'
    if (dia >= hoje - DIA) return 'Ontem'
    if (dia > hoje - 7 * DIA) return 'Últimos 7 dias'
    if (dia > hoje - 30 * DIA) return 'Últimos 30 dias'
    // Mais antigo que um mês vira mês por extenso. Com o ano junto, porque
    // "março" sem ano é ambíguo assim que o produto passa de um aniversário.
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  const grupos: Grupo[] = []
  for (const c of conversas) {
    const rotulo = rotuloDe(c.atualizadaEm)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.rotulo === rotulo) ultimo.itens.push(c)
    else grupos.push({ rotulo, itens: [c] })
  }
  return grupos
}

/** Apaga a conversa. As trocas vão junto, por `on delete cascade`. */
export async function remove(id: string): Promise<void> {
  try {
    await supabaseNavegador().from('conversas').delete().eq('id', id)
  } catch {
    /* histórico é conforto */
  }
  avisa()
}

/** Renomeia. Existe para o usuário poder consertar um título ruim. */
export async function renomeia(id: string, titulo: string): Promise<void> {
  const limpo = titulo.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!limpo) return
  try {
    await supabaseNavegador().from('conversas').update({ titulo: limpo }).eq('id', id)
  } catch {
    /* idem */
  }
  avisa()
}
