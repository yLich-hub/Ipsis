// =============================================================================
// /configuracoes — ajustes do usuário
//
// Componente de servidor por um motivo só: a seção "Fontes e data de corte" tem
// de dizer o que o banco realmente tem — quantas leis, com que cobertura e com
// que data de corte —, e inventar esses números no cliente seria a mesma classe
// de erro que a decisão nº 3 do projeto existe para impedir.
//
// Se o banco estiver pausado, a tela não cai: a seção de fontes explica que não
// pôde ler, e as outras quatro continuam de pé, porque nenhuma delas depende de
// rede.
// =============================================================================

import type { Metadata } from 'next'

import { Configuracoes, type FonteLei } from '@/components/toga/configuracoes'
import { contagemDispositivos, leis } from '@/lib/dados'
import { titulo } from '@/lib/toga/marca'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: titulo('Configurações'),
  description: 'Perfil, garantias de citação, fontes do corpus, aparência e segurança da conta.',
}

export default async function PaginaConfiguracoes() {
  const ls = await leis()

  if (!ls.ok) return <Configuracoes leis={[]} erroFontes={ls.erro} />

  const fontes: FonteLei[] = await Promise.all(
    ls.dados.map(async (l) => ({
      id: l.id,
      apelido: l.apelido,
      cobertura: l.cobertura,
      coberturaNota: l.cobertura_nota,
      vigenciaAte: l.vigencia_ate,
      artigos: l.total_artigos,
      dispositivos: await contagemDispositivos(l.id),
    })),
  )

  return <Configuracoes leis={fontes} />
}
