'use client'

// =============================================================================
// Menu da conta, no canto do cabeçalho — quem está logado e como sair.
//
// Substitui o avatar decorativo que existia enquanto o projeto não tinha
// autenticação. O padrão de menu é o mesmo do `Seletor` do console do agente:
// botão, sobreposição invisível para fechar no clique fora, lista abaixo.
//
// Sair não navega daqui: `signOut()` derruba o cookie e o evento SIGNED_OUT é
// tratado num lugar só, no ProvedorSessao. Duplicar a navegação nos dois
// lugares é como se fabrica redirecionamento em corrida.
// =============================================================================

import { useEffect, useState } from 'react'

import { Icone } from '@/components/icones'
import { marcarSaidaDeliberada, useUsuario } from '@/components/casca/sessao'
import { supabaseNavegador } from '@/lib/auth/navegador'

/** Duas letras do e-mail — não há nome de exibição no escopo, e não vale inventar. */
function iniciais(email: string): string {
  const local = email.split('@')[0] ?? ''
  const partes = local.split(/[._-]+/).filter(Boolean)
  const bruto =
    partes.length > 1 ? `${partes[0]![0]}${partes[1]![0]}` : local.slice(0, 2) || email.slice(0, 2)
  return bruto.toUpperCase()
}

export function Conta() {
  const usuario = useUsuario()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  if (!usuario?.email) return null

  async function sair() {
    if (saindo) return
    setSaindo(true)
    marcarSaidaDeliberada()
    const { error } = await supabaseNavegador().auth.signOut()
    if (error) {
      // Sessão já inválida no servidor devolve erro — e mesmo assim o cookie
      // local foi limpo. Insistir com a tela travada em "Saindo…" seria pior
      // que seguir para o login.
      setSaindo(false)
      setAberto(false)
    }
  }

  const email = usuario.email

  return (
    <div className="relative">
      {aberto && (
        <button
          type="button"
          aria-label="Fechar menu da conta"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setAberto(false)}
        />
      )}

      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={email}
        className="ml-1 grid size-8 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-[11px] font-semibold text-slate-950 ring-1 ring-white/10 transition-shadow hover:ring-emerald-400/40"
      >
        {iniciais(email)}
        <span className="sr-only">Conta de {email}</span>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#1E293B] p-1 shadow-2xl shadow-black/50"
        >
          <div className="px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Sessão ativa
            </p>
            <p className="mt-1 truncate text-[13px] text-slate-200" title={email}>
              {email}
            </p>
          </div>

          <div className="my-1 border-t border-white/[0.06]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => void sair()}
            disabled={saindo}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {saindo ? (
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : (
              <Icone nome="cadeado" className="size-3.5 shrink-0 text-slate-500" />
            )}
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      )}
    </div>
  )
}
