// =============================================================================
// /agente — rota antiga do console, agora em /consulta.
//
// O TOGA v2 tem uma tela de conversa só, e ela é `/consulta`. Manter o console
// anterior vivo em paralelo significaria duas implementações do mesmo chat
// divergindo a cada correção — o `redirect` é permanente porque a rota nova é
// definitiva, e link antigo em histórico ou favorito continua chegando lá.
// =============================================================================

import { permanentRedirect } from 'next/navigation'

export default function PaginaAgente(): never {
  permanentRedirect('/consulta')
}
