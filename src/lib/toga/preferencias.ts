// =============================================================================
// TOGA v2 — o que o navegador guarda
//
// Duas preferências, as duas locais: lateral recolhida e movimento reduzido.
// São conforto de interface e só fazem sentido no aparelho onde foram
// escolhidas — guardá-las em tabela pediria migration, RLS e uma ida ao servidor
// a cada toque de interruptor, para depois recolher a lateral do celular porque
// alguém a recolheu no desktop.
//
// O **perfil** morava aqui e saiu: virou `public.perfil` no banco (migration
// 0008), com este arquivo emprestando só o cache. Ver `lib/toga/perfil.ts`.
//
// Um evento para todas: a lateral e o avatar do topo precisam reagir a uma
// mudança feita em `/configuracoes`, que é outra árvore de componentes. Sem o
// evento, recolher a lateral pelo ajuste só teria efeito no próximo F5.
// =============================================================================

'use client'

import { useEffect, useState } from 'react'

/** A mesma chave que a casca já usava — trocá-la esqueceria a escolha de quem já usa. */
const CHAVE_LATERAL = 'toga:lateral-colapsada'
const CHAVE_MOVIMENTO = 'toga:movimento-reduzido'

export const EVENTO_PREFERENCIAS = 'toga:preferencias'

/**
 * `localStorage` estoura no modo privado de alguns navegadores, e preferência
 * é conforto: falha de leitura vira padrão, falha de escrita vira preferência
 * que não sobrevive à aba. Nenhuma das duas pode derrubar a tela.
 *
 * Exportadas porque `lib/toga/perfil.ts` usa o mesmo armazenamento como cache do
 * que está no banco — e o cache tem de disparar o mesmo evento, senão o avatar
 * do topo não repinta quando o nome muda.
 */
export function leLocal(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}

export function gravaLocal(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    /* a preferência não persiste; a sessão atual funciona igual */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIAS))
}

// --- lateral -----------------------------------------------------------------

export const leColapso = () => leLocal(CHAVE_LATERAL) === '1'
export const gravaColapso = (v: boolean) => gravaLocal(CHAVE_LATERAL, v ? '1' : '0')

// --- movimento ---------------------------------------------------------------

export const leMovimentoReduzido = () => leLocal(CHAVE_MOVIMENTO) === '1'

export function gravaMovimentoReduzido(v: boolean) {
  gravaLocal(CHAVE_MOVIMENTO, v ? '1' : '0')
  aplicaMovimento(v)
}

/**
 * O ajuste só some com o movimento de quem NÃO desligou no sistema: a media
 * query de `globals.css` continua valendo por cima, e ninguém que já pediu
 * menos animação ao sistema operacional precisa vir aqui pedir de novo.
 */
export function aplicaMovimento(v: boolean) {
  const raiz = document.documentElement
  if (v) raiz.dataset.movimento = 'reduzido'
  else delete raiz.dataset.movimento
}

// --- leitura reativa ---------------------------------------------------------

/**
 * Lê uma preferência e reage às mudanças, venham de onde vierem.
 *
 * O valor inicial é o padrão, nunca o do disco: `localStorage` não existe no
 * servidor, e ler no primeiro render faria o HTML do servidor divergir do
 * cliente. O custo é um quadro com o padrão; o preço do atalho seria erro de
 * hidratação.
 */
export function usePreferencia<T>(ler: () => T, padrao: T): T {
  const [valor, setValor] = useState<T>(padrao)

  useEffect(() => {
    const reler = () => setValor(ler())
    reler()
    window.addEventListener(EVENTO_PREFERENCIAS, reler)
    // `storage` só dispara em OUTRAS abas — é o que mantém duas janelas do
    // produto de acordo sobre a mesma preferência.
    window.addEventListener('storage', reler)
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIAS, reler)
      window.removeEventListener('storage', reler)
    }
    // `ler` é recriada a cada render em quem chama; depender dela reinscreveria
    // o listener em todo quadro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return valor
}
