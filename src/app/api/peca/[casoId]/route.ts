// =============================================================================
// GET /api/peca/[casoId] — baixa a resposta à acusação em .docx
//
// `runtime = 'nodejs'`: a lib docx não roda no Edge (CLAUDE.md, "Deploy").
//
// A rota não decide nada sobre o conteúdo. Ela lê o caso e as teses do banco,
// aplica o mesmo `aplicaA()` que a tela usa no checklist, resolve as citações
// contra `dispositivos` e empacota. Tela e arquivo saem do mesmo cálculo — se
// divergissem, a conferência que o usuário faz na tela não valeria para o
// arquivo que ele protocola.
//
// Nenhuma chamada a modelo acontece aqui, e não é por economia: a argumentação
// já está escrita e revisada em `data/curadoria/teses.yaml`, e o texto legal vem
// do banco. Não há frase nesta peça que alguém não tenha lido antes.
// =============================================================================

import { NextResponse } from 'next/server'

import { aplicaA, caso as leCaso, tesesComTemplate } from '@/lib/dados'
import { CitacaoOrfa, montarPeca } from '@/lib/peca/montar'
import { pecaEmDocx } from '@/lib/peca/docx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ casoId: string }> },
) {
  const { casoId } = await params

  const [c, ts] = await Promise.all([leCaso(casoId), tesesComTemplate()])

  if (!c.ok) return NextResponse.json({ erro: c.erro }, { status: 503 })
  if (!ts.ok) return NextResponse.json({ erro: ts.erro }, { status: 503 })
  if (!c.dados) return NextResponse.json({ erro: 'caso não encontrado' }, { status: 404 })

  const aplicaveis = ts.dados.filter((t) => aplicaA(t, c.dados))

  try {
    const peca = await montarPeca(c.dados, aplicaveis)
    const buffer = await pecaEmDocx(peca)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // `filename*` em UTF-8 porque o id do caso é ASCII mas o prefixo não
        // precisa ser; e `attachment` para o navegador baixar em vez de tentar
        // renderizar um zip.
        'Content-Disposition': `attachment; filename="resposta-acusacao-${casoId}.docx"`,
        // A minuta reflete o banco no instante do download. Guardar em cache
        // serviria uma peça velha depois de a curadoria mudar.
        'Cache-Control': 'no-store',
        'X-Teses-Aplicadas': String(aplicaveis.length),
        'X-Dispositivos-Citados': String(peca.citados.length),
      },
    })
  } catch (e) {
    // Citação órfã não vira minuta parcial: vira erro. Ver o cabeçalho de
    // `lib/peca/montar.ts`.
    if (e instanceof CitacaoOrfa) {
      return NextResponse.json({ erro: e.message, ids: e.ids }, { status: 500 })
    }
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'falha ao montar a minuta' },
      { status: 500 },
    )
  }
}
