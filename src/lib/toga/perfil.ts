// =============================================================================
// Perfil do usuário — banco, com o navegador como cache
//
// Mora em `public.perfil` (migration 0008), uma linha por usuário, sob RLS por
// `auth.uid()`. Quem escreve é o cliente do NAVEGADOR, carregando a sessão — o
// cliente anônimo do servidor não enxergaria linha nenhuma, porque a policy
// exige `auth.uid()`. É o mesmo desenho do histórico de conversas.
//
// **O `localStorage` continua no caminho, mas mudou de papel.** Antes era a
// fonte; agora é cache. A diferença importa: o avatar do topo aparece em toda
// tela, e esperar uma ida ao banco para pintar duas letras faria o canto da
// interface piscar em cada navegação. O cache pinta na hora, o banco corrige
// depois — e é o banco que vale quando os dois discordam.
//
// Quem tinha perfil gravado antes desta migration não o perde: se o banco não
// tem linha e o cache tem conteúdo, `carrega()` sobe o que estava no navegador.
// Sem isso, a primeira abertura depois do deploy apagaria em silêncio o nome que
// a pessoa havia digitado.
//
// **O perfil não entra na minuta.** O `.docx` continua saindo com "Autos nº
// ____" e "Advogado(a) — OAB/__ nº ______" como campos a preencher. Preencher o
// cabeçalho de uma peça a partir de um ajuste de tela é decisão sobre a peça.
// =============================================================================

'use client'

import { supabaseNavegador } from '@/lib/auth/navegador'
import { gravaLocal, leLocal, usePreferencia } from '@/lib/toga/preferencias'

export type Perfil = {
  nome: string
  oab: string
  telefone: string
}

export const PERFIL_VAZIO: Perfil = { nome: '', oab: '', telefone: '' }

const CHAVE = 'toga:perfil'

/** Tetos iguais aos checks de 0008 — cortar aqui evita um 400 do PostgREST. */
const TETO = { nome: 120, oab: 40, telefone: 40 } as const

const limpa = (p: Perfil): Perfil => ({
  nome: p.nome.trim().slice(0, TETO.nome),
  oab: p.oab.trim().slice(0, TETO.oab),
  telefone: p.telefone.trim().slice(0, TETO.telefone),
})

const vazio = (p: Perfil) => !p.nome && !p.oab && !p.telefone

// --- cache -------------------------------------------------------------------

/** O que o navegador guardou da última leitura. Sem rede, síncrono. */
export function doCache(): Perfil {
  const cru = leLocal(CHAVE)
  if (!cru) return PERFIL_VAZIO
  try {
    const p = JSON.parse(cru) as Partial<Perfil>
    // Campo a campo, e não `{...PERFIL_VAZIO, ...p}`: o que veio do disco é
    // texto de origem desconhecida, e um `nome: 42` viraria `.trim` de número
    // no primeiro render.
    return {
      nome: typeof p.nome === 'string' ? p.nome : '',
      oab: typeof p.oab === 'string' ? p.oab : '',
      telefone: typeof p.telefone === 'string' ? p.telefone : '',
    }
  } catch {
    return PERFIL_VAZIO
  }
}

const noCache = (p: Perfil) => gravaLocal(CHAVE, JSON.stringify(p))

// --- banco -------------------------------------------------------------------

/**
 * Lê o perfil do banco e atualiza o cache. Qualquer falha devolve o cache: a
 * tela de ajustes não pode ficar em branco porque o banco pausou.
 */
export async function carrega(): Promise<Perfil> {
  try {
    const sb = supabaseNavegador()
    const { data: dono } = await sb.auth.getUser()
    if (!dono.user) return doCache()

    const { data, error } = await sb
      .from('perfil')
      .select('nome,oab,telefone')
      .eq('usuario_id', dono.user.id)
      .maybeSingle()

    if (error) return doCache()

    if (!data) {
      // Sem linha no banco. Se o navegador tem o perfil da versão anterior,
      // sobe — perder o que a pessoa digitou seria o pior desfecho possível
      // para uma migration que existe justamente para não perder.
      const local = doCache()
      if (!vazio(local)) {
        await salva(local)
        return local
      }
      return PERFIL_VAZIO
    }

    const p: Perfil = {
      nome: (data.nome as string) ?? '',
      oab: (data.oab as string) ?? '',
      telefone: (data.telefone as string) ?? '',
    }
    noCache(p)
    return p
  } catch {
    return doCache()
  }
}

/**
 * Grava no banco e no cache. Devolve `false` quando o banco recusou.
 *
 * O cache é escrito de qualquer jeito, e de propósito: a tela já mostra o que a
 * pessoa digitou, e apagar da tela o que ela acabou de escrever porque a rede
 * caiu seria pior que guardar localmente e avisar que não subiu.
 */
export async function salva(perfil: Perfil): Promise<boolean> {
  const p = limpa(perfil)
  noCache(p)

  try {
    const sb = supabaseNavegador()
    const { data: dono } = await sb.auth.getUser()
    if (!dono.user) return false

    const { error } = await sb
      .from('perfil')
      .upsert(
        { usuario_id: dono.user.id, ...p, atualizado_em: new Date().toISOString() },
        { onConflict: 'usuario_id' },
      )

    return !error
  } catch {
    return false
  }
}

// --- iniciais ----------------------------------------------------------------

/**
 * Duas letras para o avatar. Preferem o nome do perfil, quando existe; sem ele
 * caem no e-mail, que é o que havia antes de a tela de ajustes existir.
 *
 * É o que torna o campo "Nome" uma preferência de verdade em vez de um campo que
 * se preenche e nunca mais se vê.
 */
export function iniciais(nome: string, email: string): string {
  const partesNome = nome.trim().split(/\s+/).filter(Boolean)
  if (partesNome.length > 1) {
    return `${partesNome[0]![0]}${partesNome[partesNome.length - 1]![0]}`.toUpperCase()
  }
  if (partesNome.length === 1) return partesNome[0]!.slice(0, 2).toUpperCase()

  const local = email.split('@')[0] ?? ''
  const partes = local.split(/[._-]+/).filter(Boolean)
  const bruto =
    partes.length > 1 ? `${partes[0]![0]}${partes[1]![0]}` : local.slice(0, 2) || email.slice(0, 2)
  return bruto.toUpperCase()
}

/** O perfil do cache, reagindo a toda gravação. Quem precisa do banco chama `carrega()`. */
export const usePerfil = () => usePreferencia(doCache, PERFIL_VAZIO)
