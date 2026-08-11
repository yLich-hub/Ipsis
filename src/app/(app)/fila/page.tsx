import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { ForaDeEscopo } from '@/components/ui'

export const metadata: Metadata = { title: 'Fila de Análise — fora do recorte' }

export default function FilaPage() {
  return (
    <>
      <Cabecalho titulo="Fila de Análise" sub="fora do recorte do projeto" />
      <div className="flex-1 overflow-y-auto">
        <ForaDeEscopo
          titulo="Fila de análise não existe aqui"
          porque={
            <>
              Uma fila pressupõe multiusuário, atribuição de responsável e estado por documento —
              três coisas que exigem autenticação, que está declarada fora de escopo. O recorte é
              deliberado: <strong>30% do escopo com 100% de acabamento</strong> vale mais que um
              sistema amplo e quebrado. O item continua no menu porque o desenho original previa um
              produto maior; a tela diz o que aconteceu com ele em vez de fingir dados.
            </>
          }
          emVezDisso={[
            { href: '/agente', rotulo: 'Agente Penal', nota: 'consulta com citação resolvida no banco' },
            { href: '/busca', rotulo: 'Busca híbrida', nota: 'rubrica + lexical + semântica numa RPC' },
            { href: '/painel', rotulo: 'Painel', nota: 'o que está de pé, medido no banco agora' },
          ]}
        />
      </div>
    </>
  )
}
