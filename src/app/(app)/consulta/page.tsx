// =============================================================================
// /consulta — a tela de chat do TOGA v2
//
// Servidor só para duas coisas, e as duas existem por um motivo:
//
// 1. A saudação. Calcular a hora no cliente faria o HTML do servidor divergir do
//    primeiro render do navegador e o React acusaria erro de hidratação. Aqui a
//    hora é lida uma vez, no fuso de Brasília, e desce como texto pronto.
// 2. A pergunta da URL. `?p=` é como a lateral, a paleta do ⌘K e os atalhos das
//    outras telas mandam uma consulta para cá — em vez de um store global para
//    uma string.
// =============================================================================

import { Consulta } from '@/components/toga/consulta'

/**
 * Fuso fixo: o servidor da Vercel roda em UTC, e "Boa noite" às 15h de Brasília
 * é o tipo de detalhe que faz o produto parecer estrangeiro.
 */
function saudacaoDeAgora(): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(new Date()),
  )
  if (hora < 12) return 'Bom dia.'
  if (hora < 18) return 'Boa tarde.'
  return 'Boa noite.'
}

export default async function PaginaConsulta({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; c?: string }>
}) {
  const { p, c } = await searchParams
  return (
    <Consulta
      saudacao={saudacaoDeAgora()}
      perguntaInicial={p?.trim() || undefined}
      // `?c=` reabre uma conversa do histórico. Quem manda é ela: com os dois
      // parâmetros na URL, reabrir vence disparar pergunta nova.
      conversaInicial={c?.trim() || undefined}
    />
  )
}
