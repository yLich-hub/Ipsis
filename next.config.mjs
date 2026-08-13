/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: false },

  // Era `true`, e o efeito não era "o lint falha e nós ignoramos": não havia
  // configuração de ESLint alguma, e a flag escondia a ausência. Build verde não
  // dizia nada sobre o código. Agora `eslint.config.mjs` existe e o build quebra
  // com o lint — que é o ponto de ter lint.
  eslint: { ignoreDuringBuilds: false },

  // O acervo Vade Mecum é lido do disco em runtime (src/lib/vademecum.ts), e o
  // rastreador de arquivos da Vercel não enxerga um `readFileSync` com caminho
  // montado em variável. Sem isto, `data/vademecum/` fica fora do bundle e as
  // telas do acervo quebram só em produção.
  outputFileTracingIncludes: {
    '/vademecum': ['./data/vademecum/**'],
    '/vademecum/[leiId]': ['./data/vademecum/**'],
  },
}

export default nextConfig
