'use client'

// =============================================================================
// TOGA v2 — Decretos do Paraná
//
// A forma é a de `/jurisprudencia`: coluna de facetas de 242px, barra de filtro
// com contagem, chips do que está ativo, cartões em lista. A escolha é
// deliberada — as duas telas fazem a mesma coisa (percorrer um acervo grande e
// estreitar até o que interessa), e dar a elas layouts diferentes obrigaria o
// usuário a reaprender a mesma tarefa duas vezes.
//
// Três diferenças, e todas vêm do que o acervo é:
//
// - **O selo não afirma vigência.** Em `/jurisprudencia` o selo carrega a
//   situação do tema no STJ, que é dado da fonte. Aqui o que a fonte dá é a
//   redação compilada e a data em que o coletor a leu — se um decreto foi
//   revogado por inteiro, a página não foi conferida quanto a isso. O selo diz
//   "compilado · lido em DD/MM/AAAA", que é o que se sabe. Ver o cabeçalho da
//   migration 0018.
//
// - **A faceta de espécie sai da súmula, não de uma coluna.** É `especie()`, em
//   `lib/decretos.ts`, e o motivo de ela não virar dado do banco está lá.
//
// - **Filtrar é local e síncrono**, como na Jurisprudência: os resumos já
//   vieram todos. Nenhum esqueleto ao tocar num filtro — fingir espera que não
//   existe é a mentira mais fácil de escrever numa tela de demonstração.
// =============================================================================

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Caixinha, Selo } from '@/components/toga/base'
import { Icone } from '@/components/icones'
import { dataBR, especie, publicacao, versaoFem, type DecretoResumo } from '@/lib/decretos/formato'

/**
 * Quantos cartões se desenha de uma vez.
 *
 * **Medido no navegador, em 390px:** desenhando os 1.989 de uma vez a tela ia
 * para o telefone com **2,3 MB de HTML e 14.195 nós no DOM**, numa página de
 * 366 mil pixels de altura. Nenhum celular precisa disso para mostrar os seis
 * cartões que cabem na primeira tela.
 *
 * É a mesma decisão de `tg-lista`, que anima só os dez primeiros porque 825
 * elementos com `transform` travam a rolagem — e pelo mesmo motivo: o custo é
 * de quem desenha, não de quem lê.
 *
 * **O filtro continua vendo os 1.989.** Ele roda sobre o array inteiro, em
 * memória, e a contagem "X de Y" continua dizendo a verdade sobre o acervo. O
 * que a janela limita é o desenho, e o botão do rodapé diz exatamente quantos
 * ainda não foram desenhados — lista cortada que não se anuncia é lista que
 * mente sobre o próprio tamanho.
 */
const JANELA = 60

type Faceta = { chave: string; rotulo: string; total: number }

function Facetas({
  titulo,
  itens,
  ligados,
  aoAlternar,
}: {
  titulo: string
  itens: Faceta[]
  ligados: Set<string>
  aoAlternar: (chave: string) => void
}) {
  if (itens.length === 0) return null
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-tg-fraco-3">
        {titulo}
      </p>
      <div className="flex flex-col gap-0.5">
        {itens.map((f) => (
          <button
            key={f.chave}
            type="button"
            onClick={() => aoAlternar(f.chave)}
            aria-pressed={ligados.has(f.chave)}
            className="tgb flex items-center gap-2 rounded-lg px-1.5 py-[7px] text-left transition-colors hover:bg-tg-preenche max-sm:py-2.5"
          >
            <Caixinha marcada={ligados.has(f.chave)} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-tg-corpo">
              {f.rotulo}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-tg-fraco-3">{f.total}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Cartao({ d }: { d: DecretoResumo }) {
  const pub = publicacao(d)
  return (
    <Link
      href={`/decretos/${encodeURIComponent(d.id)}`}
      className="tgc block rounded-[18px] bg-white px-5 py-4 shadow-[var(--tg-elev-1)] transition-shadow hover:shadow-[var(--tg-elev-2)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Revogado vem primeiro e em âmbar: é o que muda tudo o que se lê
            abaixo. Sem ele o ato aparecia como qualquer outro — e 40 dos 1.496
            estão revogados por inteiro. */}
        {d.revogado_por && <Selo tom="ambar">Revogado</Selo>}
        <Selo tom="acento">{especie(d.sumula)}</Selo>
        <span className="text-[13.5px] font-medium text-tg-tinta-2">
          Decreto {d.numero}/{d.ano}
        </span>
        <span
          className="text-[12px] text-tg-fraco-3"
          title={pub.divergente ? 'a fonte publica esta data em desacordo com o ano do ato' : undefined}
        >
          {pub.texto}
          {pub.divergente && <span className="ml-1 text-tg-ambar-txt">· data divergente na fonte</span>}
        </span>
      </div>

      {/* Serifada: é texto da fonte, não rótulo do produto. A divisão entre as
          duas famílias é o que separa, sem moldura, o que o produto afirma do
          que ele cita. */}
      <p className="mt-2 font-tg-serif text-[14px] leading-[1.55] text-tg-corpo">{d.sumula}</p>

      <p className="mt-2.5 text-[11px] text-tg-suave">
        {d.revogado_por ? `${d.revogado_por} · ` : ''}
        Redação {versaoFem(d.versao)} · lida em {dataBR(d.conferido_em)}
      </p>
    </Link>
  )
}

export function Decretos({ linhas }: { linhas: DecretoResumo[] }) {
  const [busca, setBusca] = useState('')
  const [anos, setAnos] = useState<Set<string>>(new Set())
  const [especies, setEspecies] = useState<Set<string>>(new Set())
  const [janela, setJanela] = useState(JANELA)

  const facetas = useMemo(() => {
    const porAno = new Map<string, number>()
    const porEspecie = new Map<string, number>()
    for (const d of linhas) {
      porAno.set(String(d.ano), (porAno.get(String(d.ano)) ?? 0) + 1)
      const e = especie(d.sumula)
      porEspecie.set(e, (porEspecie.get(e) ?? 0) + 1)
    }
    return {
      anos: [...porAno.entries()]
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([chave, total]) => ({ chave, rotulo: chave, total })),
      especies: [...porEspecie.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([chave, total]) => ({ chave, rotulo: chave, total })),
    }
  }, [linhas])

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter((d) => {
      if (anos.size && !anos.has(String(d.ano))) return false
      if (especies.size && !especies.has(especie(d.sumula))) return false
      if (!q) return true
      // A epígrafe saiu do payload da lista — ela repetia número e data, que
      // já têm coluna própria, e custava 40 caracteres por linha vezes 1.989.
      // O filtro não perdeu nada: quem digita "8812" casa por `numero`.
      return d.sumula.toLowerCase().includes(q) || d.numero.includes(q)
    })
  }, [linhas, busca, anos, especies])

  // Toda mudança de filtro volta a janela ao começo. Sem isto, quem abriu 600
  // cartões e depois filtrou por um ano continuaria com 600 desenhados — e o
  // botão do rodapé sumiria sem que a lista tivesse encolhido.
  const alterna = (conjunto: Set<string>, set: (s: Set<string>) => void) => (chave: string) => {
    const novo = new Set(conjunto)
    if (novo.has(chave)) novo.delete(chave)
    else novo.add(chave)
    set(novo)
    setJanela(JANELA)
  }

  const limpar = () => {
    setAnos(new Set())
    setEspecies(new Set())
    setBusca('')
    setJanela(JANELA)
  }

  const ativos = anos.size + especies.size

  const painel = (
    <>
      <Facetas
        titulo="Ano"
        itens={facetas.anos}
        ligados={anos}
        aoAlternar={alterna(anos, setAnos)}
      />
      <Facetas
        titulo="Espécie"
        itens={facetas.especies}
        ligados={especies}
        aoAlternar={alterna(especies, setEspecies)}
      />
      {ativos > 0 && (
        <button
          type="button"
          onClick={limpar}
          className="tgb text-[12px] text-tg-acento-txt hover:underline max-sm:py-2"
        >
          Limpar filtros
        </button>
      )}
    </>
  )

  return (
    <div className="tg-sobe flex min-h-0 flex-1">
      <aside className="hidden w-[242px] shrink-0 overflow-auto border-r border-tg-linha-media px-4 py-5 xl:block">
        {painel}
      </aside>

      {/* Abaixo de `xl` quem rola é esta coluna inteira, e não a lista por
          dentro dela — o mesmo conserto do Vade Mecum e da Jurisprudência,
          pela mesma causa: `h-dvh overflow-hidden` na casca. */}
      <div className="flex min-w-0 flex-1 flex-col xl:overflow-hidden">
        <div className="shrink-0 px-5 pb-3.5 pt-5 sm:px-[26px]">
          <div className="flex items-center gap-[11px] rounded-[18px] bg-white px-4 py-3.5 shadow-[var(--tg-elev-1f)]">
            <Selo tom="acento">Acervo estadual</Selo>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setJanela(JANELA)
              }}
              placeholder="Filtrar por súmula ou número…"
              aria-label="Filtrar decretos"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-tg-tinta-2 outline-none placeholder:text-tg-tenue-2"
            />
            <span className="shrink-0 text-[12px] text-tg-fraco-3">
              {resultados.length} de {linhas.length}
            </span>
          </div>

          {/* No celular as facetas moram aqui, dentro do cabeçalho que não
              rola com a lista. */}
          <details className="group mt-3 xl:hidden">
            {/*
              No celular esta é a ÚNICA porta para as facetas, e ela não parecia
              porta: era a palavra "Filtros" solta, em 12,5px, sem borda, sem
              fundo e sem seta — o `inline-flex` come o marcador padrão do
              <summary>. Quem abrisse a tela no telefone não tinha como saber
              que dava para filtrar por ano ou por espécie.

              Vira pílula branca com a seta desenhada à mão, e a seta gira ao
              abrir. `list-none` tira o marcador nativo nos navegadores que o
              desenham por fora do flex.
            */}
            <summary className="tgb inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-[12.5px] font-medium text-tg-corpo shadow-[var(--tg-elev-1)] [&::-webkit-details-marker]:hidden">
              <Icone nome="filtro" className="size-3.5 text-tg-fraco-3" />
              Filtros
              {ativos > 0 && <Selo tom="acento">{ativos}</Selo>}
              <span aria-hidden="true" className="text-[10px] text-tg-fraco-3 transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-3 rounded-2xl bg-white px-4 py-4 shadow-[var(--tg-elev-1)]">
              {painel}
            </div>
          </details>
        </div>

        <div className="tg-lista flex flex-col gap-3 px-5 pb-[26px] pt-1 sm:px-[26px] xl:min-h-0 xl:flex-1 xl:overflow-auto">
          {resultados.slice(0, janela).map((d) => (
            <Cartao key={d.id} d={d} />
          ))}

          {resultados.length > janela && (
            <button
              type="button"
              onClick={() => setJanela((j) => j + JANELA)}
              className="tgb rounded-[14px] bg-white px-4 py-3.5 text-[13px] font-medium text-tg-acento-txt shadow-[var(--tg-elev-1)] hover:shadow-[var(--tg-elev-3)]"
            >
              Mostrar mais {Math.min(JANELA, resultados.length - janela)} ·{' '}
              <span className="font-normal text-tg-fraco-2">
                {resultados.length - janela} ainda não exibidos
              </span>
            </button>
          )}

          {resultados.length === 0 && (
            <div className="rounded-[18px] bg-white px-6 py-10 text-center shadow-[var(--tg-elev-1)]">
              <p className="text-[13.5px] font-medium text-tg-tinta-2">
                {linhas.length === 0
                  ? 'Nenhum decreto no acervo ainda'
                  : 'Nenhum decreto com esses filtros'}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-[1.6] text-tg-fraco-2">
                {linhas.length === 0 ? (
                  <>
                    O acervo vem de <code className="text-tg-corpo">decretos_pr</code>, semeada a
                    partir do que <code className="text-tg-corpo">coletores/parana.py</code> colhe
                    de <span className="whitespace-nowrap">legislacao.pr.gov.br</span> — se a
                    tabela está vazia, a coleta ainda não rodou.
                  </>
                ) : (
                  'Tente limpar um filtro ou procurar por outra palavra da súmula.'
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
