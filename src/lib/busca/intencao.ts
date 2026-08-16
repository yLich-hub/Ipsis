// =============================================================================
// Classificação de intenção — por regras em TypeScript, sem chamada de modelo.
//
// Precisa ser determinística e rodar antes da rede: é ela que decide o formato
// da resposta e, no molde `doutrina`, que a resposta NÃO seja um resumo de obra
// autoral. Uma classificação que depende de LLM em runtime seria superfície de
// gasto anônima (o app não tem autenticação) e ainda variaria a cada chamada.
//
// Ver CLAUDE.md, "Classificação de intenção".
// =============================================================================

import { semAcento } from '@/lib/formato'

export type Molde = 'dispositivo' | 'tema' | 'processual' | 'doutrina' | 'aberta'

export type Intencao = {
  molde: Molde
  /** O que disparou a classificação — exibido na UI, para a regra ser auditável. */
  sinal: string
  /** Só no molde `dispositivo`: o artigo citado, quando dá para extrair. */
  artigo?: { numero: string; lei?: string }
}


/** `art. 33`, `artigo 217-A`, `art 59` */
const ARTIGO = /\bart(?:igo)?s?\.?\s*(\d+(?:\s*-\s*[a-z])?)/i

const LEIS: { re: RegExp; id: string; rotulo: string }[] = [
  { re: /\b11\.?343\b|\blei de drogas\b|\blei antidrogas\b/, id: 'lei_11343_2006', rotulo: 'Lei 11.343/2006' },
  { re: /\bc\.?\s?p\.?\b|\bcodigo penal\b|\b2\.?848\b/, id: 'dl_2848_1940', rotulo: 'Código Penal' },
  { re: /\bcpp\b|\bcodigo de processo penal\b|\b3\.?689\b/, id: 'dl_3689_1941', rotulo: 'CPP' },
]

// Rito, não direito material: quem pergunta isso quer o dispositivo processual.
const PROCESSUAIS = [
  'resposta a acusacao',
  'defesa previa',
  'absolvicao sumaria',
  'audiencia de instrucao',
  'alegacoes finais',
  'nulidade',
  'citacao',
  'recebimento da denuncia',
  'rejeicao da denuncia',
  'busca e apreensao',
  'flagrante',
  'prazo para',
  'rito',
]

// "segundo Nucci", "o que diz a doutrina", "posição doutrinária"
const DOUTRINA = ['doutrina', 'doutrinari', 'nucci', 'greco', 'bitencourt', 'masson', 'segundo o autor']

export function classifica(consulta: string): Intencao {
  const q = semAcento(consulta.trim())

  const doutrina = DOUTRINA.find((t) => q.includes(t))
  if (doutrina) return { molde: 'doutrina', sinal: `termo "${doutrina}"` }

  const m = ARTIGO.exec(consulta)
  if (m?.[1]) {
    const lei = LEIS.find((l) => l.re.test(q))
    return {
      molde: 'dispositivo',
      sinal: lei ? `art. ${m[1]} + ${lei.rotulo}` : `padrão "art. ${m[1]}"`,
      artigo: { numero: m[1].replace(/\s+/g, '').toUpperCase(), ...(lei ? { lei: lei.id } : {}) },
    }
  }

  const processual = PROCESSUAIS.find((t) => q.includes(t))
  if (processual) return { molde: 'processual', sinal: `termo de rito "${processual}"` }
  if (/\bcpp\b/.test(q)) return { molde: 'processual', sinal: 'sigla CPP' }

  return { molde: 'aberta', sinal: 'sem sinal de molde — busca híbrida completa' }
}

/**
 * O molde `tema` só se confirma depois da busca: é a rubrica do banco que diz
 * se o termo digitado é o apelido de um instituto. Classificar "tema" antes da
 * rede seria adivinhar o vocabulário curado.
 */
export function refina(intencao: Intencao, viaRubrica: string | null): Intencao {
  if (!viaRubrica) return intencao
  if (intencao.molde === 'doutrina') return intencao
  return { ...intencao, molde: 'tema', sinal: `rubrica "${viaRubrica}" (match exato)` }
}

// `ROTULO_MOLDE` traduzia o molde para a tela de diagnóstico da busca, que saiu
// junto com `/busca`. Hoje quem mostra o molde ao usuário é o passo animado da
// Consulta, e ele imprime `intencao.sinal`, que é uma frase inteira e não um
// rótulo. Um segundo vocabulário para a mesma coisa só teria como divergir.
