// =============================================================================
// / — a página pública do projeto.
//
// **Ela era um desvio e virou tela.** Até aqui a raiz mandava visitante sem
// sessão direto para `/login`, e o primeiro contato de quem chegava por link
// era um formulário pedindo credencial de um sistema que a pessoa não conhecia.
// Para um projeto de portfólio isso é jogar fora o único visitante que importa:
// o que veio ver o que foi construído, não trabalhar aqui.
//
// **O que esta página defende, e por que só uma coisa.** A decisão nº 1 —
// o texto legal nunca é gerado pelo modelo. As outras duas decisões aparecem,
// mas como prova de apoio: uma página que defende três teses não é lembrada por
// nenhuma. O centro é o inspetor, onde o visitante abre cada citação e vê o
// registro do corpus por trás dela.
//
// **Estática, e isso é requisito e não acaso.** Nada aqui lê cookie, sessão ou
// banco. Os números são contados em build (`lib/landing/numeros.ts`) e as
// citações são resolvidas em build (`lib/landing/inspetor.ts`). É o que a ADR 6
// pede: um link de portfólio é clicado semanas depois, quando o plano gratuito
// do Supabase já pausou o projeto — e nesse dia esta página tem de estar
// inteira.
//
// A rota continua passando pelo middleware, que agora só desvia quem TEM
// sessão: para quem já trabalha no sistema, a raiz segue levando a `/consulta`
// sem mostrar apresentação nenhuma.
// =============================================================================

import type { Metadata } from 'next'
import Link from 'next/link'

import { Icone } from '@/components/icones'
import { Inspetor } from '@/components/landing/inspetor'
import { ROTA_LOGIN } from '@/lib/auth/rotas'
import { dataBR, numeroBR } from '@/lib/formato'
import { carregaInspetor } from '@/lib/landing/inspetor'
import { numeros } from '@/lib/landing/numeros'
import { GRADIENTE_MARCA } from '@/lib/toga/tokens'
import { MARCA } from '@/lib/toga/marca'

/**
 * O repositório. Escrito aqui e não em `marca.ts` de propósito: aquele arquivo
 * declara de si que guarda decisão de produto, e endereço de hospedagem de
 * código não é produto — é onde o código mora hoje.
 */
const REPOSITORIO = 'https://github.com/yLich-hub/Ipsis'
const ARQUITETURA = `${REPOSITORIO}#2-arquitetura-do-sistema`

export const metadata: Metadata = {
  title: `${MARCA.nome} — o modelo argumenta, o banco cita`,
  description:
    'Assistente jurídico para defesa em tráfico de drogas. O texto legal nunca é ' +
    'gerado pelo modelo: toda citação resolve para um dispositivo lido do corpus.',
}

/** As três decisões do projeto, na ordem em que `docs/decisoes-de-arquitetura.md` as lista. */
const DECISOES = [
  {
    icone: 'cadeado',
    titulo: 'O texto legal nunca é gerado pelo modelo',
    corpo:
      'Toda citação resolve para um registro do corpus. O modelo escreve apenas a ' +
      'argumentação entre as citações — e, na minuta em DOCX, nem isso: ali ela é ' +
      'escrita à mão, e o rodapé do arquivo declara quantas teses ainda aguardam ' +
      'revisão em vez de afirmar que todas passaram. Citação para dispositivo ' +
      'inexistente quebra o teste antes do build, em vez de aparecer em audiência.',
  },
  {
    icone: 'busca',
    titulo: 'A camada de rubricas é o coração da busca',
    corpo:
      'Advogado não busca pelo texto da lei, busca pelo apelido do instituto — e ' +
      'tráfico privilegiado não aparece em lugar nenhum do art. 33, § 4º. Busca ' +
      'semântica sozinha também erra: para a pergunta sobre reduzir a pena de quem é ' +
      'primário, o vetor devolve tráfico de pessoas acima de tráfico de drogas, porque ' +
      'as duas redações são quase idênticas. O apelido é casado por match exato, com ' +
      'peso dominante na fusão.',
  },
  {
    icone: 'historico',
    titulo: 'A data de corte é visível o tempo todo',
    corpo:
      'O corpus é uma fotografia da legislação, e fotografia envelhece. A data em que ' +
      'ela foi tirada aparece ao lado de cada dispositivo, e seis coletores públicos ' +
      'perguntam todo dia se alguma das fontes mudou desde então.',
  },
] as const

export default function Raiz() {
  const n = numeros()
  const inspetor = carregaInspetor()

  const provas = [
    { valor: numeroBR(n.leis), rotulo: 'leis no corpus citável', apoio: 'Lei 11.343, CP e CPP, em cobertura integral' },
    { valor: numeroBR(n.artigos), rotulo: 'artigos versionados', apoio: 'contados na entrada do normalize, neste repositório' },
    { valor: numeroBR(n.rubricas), rotulo: 'rubricas curadas', apoio: 'os apelidos de instituto que a busca casa por match exato' },
    { valor: numeroBR(n.teses), rotulo: 'teses de resposta à acusação', apoio: 'argumentação escrita à mão, sem modelo em runtime' },
    { valor: numeroBR(n.decretos), rotulo: 'decretos do Paraná', apoio: `no recorte normativo, achados em ${numeroBR(n.atosLidos)} atos lidos` },
    { valor: numeroBR(n.acervoDeLeitura), rotulo: 'legislações para leitura', apoio: 'acervo Vade Mecum — deliberadamente fora do corpus citável' },
  ]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 sm:px-8">
      {/* --- marca -------------------------------------------------------- */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-9 place-items-center rounded-xl font-tg-serif text-[14px] font-semibold tracking-[0.01em] text-white shadow-[var(--tg-elev-marca)]"
            style={{ background: GRADIENTE_MARCA }}
          >
            {MARCA.inicial}
          </span>
          <span className="text-xl font-semibold -tracking-[0.01em] text-tg-tinta">{MARCA.nome}</span>
          <span className="rounded-full bg-tg-acento-fraco px-2 py-0.5 text-[10px] font-medium text-tg-acento-txt">
            {MARCA.ramo}
          </span>
        </div>
        <Link
          href={ROTA_LOGIN}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-tg-corpo-2 transition-colors hover:bg-tg-hover hover:text-tg-tinta"
        >
          Entrar
        </Link>
      </header>

      {/* --- 1. o problema ------------------------------------------------ */}
      <section className="tg-sobe pt-8 pb-14 sm:pt-14">
        <p className="text-[12.5px] font-medium tracking-[0.04em] text-tg-acento-txt uppercase">
          Consulta e peças em tráfico de drogas
        </p>
        <h1 className="mt-4 text-[34px] leading-[1.15] font-semibold -tracking-[0.02em] text-tg-tinta sm:text-[44px]">
          O modelo escreve a argumentação.
          <br />
          O texto da lei ele nunca escreve.
        </h1>
        <p className="mt-6 max-w-2xl font-tg-serif text-[17px] leading-[1.7] text-tg-corpo">
          Citar redação revogada, ou fundamento que não existe, em peça protocolada não é falha
          de interface — é dano ao cliente, e o custo do erro é assimétrico. Por isso o{' '}
          {MARCA.nome} trata citação como dado e não como texto gerado: cada uma resolve para um
          dispositivo lido do corpus, e ao modelo sobra o espaço entre elas.
        </p>
      </section>

      {/* --- 2. o inspetor ------------------------------------------------ */}
      <section className="pb-14">
        <div className="rounded-[26px] bg-white p-5 shadow-[var(--tg-elev-cartao)] sm:p-7">
          <div className="flex items-start gap-3 border-b border-tg-linha pb-5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-tg-campo text-tg-corpo-2">
              <Icone nome="busca" className="size-4" />
            </span>
            <div>
              <p className="font-tg-serif text-[17px] leading-snug text-tg-tinta">
                {inspetor.pergunta}
              </p>
              <p className="mt-1.5 text-[11.5px] text-tg-fraco-2">
                rubrica reconhecida: <span className="text-tg-corpo-2">{inspetor.rubrica}</span> ·{' '}
                {inspetor.blocos.length} citações atravessando {inspetor.leisAtravessadas} leis
              </p>
            </div>
          </div>

          <div className="pt-5">
            <Inspetor blocos={inspetor.blocos} dataDeCorte={n.dataDeCorte} />
          </div>

          {/* A honestidade que a página precisa dizer em voz alta, e no lugar
              onde ela é verificável — não num rodapé que ninguém lê. */}
          <p className="mt-6 border-t border-tg-linha-tenue pt-4 text-[12.5px] leading-relaxed text-tg-fraco">
            No produto, quem escreve a prosa entre as citações é o modelo. Aqui ela está curada,
            porque rota sem sessão não gasta com modelo e porque esta página precisa funcionar com
            o banco pausado. O que muda é o autor da argumentação; o que não muda é a origem das
            citações — nenhuma delas foi escrita, todas foram lidas do corpus em tempo de build.
          </p>
        </div>
      </section>

      {/* --- 3. as três decisões ------------------------------------------ */}
      <section className="pb-14">
        <h2 className="text-[13px] font-medium tracking-[0.04em] text-tg-fraco uppercase">
          As três decisões que definem o projeto
        </h2>
        <div className="tg-lista mt-5 flex flex-col gap-3">
          {DECISOES.map((d, i) => (
            <article
              key={d.titulo}
              className="rounded-2xl border border-tg-linha bg-white p-5 shadow-[var(--tg-elev-1)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-tg-acento-fraco text-tg-acento-txt">
                  <Icone nome={d.icone} className="size-4" />
                </span>
                <h3 className="text-[15px] font-semibold -tracking-[0.01em] text-tg-tinta">
                  <span className="text-tg-tenue">{i + 1}.</span> {d.titulo}
                </h3>
              </div>
              <p className="mt-3 font-tg-serif text-[15px] leading-[1.7] text-tg-corpo">{d.corpo}</p>
            </article>
          ))}
        </div>
      </section>

      {/* --- 4. os números ------------------------------------------------ */}
      <section className="pb-14">
        <h2 className="text-[13px] font-medium tracking-[0.04em] text-tg-fraco uppercase">
          O que há dentro, contado no build
        </h2>
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {provas.map((p) => (
            <div
              key={p.rotulo}
              className="rounded-2xl border border-tg-linha bg-white p-4 shadow-[var(--tg-elev-1)]"
            >
              <dt className="text-[26px] leading-none font-semibold tabular-nums -tracking-[0.02em] text-tg-tinta">
                {p.valor}
              </dt>
              <dd className="mt-2 text-[13px] font-medium text-tg-corpo">{p.rotulo}</dd>
              <dd className="mt-1 text-[11.5px] leading-relaxed text-tg-fraco-2">{p.apoio}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed text-tg-fraco-2">
          Nenhum destes números está digitado: todos são contagem do que está versionado neste
          repositório, feita durante o build. A legislação do corpus é a vigente em{' '}
          <strong className="font-medium text-tg-corpo-2">{dataBR(n.dataDeCorte)}</strong>.
        </p>
      </section>

      {/* --- 5. a saída --------------------------------------------------- */}
      <section className="mt-auto pb-12">
        <div className="rounded-[26px] border border-tg-linha bg-white p-6 shadow-[var(--tg-elev-1f)] sm:p-7">
          <h2 className="text-[19px] font-semibold -tracking-[0.015em] text-tg-tinta">
            O código está aberto
          </h2>
          <p className="mt-2.5 max-w-xl font-tg-serif text-[15px] leading-[1.7] text-tg-corpo">
            A arquitetura, as {n.decisoesRegistradas} decisões registradas e o que ficou de fora
            por escolha estão no repositório. É lá que dá para conferir se o mecanismo desta página
            é mesmo o que o sistema faz.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <a
              href={REPOSITORIO}
              className="inline-flex items-center gap-2 rounded-xl bg-tg-acento px-4 py-2.5 text-[13.5px] font-medium text-white shadow-[var(--tg-elev-acento)] transition-colors hover:bg-tg-acento-medio"
            >
              <Icone nome="pasta" className="size-4" />
              Ver o repositório
            </a>
            <a
              href={ARQUITETURA}
              className="inline-flex items-center gap-2 rounded-xl border border-tg-linha-forte bg-tg-preenche px-4 py-2.5 text-[13.5px] font-medium text-tg-corpo transition-colors hover:bg-tg-hover"
            >
              <Icone nome="paineis" className="size-4" />
              Ler a arquitetura
            </a>
          </div>

          {/* A natureza do projeto, declarada onde o leitor já viu a prova — e
              antes de ele encontrar o formulário de cadastro. */}
          <p className="mt-6 border-t border-tg-linha-tenue pt-4 text-[12.5px] leading-relaxed text-tg-fraco">
            Projeto de portfólio, de escopo estreito por decisão: recorte em tráfico de drogas,
            uma peça processual e autenticação de usuário único. Não é produto comercial, não tem
            suporte e não substitui a conferência de quem assina a peça.
          </p>
        </div>
      </section>
    </div>
  )
}
