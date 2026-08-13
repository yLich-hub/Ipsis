// =============================================================================
// "Marcar como conferido" — a única escrita que sai do navegador nesta tela
//
// Escreve com a sessão do usuário, como o histórico e a agenda de clientes. A
// policy de 0012 aceita `update` de `authenticated`, mas o `grant` é por
// COLUNA: só `reconferido_em` e `reconferido_por` passam. Uma tentativa de
// escrever `ementa` ou `url` daqui devolve 42501, e é assim que tem de ser —
// RLS decide linha, não coluna, e sem o grant restrito "pode marcar como lido"
// viraria "pode reescrever o link do ato oficial".
//
// **Marcar não é resolver.** O achado continua na lista; o que muda é que ele
// deixa de pedir atenção. Quem resolve é quem roda o parser sobre a nova
// redação — ver o cabeçalho de `supabase/migrations/0012_vigilia.sql`.
// =============================================================================

'use client'

import { supabaseNavegador } from '@/lib/auth/navegador'

export type Resultado = { ok: true } | { ok: false; erro: string }

export async function marca(id: string): Promise<Resultado> {
  try {
    const sb = supabaseNavegador()
    const { data: dono } = await sb.auth.getUser()
    if (!dono.user) return { ok: false, erro: 'sessão expirada — entre de novo' }

    const { error } = await sb
      .from('vigilia_alteracoes')
      .update({ reconferido_em: new Date().toISOString(), reconferido_por: dono.user.id })
      .eq('id', id)

    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha ao marcar' }
  }
}
