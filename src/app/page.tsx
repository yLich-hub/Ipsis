// =============================================================================
// / — não é tela, é desvio.
//
// Quem decide o destino é o middleware, que já tem a sessão validada em mãos:
// com sessão vai para `/consulta`, sem sessão vai para `/login`. Este arquivo é
// a rede de segurança para o caso de o `matcher` deixar de casar a raiz — o
// mesmo padrão de `(app)/layout.tsx`, que repete o guarda do middleware.
//
// Manda para o login, e não para o painel, porque este caminho não sabe quem é
// o visitante: ler a sessão aqui custaria uma ida ao servidor de Auth em toda
// visita. E mandar para o login já está certo nos dois estados — quem tem
// sessão é devolvido a `/consulta` pela regra de `ehFormularioDeAuth`. Uma volta
// a mais no caso raro, nenhuma chamada a mais no caso comum.
//
// A apresentação do projeto que vivia aqui não se perdeu: ela está em
// `/suporte` ("Como funciona"), que é onde o menu já a anunciava.
// =============================================================================

import { redirect } from 'next/navigation'

import { ROTA_LOGIN } from '@/lib/auth/rotas'

export default function Raiz() {
  redirect(ROTA_LOGIN)
}
