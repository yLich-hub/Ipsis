// =============================================================================
// Formatação de exibição
//
// `date` do Postgres não tem fuso, mas chega como '2025-02-28' ou como Date à
// meia-noite UTC. `toLocaleDateString('pt-BR')` puxa para UTC−3 e imprime 27/02
// no lugar de 28/02. Numa data de corte de redação legal isso não é detalhe
// cosmético — é a diferença entre citar a redação certa e a anterior.
// =============================================================================

export function dataBR(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const t = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return '—'
  const dia = String(t.getUTCDate()).padStart(2, '0')
  const mes = String(t.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${t.getUTCFullYear()}`
}

export const numeroBR = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—'

/** 'Art. 33' a partir de '33'; '7-A' vira 'Art. 7º-A' quando cabe o ordinal. */
export function tituloArtigo(numero: string): string {
  const base = Number(numero.split('-')[0])
  const ordinal = base >= 1 && base <= 9 ? numero.replace(/^(\d)/, '$1º') : numero
  return `Art. ${ordinal}`
}

/** Mesmo contrato de `public.norm()` no banco: sem acento, caixa baixa. */
export const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
