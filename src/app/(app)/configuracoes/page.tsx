// =============================================================================
// /configuracoes — diagnóstico do runtime, somente leitura.
//
// Não há o que configurar: sem autenticação e sem multiusuário, "preferências"
// seria tela decorativa. O que é útil neste lugar do menu é mostrar o que o
// runtime enxerga — inclusive a checagem de que nenhum segredo vazou para o
// bundle do cliente, que é a única falha aqui com consequência de verdade.
//
// Nenhum VALOR de variável de ambiente é impresso; só presença.
// =============================================================================

import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Cartao, Selo } from '@/components/ui'
import { saude } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Diagnóstico — Jesbick' }

const presente = (nome: string) => Boolean(process.env[nome])

function Linha({
  rotulo,
  valor,
  nota,
  ok,
}: {
  rotulo: string
  valor: string
  nota?: string
  ok?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="text-[13px] text-slate-300">{rotulo}</span>
      {nota && <span className="text-[11.5px] text-slate-600">{nota}</span>}
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[12.5px] tabular-nums text-slate-400">{valor}</span>
        {ok !== undefined &&
          (ok ? (
            <Icone nome="check" className="size-4 text-emerald-400" strokeWidth={2.2} />
          ) : (
            <Icone nome="xis" className="size-4 text-amber-400" strokeWidth={2.2} />
          ))}
      </span>
    </div>
  )
}

export default async function ConfiguracoesPage() {
  const s = await saude()

  const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const host = urlSupabase ? new URL(urlSupabase).host : '—'

  // Um `NEXT_PUBLIC_*` com cara de segredo vai parar no bundle do browser. A
  // service role ignora RLS: vazá-la abre o banco para escrita.
  const vazamentos = Object.keys(process.env).filter(
    (k) => k.startsWith('NEXT_PUBLIC_') && /service|secret|openai|anthropic|password|database/i.test(k),
  )

  return (
    <>
      <Cabecalho titulo="Diagnóstico" sub="somente leitura · nenhum valor de segredo é impresso" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Banco
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            <Linha rotulo="Projeto Supabase" valor={host} nota="PostgREST/HTTPS, sem conexão direta" />
            <Linha
              rotulo="RPC saude()"
              valor={s.ok ? 'respondeu' : 'falhou'}
              ok={s.ok}
              nota={s.ok ? undefined : s.erro}
            />
            <Linha
              rotulo="Dispositivos com embedding"
              valor={s.ok ? `${s.dados.com_embedding} / ${s.dados.dispositivos}` : '—'}
              ok={s.ok ? s.dados.com_embedding === s.dados.dispositivos : undefined}
            />
          </Cartao>

          <h2 className="mt-6 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Variáveis de ambiente (presença, nunca valor)
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            <Linha
              rotulo="NEXT_PUBLIC_SUPABASE_URL"
              valor={presente('NEXT_PUBLIC_SUPABASE_URL') ? 'definida' : 'ausente'}
              ok={presente('NEXT_PUBLIC_SUPABASE_URL')}
            />
            <Linha
              rotulo="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
              valor={presente('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ? 'definida' : 'ausente'}
              nota="chave pública, sujeita a RLS somente-leitura"
              ok={presente('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')}
            />
            <Linha
              rotulo="OPENAI_API_KEY"
              valor={presente('OPENAI_API_KEY') ? 'definida' : 'ausente'}
              nota="server-side · embedding da consulta"
              ok={presente('OPENAI_API_KEY')}
            />
            <Linha
              rotulo="Segredo com prefixo NEXT_PUBLIC_"
              valor={vazamentos.length ? vazamentos.join(', ') : 'nenhum'}
              ok={vazamentos.length === 0}
              nota="service role no bundle abriria o banco para escrita"
            />
          </Cartao>

          <h2 className="mt-6 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Busca
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            <Linha rotulo="Fusão" valor="Reciprocal Rank Fusion, k = 60" />
            <Linha rotulo="Pesos" valor="rubrica 3.0 · lexical 1.0 · semântica 1.0" />
            <Linha rotulo="Embeddings" valor="text-embedding-3-small · 1536 dims · cosseno" />
            <Linha
              rotulo="Perna semântica"
              valor={presente('OPENAI_API_KEY') ? 'ativa' : 'degradada'}
              ok={presente('OPENAI_API_KEY')}
              nota="sem chave, a busca cai para rubrica + lexical"
            />
          </Cartao>

          <h2 className="mt-6 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Runtime
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            <Linha rotulo="Node" valor={process.version} />
            <Linha rotulo="Ambiente" valor={process.env.NODE_ENV ?? '—'} />
            <Linha
              rotulo="LLM em runtime"
              valor="nenhum"
              ok
              nota="argumentação é gerada offline e revisada à mão"
            />
          </Cartao>

          <div className="mt-6 flex flex-wrap gap-2 pb-6">
            {[
              { href: '/api/health', r: 'GET /api/health' },
              { href: '/api/busca?q=fixa%C3%A7%C3%A3o%20da%20pena', r: 'GET /api/busca?q=…' },
            ].map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-slate-300 transition-colors hover:border-emerald-500/30 hover:text-emerald-200"
              >
                {a.r}
                <Icone nome="link_externo" className="size-3" />
              </a>
            ))}
            <Selo tom="neutro">respostas JSON, sem cache</Selo>
          </div>
        </div>
      </div>
    </>
  )
}
