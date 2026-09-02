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

  // ---------------------------------------------------------------------------
  // Cabeçalhos de segurança
  //
  // O produto não emitia nenhum, e o que mais pesava não era a ausência em si:
  // era a ausência somada ao único `dangerouslySetInnerHTML` que existe em
  // produção (`app/(app)/vademecum/[leiId]/page.tsx`). O saneamento daquele HTML
  // é sólido — allowlist de `sanitize-html` em build, `style` fora,
  // `allowedSchemes` sem `javascript:` — e CSP é justamente a camada que sobra
  // no dia em que um saneamento falha.
  //
  // **A CSP não está aqui, e sim no middleware.** Ela precisa de um nonce novo a
  // cada requisição, e `headers()` é estático: o valor é calculado no build e
  // repetido para todo mundo. Nonce fixo não é nonce. Ver `src/middleware.ts`.
  //
  // O que fica aqui é o que não muda por requisição.
  // ---------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [
          // Impede o navegador de adivinhar o tipo de um recurso pelo conteúdo.
          // Vale mais do que parece numa rota que devolve `.docx`: sem isto, um
          // navegador podia decidir renderizar em vez de baixar.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // O Referer não deve levar caminho nem query para fora do domínio. Um
          // `/consulta?p=<termo>` carrega a pergunta do advogado na URL.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Clickjacking. A CSP do middleware diz `frame-ancestors 'none'`, que
          // é a regra moderna e a que vale; este continua para o navegador que
          // não a implementa. Os dois concordam de propósito.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Nada aqui usa câmera, microfone ou geolocalização, e declarar isso
          // custa uma linha. O que não se declara, um script de terceiro pede.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
