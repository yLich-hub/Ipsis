import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { ForaDeEscopo } from '@/components/ui'

export const metadata: Metadata = { title: 'Gestão de Processos — fora do recorte' }

export default function ProcessosPage() {
  return (
    <>
      <Cabecalho titulo="Gestão de Processos" sub="fora do recorte do projeto" />
      <div className="flex-1 overflow-y-auto">
        <ForaDeEscopo
          titulo="Gestão de processos não existe aqui"
          porque={
            <>
              Acompanhar processo real significa integração com o PJe, dados pessoais de partes e
              custódia de prazo — nenhum dos três cabe num projeto de portfólio sem autenticação, e
              todos estão declarados fora de escopo. O que o projeto faz de verdade é o caminho
              curto e completo: <strong>consultar a lei e montar uma peça</strong> a partir de casos
              anonimizados que já vivem no banco, sem depender de upload de arquivo.
            </>
          }
          emVezDisso={[
            { href: '/pecas', rotulo: 'Peças', nota: 'resposta à acusação, art. 396-A do CPP' },
            { href: '/leis', rotulo: 'Legislação', nota: 'Lei 11.343 e Código Penal, com data de corte' },
            { href: '/agente', rotulo: 'Agente Penal', nota: 'consulta em linguagem natural' },
          ]}
        />
      </div>
    </>
  )
}
