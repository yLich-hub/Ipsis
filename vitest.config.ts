// =============================================================================
// Vitest — os testes rodam em Node, sem DOM.
//
// O alias `@/` é o mesmo do tsconfig. Sem repeti-lo aqui, qualquer teste que
// importe um módulo de src/ falha na resolução: o Vite não lê `paths` do
// tsconfig por conta própria.
// =============================================================================

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
