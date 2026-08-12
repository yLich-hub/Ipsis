// =============================================================================
// ESLint — flat config.
//
// Antes deste arquivo, `next.config.mjs` trazia `eslint.ignoreDuringBuilds:
// true`. O efeito não era "o lint falha e nós ignoramos": era que não havia
// configuração alguma, e a flag escondia a ausência. Build verde não dizia nada
// sobre o código.
//
// `next lint` está deprecado no Next 16, então a configuração é a do ESLint CLI
// direto, com o plugin do Next carregado por `FlatCompat` (é assim que
// `eslint-config-next` ainda se distribui).
// =============================================================================

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    // Artefatos e fonte de dados. `data/` guarda o JSON do parser, que é fonte
    // imutável e não código.
    ignores: ['.next/**', 'node_modules/**', 'data/**', 'Design_system/**', 'next-env.d.ts'],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // O projeto usa `_` para argumento deliberadamente não lido (a rota de
      // peça recebe `_req`). Sem isto, a convenção vira ruído no build.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // `scripts/` roda em Node, fora do bundle: `console` ali é a interface do
    // usuário, e o non-null assertion aparece depois de checagem explícita.
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]

export default config
