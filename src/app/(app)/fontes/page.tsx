// =============================================================================
// /fontes — a vigília do corpus
//
// Componente de servidor, e as quatro leituras vão em paralelo: são
// independentes entre si, e encadeá-las somaria quatro idas ao Supabase no
// tempo de resposta.
//
// **A tela não coleta.** Quem fala com a Câmara e com o Senado é
// `/api/vigilia/coletar`, chamada pelo cron diário; aqui só se lê o que ela
// gravou. Uma tela que dispara coleta ao abrir põe a disponibilidade de duas
// APIs de terceiro no caminho do usuário e some junto com elas.
//
// A data de corte vem de `leis.vigencia_ate`, do banco, e não da constante de
// `lib/vigilia/alvos.ts`. As duas devem coincidir; quando divergirem, é o banco
// que está certo — ele é o que a peça cita.
// =============================================================================

import type { Metadata } from 'next'

import { Fontes } from '@/components/toga/fontes'
import { leis } from '@/lib/dados'
import { alteracoes, jurimetria, tesesCitantes, ultimasColetas } from '@/lib/vigilia/leitura'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fontes e atualizações — Toga',
  description:
    'Vigília sobre as três leis do corpus: o que foi proposto e o que virou lei depois da data de corte.',
}

export default async function PaginaFontes() {
  const [achados, coletas, teses, metricas, ls] = await Promise.all([
    alteracoes(),
    ultimasColetas(),
    tesesCitantes(),
    jurimetria(),
    leis(),
  ])

  // A data de corte é a mesma para as três leis do corpus; a primeira serve.
  const dataDeCorte = ls.ok ? (ls.dados[0]?.vigencia_ate ?? null) : null

  // Erro de leitura não derruba a tela: a vigília inteira é aviso, e uma tela
  // que explode no lugar de avisar é pior que uma tela que diz que não pôde
  // ler. Mesmo critério de `ErroBanco` nas outras telas, só que embutido —
  // aqui há quatro leituras, e três delas podem faltar sem inutilizar a quarta.
  const erro = !achados.ok ? achados.erro : !coletas.ok ? coletas.erro : null

  return (
    <Fontes
      alteracoes={achados.ok ? achados.dados : []}
      coletas={coletas.ok ? coletas.dados : {}}
      teses={teses.ok ? teses.dados : []}
      jurimetria={metricas.ok ? metricas.dados : []}
      dataDeCorte={dataDeCorte}
      erro={erro}
    />
  )
}
