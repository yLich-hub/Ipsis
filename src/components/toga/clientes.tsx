'use client'

// =============================================================================
// TOGA v2 — Clientes do escritório
//
// A primeira tela do produto que ESCREVE dado de pessoa de fora. Tudo o mais é
// leitura de lei, de curadoria ou da própria conversa do usuário; aqui entra o
// nome de quem o advogado defende. Isso muda três coisas em relação às outras
// telas, e as três estão no código:
//
// 1. **Falha não é silenciosa.** O histórico de conversas engole erro de banco
//    e vira lista vazia, porque perder conforto é aceitável. Aqui o erro aparece
//    na tela e o formulário continua preenchido: perder o cadastro que a pessoa
//    acabou de digitar é perder o dado.
// 2. **Só o nome é obrigatório.** Cadastro que exige CPF empurra quem ainda não
//    o tem a digitar qualquer coisa, e um CPF inventado é pior que campo vazio
//    porque parece conferido. O que é digitado, porém, é conferido de verdade —
//    dígito verificador incluído.
// 3. **Apagar pede confirmação na própria linha.** Não há lixeira no banco, e um
//    diálogo do navegador seria descartado no reflexo; a confirmação inline
//    obriga um segundo clique consciente e não some a tela toda.
//
// A forma é a do documento de design: cartão branco de raio 20, listas com
// divisória de 1px, pílulas para metadado, e o formulário abrindo dentro do
// próprio cartão em vez de num modal — modal esconderia a lista que o usuário
// está conferindo enquanto cadastra.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

import { BotaoAcento, BotaoClaro, Selo, TituloTela } from '@/components/toga/base'
import type { CasoCurado } from '@/lib/tipos'
import {
  EVENTO_CLIENTES,
  RASCUNHO_VAZIO,
  type Cliente,
  type Rascunho,
  atualiza,
  cria,
  formataCpf,
  lista,
  remove,
} from '@/lib/toga/clientes'

export function Clientes({ casos }: { casos: Pick<CasoCurado, 'id' | 'titulo'>[] }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  /** `null` = formulário fechado; `''` = cadastrando; id = editando aquele. */
  const [editando, setEditando] = useState<string | null>(null)

  const recarrega = useCallback(async (termo: string) => {
    const r = await lista(termo)
    if (r.ok) {
      setClientes(r.dados)
      setErro(null)
    } else {
      setErro(r.erro)
    }
    setCarregando(false)
  }, [])

  // A leitura só acontece depois de montar: a consulta precisa da sessão, que no
  // servidor não existe. A busca é debounced — cada tecla seria uma ida ao banco,
  // e em rede lenta o resultado da penúltima chegaria depois da última.
  useEffect(() => {
    const t = setTimeout(() => void recarrega(busca), busca ? 220 : 0)
    const aoMudar = () => void recarrega(busca)
    window.addEventListener(EVENTO_CLIENTES, aoMudar)
    return () => {
      clearTimeout(t)
      window.removeEventListener(EVENTO_CLIENTES, aoMudar)
    }
  }, [busca, recarrega])

  const tituloDoCaso = (id: string) => casos.find((c) => c.id === id)?.titulo ?? id

  return (
    <div className="min-h-0 flex-1 overflow-auto px-5 pb-[30px] pt-6 sm:px-7">
      <div className="mx-auto w-full max-w-[860px]">
        <TituloTela
          titulo="Clientes"
          sub={
            <>
              cadastro do escritório · {clientes.length}{' '}
              {clientes.length === 1 ? 'cliente' : 'clientes'}
            </>
          }
        >
          {editando === null && (
            <BotaoAcento onClick={() => setEditando('')}>
              <span aria-hidden="true">+</span> Novo cliente
            </BotaoAcento>
          )}
        </TituloTela>

        {editando !== null && (
          <div className="mt-5">
            <Formulario
              casos={casos}
              inicial={
                editando ? (clientes.find((c) => c.id === editando) ?? null) : null
              }
              aoFechar={() => setEditando(null)}
            />
          </div>
        )}

        {/* A busca só aparece quando há o que procurar. Campo sobre lista vazia é
            convite para o usuário achar que existe cadastro escondido. */}
        {(clientes.length > 0 || busca) && (
          <div className="mt-5 flex items-center gap-2 rounded-[12px] bg-white px-3.5 py-2.5 shadow-[var(--tg-elev-1)]">
            <span aria-hidden="true" className="text-[12px] text-tg-fraco-3">
              ⌕
            </span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, e-mail ou telefone…"
              aria-label="Buscar cliente"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-tg-tinta outline-none placeholder:text-tg-tenue"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="shrink-0 rounded px-1 text-[13px] leading-none text-tg-tenue-2 hover:text-tg-tinta-4"
              >
                ×
              </button>
            )}
          </div>
        )}

        {erro && (
          <p className="mt-4 rounded-[14px] bg-tg-ambar-fundo px-4 py-3 text-[12.5px] leading-[1.6] text-tg-ambar-txt">
            Não foi possível ler a agenda: {erro}
          </p>
        )}

        <div className="mt-3.5 overflow-hidden rounded-[20px] bg-white shadow-[var(--tg-elev-1)]">
          {carregando ? (
            <p className="px-[22px] py-[26px] text-[13px] text-tg-fraco-3">Lendo a agenda…</p>
          ) : clientes.length === 0 ? (
            <p className="px-[22px] py-[26px] text-[13px] leading-[1.6] text-tg-fraco-2">
              {busca ? (
                <>Nenhum cliente para “{busca}”.</>
              ) : (
                <>
                  Nenhum cliente cadastrado ainda. O que você cadastrar aqui fica visível só para
                  esta conta.
                </>
              )}
            </p>
          ) : (
            clientes.map((c) => (
              <Linha
                key={c.id}
                cliente={c}
                caso={c.casoId ? tituloDoCaso(c.casoId) : ''}
                aoEditar={() => setEditando(c.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// --- linha da lista ----------------------------------------------------------

function Linha({
  cliente,
  caso,
  aoEditar,
}: {
  cliente: Cliente
  caso: string
  aoEditar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function apagar() {
    setApagando(true)
    const r = await remove(cliente.id)
    // Deu certo: a linha some com a recarga disparada pelo evento, e este estado
    // morre junto. Só o caso de erro precisa voltar ao começo.
    if (!r.ok) {
      setErro(r.erro)
      setApagando(false)
      setConfirmando(false)
    }
  }

  const contatos = [cliente.telefone, cliente.email].filter(Boolean)

  return (
    <div className="border-b border-tg-linha-tenue px-[22px] py-[17px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-tg-tinta">{cliente.nome}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-tg-fraco-2">
            {cliente.cpf && <span>CPF {formataCpf(cliente.cpf)}</span>}
            {contatos.map((c) => (
              <span key={c}>{c}</span>
            ))}
            {!cliente.cpf && contatos.length === 0 && (
              <span className="text-tg-tenue">sem contato cadastrado</span>
            )}
          </p>
        </div>

        {caso && (
          <Selo tom="acento" title="Caso vinculado">
            {caso}
          </Selo>
        )}

        {confirmando ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void apagar()}
              disabled={apagando}
              className="tgb rounded-full bg-tg-supressao-fundo px-3 py-1.5 text-[11.5px] font-medium text-tg-supressao-txt disabled:opacity-60"
            >
              {apagando ? 'Apagando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="tgb rounded-full bg-tg-preenche px-3 py-1.5 text-[11.5px] font-medium text-tg-corpo"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={aoEditar}
              className="tgb rounded-full bg-tg-preenche px-3 py-1.5 text-[11.5px] font-medium text-tg-corpo hover:bg-tg-preenche-alto"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label={`Apagar ${cliente.nome}`}
              className="tgb rounded-full px-3 py-1.5 text-[11.5px] font-medium text-tg-fraco-3 hover:bg-tg-supressao-fundo hover:text-tg-supressao-txt"
            >
              Apagar
            </button>
          </span>
        )}
      </div>

      {cliente.nota && (
        <p className="mt-2 font-tg-serif text-[12.5px] leading-[1.6] text-tg-corpo-2">
          {cliente.nota}
        </p>
      )}

      {erro && <p className="mt-2 text-[12px] text-tg-supressao-txt">{erro}</p>}
    </div>
  )
}

// --- formulário --------------------------------------------------------------

/** Um formulário por vez na tela (cadastro OU edição), então o id pode ser fixo. */
const ID_ERRO = 'cliente-erro'

const CAMPOS = [
  { k: 'nome', rot: 'Nome', dica: 'Nome completo', larga: true },
  { k: 'cpf', rot: 'CPF (opcional)', dica: '000.000.000-00', larga: false },
  { k: 'telefone', rot: 'Telefone (opcional)', dica: '(11) 90000-0000', larga: false },
  { k: 'email', rot: 'E-mail (opcional)', dica: 'nome@exemplo.com', larga: false },
] as const

function Formulario({
  casos,
  inicial,
  aoFechar,
}: {
  casos: Pick<CasoCurado, 'id' | 'titulo'>[]
  /** `null` cadastra; um cliente edita aquele. */
  inicial: Cliente | null
  aoFechar: () => void
}) {
  const [r, setR] = useState<Rascunho>(
    inicial
      ? {
          nome: inicial.nome,
          cpf: inicial.cpf,
          telefone: inicial.telefone,
          email: inicial.email,
          casoId: inicial.casoId,
          nota: inicial.nota,
        }
      : RASCUNHO_VAZIO,
  )
  const [erro, setErro] = useState<string | null>(null)
  /** Qual campo tem o defeito, quando o erro sabe dizer. */
  const [campoRuim, setCampoRuim] = useState<keyof Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const entradas = useRef(new Map<keyof Rascunho, HTMLElement>())

  const altera = (k: keyof Rascunho, v: string) => {
    setR((x) => ({ ...x, [k]: v }))
    // Corrigir o campo apontado apaga a marca. Deixar o `aria-invalid` colado
    // depois da correção faria o leitor de tela anunciar como inválido um campo
    // que já está certo.
    if (campoRuim === k) setCampoRuim(null)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (salvando) return
    setSalvando(true)
    setErro(null)
    setCampoRuim(null)

    const resposta = inicial ? await atualiza(inicial.id, r) : await cria(r)

    if (resposta.ok) {
      aoFechar()
      return
    }

    // O formulário continua preenchido de propósito: o erro mais comum é CPF
    // repetido, e limpar os campos obrigaria a redigitar tudo por causa de um.
    setErro(resposta.erro)
    setCampoRuim(resposta.campo ?? null)
    setSalvando(false)

    // O foco ia para lugar nenhum — ficava no `<body>`, e quem enviou por
    // teclado tinha de tabular o formulário inteiro de volta para descobrir
    // onde estava o defeito. Quem não enxerga a tela não descobria nem que
    // houve defeito: a caixa vermelha aparecia sem `role="alert"`.
    //
    // Sem campo apontado (rede, sessão), não se rouba o foco de ninguém: o
    // `role="alert"` da caixa já anuncia, e mover o cursor para um campo que
    // não tem culpa seria pior.
    if (resposta.campo) entradas.current.get(resposta.campo)?.focus()
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="tg-sobe rounded-[20px] bg-white p-[22px] shadow-[var(--tg-elev-1)]"
    >
      <p className="mb-4 text-[14px] font-medium text-tg-tinta">
        {inicial ? 'Editar cliente' : 'Novo cliente'}
      </p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {CAMPOS.map((c) => {
          const ruim = campoRuim === c.k
          return (
            <label key={c.k} className={`block ${c.larga ? 'sm:col-span-2' : ''}`}>
              <span className="mb-[7px] block text-[11.5px] font-medium text-tg-fraco-2">
                {c.rot}
              </span>
              <input
                ref={(n) => {
                  if (n) entradas.current.set(c.k, n)
                  else entradas.current.delete(c.k)
                }}
                value={r[c.k]}
                onChange={(e) => altera(c.k, e.target.value)}
                placeholder={c.dica}
                autoComplete="off"
                inputMode={c.k === 'cpf' || c.k === 'telefone' ? 'numeric' : undefined}
                aria-invalid={ruim || undefined}
                // Liga o campo à caixa de erro: quem chega nele pelo Tab ouve o
                // motivo, sem ter de procurar a mensagem na tela.
                aria-describedby={ruim ? ID_ERRO : undefined}
                // Filete lateral, e não borda vermelha inteira: é o mesmo
                // desenho do `Aviso` de falha, e pelo mesmo motivo — o acento do
                // produto é vermelho, e campo com contorno vermelho ao lado de
                // um botão vermelho de ação é ambiguidade.
                className={`w-full rounded-xl bg-tg-preenche px-[13px] py-[11px] text-[13.5px] text-tg-tinta outline-none placeholder:text-tg-tenue focus:bg-tg-campo ${
                  ruim ? 'rounded-l-none border-l-2 border-l-tg-falha-borda bg-tg-falha-fundo' : ''
                }`}
              />
            </label>
          )
        })}

        <label className="block sm:col-span-2">
          <span className="mb-[7px] block text-[11.5px] font-medium text-tg-fraco-2">
            Caso vinculado (opcional)
          </span>
          <select
            value={r.casoId}
            onChange={(e) => altera('casoId', e.target.value)}
            className="w-full rounded-xl bg-tg-preenche px-[13px] py-[11px] text-[13.5px] text-tg-tinta outline-none focus:bg-tg-campo"
          >
            <option value="">Sem vínculo</option>
            {casos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo}
              </option>
            ))}
          </select>
          {casos.length === 0 && (
            <span className="mt-1.5 block text-[11.5px] text-tg-fraco-3">
              Nenhum caso no banco agora — o vínculo continua opcional.
            </span>
          )}
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-[7px] block text-[11.5px] font-medium text-tg-fraco-2">
            Anotação (opcional)
          </span>
          <textarea
            value={r.nota}
            onChange={(e) => altera('nota', e.target.value)}
            rows={3}
            placeholder="Onde o processo está, o que ficou combinado, o que falta."
            className="w-full resize-y rounded-xl bg-tg-preenche px-[13px] py-[11px] text-[13.5px] leading-[1.6] text-tg-tinta outline-none placeholder:text-tg-tenue focus:bg-tg-campo"
          />
        </label>
      </div>

      {/*
        `role="alert"` é o que faz o recado existir para quem não está olhando
        a tela: sem ele a caixa vermelha aparecia e nada era anunciado. É a
        mesma peça que as cinco telas de autenticação já usam no `Aviso` —
        aqui ela faltava, e este é o formulário que guarda dado de pessoa de
        fora, onde perder o que foi digitado custa mais.
      */}
      {erro && (
        <p
          id={ID_ERRO}
          role="alert"
          className="mt-3.5 rounded-[12px] bg-tg-supressao-fundo px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-tg-supressao-txt"
        >
          {erro}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <BotaoAcento type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Cadastrar'}
        </BotaoAcento>
        <BotaoClaro onClick={aoFechar}>Cancelar</BotaoClaro>
      </div>
    </form>
  )
}
