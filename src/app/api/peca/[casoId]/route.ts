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

import { usuarioAtual } from '@/lib/auth/servidor'
import { aplicaA, caso as leCaso, tesesComTemplate } from '@/lib/dados'
import { CitacaoOrfa, montarPeca } from '@/lib/peca/montar'
import { pecaEmDocx } from '@/lib/peca/docx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ casoId: string }> },
) {
  // **A sessão é conferida aqui, e não só no middleware.** O `matcher` pula
  // qualquer caminho terminado em `.txt`, `.xml`, `.svg` e companhia — e num
  // segmento dinâmico é o chamador quem escolhe o fim do caminho. Medido antes
  // do conserto: `/api/peca/caso.txt` não passava pelo middleware, enquanto
  // `/api/peca/caso_flagrante` passava.
  //
  // Nada vazava por ali, e é justo dizê-lo: nenhum id de `casos.yaml` termina em
  // extensão excluída, e `public.casos` tem leitura pública por projeto — é
  // curadoria de demonstração. O que se fechou foi a classe de erro, antes que a
  // próxima rota com segmento dinâmico nascesse sem porteiro. As páginas já
  // tinham essa segunda camada em `(app)/layout.tsx`; as rotas de API, nenhuma.
  //
  // Conferido contra `next start`: hoje o middleware pega antes e devolve 307
  // para `/login`, inclusive em `/api/peca/<id>.txt`, que antes ele nem via.
  // Este 401 é a rede que fica embaixo — o caminho normal nunca chega nele.
  const usuario = await usuarioAtual()
  if (!usuario) return NextResponse.json({ erro: 'sessão necessária' }, { status: 401 })

  const { casoId } = await params

  const [c, ts] = await Promise.all([leCaso(casoId), tesesComTemplate()])

  if (!c.ok) return NextResponse.json({ erro: c.erro }, { status: 503 })
  if (!ts.ok) return NextResponse.json({ erro: ts.erro }, { status: 503 })
  // Caso inexistente é 404, não 503: até `tentaTalvez` existir, "não encontrado"
  // vinha como erro de banco e este ramo era inalcançável.
  if (!c.dados) return NextResponse.json({ erro: 'caso não encontrado' }, { status: 404 })

  // Ligado a um const local porque o estreitamento de `c.dados` não atravessa a
  // fronteira do callback abaixo.
  const caso = c.dados
  const aplicaveis = ts.dados.filter((t) => aplicaA(t, caso))

  try {
    const peca = await montarPeca(caso, aplicaveis)
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
