'use client'

// =============================================================================
// TOGA v2 — Fontes e procedência
//
// No documento de design esta tela mostra cinco coletores em Python raspando
// DOU, Planalto, Câmara, Senado e DataJud, com sincronização ao vivo. Este
// projeto tem cinco etapas de pipeline de verdade — parser, normalização,
// auditoria, seed e embeddings —, e é sobre elas que a tela fala.
//
// A troca não é conveniência: é o que essa tela existe para dizer. O trabalho
// difícil deste produto não é buscar, é ter certeza de que o texto que sai na
// peça é o texto da lei. Cada correção listada no feed era, antes de ser
// corrigida, uma citação errada esperando para acontecer.
//
// Nenhum número desta tela é escrito aqui. Eles chegam por prop, de
// `lib/toga/pipeline.ts` (o relatório que o normalize escreve) e da RPC
// `saude()`. Enquanto foram digitados, divergiram: a tela dizia 534 artigos,
// 3 leis e 923 correções, contra 509, 2 e 506 reais. Uma tela de procedência
// com número decorado desmente a própria tese.
//
// O botão "Sincronizar agora" virou "Conferir a base", e ele faz uma coisa real:
// bate em /api/health, que é o mesmo alvo do cron diário da Vercel que impede o
// Supabase gratuito de pausar. A barra de progresso é a espera de verdade.
// =============================================================================

import Link from 'next/link'
import { useState } from 'react'

import { Girador, Ponto, Selo, TituloTela } from '@/components/toga/base'
import { GRADIENTE_PROGRESSO } from '@/lib/toga/tokens'
import type { ResumoPipeline } from '@/lib/toga/pipeline'

/** Contagens vivas do banco, vindas da RPC `saude()`. `null` = banco fora do ar. */
export type Banco = {
  leis: number
  artigos: number
  dispositivos: number
  comEmbedding: number
  rubricas: number
  teses: number
  casos: number
}

// --- o pipeline --------------------------------------------------------------

/**
 * As barras são números reais, escalados dentro do próprio cartão. Onde não há
 * série, há uma barra só — melhor que doze barras inventadas com cara de
 * histórico.
 */
/**
 * Os cinco estágios, com os números vindos de onde eles realmente existem: o
 * relatório que `normalize.ts` escreve e a RPC `saude()`. Nada aqui é digitado.
 *
 * Onde o dado não chegou (banco pausado, relatório ausente), a barra some e a
 * legenda diz o que falta. Barra fixa de reserva seria pior que nenhuma: ela se
 * lê como medição.
 */
function coletores(p: ResumoPipeline | null, b: Banco | null) {
  const um = (n: number | undefined) => (n === undefined ? [] : [n])
  const r = p?.porRegra

  return [
    {
      nome: 'vade_parser.py',
      desc: 'Extração do PDF do Vade Mecum do Senado Federal, 1ª ed.',
      barras: (p?.leis ?? []).map((l) => l.artigos),
      rotuloBarras: `artigos por lei: ${(p?.leis ?? []).map((l) => l.leiId).join(', ') || '—'}`,
      legenda: p ? `${p.leis.reduce((n, l) => n + l.artigos, 0)} artigos` : 'sem relatório',
      estado: p ? 'validado' : 'não rodou',
    },
    {
      nome: 'normalize.ts',
      desc: 'Cinco artefatos de extração, todos quantificados na auditoria.',
      // Ordem A, C, D, E, B — a mesma nomenclatura do CLAUDE.md e do feed abaixo.
      barras: p
        ? ([
            r?.rubrica_marginal,
            r?.ordinal,
            r?.nota_editor,
            r?.emenda,
            r?.nota_rodape,
          ].filter((n): n is number => n !== undefined))
        : [],
      rotuloBarras: 'ocorrências por artefato: A, C, D, E, B',
      legenda: p ? `${p.totalAlteracoes} correções` : 'sem relatório',
      estado: p ? 'determinístico' : 'não rodou',
    },
    {
      nome: 'audit.ts',
      desc: 'Diff texto_bruto → texto das alterações, para revisão manual antes do seed.',
      barras: um(p?.totalAlteracoes),
      rotuloBarras: 'diffs gerados',
      legenda: p ? `${p.totalAlteracoes} diffs` : 'sem relatório',
      estado: p ? 'revisado à mão' : 'não rodou',
    },
    {
      nome: 'seed.ts',
      desc: 'Upsert por id. Rodar duas vezes não duplica nada.',
      barras: b ? [b.artigos, b.leis, b.rubricas] : [],
      rotuloBarras: 'artigos, leis, rubricas no banco',
      legenda: b ? `${b.dispositivos} dispositivos` : 'banco fora do ar',
      estado: b ? 'idempotente' : 'sem resposta',
    },
    {
      nome: 'embed.ts',
      desc: 'Reembute só as linhas cujo hash de texto_embed mudou.',
      barras: b ? [b.comEmbedding, b.dispositivos - b.comEmbedding] : [],
      rotuloBarras: 'com embedding, pendentes',
      legenda: b
        ? `${b.comEmbedding} de ${b.dispositivos} vetores`
        : 'banco fora do ar',
      estado: b && b.comEmbedding === b.dispositivos ? 'completo' : 'incremental',
    },
  ]
}

/**
 * Os cinco artefatos de extração do PDF, na ordem em que a auditoria os
 * catalogou. As letras são as do CLAUDE.md — quem ler o código e a tela vê a
 * mesma nomenclatura.
 */
const ARTEFATOS = [
  {
    letra: 'A',
    regra: 'rubrica_marginal',
    tag: 'Código Penal',
    titulo: 'Rubrica marginal colada',
    txt: 'O Vade Mecum imprime a rubrica do dispositivo na margem, e o parser a absorve no fim do bloco anterior. O caput do art. 1º termina com “Lei penal no tempo”, que é a rubrica do art. 2º. A regra é determinística: o fragmento no fim do dispositivo i é a rubrica do dispositivo i+1.',
    saida: 'viraram rubricas com origem = oficial, já ligadas ao dispositivo exato',
    novo: true,
  },
  {
    letra: 'C',
    regra: 'ordinal',
    tag: 'Todo o corpus',
    titulo: 'Ordinais como letra “o”',
    txt: '“§ 1o” vira “§ 1º”; “Lei no 9.099” vira “Lei nº 9.099”. A regra só dispara depois de palavra que anuncia diploma legal ou diante de separador de milhar — “no 1º grau” é português legítimo, não abreviação.',
    saida: '450 são o marcador de início de bloco, que vira rótulo; 117 estão dentro do texto',
  },
  {
    letra: 'D',
    regra: 'nota_editor',
    tag: 'CP e Lei 11.343',
    titulo: 'Nota do Editor dentro do texto legal',
    txt: 'Não é o marcador, é o corpo da nota emendado no meio da frase. Não é regex-ável com segurança: uma delas contém “art. 2o da Lei no 7.209/1984”, e qualquer regra “corta até o primeiro ponto” decepa o texto legal junto.',
    saida: 'cortes exatos em data/curadoria/notas_editor.yaml; normalize.ts aborta se sobrar “NE:”',
  },
  {
    letra: 'E',
    regra: 'emenda',
    tag: 'Lei 11.343',
    titulo: 'Parágrafos que não existem',
    txt: 'Quando a quebra de linha do PDF cai antes de uma remissão a parágrafo, o parser trata a continuação da frase como parágrafo novo: o anterior fica truncado e nasce um dispositivo fantasma, citável em peça. O pior é o art. 37 — informante do tráfico, dentro do recorte —, com o caput cortado em “arts. 33, caput e”.',
    saida: 'emendas.yaml corrige, com trava comeca_com que aborta se o texto mudar embaixo',
    novo: true,
  },
  {
    letra: 'B',
    regra: 'nota_rodape',
    tag: 'Todo o corpus',
    titulo: 'Marcadores de nota de rodapé colados',
    txt: '“…integre organização criminosa.2”, “…prevenção do crime:5”. Dígito de uma ou duas casas colado logo após pontuação, em fim de bloco — nunca dentro de números como 1.500 ou art. 33.',
    saida: 'removidos; texto_bruto guarda sempre o original',
  },
] as const

const ROTINAS = [
  { nome: 'npm run normalize', dur: 'limpeza + emendas', st: 'OK' },
  { nome: 'npm run audit', dur: 'diff para revisão', st: 'OK' },
  { nome: 'npm run seed', dur: 'upsert por id', st: 'OK' },
  { nome: 'npm run embed', dur: 'só o hash que mudou', st: 'OK' },
  { nome: 'npm run vademecum', dur: 'espelho em SHA fixado', st: 'OK' },
]

const ETAPAS = [
  'Abrindo conexão com o Supabase…',
  'Executando o select trivial de /api/health…',
  'Conferindo a data de corte do corpus…',
  'Lendo o índice do acervo em disco…',
]

// --- tela --------------------------------------------------------------------

type Estado = { fase: 'parado' | 'indo'; pct: number; resultado: string | null; ok: boolean }

export function Fontes({
  pipeline,
  banco,
}: {
  pipeline: ResumoPipeline | null
  banco: Banco | null
}) {
  const [e, setE] = useState<Estado>({ fase: 'parado', pct: 0, resultado: null, ok: true })
  const COLETORES = coletores(pipeline, banco)

  async function conferir() {
    if (e.fase === 'indo') return
    setE({ fase: 'indo', pct: 8, resultado: null, ok: true })

    // A barra anda enquanto o fetch está no ar. Ela para em 92% e só fecha
    // quando a resposta chega — barra que chega a 100% antes do resultado é a
    // forma mais comum de progresso mentiroso.
    const relogio = setInterval(() => {
      setE((s) => (s.fase === 'indo' ? { ...s, pct: Math.min(92, s.pct + 11) } : s))
    }, 320)

    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const corpo = (await res.json()) as Record<string, unknown>
      clearInterval(relogio)
      setE({
        fase: 'parado',
        pct: 100,
        ok: res.ok,
        resultado: res.ok
          ? `Banco respondeu em ${typeof corpo.ms === 'number' ? `${corpo.ms} ms` : 'tempo hábil'}. O cron diário mantém o projeto fora da pausa por inatividade.`
          : `A base respondeu ${res.status}. O acervo Vade Mecum continua inteiro — ele lê do disco.`,
      })
    } catch (err) {
      clearInterval(relogio)
      setE({
        fase: 'parado',
        pct: 100,
        ok: false,
        resultado: `Não deu para falar com /api/health: ${err instanceof Error ? err.message : 'falha de rede'}`,
      })
    }
  }

  const etapa = ETAPAS[Math.min(ETAPAS.length - 1, Math.floor(e.pct / 25))]

  return (
    <div className="tg-sobe min-h-0 flex-1 overflow-auto px-5 pb-8 pt-6 sm:px-7">
      <TituloTela
        titulo="Fontes e procedência"
        sub="De onde vem cada caractere do corpus, e o que foi preciso consertar no caminho."
      >
        <Link
          href="/suporte"
          className="tgb hidden shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-medium text-tg-corpo shadow-[var(--tg-elev-1)] hover:shadow-[var(--tg-elev-3)] sm:inline-flex"
        >
          Como funciona
        </Link>
        <button
          type="button"
          onClick={() => void conferir()}
          disabled={e.fase === 'indo'}
          className="tgb inline-flex shrink-0 items-center gap-2 rounded-full bg-tg-acento px-3.5 py-2 text-[12px] font-medium text-white shadow-[var(--tg-elev-acento-forte)] disabled:cursor-wait"
        >
          {e.fase === 'indo' && (
            <Girador tamanho={12} trilho="rgba(255,255,255,.35)" cabeca="#fff" />
          )}
          {e.fase === 'indo' ? 'Conferindo' : 'Conferir a base'}
        </button>
      </TituloTela>

      {e.fase === 'indo' && (
        <div className="tg-sobe mb-4 mt-5 rounded-2xl bg-white px-[18px] py-3.5 shadow-[var(--tg-elev-1)]">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="text-[12.5px] font-medium text-tg-tinta-2">{etapa}</span>
            <span className="flex-1" />
            <span className="text-[12px] tabular-nums text-tg-fraco-3">{e.pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-tg-campo">
            <div
              className="h-full rounded-full transition-[width] duration-[350ms] ease-out"
              style={{ width: `${e.pct}%`, background: GRADIENTE_PROGRESSO }}
            />
          </div>
        </div>
      )}

      {e.resultado && (
        <div
          className={`tg-sobe mb-4 mt-5 rounded-2xl px-[18px] py-3.5 text-[12.5px] leading-[1.55] ${
            e.ok ? 'bg-tg-verde-fundo text-tg-verde-txt' : 'bg-tg-ambar-fundo text-tg-ambar-txt'
          }`}
        >
          {e.resultado}
        </div>
      )}

      {/* os cinco estágios */}
      {/* Cinco colunas a partir de xl, como no documento. Abaixo disso as
          colunas ficariam com menos de 150px e a descrição de cada estágio
          viraria uma palavra por linha. */}
      <div className="mb-5 mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {COLETORES.map((c) => {
          // Sem série não há escala. `Math.max()` de array vazio é -Infinity, e
          // a altura de cada barra viraria NaN.
          const maior = c.barras.length ? Math.max(...c.barras) : 1
          return (
            <article
              key={c.nome}
              className="tgc rounded-[18px] bg-white px-4 py-[15px] shadow-[var(--tg-elev-1)]"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <Ponto pulsa />
                <h3 className="truncate font-tg text-[12.5px] font-medium text-tg-tinta">
                  {c.nome}
                </h3>
              </div>
              <p className="mb-2.5 h-[51px] text-[11.5px] leading-[1.45] text-tg-fraco-3">
                {c.desc}
              </p>

              {/*
                O documento desenha doze barras finas ocupando a largura toda.
                Aqui a série tem entre uma e cinco barras — é o número real de
                grandezas de cada estágio —, e deixá-las com `flex-1` produzia
                lajes largas que o olho lê como barra de progresso, não como
                gráfico. Largura fixa e alinhadas à esquerda resolvem: pouca
                barra continua parecendo gráfico pequeno.
              */}
              <div
                className="mb-2.5 flex h-[30px] items-end gap-[3px]"
                title={c.rotuloBarras}
                aria-label={c.rotuloBarras}
              >
                {c.barras.map((b, i) => (
                  <span
                    key={i}
                    className="tg-cresce w-[18px] origin-bottom rounded-sm bg-tg-acento-nevoa"
                    style={{
                      height: `${Math.max(14, (b / maior) * 100)}%`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                ))}
              </div>

              <div className="flex justify-between text-[11.5px] text-tg-fraco-3">
                <span className="truncate">{c.legenda}</span>
                <span className="shrink-0 text-tg-verde-txt">{c.estado}</span>
              </div>
            </article>
          )
        })}
      </div>

      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start">
        {/* feed dos artefatos */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
          <header className="flex items-center gap-2.5 border-b border-tg-linha-fraca px-5 py-4">
            <h2 className="text-[14px] font-medium">Artefatos de extração corrigidos</h2>
            <span className="text-[12px] text-tg-fraco-3">
              {pipeline
                ? `${pipeline.totalAlteracoes} ocorrências · ${Object.keys(pipeline.porRegra).length} classes`
                : 'relatório do normalize ausente'}
            </span>
            <span className="flex-1" />
            <Selo tom="verde">normalize.ts</Selo>
          </header>

          {ARTEFATOS.map((a) => (
            <article
              key={a.letra}
              className="tg-sobe flex gap-4 border-b border-tg-linha-tenue px-5 py-4 last:border-0"
            >
              <div className="w-[74px] shrink-0">
                <p className="font-tg-serif text-[22px] leading-none text-tg-acento">{a.letra}</p>
                <p className="mt-1 text-[11.5px] font-medium text-tg-suave">
                  {pipeline ? `${pipeline.porRegra[a.regra] ?? 0} ocorr.` : '—'}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                  <Selo tom="acento">{a.tag}</Selo>
                  <h3 className="text-[13px] font-medium text-tg-tinta">{a.titulo}</h3>
                  {'novo' in a && a.novo && <Selo tom="ambar">dentro do recorte</Selo>}
                </div>
                <p className="font-tg-serif text-[13px] leading-[1.6] text-tg-corpo">{a.txt}</p>
                <p className="mt-2 text-[11.5px] leading-[1.5] text-tg-tenue">→ {a.saida}</p>
              </div>
            </article>
          ))}
        </section>

        {/* comparador e rotinas */}
        <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[352px]">
          <section className="overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
            <h2 className="border-b border-tg-linha-fraca px-[17px] py-3.5 text-[13.5px] font-medium">
              Comparador texto_bruto → texto
            </h2>
            <div className="px-[17px] py-[15px]">
              <p className="mb-2.5 text-[11.5px] text-tg-fraco-3">
                CP art. 1º · caput · artefato da classe A
              </p>
              <p className="mb-2 rounded-xl bg-tg-supressao-fundo px-3.5 py-[11px] font-tg-serif text-[13px] leading-[1.65] text-tg-supressao-txt">
                Não há crime sem lei anterior que o defina, nem pena sem prévia cominação legal.{' '}
                <span className="line-through">Lei penal no tempo</span>
              </p>
              <p className="rounded-xl bg-tg-insercao-fundo px-3.5 py-[11px] font-tg-serif text-[13px] leading-[1.65] text-tg-insercao-txt">
                Não há crime sem lei anterior que o defina, nem pena sem prévia cominação legal.
              </p>
              <p className="mt-2.5 text-[11.5px] leading-[1.5] text-tg-fraco-2">
                O fragmento removido não foi jogado fora: virou a rubrica{' '}
                <strong className="font-medium text-tg-corpo">“Lei penal no tempo”</strong> do art.
                2º, com <code className="font-tg">origem = oficial</code>. A limpeza obrigatória
                virou a camada que faz a busca funcionar.
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
            <h2 className="border-b border-tg-linha-fraca px-[17px] py-3.5 text-[13.5px] font-medium">
              Rotinas do pipeline
            </h2>
            <div className="px-[17px] pb-3.5 pt-1.5">
              {ROTINAS.map((j) => (
                <div
                  key={j.nome}
                  className="flex items-center gap-2.5 border-b border-tg-linha-tenue py-2.5 last:border-0"
                >
                  <code className="min-w-0 flex-1 truncate font-tg text-[12px] text-tg-corpo-2">
                    {j.nome}
                  </code>
                  <span className="shrink-0 text-[11.5px] text-tg-tenue-2">{j.dur}</span>
                  <Selo tom="verde">{j.st}</Selo>
                </div>
              ))}
              <p className="pt-3 text-[11.5px] leading-[1.5] text-tg-fraco-3">
                Todas rodam localmente, nunca na Vercel: conexão direta ao Postgres em ambiente
                serverless esgota o pool. Em runtime o app só fala por{' '}
                <code className="font-tg">supabase-js .rpc()</code>.
              </p>
            </div>
          </section>

          <section className="rounded-[20px] bg-white px-[17px] py-[15px] shadow-[var(--tg-elev-1)]">
            <h2 className="mb-2 text-[13.5px] font-medium">Data de corte</h2>
            <p className="text-[12px] leading-[1.6] text-tg-fraco-2">
              Os JSONs são uma fotografia de{' '}
              <strong className="font-medium text-tg-corpo">fevereiro de 2025</strong> — Vade Mecum
              do Senado Federal, 1ª edição. Lei 11.343 e Código Penal com cobertura integral; CPP
              em cobertura parcial, só o subconjunto curado que o recorte usa, conferido à mão
              contra o texto oficial.
            </p>
            <p className="mt-2.5 text-[12px] leading-[1.6] text-tg-fraco-2">
              O{' '}
              <Link href="/vademecum" className="text-tg-acento-txt hover:underline">
                acervo Vade Mecum
              </Link>{' '}
              é outra coisa: espelho de terceiro, sem vigência conferida, e por isso não é citável
              em peça nem participa da busca.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
