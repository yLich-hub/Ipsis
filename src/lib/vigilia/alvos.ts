// =============================================================================
// Vigília do corpus — o filtro que decide se um achado interessa
//
// Puro e offline, de propósito: é a única peça da vigília que pode estar errada
// em silêncio. Um cliente de API que quebra devolve erro e a tela mostra; um
// filtro que erra devolve uma lista plausível e vazia, e ninguém desconfia.
// `tests/vigilia.test.ts` tranca as regras daqui contra ementas reais colhidas
// das duas APIs.
//
// O que se procura é estreito: norma ou proposição que diga alterar UMA DAS TRÊS
// LEIS DO CORPUS. Não é um monitor legislativo — é o alarme da decisão nº 3.
// Projeto sobre saúde mental, política de drogas ou execução penal não entra
// aqui só por falar de droga: se não mexe no texto que o banco guarda, não
// envelhece a fotografia de 28/02/2025.
//
// **O erro é enviesado de propósito para o falso positivo.** Um achado a mais
// custa uma linha que o usuário lê e descarta; um achado a menos custa uma peça
// protocolada com redação revogada. Daí a regra de co-ocorrência abaixo ser
// deliberadamente frouxa quanto à posição do verbo na frase.
// =============================================================================

import { semAcento } from '@/lib/formato'

export type Alvo = {
  /** `leis.id` no banco — a mesma chave do corpus, não um apelido novo. */
  leiId: string
  rotulo: string
  /** Reconhece a lei pelo número, pelo nome ou pelo apelido de mercado. */
  reconhece: RegExp
}

/**
 * As três leis do corpus, com o que basta para reconhecê-las numa ementa.
 *
 * Os dois `(?!\s+militar)` não são preciosismo. O Código Penal Militar é o
 * Decreto-Lei 1.001/1969 e o Código de Processo Penal Militar é o 1.002/1969 —
 * leis diferentes, que não estão no banco. Sem a exclusão, todo projeto sobre
 * justiça militar entraria na vigília como se mexesse no corpus, e a lista
 * viraria ruído no primeiro mês.
 *
 * O número aparece com e sem ponto de milhar porque as duas grafias circulam
 * nas ementas ("Lei nº 11.343" e "Lei 11343"), e o `\b` do fim impede que
 * `2.848` case dentro de `12.848`.
 */
export const ALVOS: Alvo[] = [
  {
    leiId: 'lei_11343_2006',
    rotulo: 'Lei 11.343/2006',
    reconhece: /\b11\.?343\b|\blei (antidrogas|de drogas|de toxicos|antitoxicos)\b/,
  },
  {
    leiId: 'dl_2848_1940',
    rotulo: 'Código Penal',
    reconhece: /\b2\.?848\b|\bcodigo penal\b(?!\s+militar)/,
  },
  {
    leiId: 'dl_3689_1941',
    rotulo: 'Código de Processo Penal',
    reconhece: /\b3\.?689\b|\bcodigo de processo penal\b(?!\s+militar)/,
  },
]

/**
 * Verbos que caracterizam mudança no texto legal.
 *
 * Exigir um deles é o que separa "esta proposição muda a lei" de "esta
 * proposição fala da lei". A distinção importa: metade das ementas que citam a
 * Lei 11.343 a citam como referência ("nos termos da Lei nº 11.343"), e
 * arrastá-las para a vigília faria a tela dizer que a fotografia envelheceu
 * quando nada tinha mudado — que é exatamente o alarme falso que desensibiliza
 * quem lê.
 *
 * `revoga` entra porque revogação é a alteração mais grave de todas para este
 * projeto: é o caso em que o dispositivo continua no banco, íntegro e citável,
 * e já não existe no mundo.
 */
const VERBOS =
  /\b(altera(r|m|cao|coes)?|acrescenta|inclui|insere|revoga|modifica|renumera|substitui|suprime|da nova redacao|nova redacao|atualiza|reformula|derroga)\b/

/**
 * `2.848` sozinho é ambíguo — pode ser valor em reais numa ementa orçamentária.
 * Quando a lei é reconhecida só pelo número, exige-se o contexto que a nomeia
 * como diploma legal. Reconhecimento pelo nome ("Código Penal") dispensa isto,
 * porque o nome já é o contexto.
 */
const CONTEXTO_DE_LEI = /\b(lei|decreto-?lei|codigo|estatuto|dec\.?-?lei)\b/

/**
 * Diplomas que NÃO estão no corpus, reconhecidos pelo nome. Espelha
 * `outros_diplomas` em `data/curadoria/vigilia.yaml`, e `tests/vigilia.test.ts`
 * falha se os dois divergirem.
 */
export const OUTROS_DIPLOMAS =
  /\b(cpc|codigo de processo civil|clt|consolidacao das leis do trabalho|cdc|codigo de defesa do consumidor|eca|estatuto da crianca|ctb|codigo de transito|ctn|codigo tributario|codigo civil|constituicao|lei de execucao penal|lep)\b/

/** Quantos caracteres depois de "art. N" se olha para achar o diploma. */
const JANELA_DIPLOMA = 80

/**
 * A janela depois de um artigo nomeia um diploma que NÃO é o alvo?
 *
 * **Vale o PRIMEIRO diploma nomeado, não qualquer um na janela** — e essa
 * precisão foi cobrada por um caso real. O Tema 991 do STJ diz "majorante do
 * art. 157, § 2º, I, do Código Penal" e, cinquenta caracteres depois, traz o
 * boilerplate "RRC de Origem (… do CPC/15)". Com a regra frouxa — "há CPC na
 * janela?" — o art. 157 era descartado, e ele estava certo.
 *
 * Silêncio conta a favor de atribuir: sem diploma nomeado, devolve `false`.
 */
function deOutroDiploma(janela: string, leiAlvo: string): boolean {
  const primeiro = (re: RegExp) => {
    const m = janela.match(re)
    return m?.index ?? janela.length + 1
  }

  const doAlvo = ALVOS.find((a) => a.leiId === leiAlvo)
  const inicioAlvo = doAlvo ? primeiro(doAlvo.reconhece) : janela.length + 1

  let inicioOutro = primeiro(OUTROS_DIPLOMAS)
  for (const a of ALVOS) {
    if (a.leiId !== leiAlvo) inicioOutro = Math.min(inicioOutro, primeiro(a.reconhece))
  }

  if (inicioAlvo > janela.length && inicioOutro > janela.length) return false
  return inicioOutro < inicioAlvo
}

export type Achado = {
  /** Como a fonte identifica o item: 'PL 466/2026', 'Lei 15.123/2026'. */
  identificacao: string
  ementa: string
  /** ISO `YYYY-MM-DD`, ou vazio quando a fonte não informa. */
  apresentadoEm: string
}

/**
 * Quais leis do corpus esta ementa diz alterar. Lista vazia significa "não
 * interessa" — e não "erro".
 *
 * Trabalha sobre a ementa normalizada (sem acento, caixa baixa), o mesmo
 * contrato de `public.norm()` no banco. Não se procura o verbo colado ao nome
 * da lei porque as ementas reais não os colam: "Altera a Lei nº 7.560, de 19 de
 * dezembro de 1986, e a Lei nº 11.343, de 23 de agosto de 2006, para
 * aperfeiçoar o regime de destinação de bens" põe 60 caracteres entre um e
 * outro, e uma regra de proximidade perderia justamente o alvo.
 */
export function tocaOCorpus(ementa: string): Alvo[] {
  const t = semAcento(ementa)
  if (!VERBOS.test(t)) return []

  return ALVOS.filter((a) => {
    if (!a.reconhece.test(t)) return false
    // Casou só pelo número? Então a ementa tem de tratar o número como diploma.
    const soPorNumero = !/[a-z]/.test(String(t.match(a.reconhece)?.[0] ?? ''))
    return soPorNumero ? CONTEXTO_DE_LEI.test(t) : true
  })
}

/**
 * Artigos que a ementa diz alterar, como ids no formato do corpus.
 * `'Altera o art. 64 do Decreto-Lei nº 2.848…'` → `['dl_2848_1940_art64']`.
 *
 * **Serve para uma pergunta só, e é a pergunta certa:** este projeto cita
 * dispositivos específicos em `teses.fundamentos` e nos marcadores `{{cite:}}`.
 * Uma proposição que altera o art. 121 do CP (homicídio) não toca nada que a
 * minuta cite; uma que altera o art. 59 ou o 68 desmonta a dosimetria inteira.
 * Sem essa distinção a vigília lista 666 proposições sobre o Código Penal e
 * afoga a única que importa — conferido contra a API em 13/08/2026.
 *
 * **Devolve vazio quando a ementa altera mais de uma lei do corpus, de
 * propósito.** "Altera o Decreto-Lei nº 2.848 (Código Penal) e o Decreto-Lei nº
 * 3.689 (CPP), para alterar os arts. 33 e 155" não diz qual artigo é de qual
 * diploma, e atribuir os dois a ambos produziria `dl_3689_1941_art155`, que não
 * existe. Achado sem artigo continua na lista — só não ganha o vínculo com as
 * teses. Perder o vínculo é aceitável; inventá-lo não.
 */
export function artigosDe(ementa: string, alvos: Alvo[]): string[] {
  if (alvos.length !== 1) return []
  const lei = alvos[0]!.leiId

  // Segunda trava, e a que pega o caso traiçoeiro: "Altera o art. 2º da Lei nº
  // 7.209/1984 e a Lei nº 11.343, de 2006" toca uma só lei do corpus, mas o
  // artigo nomeado é da OUTRA lei. Atribuí-lo à Lei de Drogas produziria
  // `lei_11343_2006_art2` — um id que existe no banco, aponta para o artigo
  // errado e ninguém desconfiaria. Com mais de um diploma numerado na ementa,
  // nenhum artigo é atribuído.
  const diplomas = new Set(ementa.match(/\b\d{1,3}\.\d{3}\b/g) ?? [])
  if (diplomas.size > 1) return []

  const numeros = new Set<string>()
  // A alternância aceita a lista inteira ("arts. 359-L e 359-M", "arts. 33, 35 e
  // 40") e para no primeiro caractere que não pertence a uma lista de artigos —
  // é o que faz "art. 2º da Lei…" render só o `2`.
  for (const m of ementa.matchAll(
    /\barts?\.?\s*((?:\d{1,4}(?:-[A-Za-z])?[ºo°]?(?:\s*(?:,|e)\s*)?)+)/gi,
  )) {
    // Terceira trava, por ARTIGO e não pela ementa inteira: o que vem logo
    // DEPOIS de cada `art. N` diz de que diploma ele é. Nasceu de um boilerplate
    // do STJ — "RRC de Origem (art. 1030, IV e art. 1036, §1º, do CPC/15)" —,
    // que produzia 28 ids de artigo inexistente em 21 dos 72 temas, e pega
    // também o caso mais sutil: "nos crimes da Lei n. 11.343/2006, aplica-se o
    // rito do art. 400 do Código de Processo Penal", que rendia
    // `lei_11343_2006_art400` — id que existe e aponta para o artigo errado.
    const fim = (m.index ?? 0) + m[0].length
    if (deOutroDiploma(semAcento(ementa).slice(fim, fim + JANELA_DIPLOMA), lei)) continue

    for (const n of (m[1] ?? '').match(/\d{1,4}(?:-[A-Za-z])?/g) ?? []) {
      // `33-A` é artigo distinto de `33` e tem de sobreviver inteiro. A caixa
      // baixa não é estética: o corpus grava `dl_2848_1940_art359-a`, e um id em
      // maiúscula não casaria com `teses.fundamentos` — o vínculo com as teses
      // sumiria em silêncio, que é o modo de falha que esta tela não pode ter.
      numeros.add(n.toLowerCase())
    }
  }

  return [...numeros].map((n) => `${lei}_art${n}`)
}

/**
 * `lei_11343_2006_art33_p4` → `lei_11343_2006_art33`. Id sem sufixo passa intacto.
 *
 * É o outro lado do vínculo com as teses: `teses.fundamentos` guarda ids de
 * DISPOSITIVO, e a vigília só sabe ARTIGO, porque a ementa quase nunca desce ao
 * parágrafo. Este corte é o que faz os dois se encontrarem.
 *
 * Corta tudo depois do número do artigo em vez de listar os sufixos conhecidos:
 * a curadoria usa `_caput`, `_p4` e `_inc1` hoje, e uma lista fechada perderia
 * em silêncio o sufixo que aparecer amanhã — e "perder em silêncio" aqui
 * significa a tela dizer que nenhuma tese é afetada quando alguma é. O `-a` de
 * `art359-a` sobrevive porque faz parte do número do artigo.
 *
 * Mora neste arquivo, e não em `leitura.ts`, pelo mesmo motivo que
 * `lib/peca/resolver.ts` não importa cliente nenhum: `lib/supabase.ts` lança no
 * import quando falta variável de ambiente, e um teste que exigisse segredo não
 * rodaria no CI.
 */
export function soArtigo(dispositivoId: string): string {
  return dispositivoId.match(/^(.*_art\d+(?:-[a-z])?)/i)?.[1] ?? dispositivoId
}

/**
 * A fotografia. Tudo anterior a esta data já está dentro do corpus, por
 * definição — o parser leu o Vade Mecum nesta redação.
 *
 * Fica aqui e não no banco por um motivo prático: o coletor precisa da data
 * ANTES de falar com o banco, para não pedir às APIs uma janela que já é
 * conhecida. A verdade continua sendo `leis.vigencia_ate`, e a tela mostra a do
 * banco — se as duas divergirem, é a tela que está certa.
 *
 * **É também a fonte única da data que a interface escreve à mão.** Onde a tela
 * já tem um dispositivo em mãos, ela imprime `vigencia_ate` daquele registro; só
 * onde não há registro nenhum — a lateral, a tela de entrada, a pílula da caixa
 * de consulta — é que esta constante aparece. Antes eram cinco literais
 * `28/02/2025` espalhados pelo JSX, que é o mesmo defeito que `marca.ts` existe
 * para evitar: a próxima fotografia deixaria a metade das telas com a data
 * velha, e a data velha é justamente o que a decisão nº 3 proíbe.
 */
export const DATA_DE_CORTE = '2025-02-28'

/** Um achado anterior à data de corte não envelhece nada: já está no corpus. */
export function depoisDoCorte(apresentadoEm: string): boolean {
  if (!apresentadoEm) return true // sem data, o achado não pode ser descartado
  return apresentadoEm.slice(0, 10) > DATA_DE_CORTE
}

/**
 * "Virou lei?" a partir do texto de situação que cada fonte devolve.
 *
 * É o campo que separa aviso de radar de fotografia furada. A Câmara escreve
 * "Transformado em Norma Jurídica" e o Senado, "NORMA JURÍDICA"; as duas
 * grafias entram porque nenhuma das APIs tem um booleano para isto.
 */
export function virouNorma(situacao: string | null | undefined): boolean {
  if (!situacao) return false
  const s = semAcento(situacao)
  return /transformad[oa] em norma|norma juridica|transformad[oa] n[ao] lei|convertid[oa] em lei|sancionad[oa]/.test(s)
}

/**
 * Número da norma resultante, quando o texto da situação o traz.
 * `'Transformado na Lei Ordinária 15.123/2026'` → `'Lei 15.123/2026'`.
 * Devolve `null` quando a fonte não nomeia — inventar o número seria pior que
 * não tê-lo.
 */
export function extraiNorma(situacao: string | null | undefined): string | null {
  if (!situacao) return null

  const m = situacao.match(/lei\s+(?:ordin[áa]ria\s+|complementar\s+)?n?[ºo°.]*\s*([\d.]+)/i)
  if (!m?.[1]) return null
  const numero = m[1].replace(/\.$/, '')

  // O ano vem logo depois do número, mas em duas grafias que as fontes misturam:
  // `15.123/2026` e `15.164 de 14/07/2025`. Procurar o primeiro ano nos 30
  // caracteres seguintes cobre as duas sem uma alternativa para cada — e a
  // janela curta é o que impede pegar um ano de outra frase da mesma situação.
  const fim = (m.index ?? 0) + m[0].length
  const ano = situacao.slice(fim, fim + 30).match(/\b(?:19|20)\d{2}\b/)?.[0]

  return ano ? `Lei ${numero}/${ano}` : `Lei ${numero}`
}
