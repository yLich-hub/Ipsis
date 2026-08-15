// =============================================================================
// /jurisprudencia — entendimento consolidado ligado às teses.
//
// Duas fontes, e a diferença entre elas é o ponto da tela:
//
// 1. `teses.jurisprudencia` — curadoria manual, 15 entradas. Súmulas e julgados
//    escolhidos à mão para sustentar uma tese da peça. **Não têm situação**: não
//    há como acompanhar, e por isso a tela não inventa um selo de vigência.
//
// 2. `precedentes_stj` — 61 temas qualificados do Portal de Dados Abertos do
//    STJ, sob CC-BY (migration 0014). **Têm situação**, e é ela que justifica a
//    fonte existir: 14 estão cancelados ou sobrestados.
//
// O desenho do TOGA v2 é de buscador de acórdãos; o que se aproveitou dele e o
// que se recusou está no cabeçalho de `components/toga/jurisprudencia.tsx`.
//
// **Nenhuma das duas vira fundamento de peça.** A minuta continua citando só
// `dispositivos`, conferidos e datados — ver a migration 0014.
// =============================================================================

import type { Metadata } from 'next'

import { Jurisprudencia, type Linha } from '@/components/toga/jurisprudencia'
import { ErroBanco } from '@/components/toga/estados'
import { teses } from '@/lib/dados'
import { agrupaPorTese, precedentes } from '@/lib/vigilia/precedentes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jurisprudência — Toga',
  description:
    'Entendimento consolidado e precedentes qualificados do STJ, com a situação de cada um.',
}

export default async function PaginaJurisprudencia() {
  // Em paralelo: são independentes, e encadeá-las somaria duas idas ao Supabase.
  const [ts, ps] = await Promise.all([teses(), precedentes()])

  if (!ts.ok) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <ErroBanco erro={ts.erro} />
      </div>
    )
  }

  const curadas: Linha[] = ts.dados.flatMap((t) =>
    (t.jurisprudencia ?? []).map((j) => ({ ...j, origem: t.nome, origemId: t.id })),
  )

  // Falha ao ler os precedentes vira lista vazia, não tela de erro: a curadoria
  // manual continua de pé sozinha, e perder a metade nova é degradação, não
  // pane. Mesma escolha do histórico de conversas.
  const doStj: Linha[] = ps.ok
    ? agrupaPorTese(
        ps.dados,
        ts.dados.map((t) => ({ id: t.id, nome: t.nome, fundamentos: t.fundamentos ?? [] })),
      ).map(({ precedente: p, origem, origemId }) => ({
        tribunal: 'STJ',
        classe: p.tipo,
        numero: p.numero,
        // A questão submetida entra quando não há tese firmada — tema afetado
        // ainda não tem tese, e mostrar o cartão vazio seria pior que mostrar a
        // pergunta que o STJ vai responder.
        tese: p.teseFirmada ?? p.questao ?? undefined,
        situacao: p.situacao,
        origem,
        origemId,
      }))
    : []

  return <Jurisprudencia linhas={[...curadas, ...doStj]} />
}
