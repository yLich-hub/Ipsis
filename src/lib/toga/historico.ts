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
import { supabaseNavegador } from '@/lib/auth/navegador'

export type Troca = {
  pergunta: string
  /** Resposta crua da busca. A prosa é recomposta na leitura. */
  bruta: RespostaBusca
}

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
      bruta: t.resposta as RespostaBusca,
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
      resposta: troca.bruta,
    })
    if (error) return null

    avisa()
    return id
  } catch {
    return null
  }
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
