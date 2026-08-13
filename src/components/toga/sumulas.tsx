'use client'

// =============================================================================
// TOGA v2 — Súmulas por tema
//
// Duas diferenças em relação ao documento de design, e as duas são de conteúdo,
// não de forma:
//
// 1. O documento mostra "Precedentes (219) →" em cada súmula. Contagem de
//    precedentes exigiria indexar acórdão, que este produto não faz. No lugar
//    vai o caminho de volta ao corpus: os dispositivos que a súmula interpreta,
//    clicáveis, que levam à busca híbrida.
// 2. Existe uma súmula cancelada na lista, e ela aparece. Ver o cabeçalho de
//    `lib/toga/sumulas.ts`.
//
// "Salvas" persiste em localStorage. É preferência de leitura de um usuário só
// num produto de usuário único — mandar isso para o banco seria uma tabela, uma
// migration e uma chamada de rede para guardar um punhado de números.
// =============================================================================

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Selo, TituloTela } from '@/components/toga/base'
import { contagemPorTema, SUMULAS, TEMAS, type Sumula, type Tema } from '@/lib/toga/sumulas'

type Aba = 'STF' | 'STJ' | 'Vinculantes' | 'Salvas'

const ABAS: Aba[] = ['STF', 'STJ', 'Vinculantes', 'Salvas']
const CHAVE = 'toga:sumulas-salvas'

export function Sumulas() {
  const [aba, setAba] = useState<Aba>('STJ')
  const [tema, setTema] = useState<Tema | null>('Dosimetria da pena')
  const [salvas, setSalvas] = useState<string[]>([])

  // Ler localStorage só depois de montar: no servidor ele não existe, e usar o
  // valor no primeiro render faria o HTML divergir e o React reclamar.
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE)
      // `JSON.parse` só garante que é JSON, não que é a lista que gravamos.
      // Um valor corrompido que fosse objeto passaria por aqui e estouraria no
      // primeiro `.includes()`, já em render.
      const lido: unknown = bruto ? JSON.parse(bruto) : null
      if (Array.isArray(lido)) setSalvas(lido.filter((x): x is string => typeof x === 'string'))
    } catch {
      // Modo privado de alguns navegadores estoura no getItem. Seguir sem
      // favoritos é melhor que a tela não abrir.
    }
  }, [])

  function alternarSalva(chave: string) {
    setSalvas((s) => {
      const nova = s.includes(chave) ? s.filter((x) => x !== chave) : s.concat(chave)
      try {
        window.localStorage.setItem(CHAVE, JSON.stringify(nova))
      } catch {
        /* idem */
      }
      return nova
    })
  }

  const contagens = useMemo(contagemPorTema, [])

  const lista = useMemo(() => {
    const idDe = (s: Sumula) => `${s.tribunal}-${s.n}`
    let base: Sumula[]
    switch (aba) {
      case 'Vinculantes':
        base = SUMULAS.filter((s) => s.tipo === 'Vinculante')
        break
      case 'Salvas':
        base = SUMULAS.filter((s) => salvas.includes(idDe(s)))
        break
      default:
        base = SUMULAS.filter((s) => s.tribunal === aba)
    }
    // O tema filtra por cima da aba, mas "Salvas" ignora o tema: quem guardou
    // quer ver o que guardou, não a interseção com o tema selecionado.
    return aba === 'Salvas' || !tema ? base : base.filter((s) => s.temas.includes(tema))
  }, [aba, tema, salvas])

  return (
    <div className="tg-sobe flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pt-6 sm:px-7">
        <TituloTela
          titulo="Súmulas por tema"
          sub={
            <>
              Enunciados oficiais do STF e do STJ que tocam o recorte de tráfico.{' '}
              <span className="text-tg-tenue">
                Transcrição manual · material de leitura, fora do corpus citável.
              </span>
            </>
          }
        >
          <Link
            href="/consulta?p=Teses%20aplic%C3%A1veis%20a%20este%20caso"
            className="tgb inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-tg-acento px-3.5 py-2 text-[12px] font-medium text-white shadow-[var(--tg-elev-acento-forte)]"
          >
            Confrontar com o caso
          </Link>
        </TituloTela>

        <div className="mt-[18px] flex gap-1.5 overflow-x-auto pb-1">
          {ABAS.map((a) => {
            const ativa = aba === a
            const rotulo = a === 'Salvas' ? `Salvas (${salvas.length})` : a
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                aria-pressed={ativa}
                className={`tgb shrink-0 rounded-full px-[15px] py-2 text-[12.5px] font-medium shadow-[var(--tg-elev-1f)] ${
                  ativa ? 'bg-tg-acento text-white' : 'bg-white text-tg-corpo'
                }`}
              >
                {rotulo}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 border-t border-tg-linha-media">
        <nav
          aria-label="Temas"
          className="hidden w-[228px] shrink-0 overflow-auto border-r border-tg-linha-media px-3.5 py-[18px] lg:block"
        >
          <p className="px-2 pb-2.5 text-[11.5px] font-medium text-tg-fraco-3">Temas</p>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setTema(null)}
              className={`tgb flex items-center gap-2 rounded-[11px] px-2.5 py-2 text-left hover:bg-tg-campo ${
                tema === null ? 'bg-tg-preenche' : ''
              }`}
            >
              <span
                className={`text-[12.5px] ${tema === null ? 'text-tg-tinta' : 'text-tg-corpo'}`}
              >
                Todos os temas
              </span>
              <span className="flex-1" />
              <span className="text-[11px] text-tg-tenue-2">{SUMULAS.length}</span>
            </button>

            {TEMAS.map((t) => {
              const ativo = tema === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTema(t)}
                  className={`tgb flex items-center gap-2 rounded-[11px] px-2.5 py-2 text-left hover:bg-tg-campo ${
                    ativo ? 'bg-tg-preenche' : ''
                  }`}
                >
                  <span className={`text-[12.5px] ${ativo ? 'text-tg-tinta' : 'text-tg-corpo'}`}>
                    {t}
                  </span>
                  <span className="flex-1" />
                  <span className="text-[11px] text-tg-tenue-2">{contagens[t]}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-auto px-5 py-[22px] sm:px-7">
          <div className="flex max-w-[940px] flex-col gap-3.5">
            {lista.map((s) => (
              <Cartao
                key={`${s.tribunal}-${s.n}`}
                s={s}
                salva={salvas.includes(`${s.tribunal}-${s.n}`)}
                aoSalvar={() => alternarSalva(`${s.tribunal}-${s.n}`)}
              />
            ))}

            {lista.length === 0 && (
              <p className="rounded-[20px] bg-white px-6 py-10 text-center text-[13px] text-tg-fraco-2 shadow-[var(--tg-elev-1)]">
                {aba === 'Salvas'
                  ? 'Nada salvo ainda. O botão “Salvar” em cada súmula guarda aqui.'
                  : 'Nenhuma súmula deste tribunal neste tema.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cartao({
  s,
  salva,
  aoSalvar,
}: {
  s: Sumula
  salva: boolean
  aoSalvar: () => void
}) {
  const cancelada = s.status === 'Cancelada'

  return (
    <article className="tgc tg-sobe flex gap-5 rounded-[20px] bg-white px-[22px] py-5 shadow-[var(--tg-elev-1)]">
      <div className="w-[104px] shrink-0">
        <p className="text-[11.5px] text-tg-fraco-3">{s.tipo}</p>
        <p
          className={`my-1 font-tg-serif text-[40px] leading-none -tracking-[0.02em] ${
            cancelada ? 'text-tg-tenue-2 line-through' : 'text-tg-acento'
          }`}
        >
          {s.n}
        </p>
        <Selo tom={s.tipo === 'Vinculante' ? 'escuro' : 'acento'}>{s.tribunal}</Selo>
      </div>

      <div className="min-w-0 flex-1 border-l border-tg-linha pl-5">
        <p className="mb-3.5 font-tg-serif text-[15px] leading-[1.7] text-tg-tinta-2">{s.txt}</p>

        {s.nota && (
          <p className="mb-3.5 rounded-xl bg-tg-fundo px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-tg-suave">
            {s.nota}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Selo tom={cancelada ? 'ambar' : 'verde'}>{s.status}</Selo>
          <span className="text-[11.5px] text-tg-fraco-3">
            {s.orgao} · {s.data}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-[#e2e4ea]" />
          <span className="text-[11.5px] text-tg-fraco-3">{s.refs}</span>
          <span className="flex-1" />

          <button
            type="button"
            onClick={aoSalvar}
            aria-pressed={salva}
            className={`tgb shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-medium ${
              salva ? 'bg-tg-acento-fraco text-tg-acento-txt' : 'bg-tg-preenche text-tg-corpo'
            }`}
          >
            {salva ? 'Salva ✓' : 'Salvar'}
          </button>
          <Link
            href={`/consulta?p=${encodeURIComponent(s.refs.replace(/ · /g, ' '))}`}
            className="tgb shrink-0 text-[11.5px] font-medium text-tg-acento-txt"
          >
            Dispositivos citados →
          </Link>
        </div>
      </div>
    </article>
  )
}
