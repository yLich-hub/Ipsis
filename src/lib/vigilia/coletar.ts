// =============================================================================
// Vigília do corpus — a coleta
//
// Junta as duas fontes, passa tudo pelo mesmo filtro puro e grava. A ordem não é
// negociável e é o que dá sentido à tela:
//
//   1. cada fonte devolve `Bruto[]` no seu ritmo, e falha vira valor;
//   2. `tocaOCorpus()` decide o que interessa — regra única, offline, testada;
//   3. quem interessa E já mudou de situação ganha uma ida ao detalhe, para o
//      número da lei vir da fonte em vez de ser deduzido de uma frase;
//   4. upsert por id estável, então rodar duas vezes no mesmo dia não duplica.
//
// **Nada aqui escreve em `dispositivos`.** Ver o cabeçalho de 0012: a vigília
// avisa que a fotografia envelheceu, não a revela de novo. Quem atualiza o
// corpus é uma pessoa rodando `vade_parser.py` e conferindo o diff.
// =============================================================================

import {
  DATA_DE_CORTE,
  artigosDe,
  depoisDoCorte,
  extraiNorma,
  tocaOCorpus,
  virouNorma,
} from '@/lib/vigilia/alvos'
import * as camara from '@/lib/vigilia/camara'
import { clienteDeEscrita } from '@/lib/vigilia/escrita'
import * as senado from '@/lib/vigilia/senado'
import type { Candidato, Colheita, FonteId } from '@/lib/vigilia/tipos'

export type Relato = {
  fonte: FonteId
  ok: boolean
  erro: string | null
  vistos: number
  candidatos: number
  novos: number
  ms: number
}

export type Resumo = {
  ok: boolean
  relatos: Relato[]
  /** Quantos achados a coleta inteira gravou pela primeira vez. */
  novos: number
  /** Quantos, entre eles, já viraram lei — o que fura a data de corte. */
  normas: number
}

/**
 * Janela padrão do cron, em dias.
 *
 * O Senado devolve o intervalo inteiro numa resposta só: desde a data de corte
 * são ~4 MB, o que é desperdício repetido todo dia para reencontrar as mesmas
 * 5 mil linhas. Sessenta dias cobre com folga a distância entre duas execuções
 * diárias e ainda absorve uma semana de cron parado.
 *
 * A janela NÃO cria buraco na detecção de "virou lei": processos já gravados
 * são reconsultados por id em `atualizaPendentes()`, independentemente de
 * quando foram apresentados.
 */
export const JANELA_DIAS = 60

function desdeDias(dias: number, hoje = new Date()): string {
  const d = new Date(hoje.getTime() - dias * 86_400_000)
  const iso = d.toISOString().slice(0, 10)
  // Nunca antes da data de corte: o que é anterior a ela já está no corpus.
  return iso < DATA_DE_CORTE ? DATA_DE_CORTE : iso
}

/** Aplica o filtro do corpus a uma colheita e monta os candidatos. */
function peneira(c: Colheita): Candidato[] {
  return c.itens.flatMap((b) => {
    if (!depoisDoCorte(b.apresentadoEm)) return []
    const alvos = tocaOCorpus(b.ementa)
    if (alvos.length === 0) return []
    return [
      {
        ...b,
        leisTocadas: alvos.map((a) => a.leiId),
        artigosTocados: artigosDe(b.ementa, alvos),
        virouNorma: virouNorma(b.situacao),
        norma: extraiNorma(b.situacao),
      },
    ]
  })
}

/**
 * Roda a coleta inteira.
 *
 * `desde` vazio usa a janela padrão. O script local passa a data de corte para
 * fazer a carga completa; o cron não passa nada.
 */
export async function coleta(desde?: string, sinal?: AbortSignal): Promise<Resumo> {
  const janela = desde || desdeDias(JANELA_DIAS)
  const relatos: Relato[] = []
  let novos = 0
  let normas = 0

  // As duas fontes em paralelo: são serviços independentes, e esperar a Câmara
  // para começar o Senado dobraria o tempo do cron sem nenhum ganho.
  const [colheitaCamara, colheitaSenado] = await Promise.all([
    cronometra('camara', () => camara.colhe(janela, 60, sinal)),
    cronometra('senado', () => senado.colhe(janela, sinal)),
  ])

  for (const { fonte, colheita, ms } of [colheitaCamara, colheitaSenado]) {
    const candidatos = peneira(colheita)

    // O Senado só diz "TRANSFORMADA EM NORMA JURÍDICA"; o número da lei está no
    // detalhe, em `normaGerada`. Pede-se só para quem já virou norma — que são
    // poucos, e são os únicos em que o número importa.
    if (fonte === 'senado') {
      await Promise.all(
        candidatos
          .filter((c) => c.virouNorma && !c.norma)
          .map(async (c) => {
            c.norma = await senado.normaDe(c.id, sinal)
          }),
      )
    }

    const gravados = await grava(candidatos)
    novos += gravados
    normas += candidatos.filter((c) => c.virouNorma).length

    const relato: Relato = {
      fonte,
      ok: colheita.ok,
      erro: colheita.ok ? null : colheita.erro,
      vistos: colheita.itens.length,
      candidatos: candidatos.length,
      novos: gravados,
      ms,
    }
    relatos.push(relato)
    await registra(relato)
  }

  return { ok: relatos.every((r) => r.ok), relatos, novos, normas }
}

async function cronometra(fonte: FonteId, f: () => Promise<Colheita>) {
  const t = Date.now()
  const colheita = await f()
  return { fonte, colheita, ms: Date.now() - t }
}

/**
 * Grava os candidatos e devolve quantos eram inéditos.
 *
 * O upsert atualiza situação, norma e leis tocadas — uma proposição muda de
 * situação com o tempo, e uma linha congelada no dia em que foi vista diria
 * "aguardando parecer" sobre uma lei já sancionada. O que ele NÃO toca é
 * `visto_em` e `reconferido_*`: a data em que o achado apareceu é histórico, e
 * a marca de conferência é do usuário — sobrescrevê-las na coleta seguinte
 * apagaria o trabalho de quem leu a linha.
 */
async function grava(candidatos: Candidato[]): Promise<number> {
  if (candidatos.length === 0) return 0

  const sb = clienteDeEscrita()
  // Sem service role a coleta não grava. Não é falha silenciosa: quem chama
  // recebe zero e a rota devolve o motivo.
  if (!sb) return 0

  const ids = candidatos.map((c) => c.id)
  const { data: existentes } = await sb.from('vigilia_alteracoes').select('id').in('id', ids)
  const conhecidos = new Set((existentes ?? []).map((l) => (l as { id: string }).id))

  const { error } = await sb.from('vigilia_alteracoes').upsert(
    candidatos.map((c) => ({
      id: c.id,
      fonte: c.fonte,
      leis_tocadas: c.leisTocadas,
      artigos_tocados: c.artigosTocados,
      identificacao: c.identificacao,
      ementa: c.ementa,
      apresentado_em: c.apresentadoEm || null,
      situacao: c.situacao || null,
      virou_norma: c.virouNorma,
      norma: c.norma,
      url: c.url || null,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: 'id' },
  )
  if (error) throw new Error(`falha ao gravar achados: ${error.message}`)

  return candidatos.filter((c) => !conhecidos.has(c.id)).length
}

/** Uma linha no diário de bordo. Falha aqui não derruba a coleta: o dado já foi gravado. */
async function registra(r: Relato): Promise<void> {
  const sb = clienteDeEscrita()
  if (!sb) return
  await sb.from('vigilia_coletas').insert({
    fonte: r.fonte,
    ok: r.ok,
    erro: r.erro,
    vistos: r.vistos,
    candidatos: r.candidatos,
    novos: r.novos,
    ms: r.ms,
  })
}

/**
 * Reconsulta os achados já gravados que ainda não viraram lei.
 *
 * É o que fecha o buraco da janela, e é a metade mais importante da coleta: um
 * projeto apresentado em 2025 e sancionado hoje está fora de qualquer janela de
 * 60 dias por data de apresentação, e é justamente ele que fura a data de
 * corte. Sem esta passagem, a vigília saberia dos projetos novos e perderia
 * exatamente o evento que ela existe para pegar.
 *
 * Roda só sobre o que o banco já conhece, uma ida por linha. O teto de 200
 * existe porque cada linha é uma requisição: se a lista pendente crescer além
 * disso, é melhor o cron demorar dois dias a varrer que estourar o tempo da
 * função e não gravar nada.
 */
export async function atualizaPendentes(sinal?: AbortSignal): Promise<number> {
  const sb = clienteDeEscrita()
  if (!sb) return 0

  const { data } = await sb
    .from('vigilia_alteracoes')
    .select('id,fonte,situacao')
    .eq('virou_norma', false)
    .order('apresentado_em', { ascending: false })
    .limit(200)

  const linhas = (data ?? []) as { id: string; fonte: FonteId; situacao: string | null }[]
  let promovidos = 0

  await Promise.all(
    linhas.map(async (l) => {
      // As duas fontes respondem coisas diferentes, e a diferença é do jeito
      // certo: o Senado devolve `normaGerada` estruturado (número, ano, data de
      // publicação no DOU), então o número da lei vem da fonte. A Câmara devolve
      // texto de situação, e o número, quando existe, sai dele.
      const norma =
        l.fonte === 'senado'
          ? await senado.normaDe(l.id, sinal)
          : await (async () => {
              const s = await camara.situacaoDe(l.id, sinal)
              return s && virouNorma(s) ? (extraiNorma(s) ?? s) : null
            })()

      if (!norma) return

      const { error } = await sb
        .from('vigilia_alteracoes')
        .update({ virou_norma: true, norma, atualizado_em: new Date().toISOString() })
        .eq('id', l.id)
      if (!error) promovidos++
    }),
  )

  return promovidos
}
