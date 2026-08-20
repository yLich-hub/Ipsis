'use client'

// =============================================================================
// TOGA v2 — Dosimetria trifásica
//
// O documento de design calcula a pena de um roubo majorado (art. 157, §2º, VII
// do CP). Aqui o crime é o do recorte: tráfico do art. 33, caput da Lei
// 11.343/2006 — 5 a 15 anos e 500 a 1.500 dias-multa. A tela é a mesma até o
// pixel; o que muda são os dispositivos, e mudar isso não é adaptação cosmética:
// a dosimetria do tráfico tem uma regra que o roubo não tem, o art. 42, e ela
// aparece como o nono vetor da primeira fase.
//
// **Isto é uma calculadora, não um parecer.** Cada fração aplicada é a
// majoritária, e o rodapé de cada fase diz qual súmula a limita. Os dois pontos
// onde a conta pode divergir de um juiz real estão anotados no código, onde a
// conta acontece.
// =============================================================================

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'

import { Chave, Segmentado } from '@/components/toga/base'
import {
  AGRAVANTES,
  CAUSAS,
  CRIMES,
  CRIME_PADRAO,
  admite,
  daLeiDeDrogas,
  ENTRADA_NEUTRA,
  ENTRADA_PADRAO,
  PREPONDERANTE,
  VETORES,
  calcula,
  memorialDe,
  meses,
  porVetor,
  type ChaveAgravante,
  type ChaveCausa,
  type Crime,
  type Peso,
} from '@/lib/toga/dosimetria'
import { GRADIENTE_RESULTADO } from '@/lib/toga/tokens'

// A conta mora em `lib/toga/dosimetria.ts`, compartilhada com o cartão que
// aparece dentro da resposta do chat. Duas cópias divergiriam na primeira
// correção — e divergir aqui é a tela dizer uma pena e o cartão dizer outra.

// --- tela --------------------------------------------------------------------

export function Dosimetria() {
  const [fase, setFase] = useState<1 | 2 | 3>(1)
  // O ponto de partida é `ENTRADA_PADRAO`, e ele traz confissão e privilégio
  // marcados de propósito: aqui as duas chaves aparecem na tela, o usuário vê o
  // cenário de que partiu e desliga o que não for o caso dele.
  //
  // O cartão do chat parte de `ENTRADA_NEUTRA`, e a diferença não é divergir: lá
  // a suposição seria invisível, porque a leitura vem da pergunta e o cabeçalho
  // recolhido mostra só o número. A conta continua sendo uma só.
  const [vetores, setVetores] = useState<Peso[]>(() => [...ENTRADA_PADRAO.vetores])
  const [agravantes, setAgravantes] = useState<Record<ChaveAgravante, boolean>>(() => ({
    ...ENTRADA_PADRAO.agravantes,
  }))
  const [causas, setCausas] = useState<Record<ChaveCausa, boolean>>(() => ({
    ...ENTRADA_PADRAO.causas,
  }))
  /**
   * Estado do botão de memorial. Antes era `0 | 1 | 2` com um `setTimeout` de
   * 1400 ms entre o 1 e o 2 — "Gerando memorial…" e depois "Memorial pronto ✓"
   * sem que nada tivesse sido gerado. Agora são só dois estados reais: parado, e
   * copiado (ou falhou, quando a área de transferência é negada).
   */
  const [memorial, setMemorial] = useState<'parado' | 'copiado' | 'falhou'>('parado')
  /**
   * Qual dos cinco crimes da Lei de Drogas está sendo dosado.
   *
   * A ferramenta dosava um só, e a associação do art. 35 — que a denúncia de
   * tráfico quase sempre imputa junto — ficava de fora justamente do caso mais
   * comum do recorte.
   */
  const [crime, setCrime] = useState<Crime>(CRIME_PADRAO)

  const c = useMemo(
    () => calcula({ vetores, agravantes, causas }, crime),
    [vetores, agravantes, causas, crime],
  )

  // Mexer na conta invalida o que foi copiado. Sem isto o "Memorial copiado ✓"
  // sobreviveria à troca de um vetor e passaria a afirmar que a área de
  // transferência tem o cálculo novo, quando ela tem o antigo.
  useEffect(() => setMemorial('parado'), [vetores, agravantes, causas, crime])

  const fases = [
    { k: '1ª fase', nome: 'Pena-base', res: meses(c.base) },
    { k: '2ª fase', nome: 'Pena provisória', res: meses(c.provisoria) },
    { k: '3ª fase', nome: 'Pena definitiva', res: meses(c.definitiva) },
  ]

  return (
    <div className="tg-sobe flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
      {/*
        Abaixo de `xl` quem rola é esta coluna, e não cada painel por dentro.
        A casca é `h-dvh overflow-hidden`, então num flex de coluna com altura
        travada o `aside` — que é `shrink-0` e tem conteúdo alto — espremia o
        painel principal até sobrarem 54px de altura: no celular a tela abria
        direto no resultado e as três fases eram inalcançáveis. Medido em 390px,
        antes: `alturaVisivel: 54`, `escondido: 1986`.
      */}
      <div className="px-5 pb-[30px] pt-6 sm:px-7 xl:min-h-0 xl:flex-1 xl:overflow-auto">
        <div className="max-w-[690px]">
          <h1 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
            Dosimetria trifásica
          </h1>
          <p className="mt-1.5 text-[13px] text-tg-fraco-2">
            {crime.rotulo} · {crime.citacao} da Lei 11.343/2006 · reclusão de {crime.minimo / 12} a{' '}
            {crime.maximo / 12} anos e {crime.multaMinima.toLocaleString('pt-BR')} a{' '}
            {crime.multaMaxima.toLocaleString('pt-BR')} dias-multa
          </p>

          {/*
            O crime imputado, e não uma aba de navegação: trocar aqui muda a
            faixa, a régua de 1/8, a multa e a existência do § 4º. Fica acima
            das três fases porque é a pergunta anterior a elas — a fase 1 já
            precisa do intervalo para calcular a pena-base.
          */}
          <div
            role="radiogroup"
            aria-label="Crime imputado"
            className="mb-5 mt-3.5 flex flex-wrap items-center gap-1.5"
          >
            {CRIMES.map((x, i) => {
              const ativo = x.artigo === crime.artigo
              // A separação por lei é informação, não enfeite: o art. 42 e o
              // § 4º valem de um lado e não do outro, e é isso que muda a conta
              // quando se atravessa a linha.
              const abreLei = i === 0 || daLeiDeDrogas(x) !== daLeiDeDrogas(CRIMES[i - 1]!)
              return (
                <Fragment key={x.artigo}>
                  {abreLei && (
                    <span
                      className={`text-[11px] font-medium text-tg-fraco-3 ${i === 0 ? '' : 'ml-2'}`}
                    >
                      {daLeiDeDrogas(x) ? 'Lei 11.343' : 'Código Penal'}
                    </span>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => {
                      setCrime(x)
                      // As causas que o crime novo não admite saem do estado, e
                      // não só da tela: deixá-las ligadas faria a marca
                      // reaparecer ao voltar para o crime anterior, sem que
                      // ninguém tivesse marcado de novo.
                      setCausas((a) => {
                        const limpo = { ...a }
                        for (const causa of CAUSAS) {
                          if (!admite(x, causa.k)) limpo[causa.k] = false
                        }
                        return limpo
                      })
                    }}
                    title={`${x.citacao} — ${x.minimo / 12} a ${x.maximo / 12} anos`}
                    className={`tgb rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors max-sm:min-h-[38px] ${
                      ativo
                        ? 'bg-tg-acento text-white shadow-[var(--tg-elev-acento)]'
                        : 'bg-tg-preenche text-tg-corpo hover:bg-tg-acento-fraco hover:text-tg-acento-txt'
                    }`}
                  >
                    {x.rotulo}
                    <span
                      className={`ml-1.5 text-[11px] ${ativo ? 'text-white/70' : 'text-tg-fraco-3'}`}
                    >
                      {x.citacao}
                    </span>
                  </button>
                </Fragment>
              )
            })}
          </div>

          {/* as três fases */}
          <div className="mb-[18px] flex gap-[9px]">
            {fases.map((f, i) => {
              const ativa = fase === i + 1
              return (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setFase((i + 1) as 1 | 2 | 3)}
                  aria-pressed={ativa}
                  className={`tgb flex-1 rounded-2xl px-[15px] py-[13px] text-left ${
                    ativa ? 'bg-white shadow-[var(--tg-elev-fase)]' : 'bg-tg-preenche'
                  }`}
                >
                  <span
                    className={`block text-[11px] font-medium ${ativa ? 'text-tg-acento-claro' : 'text-tg-tenue'}`}
                  >
                    {f.k}
                  </span>
                  <span
                    className={`mt-1 block text-[13.5px] font-medium ${ativa ? 'text-tg-tinta' : 'text-tg-corpo-2'}`}
                  >
                    {f.nome}
                  </span>
                  <span
                    className={`mt-[3px] block text-[12.5px] ${ativa ? 'text-tg-acento-txt' : 'text-tg-fraco-3'}`}
                  >
                    {f.res}
                  </span>
                </button>
              )
            })}
          </div>

          {fase === 1 ? (
            <PrimeiraFase
              vetores={vetores}
              negativos={c.negativos}
              porVetor={porVetor(crime)}
              preponderante={crime.preponderante}
              aoTrocar={(i, v) =>
                setVetores((vs) => {
                  const copia = vs.slice()
                  copia[i] = v
                  return copia
                })
              }
              aoZerar={() => setVetores(Array(VETORES.length).fill('neutra'))}
            />
          ) : (
            <OutrasFases
              fase={fase}
              entra={fase === 2 ? c.base : c.provisoria}
              sai={fase === 2 ? c.provisoria : c.definitiva}
              itens={
                fase === 2
                  ? AGRAVANTES
                  : // O § 4º alcança só o art. 33: oferecer a chave nos outros
                    // quatro seria pôr na tela uma redução que a lei recusa, e
                    // `calcula` a recusa de qualquer jeito.
                    CAUSAS.filter((x) => admite(crime, x.k))
              }
              ligadas={fase === 2 ? agravantes : causas}
              aoAlternar={(k) =>
                fase === 2
                  ? setAgravantes((a) => ({
                      ...a,
                      [k as ChaveAgravante]: !a[k as ChaveAgravante],
                    }))
                  : setCausas((a) => ({
                      ...a,
                      [k as ChaveCausa]: !a[k as ChaveCausa],
                    }))
              }
              aoZerar={() =>
                fase === 2
                  ? setAgravantes({ ...ENTRADA_NEUTRA.agravantes })
                  : setCausas({ ...ENTRADA_NEUTRA.causas })
              }
              crime={crime}
            />
          )}
        </div>
      </div>

      <Resultado
        c={c}
        crime={crime}
        agravantes={agravantes}
        causas={causas}
        aoIrPara={setFase}
        memorial={memorial}
        aoCopiarMemorial={() => {
          const texto = memorialDe({ vetores, agravantes, causas }, c, crime)
          // `clipboard` não existe fora de contexto seguro e pode ser negada
          // pelo usuário. O erro vira estado visível: dizer "copiado" sobre uma
          // cópia que não aconteceu é o defeito que este botão tinha.
          void navigator.clipboard
            ?.writeText(texto)
            .then(() => setMemorial('copiado'))
            .catch(() => setMemorial('falhou'))
        }}
      />
    </div>
  )
}

// --- primeira fase -----------------------------------------------------------

function PrimeiraFase({
  vetores,
  negativos,
  porVetor: fracao,
  preponderante,
  aoTrocar,
  aoZerar,
}: {
  vetores: Peso[]
  negativos: number
  /** 1/8 do intervalo DESTE crime — 15 meses no art. 33, 6 no art. 37. */
  porVetor: number
  /** O nono vetor, do art. 42, entra? Só nos crimes da Lei de Drogas. */
  preponderante: boolean
  aoTrocar: (i: number, v: Peso) => void
  aoZerar: () => void
}) {
  // Com os nove vetores já neutros — que é como a ferramenta abre — clicar em
  // "Zerar" não mudava nada, e o botão ficava indistinguível de um botão
  // quebrado. Desligado, ele diz por que não responde.
  const nadaAZerar = vetores.every((v) => v === 'neutra')
  return (
    <section className="tg-sobe overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
      {/* Envolve no celular: em 390px as três partes — título, estado e "Zerar" —
          disputavam a mesma linha e viravam três colunas estreitas, cada uma
          quebrando no meio das palavras. */}
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-tg-linha-fraca px-5 pb-3.5 pt-4">
        <h2 className="text-[14px] font-medium">Circunstâncias judiciais · art. 59 e art. 42</h2>
        <span className="text-[12px] text-tg-fraco-3">
          {negativos === 0
            ? 'nenhum vetor negativo · pena no mínimo'
            : `${negativos} ${negativos > 1 ? 'vetores negativos' : 'vetor negativo'}`}
        </span>
        <span className="hidden flex-1 sm:block" />
        <BotaoZerar
          aoZerar={aoZerar}
          desligado={nadaAZerar}
          titulo={
            nadaAZerar ? 'Os nove vetores já estão neutros' : 'Devolve os nove vetores a neutro'
          }
        />
      </header>

      <div className="px-5 pb-4 pt-1">
        {/* Fora da Lei de Drogas o nono vetor não existe: "natureza e
            quantidade da droga" não é circunstância de um furto. */}
        {(preponderante ? VETORES : VETORES.slice(0, PREPONDERANTE)).map((v, i) => {
          const desfavoravel = vetores[i] === 'desf'
          const dobrado = i === PREPONDERANTE
          return (
            <div
              key={v.nome}
              className="flex flex-col gap-3 border-b border-tg-linha-tenue py-[11px] sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="w-[152px] shrink-0">
                <p className="text-[12.5px] font-medium text-tg-tinta-2">{v.nome}</p>
                <p className="text-[11.5px] text-tg-fraco-3">{v.dica}</p>
              </div>

              <Segmentado
                rotulo={v.nome}
                valor={vetores[i] ?? 'neutra'}
                aoTrocar={(novo) => aoTrocar(i, novo)}
                opcoes={[
                  { v: 'fav', t: 'Favorável' },
                  { v: 'neutra', t: 'Neutra' },
                  { v: 'desf', t: 'Desfavorável' },
                ]}
              />

              <div
                className={`w-[78px] shrink-0 text-right text-[12px] font-medium tabular-nums ${
                  desfavoravel ? 'text-tg-acento-txt' : 'text-tg-tenue-2'
                }`}
              >
                {desfavoravel ? `+ ${Math.round(fracao * (dobrado ? 2 : 1))} meses` : '—'}
              </div>
            </div>
          )
        })}

        <div className="flex items-center gap-3 pb-0.5 pt-3.5">
          <p className="flex-1 text-[12px] leading-[1.5] text-tg-fraco-2">
            Fração de 1/8 do intervalo ({Math.round(fracao)} meses neste crime) por vetor negativo —
            critério majoritário do STJ.{' '}
            {preponderante &&
              'O art. 42 da Lei de Drogas entra com peso dobrado, por preponderar sobre o art. 59. '}
            Súmula 444: inquéritos em curso não agravam a pena-base.
          </p>
          <Link
            href="/consulta?p=Dosimetria%20da%20pena%20na%20Lei%20de%20Drogas"
            className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-preenche px-3 py-1.5 text-[11.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto max-sm:inline-flex max-sm:min-h-[38px] max-sm:items-center"
          >
            Ver os dispositivos
          </Link>
        </div>
      </div>
    </section>
  )
}

/**
 * "Zerar", nas três fases.
 *
 * Desligado quando não há o que zerar, e não escondido: o botão some de uma
 * fase e fica na outra confundiria mais do que um botão apagado com o motivo no
 * `title`. É a mesma escolha da tela de Configurações, onde o que está
 * garantido aparece como pílula de estado em vez de sumir.
 */
function BotaoZerar({
  aoZerar,
  desligado,
  titulo,
}: {
  aoZerar: () => void
  desligado: boolean
  titulo: string
}) {
  return (
    <button
      type="button"
      onClick={aoZerar}
      disabled={desligado}
      title={titulo}
      className={`shrink-0 rounded-full px-[11px] py-1.5 text-[11.5px] font-medium max-sm:inline-flex max-sm:min-h-[38px] max-sm:items-center max-sm:px-3.5 ${
        desligado
          ? 'cursor-default bg-tg-preenche text-tg-fraco-3'
          : 'tgb bg-tg-acento-fraco text-tg-acento-txt'
      }`}
    >
      Zerar
    </button>
  )
}

/** `60` → `5 anos`; `12` → `1 ano`. O mínimo de cada crime é em anos cheios. */
function emAnos(meses: number): string {
  const n = Math.round(meses / 12)
  return `${n} ${n === 1 ? 'ano' : 'anos'}`
}

// --- segunda e terceira fases ------------------------------------------------

function OutrasFases({
  fase,
  entra,
  sai,
  itens,
  ligadas,
  aoAlternar,
  aoZerar,
  crime,
}: {
  fase: 2 | 3
  entra: number
  sai: number
  itens: readonly {
    k: string
    nome: string
    base: string
    nota: string
    fr: string
  }[]
  ligadas: Record<string, boolean>
  aoAlternar: (k: string) => void
  aoZerar: () => void
  crime: Crime
}) {
  // O mesmo botão da primeira fase, e pelo mesmo motivo de ele existir lá: a
  // ferramenta abre com confissão e privilégio marcados, e desmarcar chave por
  // chave para partir do zero era o trabalho que o "Zerar" prometia poupar.
  // Cada um zera a própria fase — zerar as três a partir do cabeçalho de uma
  // só apagaria, sem aviso, o que o usuário marcou em outra tela do passo.
  const nadaAZerar = itens.every((d) => !ligadas[d.k])
  return (
    <section className="tg-sobe overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
      {/* Envolve no celular: em 390px as três partes — título, estado e "Zerar" —
          disputavam a mesma linha e viravam três colunas estreitas, cada uma
          quebrando no meio das palavras. */}
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-tg-linha-fraca px-5 pb-3.5 pt-4">
        <h2 className="text-[14px] font-medium">
          {fase === 2
            ? 'Agravantes e atenuantes · arts. 61 a 66'
            : 'Causas de aumento e diminuição'}
        </h2>
        <span className="text-[12px] text-tg-fraco-3">
          entra em {meses(entra)} · sai em {meses(sai)}
        </span>
        <span className="hidden flex-1 sm:block" />
        <BotaoZerar
          aoZerar={aoZerar}
          desligado={nadaAZerar}
          titulo={nadaAZerar ? 'Nenhuma marcada nesta fase' : 'Desmarca todas as desta fase'}
        />
      </header>

      <div className="px-5 pb-4 pt-1.5">
        {itens.map((d) => {
          const ligada = !!ligadas[d.k]
          return (
            <button
              key={d.k}
              type="button"
              role="switch"
              aria-checked={ligada}
              onClick={() => aoAlternar(d.k)}
              className="tgb -mx-2.5 flex w-[calc(100%+20px)] items-center gap-3.5 rounded-xl border-b border-tg-linha-tenue px-2.5 py-3 text-left transition-[background-color,box-shadow] duration-200 hover:bg-tg-acento-fraco hover:shadow-[inset_0_0_0_1px_var(--color-tg-acento-palido)]"
            >
              <Chave ligada={ligada} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-tg-tinta-2">{d.nome}</span>
                <span className="block text-[11.5px] text-tg-fraco-3">{d.base}</span>
              </span>
              <span className="hidden w-[200px] shrink-0 text-[11.5px] leading-[1.4] text-tg-fraco-3 lg:block">
                {d.nota}
              </span>
              <span
                className={`w-[66px] shrink-0 text-right text-[12px] font-medium tabular-nums ${
                  ligada ? 'text-tg-acento-txt' : 'text-tg-tenue-2'
                }`}
              >
                {d.fr}
              </span>
            </button>
          )
        })}

        {/*
          As duas frases falavam do art. 33 e só dele: o mínimo era "5 anos"
          escrito à mão, e a nota da terceira fase terminava em "é o que faz o
          § 4º valer no tráfico" — que aparecia sob um estupro de vulnerável.
          Regra da tela desde que ela passou a dosar oito crimes: nada afirmado
          aqui pode valer para um crime e ser exibido sobre outro.
        */}
        <p className="pt-3.5 text-[12px] leading-[1.5] text-tg-fraco-2">
          {fase === 2
            ? `Súmula 231/STJ: a atenuante não reduz a pena abaixo do mínimo legal de ${emAnos(crime.minimo)} — a trava está aplicada no cálculo.`
            : 'Aqui a pena pode ficar abaixo do mínimo: causa de diminuição não é atenuante, e a Súmula 231 não a alcança.' +
              (admite(crime, 'privilegiado') ? ' É o que faz o § 4º valer no tráfico.' : '')}
        </p>
      </div>
    </section>
  )
}

// --- painel de resultado -----------------------------------------------------

function Resultado({
  c,
  crime,
  agravantes,
  causas,
  aoIrPara,
  memorial,
  aoCopiarMemorial,
}: {
  c: {
    negativos: number
    peso: number
    base: number
    provisoria: number
    definitiva: number
    multa: number
  }
  crime: Crime
  agravantes: Record<ChaveAgravante, boolean>
  causas: Record<ChaveCausa, boolean>
  aoIrPara: (f: 1 | 2 | 3) => void
  memorial: 'parado' | 'copiado' | 'falhou'
  aoCopiarMemorial: () => void
}) {
  const anos = c.definitiva / 12

  // Art. 33, §2º do CP. O tráfico deixou de ter regime inicial fechado
  // obrigatório: o STF declarou inconstitucional o §1º do art. 2º da Lei
  // 8.072/90 (HC 111.840), então o regime volta a seguir a regra geral.
  const regime = anos > 8 ? 'Fechado' : anos > 4 ? 'Semiaberto' : 'Aberto'

  // Art. 44 do CP. A vedação do art. 44 da Lei 11.343 caiu no HC 97.256/STF —
  // por isso a substituição aparece como possível, e não vedada de plano.
  const substituicao = anos <= 4 && !agravantes.reincidencia ? 'Possível' : 'Vedada'

  // Art. 109 do CP, pela pena concreta.
  const prescricao =
    anos > 12
      ? '20 anos'
      : anos > 8
        ? '16 anos'
        : anos > 4
          ? '12 anos'
          : anos > 2
            ? '8 anos'
            : '4 anos'

  const linhas = [
    {
      n: '1',
      rot: 'Pena-base',
      det: `${c.negativos} vetor(es) negativo(s) · 1/8 do intervalo`,
      val: meses(c.base),
      fase: 1 as const,
    },
    {
      n: '2',
      rot: 'Agravantes',
      det: agravantes.reincidencia ? 'reincidência +1/6' : 'nenhuma reconhecida',
      val: agravantes.reincidencia ? meses((c.base * 7) / 6) : '=',
      fase: 2 as const,
    },
    {
      n: '3',
      rot: 'Atenuantes',
      det:
        agravantes.menoridade || agravantes.confissao
          ? `${[agravantes.menoridade && 'menoridade', agravantes.confissao && 'confissão']
              .filter(Boolean)
              .join(' e ')} · Súmula 231 respeitada`
          : 'nenhuma marcada',
      val: meses(c.provisoria),
      fase: 2 as const,
    },
    {
      n: '4',
      rot: 'Causas de aumento e diminuição',
      // Nomeia as causas ligadas QUE ESTE CRIME ADMITE: escrever "privilegiado
      // −2/3 (art. 33, § 4º)" sob um roubo seria anunciar uma redução que a
      // conta recusou.
      det:
        CAUSAS.filter((x) => causas[x.k] && admite(crime, x.k))
          .map((x) => `${x.nome.replace(/ \(.*/, '')} ${x.fr}`)
          .join(' · ') || 'nenhuma aplicada',
      val: meses(c.definitiva),
      fase: 3 as const,
    },
  ]

  return (
    <aside className="w-full shrink-0 border-t border-tg-linha-media bg-white px-[22px] py-6 xl:w-[352px] xl:overflow-auto xl:border-l xl:border-t-0">
      <p className="mb-3.5 text-[12px] font-medium text-tg-fraco-3">Resultado ao vivo</p>

      <div
        className="rounded-[20px] p-5 text-white shadow-[var(--tg-elev-painel)]"
        style={{ background: GRADIENTE_RESULTADO }}
      >
        <p className="text-[12px] text-white/[0.66]">Pena definitiva</p>
        {/* `key` força a animação a repetir a cada valor novo — sem ela o
            número troca em silêncio e a conta parece não ter reagido. */}
        <p
          key={c.definitiva}
          className="tg-pipoca my-[8px] font-tg-serif text-[46px] leading-[1.02] -tracking-[0.02em]"
        >
          {meses(c.definitiva)}
        </p>
        <p className="text-[12.5px] text-white/[0.72]">
          {meses(c.definitiva)} de reclusão e {c.multa} dias-multa
        </p>

        <div className="mt-4 flex gap-2.5 border-t border-white/[0.14] pt-4">
          {[
            ['Regime', regime],
            ['Substituição', substituicao],
            ['Prescrição', prescricao],
          ].map(([rot, val]) => (
            <div key={rot} className="flex-1">
              <p className="text-[11px] text-white/60">{rot}</p>
              <p className="mt-0.5 text-[13px] font-medium">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {linhas.map((l) => (
          <button
            key={l.n}
            type="button"
            onClick={() => aoIrPara(l.fase)}
            className="tgb -mx-2.5 flex w-[calc(100%+20px)] items-start gap-3 rounded-xl px-2.5 py-3 text-left transition-[background-color,box-shadow] duration-200 hover:bg-tg-acento-fraco hover:shadow-[inset_0_0_0_1px_var(--color-tg-acento-palido)]"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-tg-acento-fraco text-[10.5px] font-semibold text-tg-acento-txt">
              {l.n}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-tg-tinta-2">{l.rot}</span>
              <span className="block text-[11.5px] leading-[1.45] text-tg-fraco-3">{l.det}</span>
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-tg-acento">
              {l.val}
            </span>
          </button>
        ))}
      </div>

      <div className="my-2 rounded-2xl bg-tg-fundo px-4 py-3.5">
        <p className="mb-[7px] text-[11.5px] font-medium text-tg-suave">Fundamentação sugerida</p>
        <p className="font-tg-serif text-[13px] leading-[1.65] text-tg-corpo">
          “Presente{c.negativos === 0 ? ' nenhuma' : ` ${c.negativos}`} circunstância judicial
          desfavorável, fixo a pena-base em {meses(c.base)}, que torno definitiva em{' '}
          {meses(c.definitiva)} de reclusão e {c.multa} dias-multa após as fases seguintes.”
        </p>
      </div>

      <div className="mt-3.5 flex flex-col gap-2">
        <button
          type="button"
          onClick={aoCopiarMemorial}
          className="tgb rounded-[14px] bg-tg-acento py-[11px] text-center text-[12.5px] font-medium text-white shadow-[var(--tg-elev-acento-forte)]"
        >
          {
            {
              parado: 'Copiar memorial de cálculo',
              copiado: 'Memorial copiado ✓',
              falhou: 'Não foi possível copiar',
            }[memorial]
          }
        </button>
        <Link
          href="/jurisprudencia"
          className="tgb rounded-[14px] bg-tg-preenche py-[11px] text-center text-[12.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
        >
          Comparar com o entendimento consolidado
        </Link>
      </div>

      <p className="mt-3.5 text-[11px] leading-[1.5] text-tg-tenue">
        Calculadora, não parecer. As frações são as majoritárias e cada fase mostra a súmula que a
        limita — o caso concreto pode justificar outra.
      </p>
    </aside>
  )
}
