// =============================================================================
// /decretos — o acervo de decretos estaduais do Paraná.
//
// Decretos do Executivo do Paraná, 2022–2026, na redação **compilada** que a
// fonte publica, colhidos por `coletores/parana.py` e semeados em
// `decretos_pr` (migration 0018).
//
// **É acervo de consulta, não corpus citável.** Nenhum decreto vira `{{cite:}}`
// e nenhum entra na minuta — a separação é estrutural, pelo espaço de id
// (`decpr:2025:8812` nunca casa `lei_11343_2006_art33_p4`) e pela ausência de
// FK para `dispositivos`. É a mesma regra do acervo Vade Mecum e dos
// precedentes do STJ, e a razão inteira está no cabeçalho da migration.
//
// **O recorte é normativo.** Dos 17.778 decretos publicados na janela, a
// esmagadora maioria é ato de pessoal — nomeação, exoneração, designação —, e
// eles ficaram de fora por `data/curadoria/decretos_pr.yaml`. O levantamento
// que mediu isso está em `docs/decretos-pr-levantamento.md`.
// =============================================================================

import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Decretos } from '@/components/toga/decretos'
import { ErroBanco } from '@/components/toga/estados'
import { Selo } from '@/components/toga/base'
import { decretos } from '@/lib/decretos/leitura'
import { titulo } from '@/lib/toga/marca'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: titulo('Decretos do Paraná'),
  description:
    'Decretos normativos do Executivo do Paraná, na redação compilada publicada pela Casa Civil.',
}

export default async function PaginaDecretos() {
  const r = await decretos()

  if (!r.ok) {
    return (
      <div className="flex-1 p-6 lg:overflow-y-auto">
        <ErroBanco erro={r.erro} />
      </div>
    )
  }

  const anos = [...new Set(r.dados.map((d) => d.ano))].sort()
  const janela = anos.length ? `${anos[0]}–${anos[anos.length - 1]}` : '—'

  return (
    <>
      <Cabecalho
        titulo="Decretos do Paraná"
        sub={`${r.dados.length} decretos normativos · ${janela} · redação compilada`}
      >
        {/* O mesmo aviso que o acervo Vade Mecum carrega, e pelo mesmo motivo:
            o que se pode citar em peça é o corpus curado, e só ele. */}
        <Selo tom="ambar" title="Acervo de consulta: decreto estadual não é fundamento de peça">
          não citável
        </Selo>
      </Cabecalho>

      <Decretos linhas={r.dados} />
    </>
  )
}
