// =============================================================================
// /suporte — "Como funciona".
//
// Não há suporte a prestar (é portfólio, não produto). O que cabe aqui é a
// explicação das três decisões que definem o projeto, com link para a tela em
// que cada uma pode ser verificada — não descrita, verificada.
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { Icone } from '@/components/icones'
import { Cartao } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Como funciona — Jesbick',
  description: 'As três decisões que definem o projeto e onde verificar cada uma.',
}

const DECISOES = [
  {
    titulo: 'O texto legal nunca é gerado pelo modelo',
    corpo:
      'Toda citação resolve para um id de dispositivo no banco. O renderizador substitui o marcador {{cite:id}} pelo texto lido do Postgres e por um link para /dispositivo/[id]. O modelo escreve apenas a argumentação entre as citações — e mesmo essa é gerada offline e revisada à mão.',
    onde: { href: '/dispositivo/lei_11343_2006_art33_p4', rotulo: 'Ver o art. 33, § 4º resolvido do banco' },
  },
  {
    titulo: 'A camada de rubricas é o coração da busca',
    corpo:
      '"Tráfico privilegiado" não aparece em lugar nenhum do art. 33, § 4º; "fixação da pena" é a rubrica marginal do art. 59, não o texto dele. Advogado busca pelo apelido do instituto — por isso a rubrica entra na fusão com peso 3× e, quando bate exatamente, encabeça o resultado.',
    onde: { href: '/busca?q=fixa%C3%A7%C3%A3o+da+pena', rotulo: 'Buscar "fixação da pena" e ver o match de rubrica' },
  },
  {
    titulo: 'A data de corte é visível o tempo todo',
    corpo:
      'Os dados são uma fotografia de fevereiro/2025 (Vade Mecum do Senado Federal, 1ª ed.). Citar redação revogada em peça criminal é grave, então a vigência viaja com o dispositivo em toda tela — e cobertura parcial é declarada do mesmo jeito.',
    onde: { href: '/leis', rotulo: 'Ver cobertura e vigência por lei' },
  },
]

const DOCS = [
  { arq: 'docs/busca.md', nota: 'as três pernas, RRF e as armadilhas de IMMUTABLE' },
  { arq: 'docs/corpus.md', nota: 'os cinco artefatos de extração do PDF e como cada um é tratado' },
  { arq: 'docs/decisoes-de-arquitetura.md', nota: 'por que cada decisão foi tomada, com medição' },
  { arq: 'docs/seguranca.md', nota: 'RLS, segredos e superfície pública' },
]

export default function SuportePage() {
  return (
    <>
      <Cabecalho titulo="Como funciona" sub="portfólio · consulta e peças em tráfico de drogas" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-[13.5px] leading-relaxed text-slate-400">
            Escopo estreito de propósito: crimes de tráfico de drogas (Lei 11.343/2006), com Código
            Penal e um subconjunto curado do CPP disponíveis para consulta. Sem autenticação, sem
            multiusuário, sem cobrança — e uma peça processual só, a resposta à acusação.
          </p>

          <div className="mt-6 space-y-3">
            {DECISOES.map((d, i) => (
              <Cartao key={d.titulo} className="p-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-[11px] font-semibold text-emerald-300">
                    {i + 1}
                  </span>
                  <h2 className="text-[14px] font-medium text-slate-100">{d.titulo}</h2>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{d.corpo}</p>
                <Link
                  href={d.onde.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-emerald-300 hover:underline"
                >
                  {d.onde.rotulo}
                  <Icone nome="seta_direita" className="size-3.5" />
                </Link>
              </Cartao>
            ))}
          </div>

          <h2 className="mt-8 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Documentação no repositório
          </h2>
          <Cartao className="mt-2 divide-y divide-white/[0.06]">
            {DOCS.map((d) => (
              <div key={d.arq} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
                <code className="text-[12.5px] text-slate-300">{d.arq}</code>
                <span className="text-[12px] text-slate-500">{d.nota}</span>
              </div>
            ))}
          </Cartao>

          <p className="mt-4 pb-6 text-[11.5px] leading-relaxed text-slate-600">
            Os itens marcados com cadeado no menu levam a telas que explicam por que aquele recurso
            não existe. Preferi dizer isso na cara a preencher a interface com números inventados.
          </p>
        </div>
      </div>
    </>
  )
}
