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
    //
    // Os venvs de Python entram aqui porque o git NÃO os denuncia: a ferramenta
    // escreve um `.gitignore` com `*` dentro do próprio venv, então ele some do
    // `git status` e continua visível para o ESLint. `.venv-relatorio/`, o do
    // gerador da auditoria, traz o JS que o matplotlib empacota — sete erros de
    // lint em código de terceiro, que derrubavam `npm run verificar` inteiro.
    //
    // O CI nunca viu isso, e é o pior lado para o defeito ficar: ele clona
    // limpo, então o vermelho aparecia só na máquina de quem ia commitar, no
    // comando que o CLAUDE.md manda rodar antes do commit.
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'Design_system/**',
      '.venv*/**',
      'next-env.d.ts',
    ],
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
