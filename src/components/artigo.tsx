// =============================================================================
// Página de artigo — o destino de toda citação do produto.
//
// Serve /artigo/[id] e /dispositivo/[id]: são a mesma tela, muda só o
// dispositivo em destaque. Um § 4º isolado não se sustenta (é o mesmo motivo
// pelo qual `texto_embed` carrega o caput junto), então a citação sempre abre o
// artigo inteiro com o dispositivo marcado, nunca um fragmento sem contexto.
// =============================================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Icone } from '@/components/icones'
import { Aviso, ErroBanco, Selo } from '@/components/ui'
import { artigo, dispositivosDoArtigo, rubricasDe, vizinhos, type Dispositivo } from '@/lib/dados'
import { dataBR, tituloArtigo } from '@/lib/formato'

const RECUO: Record<Dispositivo['tipo'], string> = {
  caput: '',
  paragrafo: '',
  inciso: 'pl-6',
  alinea: 'pl-12',
}

export async function PaginaArtigo({
  artigoId,
  destaque,
}: {
  artigoId: string
  destaque?: string
}) {
  // A ordem do artigo no documento não está em `v_dispositivo` (a view carrega
  // a ordem do dispositivo dentro do artigo) — daí a leitura da tabela junto.
  const [ds, a] = await Promise.all([dispositivosDoArtigo(artigoId), artigo(artigoId)])
  if (!ds.ok) return <ErroBanco erro={ds.erro} />
  if (ds.dados.length === 0) notFound()

  const primeiro = ds.dados[0]!
  const [rubs, viz] = await Promise.all([
    rubricasDe(ds.dados.map((d) => d.id)),
    vizinhos(primeiro.lei_id, a.ok && a.dados ? a.dados.ordem : 0),
  ])

  const rubricasDoArtigo = rubs.ok
    ? [
        ...new Map(
          rubs.dados
            .filter((r) => r.rubricas)
            .map((r) => [r.rubricas!.termo, { ...r.rubricas!, papel: r.papel }]),
        ).values(),
      ]
    : []

  const trilha = [primeiro.titulo, primeiro.capitulo, primeiro.secao].filter(Boolean) as string[]

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      {/* ---------- contexto ---------- */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px] text-tg-fraco-3">
        <Link href="/leis" className="hover:text-tg-tinta-4">
          Legislação
        </Link>
        <span>/</span>
        <Link href={`/leis/${primeiro.lei_id}`} className="hover:text-tg-tinta-4">
          {primeiro.lei_apelido}
        </Link>
      </nav>

      {trilha.length > 0 && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-tg-fraco-3">{trilha.join(' › ')}</p>
      )}

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-tg-tinta">
          {tituloArtigo(primeiro.artigo_numero)}
        </h1>
        {primeiro.artigo_rubrica && (
          <span className="text-[15px] text-tg-acento-txt">{primeiro.artigo_rubrica}</span>
        )}
        {primeiro.artigo_revogado && <Selo tom="vermelho">revogado</Selo>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-tg-fraco-3">
        <span className="flex items-center gap-1">
          <Icone nome="alerta" className="size-3" />
          redação vigente em {dataBR(primeiro.vigencia_ate)}
        </span>
        <span>·</span>
        <span>{primeiro.lei_nome}</span>
        {primeiro.cobertura === 'parcial' && <Selo tom="ambar">cobertura parcial</Selo>}
        {primeiro.artigo_conferido_em && (
          <Selo title="Artigo de curadoria manual, conferido contra o texto oficial">
            conferido em {dataBR(primeiro.artigo_conferido_em)}
          </Selo>
        )}
      </div>

      {primeiro.cobertura === 'parcial' && primeiro.cobertura_nota && (
        <Aviso className="mt-4">{primeiro.cobertura_nota}</Aviso>
      )}

      {/* ---------- texto ---------- */}
      <div className="mt-6 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-tg-linha bg-white">
        {ds.dados.map((d) => {
          const marcado = d.id === destaque
          return (
            <div
              key={d.id}
              id={d.id}
              className={`scroll-mt-6 px-4 py-3 ${marcado ? 'bg-tg-acento-fraco ring-1 ring-inset ring-tg-acento-palido' : ''}`}
            >
              <div className={`flex gap-3 ${RECUO[d.tipo]}`}>
                <span
                  className={`w-12 shrink-0 pt-px text-[12.5px] font-medium tabular-nums ${
                    marcado ? 'text-tg-acento-txt' : 'text-tg-fraco-3'
                  }`}
                >
                  {d.rotulo === 'caput' ? '' : d.rotulo}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-relaxed text-tg-tinta-2">{d.texto}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-tg-tenue-2">
                    <Link href={`/dispositivo/${d.id}`} className="hover:text-tg-acento-txt">
                      {d.citacao}
                    </Link>
                    <code className="text-tg-corpo-2">{d.id}</code>
                    {d.revogado && <Selo tom="vermelho">revogado</Selo>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ---------- rubricas ---------- */}
      {rubricasDoArtigo.length > 0 && (
        <>
          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
            Rubricas ligadas
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {rubricasDoArtigo.map((r) => (
              <li key={r.termo}>
                <Link
                  // Vai para o chat com a rubrica já consultada. É a mesma busca
                  // híbrida da página `/busca`, que saiu por ser a duplicata dela.
                  href={`/consulta?p=${encodeURIComponent(r.termo)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-tg-linha bg-tg-fundo px-2.5 py-1.5 text-[12.5px] text-tg-tinta-4 transition-colors hover:border-tg-acento-palido hover:text-tg-acento-txt"
                  title={
                    r.origem === 'oficial'
                      ? 'Rubrica marginal do Vade Mecum, devolvida ao dispositivo certo pela limpeza'
                      : 'Termo coloquial curado à mão'
                  }
                >
                  {r.termo}
                  <span className="text-[10px] text-tg-tenue-2">{r.origem}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------- vizinhos ---------- */}
      <nav className="mt-8 flex items-center gap-3 border-t border-tg-linha pt-4 pb-6">
        {viz.anterior ? (
          <Link
            href={`/artigo/${viz.anterior.id}`}
            className="flex min-w-0 items-center gap-2 text-[13px] text-tg-corpo hover:text-tg-acento-txt"
          >
            <Icone nome="seta_esquerda" className="size-4 shrink-0" />
            <span className="truncate">
              {tituloArtigo(viz.anterior.numero)}
              {viz.anterior.rubrica ? ` · ${viz.anterior.rubrica}` : ''}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {viz.proximo && (
          <Link
            href={`/artigo/${viz.proximo.id}`}
            className="ml-auto flex min-w-0 items-center gap-2 text-[13px] text-tg-corpo hover:text-tg-acento-txt"
          >
            <span className="truncate">
              {tituloArtigo(viz.proximo.numero)}
              {viz.proximo.rubrica ? ` · ${viz.proximo.rubrica}` : ''}
            </span>
            <Icone nome="seta_direita" className="size-4 shrink-0" />
          </Link>
        )}
      </nav>
    </article>
  )
}
