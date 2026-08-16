'use client'

// =============================================================================
// TOGA v2 — Configurações
//
// A forma é a do documento de design: trilha de 250px à esquerda com as seções,
// conteúdo à direita em cartões de 20px de raio, título serifado de 26px e as
// listas de opção com interruptor à direita. Isso foi mantido linha a linha.
//
// O conteúdo, não. O documento ajusta um produto que não é este: ele tem
// escritório com 12 assentos, fatura de R$ 2.390/mês, cinco coletores em Python
// e sincronização do Diário Oficial a cada 30 minutos. Aqui não há multiusuário,
// não há cobrança e não há coletor — desenhar essas telas encheria o produto de
// dado plausível e falso, que é exatamente o que a decisão nº 3 do projeto
// existe para impedir. Onde a seção do documento não tinha correspondente real,
// ela foi trocada por uma que tem:
//
//   documento              aqui                     por quê
//   ─────────────────────  ───────────────────────  ──────────────────────────
//   Perfil e OAB           Perfil e OAB             igual, em `public.perfil`
//   IA e citações          IA e citações            vira o que já é garantido
//   Fontes e sincronização Fontes e data de corte   não há coletor; há corpus
//   Alertas                Aparência                nada notifica; a interface
//                                                   tem duas preferências reais
//   Segurança              Segurança                sessão, senha, dispositivos
//   Escritório e cobrança  —                        fora de escopo, sem farsa
//
// **Nenhum interruptor desta tela é decorativo.** Os dois que existem mexem em
// coisa que se vê na hora; o resto das linhas é leitura, com pílula de estado no
// lugar do interruptor — e a diferença entre "ajustável" e "garantido" fica na
// forma, não numa nota de rodapé que ninguém lê.
// =============================================================================

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { marcarSaidaDeliberada, useUsuario } from '@/components/casca/sessao'
import { Chave, Selo } from '@/components/toga/base'
import { supabaseNavegador } from '@/lib/auth/navegador'
import { dataBR, numeroBR } from '@/lib/formato'
import {
  PERFIL_VAZIO,
  type Perfil,
  carrega,
  doCache,
  iniciais,
  salva,
} from '@/lib/toga/perfil'
import {
  gravaColapso,
  gravaMovimentoReduzido,
  leColapso,
  leMovimentoReduzido,
  usePreferencia,
} from '@/lib/toga/preferencias'
import { GRADIENTE_CONTA, MATIZ } from '@/lib/toga/tokens'

/** Uma lei do corpus, como a tela precisa dela. Montada no componente de servidor. */
export type FonteLei = {
  id: string
  apelido: string
  cobertura: 'integral' | 'parcial'
  coberturaNota: string | null
  vigenciaAte: string
  artigos: number
  dispositivos: number | null
}

const SECOES = [
  {
    k: 'perfil',
    t: 'Perfil e OAB',
    matiz: MATIZ.lavanda,
    titulo: 'Perfil e OAB',
    sub: 'Como você aparece dentro do produto.',
  },
  {
    k: 'ia',
    t: 'IA e citações',
    matiz: MATIZ.sabia,
    titulo: 'IA e citações',
    sub: 'O que o modelo escreve e o que ele nunca escreve.',
  },
  {
    k: 'fontes',
    t: 'Fontes e data de corte',
    matiz: MATIZ.gelo,
    titulo: 'Fontes e data de corte',
    sub: 'O corpus citável, com a fotografia de que ele saiu.',
  },
  {
    k: 'aparencia',
    t: 'Aparência',
    matiz: MATIZ.areia,
    titulo: 'Aparência',
    sub: 'Duas preferências de interface, guardadas neste navegador.',
  },
  {
    k: 'seguranca',
    t: 'Segurança',
    matiz: MATIZ.rosa,
    titulo: 'Segurança',
    sub: 'Sessão, senha e encerramento de acesso.',
  },
] as const

type ChaveSecao = (typeof SECOES)[number]['k']

export function Configuracoes({
  leis,
  erroFontes,
}: {
  leis: FonteLei[]
  /** O banco pode estar pausado — a tela continua útil, só a seção de fontes degrada. */
  erroFontes?: string
}) {
  const [secao, setSecao] = useState<ChaveSecao>('perfil')
  const atual = SECOES.find((s) => s.k === secao)!

  return (
    <div className="flex min-h-0 flex-1">
      {/* trilha das seções — some no estreito, onde vira a fileira de pílulas */}
      <nav
        aria-label="Ajustes"
        className="hidden w-[250px] shrink-0 flex-col overflow-auto border-r border-tg-linha-media px-3.5 py-[22px] md:flex"
      >
        <p className="px-2.5 pb-2.5 text-[11.5px] font-medium text-tg-fraco-3">Ajustes</p>
        <div className="flex flex-col gap-0.5">
          {SECOES.map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setSecao(s.k)}
              aria-current={s.k === secao ? 'true' : undefined}
              className={`tgb flex items-center gap-2.5 rounded-[11px] px-[11px] py-[9px] text-left text-[12.5px] font-medium ${
                s.k === secao
                  ? 'bg-tg-acento-fraco text-tg-acento-txt'
                  : 'text-tg-corpo hover:bg-tg-campo'
              }`}
            >
              <span
                aria-hidden="true"
                className="size-[18px] shrink-0 rounded-md"
                style={{ background: s.matiz }}
              />
              {s.t}
            </button>
          ))}
        </div>

        <SairDaConta />
      </nav>

      <div className="min-w-0 flex-1 overflow-auto px-5 pb-[34px] pt-[26px] sm:px-[30px]">
        <div className="max-w-[720px]">
          {/* fileira de pílulas do modo estreito, no lugar da trilha */}
          <div className="-mx-5 mb-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:hidden">
            {SECOES.map((s) => (
              <button
                key={s.k}
                type="button"
                onClick={() => setSecao(s.k)}
                className={`tgb shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-medium ${
                  s.k === secao
                    ? 'bg-tg-acento-fraco text-tg-acento-txt'
                    : 'bg-tg-preenche text-tg-corpo'
                }`}
              >
                {s.t}
              </button>
            ))}
          </div>

          <h1 className="font-tg-serif text-[26px] leading-[1.2] -tracking-[0.01em] text-tg-tinta">
            {atual.titulo}
          </h1>
          <p className="mb-[22px] mt-[7px] text-[13px] text-tg-fraco-2">{atual.sub}</p>

          {/* `key` remonta o bloco a cada troca: é o que faz a animação de
              entrada rodar de novo, como no documento. */}
          <div key={secao} className="tg-sobe flex flex-col gap-3.5">
            {secao === 'perfil' && <SecaoPerfil />}
            {secao === 'ia' && <SecaoIa />}
            {secao === 'fontes' && <SecaoFontes leis={leis} erro={erroFontes} />}
            {secao === 'aparencia' && <SecaoAparencia />}
            {secao === 'seguranca' && <SecaoSeguranca />}
          </div>

          <div className="mt-5 md:hidden">
            <SairDaConta />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- peças repetidas ---------------------------------------------------------

function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-white shadow-[var(--tg-elev-1)] ${className}`}>
      {children}
    </div>
  )
}

/**
 * Linha de opção do documento: título, descrição e um controle à direita. O
 * controle pode ser interruptor (ajustável), pílula de valor (leitura) ou botão.
 */
function Linha({
  titulo,
  desc,
  fim,
  onClick,
}: {
  titulo: string
  desc: ReactNode
  fim: ReactNode
  onClick?: () => void
}) {
  const conteudo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-tg-tinta">{titulo}</span>
        <span className="mt-1 block text-[12px] leading-[1.5] text-tg-fraco-2">{desc}</span>
      </span>
      {fim}
    </>
  )

  // Quando há interruptor, a linha inteira é o alvo de clique: 38px de largura
  // é pouco para o dedo, e o rótulo já é o rótulo do controle.
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-[18px] border-b border-tg-linha-tenue px-[22px] py-[18px] text-left transition-colors last:border-b-0 hover:bg-[#f9fafb]"
    >
      {conteudo}
    </button>
  ) : (
    <div className="flex items-center gap-[18px] border-b border-tg-linha-tenue px-[22px] py-[18px] last:border-b-0">
      {conteudo}
    </div>
  )
}

/** Pílula de valor à direita da linha — leitura, não controle. */
function Valor({ children, tom = 'acento' }: { children: ReactNode; tom?: 'acento' | 'verde' }) {
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-[13px] py-[7px] text-[12.5px] font-medium ${
        tom === 'verde'
          ? 'bg-tg-verde-fundo text-tg-verde-txt'
          : 'bg-tg-acento-fraco text-tg-acento-txt'
      }`}
    >
      {children}
    </span>
  )
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-tg-linha-tenue px-[22px] py-4 text-[12px] leading-[1.5] text-tg-fraco-3">
      {children}
    </p>
  )
}

// --- perfil ------------------------------------------------------------------

const CAMPOS = [
  { k: 'nome', rot: 'Nome', dica: 'Marina Ribeiro' },
  { k: 'oab', rot: 'Inscrição na OAB', dica: 'OAB/SP 412.883' },
  { k: 'telefone', rot: 'Telefone', dica: '(11) 98xxx-4412' },
] as const

/** Estado da gravação, mostrado ao lado dos campos. */
type Estado = 'parado' | 'salvando' | 'salvo' | 'falhou'

function SecaoPerfil() {
  const usuario = useUsuario()
  const email = usuario?.email ?? ''
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_VAZIO)
  const [pronto, setPronto] = useState(false)
  const [estado, setEstado] = useState<Estado>('parado')
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  // O cache pinta primeiro para os campos não nascerem vazios e piscarem; o
  // banco corrige em seguida. `pronto` impede que o primeiro quadro — ainda sem
  // dado — dispare uma gravação por cima do que já estava guardado.
  useEffect(() => {
    setPerfil(doCache())
    void carrega().then((p) => {
      setPerfil(p)
      setPronto(true)
    })
  }, [])

  // Sem botão "Salvar", como no documento — mas sem gravar a cada tecla: são 300
  // ms de silêncio antes de subir. Digitar um nome de 20 letras seriam 20 idas
  // ao banco, e a penúltima chegaria depois da última em rede lenta.
  function altera(k: keyof Perfil, v: string) {
    const novo = { ...perfil, [k]: v }
    setPerfil(novo)
    if (!pronto) return

    setEstado('salvando')
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => {
      void salva(novo).then((ok) => setEstado(ok ? 'salvo' : 'falhou'))
    }, 300)
  }

  useEffect(() => () => void (relogio.current && clearTimeout(relogio.current)), [])

  return (
    <>
      <Cartao className="p-[22px]">
        <div className="mb-[22px] flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-[62px] shrink-0 place-items-center rounded-[22px] font-tg-serif text-[19px] tracking-[0.01em] text-white shadow-[0_8px_20px_-10px_rgb(28_26_36_/_0.9)]"
            style={{ background: GRADIENTE_CONTA }}
          >
            {iniciais(perfil.nome, email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-medium text-tg-tinta">
              {perfil.nome.trim() || email || 'Sem nome preenchido'}
            </p>
            <p className="mt-[3px] truncate text-[12.5px] text-tg-fraco-2">
              {perfil.oab.trim() || 'Inscrição na OAB não preenchida'} · advocacia criminal
            </p>
          </div>
          {/* O documento põe aqui um botão "Trocar foto". Não há upload nem
              armazenamento de imagem no projeto, e um botão que não faz nada é
              pior que nenhum: o avatar é gerado das iniciais, e o selo diz isso. */}
          <Selo tom="neutro" className="hidden sm:inline-flex">
            iniciais automáticas
          </Selo>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <label key={c.k} className="block">
              <span className="mb-[7px] block text-[11.5px] font-medium text-tg-fraco-2">
                {c.rot}
              </span>
              <input
                value={perfil[c.k]}
                onChange={(e) => altera(c.k, e.target.value)}
                placeholder={c.dica}
                autoComplete="off"
                className="w-full rounded-xl bg-tg-preenche px-[13px] py-[11px] text-[13.5px] text-tg-tinta outline-none placeholder:text-tg-tenue focus:bg-tg-campo"
              />
            </label>
          ))}

          {/* O e-mail não é campo: vem do Auth, e trocá-lo é operação de conta,
              não de perfil. Editável aqui, seria uma promessa que a tela não
              tem como cumprir. */}
          <label className="block">
            <span className="mb-[7px] block text-[11.5px] font-medium text-tg-fraco-2">E-mail</span>
            <input
              value={email}
              readOnly
              title="Vem da sessão do Supabase Auth"
              className="w-full cursor-default rounded-xl bg-tg-preenche/60 px-[13px] py-[11px] text-[13.5px] text-tg-fraco outline-none"
            />
          </label>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.5] text-tg-fraco-3">
          <span>
            Guardado em <code className="text-[11.5px]">public.perfil</code>, sob RLS por sessão. O
            nome alimenta as iniciais do avatar; a minuta continua saindo com autos, nome e OAB como
            campos a preencher — preencher o cabeçalho de uma peça a partir de um ajuste de tela é
            decisão sobre a peça, não sobre esta tela.
          </span>
          {estado !== 'parado' && (
            <span
              className={
                estado === 'falhou' ? 'font-medium text-tg-supressao-txt' : 'text-tg-verde-txt'
              }
            >
              {estado === 'salvando'
                ? 'salvando…'
                : estado === 'salvo'
                  ? '✓ salvo no banco'
                  : 'não foi possível salvar no banco — ficou guardado neste navegador'}
            </span>
          )}
        </p>
      </Cartao>

      <Cartao className="px-[22px] py-5">
        <p className="mb-1.5 text-[14px] font-medium text-tg-tinta">Recorte do produto</p>
        <p className="mb-3.5 text-[12.5px] text-tg-fraco-2">
          Não é preferência: é o escopo do sistema, e está aqui para ser lido antes de alguém
          esperar dele o que ele não faz.
        </p>
        <div className="flex flex-wrap gap-[7px]">
          {[
            ['Tráfico de drogas · Lei 11.343/2006', true],
            ['Código Penal', true],
            ['Código de Processo Penal', true],
            ['Vade Mecum · só leitura', false],
            ['Demais crimes', false],
            ['Segunda peça processual', false],
          ].map(([t, dentro]) => (
            <span
              key={String(t)}
              className={`rounded-full px-[13px] py-[7px] text-[12px] font-medium ${
                dentro
                  ? 'bg-tg-acento-fraco text-tg-acento-txt'
                  : 'bg-tg-preenche text-tg-tenue line-through'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </Cartao>
    </>
  )
}

// --- IA e citações -----------------------------------------------------------

const GARANTIAS = [
  {
    t: 'Citação resolvida no banco',
    d: 'Todo {{cite:}} da minuta vira texto lido de dispositivos, com link para /dispositivo/[id]. O modelo escreve só o que está entre as citações.',
    v: 'garantido',
  },
  {
    t: 'Data de corte em toda tela',
    d: 'A fotografia é de fevereiro/2025. O aviso vai no banner, ao lado de cada dispositivo e no rodapé de toda página da minuta.',
    v: 'garantido',
  },
  {
    t: 'Nenhuma chamada a modelo em runtime',
    d: 'A prosa da consulta é composta de fatos sobre a própria busca; a argumentação da peça está escrita e revisada em teses.yaml.',
    v: 'garantido',
  },
  {
    t: 'Doutrina não é hospedada nem resumida',
    d: 'Obra autoral protegida. O produto entrega entendimento consolidado de jurisprudência e link para a fonte legítima.',
    v: 'garantido',
  },
  {
    t: 'Acervo Vade Mecum não é citável',
    d: 'É espelho de terceiro, sem vigência conferida. Fica separado do corpus curado, sem embedding e fora da busca híbrida.',
    v: 'separado',
  },
]

function SecaoIa() {
  return (
    <Cartao className="overflow-hidden">
      {GARANTIAS.map((g) => (
        <Linha key={g.t} titulo={g.t} desc={g.d} fim={<Valor tom="verde">{g.v}</Valor>} />
      ))}
      <Nota>
        Nada aqui é interruptor, e é de propósito. O documento de design deixa desligar “citação
        obrigatória” e “selo de vigência” — neste projeto as duas são a razão de o sistema existir,
        e a terceira camada que as segura (
        <code className="text-[11.5px]">tests/citacao.test.ts</code>, os triggers do banco e a
        recusa de montar peça com citação órfã) não tem chave de desligar.
      </Nota>
    </Cartao>
  )
}

// --- fontes ------------------------------------------------------------------

function SecaoFontes({ leis, erro }: { leis: FonteLei[]; erro?: string }) {
  return (
    <>
      <Cartao className="overflow-hidden">
        {erro ? (
          <p className="px-[22px] py-[18px] text-[12.5px] leading-[1.6] text-tg-ambar-txt">
            O corpus não pôde ser lido agora ({erro}). A separação entre acervo e corpus não depende
            desta tela — ela é estrutural.
          </p>
        ) : (
          leis.map((l) => (
            <Linha
              key={l.id}
              titulo={l.apelido}
              desc={
                <>
                  {numeroBR(l.artigos)} artigos
                  {l.dispositivos !== null && <> · {numeroBR(l.dispositivos)} dispositivos</>} ·
                  cobertura {l.cobertura}
                  {l.coberturaNota && <> · {l.coberturaNota}</>}
                </>
              }
              fim={
                <Valor tom={l.cobertura === 'integral' ? 'verde' : 'acento'}>
                  {dataBR(l.vigenciaAte)}
                </Valor>
              }
            />
          ))
        )}
        <Nota>
          Vade Mecum do Senado Federal, 1ª ed. Não há coletor, não há sincronização e não há
          atualização automática: o corpus é uma fotografia, e é isso que permite dizer a data em
          que ele foi tirado.
        </Nota>
      </Cartao>

      <Cartao className="overflow-hidden">
        <Linha
          titulo="Acervo Vade Mecum"
          desc="75 legislações federais para leitura, espelhadas de repositório de terceiro num commit fixado. Não entra em dispositivos, não tem embedding e a busca híbrida não o enxerga."
          fim={
            <Link
              href="/vademecum"
              className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-preenche px-[13px] py-[7px] text-[12.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
            >
              Abrir
            </Link>
          }
        />
        <Linha
          titulo="Corpus curado"
          desc="As três leis acima, normalizadas, com rubricas, embeddings e ids de citação estáveis. É a única fonte que vira fundamento de peça."
          fim={
            <Link
              href="/leis"
              className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-preenche px-[13px] py-[7px] text-[12.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
            >
              Abrir
            </Link>
          }
        />
      </Cartao>
    </>
  )
}

// --- aparência ---------------------------------------------------------------

function SecaoAparencia() {
  const colapsada = usePreferencia(leColapso, false)
  const movimento = usePreferencia(leMovimentoReduzido, false)

  return (
    <Cartao className="overflow-hidden">
      <Linha
        titulo="Lateral recolhida"
        desc="Reduz o menu a uma trilha de 64px, com a marca, “Nova consulta”, os ícones e o ponto da data de corte. O mesmo que ⌘B faz."
        onClick={() => gravaColapso(!colapsada)}
        fim={<Chave ligada={colapsada} />}
      />
      <Linha
        titulo="Reduzir movimento"
        desc="Desliga a digitação animada da resposta e as transições da interface. Quem já pediu isso ao sistema operacional continua atendido sem precisar marcar aqui."
        onClick={() => gravaMovimentoReduzido(!movimento)}
        fim={<Chave ligada={movimento} />}
      />
      <Linha
        titulo="Atalhos"
        desc="⌘K abre a busca, ⌘N começa uma consulta, ⌘B recolhe a lateral. No Windows e no Linux, Ctrl."
        fim={<Valor>3 atalhos</Valor>}
      />
      <Nota>
        As duas preferências ficam neste navegador. Nada disso vai ao banco: são escolhas do
        aparelho onde foram feitas, e sincronizá-las pediria uma ida ao servidor a cada toque.
      </Nota>
    </Cartao>
  )
}

// --- segurança ---------------------------------------------------------------

function SecaoSeguranca() {
  const usuario = useUsuario()
  const [encerrando, setEncerrando] = useState(false)

  async function encerrarTudo() {
    if (encerrando) return
    setEncerrando(true)
    marcarSaidaDeliberada()
    const { error } = await supabaseNavegador().auth.signOut({ scope: 'global' })
    // Erro aqui significa sessão já inválida no servidor — e o cookie local
    // saiu do mesmo jeito. Insistir com o botão travado seria pior que soltar.
    if (error) setEncerrando(false)
  }

  return (
    <>
      <Cartao className="overflow-hidden">
        <Linha
          titulo="E-mail da conta"
          desc="Usuário único, e-mail e senha. Sem OAuth, sem papéis, sem convite."
          fim={<Valor>{usuario?.email ?? '—'}</Valor>}
        />
        <Linha
          titulo="Senha"
          desc="A senha nunca passa por este projeto: quem guarda o hash é o servidor de Auth, num schema que a chave do navegador não enxerga."
          fim={
            <Link
              href="/esqueci-senha"
              className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-preenche px-[13px] py-[7px] text-[12.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
            >
              Trocar
            </Link>
          }
        />
        <Linha
          titulo="Sessão em cookie"
          desc="Renovada pelo middleware a cada navegação, e validada por getUser() no servidor de Auth — não pelo que o cookie diz de si mesmo."
          fim={<Valor tom="verde">ativa</Valor>}
        />
        <Nota>
          A proteção de rota é por exclusão: só é público o que está listado em{' '}
          <code className="text-[11.5px]">lib/auth/rotas.ts</code>. Rota nova nasce fechada.
        </Nota>
      </Cartao>

      <Cartao className="overflow-hidden">
        <Linha
          titulo="Encerrar sessão em todos os dispositivos"
          desc="Invalida os tokens de todos os navegadores onde esta conta entrou, inclusive este. Útil se você entrou num computador que não é seu."
          fim={
            <button
              type="button"
              onClick={() => void encerrarTudo()}
              disabled={encerrando}
              className="tgb shrink-0 whitespace-nowrap rounded-full bg-tg-supressao-fundo px-[13px] py-[7px] text-[12.5px] font-medium text-tg-supressao-txt disabled:cursor-not-allowed disabled:opacity-60"
            >
              {encerrando ? 'Encerrando…' : 'Encerrar tudo'}
            </button>
          }
        />
      </Cartao>
    </>
  )
}

// --- sair --------------------------------------------------------------------

/** O item vermelho do pé da trilha, como no documento. */
function SairDaConta() {
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    if (saindo) return
    setSaindo(true)
    marcarSaidaDeliberada()
    const { error } = await supabaseNavegador().auth.signOut()
    if (error) setSaindo(false)
  }

  return (
    <button
      type="button"
      onClick={() => void sair()}
      disabled={saindo}
      className="tgb mt-[18px] flex items-center gap-2.5 rounded-[11px] px-[11px] py-[9px] text-left text-[12.5px] font-medium text-tg-supressao-txt hover:bg-tg-supressao-fundo disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className="size-[18px] shrink-0 rounded-md bg-[#f6dede]"
      />
      {saindo ? 'Saindo…' : 'Sair da conta'}
    </button>
  )
}
