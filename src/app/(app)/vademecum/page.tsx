// =============================================================================
// /vademecum — acervo de consulta, no desenho de grade de ramos + leitor.
//
// 75 legislações agrupadas por área do direito. É a parte do produto que sai do
// recorte de tráfico de propósito: consulta ampla é o gesto mais comum de quem
// trabalha com direito, e o corpus curado, por definição, não atende.
//
// O filtro deixou de ser `?f=` em componente de servidor e virou estado de
// cliente: com o índice inteiro já em memória (é metadado, não texto de lei),
// filtrar sem ida à rede é instantâneo, e a grade de ramos precisa reagir ao
// filtro para não ficar mostrando ramo vazio.
//
// Metadado, nunca o texto das leis. O que busca dentro do texto é a busca
// híbrida, e ela só enxerga o corpus curado.
// =============================================================================

import type { Metadata } from 'next'

import { VadeMecum } from '@/components/toga/vademecum'
import { areasDoAcervo, leisDoAcervo, origemDoAcervo } from '@/lib/vademecum'
import { titulo } from '@/lib/toga/marca'

export const metadata: Metadata = { title: titulo('Vade Mecum') }

export default function PaginaAcervo() {
  return (
    <VadeMecum areas={areasDoAcervo()} leis={leisDoAcervo()} origem={origemDoAcervo()} />
  )
}
