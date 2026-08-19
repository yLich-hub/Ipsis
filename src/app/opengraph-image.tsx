// =============================================================================
// A imagem que aparece quando o link é colado em algum lugar
//
// O projeto é portfólio, e o caminho mais provável até ele é um link colado no
// LinkedIn, no WhatsApp ou num Slack. Sem esta imagem, o cartão sai com o
// endereço cru — o primeiro contato com o produto vira uma linha de texto.
//
// **Gerada, e não um PNG no repositório**, pelo argumento de `marca.ts`: nome,
// inicial e descrição moram num lugar só, e um PNG traria os três desenhados
// dentro dele. A próxima troca de marca deixaria o cartão com o nome antigo, que
// é exatamente o defeito que aquele arquivo existe para impedir — e o mais
// silencioso de todos, porque ninguém revisa uma imagem em diff.
//
// A data de corte entra pela mesma razão: ela sai de `DATA_DE_CORTE`, o mesmo
// valor que a lateral e a caixa de consulta imprimem. A decisão nº 3 diz que a
// data é visível o tempo todo, e o cartão de compartilhamento é a primeira tela
// que muita gente vê.
//
// Sem fonte baixada: o `next/og` desenha com a fonte que ele já embute. É a
// mesma restrição que recusou o `next/font` — o projeto tem de buildar em
// máquina sem rede, e uma imagem que busca fonte no Google quebraria o build
// exatamente onde ele não pode quebrar.
// =============================================================================

import { ImageResponse } from 'next/og'

import { dataBR } from '@/lib/formato'
import { MARCA } from '@/lib/toga/marca'
import { DATA_DE_CORTE } from '@/lib/vigilia/alvos'

export const alt = `${MARCA.nome} — ${MARCA.descricao}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Cartao() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f7f8fa',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 33,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(160deg,#c9202c,#93101c)',
              color: '#fff',
              fontSize: 40,
              fontWeight: 600,
            }}
          >
            {MARCA.inicial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 64, fontWeight: 600, color: '#16181d', letterSpacing: -1 }}>
              {MARCA.nome}
            </div>
            <div style={{ fontSize: 26, color: '#63686f', marginTop: 4 }}>{MARCA.descricao}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 40, color: '#22252c', lineHeight: 1.3 }}>
            Toda citação resolve para o texto do dispositivo, lido do banco.
          </div>
          <div style={{ fontSize: 26, color: '#5b6068', lineHeight: 1.45 }}>
            Lei 11.343/2006, Código Penal e Código de Processo Penal — busca por rubrica e geração
            de resposta à acusação.
          </div>
        </div>

        {/* A decisão nº 3, no cartão. O filete vermelho é o acento da marca. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 4, height: 34, background: '#b3141f', borderRadius: 2 }} />
          {/* Um filho só, de propósito: o satori exige `display` explícito em
              qualquer `div` com mais de um nó, e "texto + {expressão}" são dois.
              Interpolar numa string só evita a regra em vez de contorná-la. */}
          <div style={{ fontSize: 24, color: '#63686f' }}>
            {`Corpus conferido na redação de ${dataBR(DATA_DE_CORTE)}`}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
