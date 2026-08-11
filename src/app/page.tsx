// =============================================================================
// / — porta de entrada.
//
// Fica fora da casca do app de propósito: é a tela que um recrutador abre
// primeiro, e ela tem 90 segundos para dizer qual problema difícil o projeto
// resolve. Daí o formato: as três decisões, e um link direto para verificar
// cada uma na tela onde ela acontece.
// =============================================================================

import Link from 'next/link'

import { Icone, type NomeIcone } from '@/components/icones'

const ENTRADAS: { href: string; rotulo: string; nota: string; icone: NomeIcone }[] = [
  {
    href: '/agente',
    rotulo: 'Agente Penal',
    nota: 'pergunta em linguagem natural, resposta em dispositivos do banco',
    icone: 'martelo',
  },
  {
    href: '/busca',
    rotulo: 'Busca híbrida',
    nota: 'rubrica, lexical e semântica fundidas por RRF numa chamada só',
    icone: 'busca',
  },
  {
    href: '/leis',
    rotulo: 'Legislação',
    nota: 'Lei 11.343/2006 e Código Penal, artigo a artigo',
    icone: 'livro',
  },
  {
    href: '/painel',
    rotulo: 'Painel',
    nota: 'estado real da base: artigos, dispositivos, embeddings, rubricas',
    icone: 'painel',
  },
]

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-20">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Icone nome="balanca" className="size-5 text-slate-950" strokeWidth={2} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Jesbick</h1>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
        Consulta e geração de peças para advocacia criminal, com escopo estreito de propósito:
        tráfico de drogas (Lei 11.343/2006), com o Código Penal disponível para consulta.{' '}
        <strong className="font-medium text-slate-300">
          Toda citação resolve para um dispositivo do banco — o modelo nunca escreve texto legal.
        </strong>
      </p>

      {/* A data de corte é visível o tempo todo — decisão nº 3 do CLAUDE.md. */}
      <p className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-200/90">
        Redação vigente em <strong className="text-amber-100">28/02/2025</strong> (Vade Mecum Senado
        Federal, 1ª ed.). O subconjunto do CPP tem cobertura parcial e ainda não foi semeado.
      </p>

      <ul className="mt-8 space-y-2">
        {ENTRADAS.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0F172A] px-4 py-3.5 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
            >
              <Icone nome={e.icone} className="size-[18px] shrink-0 text-slate-500 group-hover:text-emerald-400" />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-slate-100">{e.rotulo}</span>
                <span className="block text-[12.5px] text-slate-500">{e.nota}</span>
              </span>
              <Icone
                nome="seta_direita"
                className="ml-auto size-4 shrink-0 text-slate-600 transition-colors group-hover:text-emerald-400"
              />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[12.5px] leading-relaxed text-slate-600">
        Projeto de portfólio: sem autenticação, sem multiusuário, sem cobrança. Os itens do menu que
        estão fora desse recorte levam a uma tela que explica o porquê, em vez de a dados
        inventados. Veja{' '}
        <Link href="/suporte" className="text-slate-400 hover:text-emerald-300">
          como funciona
        </Link>
        .
      </p>
    </main>
  )
}
