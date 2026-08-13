// =============================================================================
// Histórico de conversas — o que a lateral lista em "Recentes".
//
// Guarda em `localStorage`, e não no banco, pela mesma razão das súmulas salvas:
// é estado de leitura de um usuário só. Uma tabela exigiria migration, policy de
// RLS e uma ida de rede a cada troca — para guardar o que o próprio navegador
// guarda de graça. **A consequência é aceita e precisa ser dita: o histórico não
// atravessa navegador nem máquina.** Se isso passar a importar, o caminho é uma
// tabela `conversas` com RLS por `auth.uid()`, e este módulo vira a interface
// que ela implementa.
//
// O que se guarda por troca é a RESPOSTA CRUA da busca, não a prosa já composta.
// A prosa é derivada — `comporResposta()` a reconstrói igual — e guardar o
// derivado dobraria o tamanho e criaria duas versões da mesma frase, uma delas
// congelada no dia em que foi salva.
// =============================================================================

import type { RespostaBusca } from '@/lib/busca/consultar'

const CHAVE = 'toga:conversas'

/**
 * Teto de conversas guardadas.
 *
 * `localStorage` dá ~5 MB por origem, e uma troca com 8 dispositivos pesa
 * dezenas de KB por causa do texto legal. 20 conversas cabem com folga; passar
 * disso é trocar histórico antigo por risco de estourar a cota no meio de uma
 * gravação.
 */
const MAX_CONVERSAS = 20

export type Troca = {
  pergunta: string
  /** Resposta crua da busca. A prosa é recomposta na leitura. */
  bruta: RespostaBusca
}

export type Conversa = {
  id: string
  titulo: string
  criadaEm: number
  atualizadaEm: number
  trocas: Troca[]
}

/** Disparado depois de toda gravação, para a lateral se atualizar sem recarregar. */
export const EVENTO_HISTORICO = 'toga:historico'

const noNavegador = () => typeof window !== 'undefined'

function avisa() {
  if (noNavegador()) window.dispatchEvent(new CustomEvent(EVENTO_HISTORICO))
}

/**
 * Título da conversa: a primeira pergunta, cortada.
 *
 * Corta em palavra inteira — "Dosimetria da pena na Lei de Dr…" é legível,
 * "Dosimetria da pena na Lei de Dro…" com corte no meio da sílaba não é.
 */
export function tituloDe(pergunta: string, limite = 42): string {
  const limpo = pergunta.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite)
  const ultimo = corte.lastIndexOf(' ')
  return `${(ultimo > limite * 0.6 ? corte.slice(0, ultimo) : corte).trimEnd()}…`
}

/**
 * `JSON.parse` garante JSON, não a forma esperada. Um valor corrompido que fosse
 * objeto passaria e estouraria no primeiro `.map()`, já em render — por isso
 * cada campo é conferido antes de a conversa entrar na lista.
 */
function ehConversa(x: unknown): x is Conversa {
  if (!x || typeof x !== 'object') return false
  const c = x as Partial<Conversa>
  return (
    typeof c.id === 'string' &&
    typeof c.titulo === 'string' &&
    typeof c.criadaEm === 'number' &&
    typeof c.atualizadaEm === 'number' &&
    Array.isArray(c.trocas) &&
    c.trocas.every((t) => t && typeof t.pergunta === 'string' && Boolean(t.bruta))
  )
}

/** Todas as conversas, da mais recente para a mais antiga. */
export function lista(): Conversa[] {
  if (!noNavegador()) return []
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    const lido: unknown = bruto ? JSON.parse(bruto) : null
    if (!Array.isArray(lido)) return []
    return lido.filter(ehConversa).sort((a, b) => b.atualizadaEm - a.atualizadaEm)
  } catch {
    // Modo privado de alguns navegadores estoura no getItem. Seguir sem
    // histórico é melhor que a tela não abrir.
    return []
  }
}

export function busca(id: string): Conversa | null {
  return lista().find((c) => c.id === id) ?? null
}

/**
 * Grava, podando o excesso.
 *
 * `QuotaExceededError` é tratado descartando a conversa mais antiga e tentando
 * de novo, em vez de perder a gravação em curso: quem está conversando agora
 * importa mais que o histórico de duas semanas atrás.
 */
function grava(conversas: Conversa[]): void {
  if (!noNavegador()) return
  let fila = conversas.slice(0, MAX_CONVERSAS)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(fila))
      return
    } catch {
      if (fila.length <= 1) return // não cabe nem uma; desiste em silêncio
      fila = fila.slice(0, fila.length - 1)
    }
  }
}

/** Id novo. `crypto.randomUUID` existe em todo navegador que roda este app. */
export function novoId(): string {
  if (noNavegador() && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c${Date.now().toString(36)}`
}

/**
 * Acrescenta uma troca à conversa, criando-a se ainda não existir.
 *
 * A conversa só nasce quando a primeira resposta chega — não quando o usuário
 * abre a tela. Caso contrário a lateral encheria de conversas vazias a cada
 * clique em "Nova consulta".
 */
export function registra(id: string, troca: Troca): Conversa {
  const todas = lista()
  const atual = todas.find((c) => c.id === id)
  const agora = Date.now()

  const conversa: Conversa = atual
    ? { ...atual, atualizadaEm: agora, trocas: [...atual.trocas, troca] }
    : {
        id,
        titulo: tituloDe(troca.pergunta),
        criadaEm: agora,
        atualizadaEm: agora,
        trocas: [troca],
      }

  grava([conversa, ...todas.filter((c) => c.id !== id)])
  avisa()
  return conversa
}

export function remove(id: string): void {
  grava(lista().filter((c) => c.id !== id))
  avisa()
}

export function limpa(): void {
  if (!noNavegador()) return
  try {
    window.localStorage.removeItem(CHAVE)
  } catch {
    /* idem */
  }
  avisa()
}
