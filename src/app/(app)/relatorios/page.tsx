import type { Metadata } from 'next'

import { Cabecalho } from '@/components/casca/cabecalho'
import { ForaDeEscopo } from '@/components/ui'

export const metadata: Metadata = { title: 'Relatórios — fora do recorte' }

export default function RelatoriosPage() {
  return (
    <>
      <Cabecalho titulo="Relatórios" sub="fora do recorte do projeto" />
      <div className="flex-1 overflow-y-auto">
        <ForaDeEscopo
          titulo="Relatórios de escritório não existem aqui"
          porque={
            <>
              Sem multiusuário e sem processos, um relatório de produtividade seria gráfico de dado
              inventado — exatamente o que este projeto evita. O relatório que importa aqui é outro,
              e é real: a auditoria da limpeza do corpus, que registra as{' '}
              <strong>alterações de <code>texto_bruto</code> para <code>texto</code></strong> em
              cada dispositivo (rubrica marginal colada, nota de rodapé, ordinal, nota do editor) e
              fica versionada em <code>data/normalizado/auditoria.md</code>.
            </>
          }
          emVezDisso={[
            { href: '/painel', rotulo: 'Painel', nota: 'contagens reais lidas do banco a cada carga' },
            { href: '/configuracoes', rotulo: 'Diagnóstico', nota: 'o que o runtime enxerga, sem segredos' },
            { href: '/leis', rotulo: 'Legislação', nota: 'o corpus que a auditoria cobre' },
          ]}
        />
      </div>
    </>
  )
}
