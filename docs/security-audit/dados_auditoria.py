# -*- coding: utf-8 -*-
"""
Dados da auditoria de segurança do Ipsis — separados do renderizador.

Cada achado carrega o caminho do arquivo, a(s) linha(s) exata(s), o trecho de
código, por que é explorável, o impacto e a condição de explorabilidade. O
renderizador (`gerar_relatorio.py`) não decide nada sobre conteúdo: ele desenha
o que está aqui.

**Esta é a segunda passagem, de 06/09/2026.** A primeira, de 02/09, encontrou
nove achados; sete foram corrigidos em código e dois no painel do Supabase. Esta
refez as cinco categorias do zero contra o estado atual — nada foi assumido como
ainda de pé por já ter sido consertado.
"""

PROJETO = "Ipsis"
DATA = "06/09/2026"
# A auditoria e a correcao do achado 1 sao de dias diferentes, e a capa diz os dois:
# relatorio que carimba uma data so faz parecer que o conserto foi instantaneo.
DATA_CORRECAO = "09/09/2026"
BRANCH = "acesso/bloco-2"
COMMIT = "5e4e1cb"

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
                                "— a RLS É o mecanismo, e foi testada como tal."),
    ("Autenticação", "Supabase Auth (e-mail e senha), usuário único, sessão em cookie via "
                     "@supabase/ssr; decisão de acesso por getUser() no middleware, no layout de "
                     "(app) e dentro dos route handlers sensíveis."),
    ("Frontend", "React 19 + Tailwind v4. Nenhum motor de template server-side de HTML."),
    ("Deploy / CI", "Vercel (vercel.json, dois crons) e GitHub Actions (verificacao.yml e "
                    "vigilia.yml). Sem Docker, Helm ou Terraform no repositório."),
]

METODOLOGIA = [
    ("1. Banco sem tranca",
     "O equivalente da stack é a RLS do Postgres. Conferidas as 26 migrations e, sobre o banco "
     "de produção, o estado REALMENTE aplicado: <b>relrowsecurity</b> de toda tabela, o texto de "
     "cada policy com papel e condição, e os grants de escrita por papel. O isolamento foi então "
     "<b>testado</b>, assumindo o papel authenticated com um sub diferente — não inferido do SQL."),
    ("2. Permissão definida no navegador",
     "O projeto não tem papéis — isAdmin, canEdit e role não existem em src/. A categoria foi "
     "lida como “gate que o app aplica e o dado não”: cada função privilegiada foi consultada por "
     "has_function_privilege para anon, authenticated e service_role, e a chave publishable do "
     "bundle foi usada contra o PostgREST para ver o que ela alcança na prática."),
    ("3. IDOR",
     "Percorridos os seis route handlers e as 41 chamadas .from() / .rpc() de src/. Para as três "
     "tabelas de dado de pessoa, um segundo usuário autenticado tentou LER, ALTERAR e APAGAR a "
     "linha do primeiro pelo id — o IDOR clássico —, dentro de transação com rollback."),
    ("4. Chaves expostas",
     "Varredura por regex nos arquivos versionados, nos 172 commits do histórico, no bundle "
     "compilado depois de um build limpo e nos arquivos de ambiente; conferência dos defaults de "
     "leitura de variável nos dois runtimes e da interpolação de entrada nos workflows."),
    ("5. Inputs sem tratamento (XSS)",
     "Busca por dangerouslySetInnerHTML, innerHTML, eval, new Function, srcdoc e document.write; "
     "auditoria dos 13 href dinâmicos; e — o mais forte — varredura dos DADOS: as 3.730 URLs "
     "guardadas no banco, os 32.086 textos e os 11 MB de HTML do acervo que alimenta o único sink."),
]

ESCOPO = [
    "src/ — middleware, seis route handlers, libs de auth, busca, consulta, peça, decretos e "
    "vigília, e os componentes de tela.",
    "supabase/migrations/ — 26 migrations, e o estado aplicado no banco de produção.",
    "coletores/ e scripts/ — coletores em Python e scripts de lote em TypeScript.",
    ".github/workflows/, vercel.json, next.config.mjs, playwright.config.ts e e2e/.",
    "Histórico do git (172 commits), bundle compilado de um build limpo, e os dados guardados: "
    "URLs, textos de lei e o acervo Vade Mecum em disco.",
]

FORA_DE_ESCOPO = [
    "“Secure password change” no painel do Supabase: o endpoint público /auth/v1/settings não o "
    "expõe, então ele não é afirmável de fora. Vira o achado informativo nº 4.",
    "Teste de penetração com ferramenta ofensiva. O que se fez foi exercitar as portas reais — "
    "PostgREST com a chave pública, HTTP contra o build de produção, RLS com um segundo sub.",
    "Revisão jurídica do conteúdo. A auditoria é de acesso, segredo e injeção.",
]

SITUACAO_CAPA = (
    "4 achados, nenhum crítico, alto ou médio. O único com severidade foi corrigido nesta "
    "passagem, pela migration 0026; os outros três são informativos. Os nove de 02/09 "
    "estão fechados e foram reconferidos na fonte, não no relatório anterior."
)

METODO_CAPA = (
    "Leitura de código, migrations e CI, somada a teste contra as portas reais: PostgREST com a "
    "chave pública do bundle, HTTP contra o build de produção, e RLS exercitada com um segundo sub."
)

VEREDITO = (
    "<b>Veredito.</b> Nenhum achado crítico, alto ou médio — e a diferença para a passagem de "
    "02/09 é que desta vez o isolamento não foi só lido: foi <b>testado</b>. Um segundo usuário "
    "autenticado, com sub diferente, viu zero linha nas quatro tabelas de dado de pessoa e teve "
    "UPDATE e DELETE por id alheio recusados. A chave pública do bundle, contra o PostgREST, não "
    "lê nada de usuário e não escreve em lugar nenhum.<br/><br/>"
    "Os nove achados da primeira passagem estão fechados. Os dois de severidade alta foram "
    "reconferidos na fonte: <b>disable_signup: true</b> no servidor de Auth, e os dois tetos de "
    "gasto sem EXECUTE para anon e authenticated.<br/><br/>"
    "O único achado com severidade era de <b>defesa em profundidade que envelheceu</b>: a "
    "migration 0004 escreveu “nenhuma escrita para anon” e executou o revoke sobre as tabelas que "
    "existiam naquele instante. Sete migrations depois, dez tabelas voltaram a ter grant amplo "
    "pelo default do Supabase. A RLS cobre tudo que é alcançável hoje — <b>menos TRUNCATE, que "
    "não passa por política nenhuma</b>.<br/><br/>"
    "<b>Ele foi corrigido nesta passagem</b>, pela migration 0026: 44 linhas de escrita para anon "
    "e authenticated viraram 9, TRUNCATE saiu de todas as tabelas e tabela nova deixa de nascer "
    "com grant amplo. Fica registrado que <b>a correção que este relatório recomendava estava "
    "errada</b>: repetir o revoke em bloco de 0004 derrubaria a agenda de clientes, o histórico e "
    "o botão de marcar como conferido, porque RLS decide quais linhas e não se o papel pode "
    "escrever. Foi o ensaio em transação com rollback que separou a recomendação plausível da "
    "correta — ver o achado 1."
)

# -----------------------------------------------------------------------------
# Achados
# -----------------------------------------------------------------------------
ACHADOS = [
    {
        "id": 1,
        "sev": "baixa",
        "cat": "Banco sem tranca",
        "titulo": "anon e authenticated mantinham grants de escrita e TRUNCATE em dez tabelas, "
                  "e TRUNCATE não passa por RLS",
        "arquivos": [
            "supabase/migrations/0004_rls.sql:22-23",
            "supabase/migrations/0007_conversas.sql (e 0008, 0009, 0012, 0013, 0014, 0018)",
        ],
        "trecho": (
            "-- 0004_rls.sql:8   a regra declarada\n"
            "-- Regra: nenhuma policy de insert/update/delete para anon. Nenhuma.\n"
            "\n"
            "-- 0004_rls.sql:22  o que de fato foi executado\n"
            "revoke insert, update, delete, truncate on all tables in schema public\n"
            "  from anon, authenticated;\n"
            "--          ^ ALL TABLES alcança as tabelas que EXISTEM neste instante.\n"
            "--            conversas (0007), perfil (0008), clientes (0009) e as de\n"
            "--            0012/0013/0014/0018 nasceram depois, e o ALTER DEFAULT\n"
            "--            PRIVILEGES do Supabase devolveu GRANT ALL a elas.\n"
            "\n"
            "-- estado medido hoje, em information_schema.role_table_grants:\n"
            "--   clientes         anon  DELETE,INSERT,TRUNCATE,UPDATE\n"
            "--   conversas        anon  DELETE,INSERT,TRUNCATE,UPDATE\n"
            "--   conversa_trocas  anon  DELETE,INSERT,TRUNCATE,UPDATE\n"
            "--   perfil           anon  DELETE,INSERT,TRUNCATE,UPDATE\n"
            "--   +6 tabelas       anon  TRUNCATE"
        ),
        "porque": (
            "A migration 0004 escreveu a regra e executou o revoke, mas `on all tables in schema "
            "public` é uma fotografia: alcança o que existe no momento em que roda. Sete "
            "migrations posteriores criaram tabelas, e o ALTER DEFAULT PRIVILEGES que o Supabase "
            "instala concede ALL a anon e authenticated em tabela nova. A camada de grant, que o "
            "documento trata como a segunda tranca, não acompanhou o schema.\n\n"
            "Para INSERT, UPDATE e DELETE a RLS cobre o buraco, e isso foi CONFIRMADO com a chave "
            "pública contra o PostgREST: POST em clientes e em conversas devolvem 42501 (“new row "
            "violates row-level security policy”), PATCH em dispositivos e em vigilia_alteracoes "
            "devolvem 42501, e o DELETE em conversas devolve 204 com ZERO linhas afetadas — "
            "contagem conferida antes e depois.\n\n"
            "**TRUNCATE é a exceção, e é o motivo de este achado existir.** No Postgres, RLS se "
            "aplica a SELECT, INSERT, UPDATE, DELETE e MERGE. TRUNCATE não: quem tem o privilégio "
            "esvazia a tabela inteira, políticas à parte."
        ),
        "impacto": (
            "Nenhum hoje, e a razão é que falta um caminho, não uma tranca: o PostgREST não expõe "
            "verbo de TRUNCATE, e não há função que execute SQL arbitrário — sete nomes usuais "
            "(exec, exec_sql, execute_sql, sql, query, run_sql, pg_execute) foram tentados e todos "
            "devolvem 404. As únicas funções que anon executa são as sete de leitura do corpus.\n\n"
            "O risco é do futuro e é assimétrico: no dia em que alguém publicar uma RPC que "
            "trunque, ou abrir qualquer via de SQL para o papel anon, `clientes`, `conversas`, "
            "`conversa_trocas` e `perfil` são esvaziáveis sem que policy nenhuma reclame — e são "
            "justamente as quatro que guardam dado de pessoa. Perda total, sem erro e sem rastro."
        ),
        "condicao": (
            "Não explorável pela superfície HTTP de hoje. Exige um caminho de execução de SQL para "
            "anon ou authenticated que não existe no projeto. É defesa em profundidade que "
            "envelheceu — a regra escrita em 0004 vale mais que o estado atual do banco."
        ),
        "situacao": "resolvido",
        "correcao": (
            "Fechado por `supabase/migrations/0026_escrita_do_dono.sql`, aplicada e conferida no "
            "banco: as 44 linhas de escrita para anon e authenticated caíram para 9, TRUNCATE não "
            "sobrou em tabela nenhuma, e `npm run e2e` seguiu 24/24 — inclusive os dois casos que "
            "cadastram e apagam um cliente e criam uma conversa.\n\n"
            "**A correção que este relatório recomendava estava errada, e o registro do erro vale "
            "mais que o conserto.** A recomendação era repetir o bloco de 0004: revoke de "
            "insert/update/delete/truncate para anon E authenticated. Ensaiado em transação com "
            "rollback antes de virar migration, ele derruba o produto por duas vias.\n\n"
            "**(a) RLS decide QUAIS linhas, não SE o papel pode escrever.** As duas checagens são "
            "independentes, e a de privilégio vem primeiro: sem o grant de tabela, authenticated "
            "recebe `permission denied for table clientes` antes de qualquer policy ser "
            "consultada. Em 0004 o revoke em bloco era inofensivo porque não havia escrita de "
            "usuário nenhuma — a autenticação nem existia. A frase “é a RLS que autoriza a escrita "
            "legítima, não o grant amplo”, que esta mesma passagem escreveu acima, é falsa.\n\n"
            "**(b) revogar UPDATE de tabela apaga junto o grant por COLUNA.** `vigilia_alteracoes` "
            "concede UPDATE só em `reconferido_em` e `reconferido_por`, e é isso que impede "
            "“marcar como conferido” de virar “reescrever o link do ato oficial”. O revoke em "
            "bloco zera as duas colunas e o botão para de funcionar — sem erro na migration, e sem "
            "nada dizendo o motivo.\n\n"
            "O que 0026 faz, então, é nominal: TRUNCATE sai de todas as tabelas, por ser a única "
            "escrita que a RLS não alcança e não ter uso legítimo pelo navegador; "
            "INSERT/UPDATE/DELETE saem inteiros de `anon`, que não escreve em lugar nenhum; e de "
            "`authenticated` sai só o que `src/` não usa. Sobram as cinco escritas reais do "
            "produto, levantadas do código e não estimadas.\n\n"
            "E a metade que faz a correção durar: `alter default privileges ... revoke`, para o "
            "papel `postgres`. Sem ela, 0026 teria a mesma validade de 0004 — a de uma fotografia. "
            "Tabela nova passa a exigir grant explícito na própria migration, que é a decisão "
            "aparecendo no diff em vez de ser herdada sem ninguém notar."
        ),
    },
    {
        "id": 2,
        "sev": "info",
        "cat": "Chaves expostas / CI",
        "titulo": "verificacao.yml não declara `permissions:`, e roda em pull_request",
        "arquivos": [
            ".github/workflows/verificacao.yml:35-38",
            ".github/workflows/vigilia.yml:69-70 (o contraste)",
        ],
        "trecho": (
            "# .github/workflows/verificacao.yml — não há bloco `permissions:`\n"
            "on:\n"
            "  push:\n"
            "    branches: [main]\n"
            "  pull_request:\n"
            "\n"
            "# .github/workflows/vigilia.yml:69 — este declara\n"
            "permissions:\n"
            "  contents: read"
        ),
        "porque": (
            "Sem bloco `permissions:`, o GITHUB_TOKEN do job recebe o conjunto padrão configurado "
            "na organização ou no repositório, que pode ser mais amplo que o necessário. O "
            "workflow da vigília já declara o mínimo; o de verificação não, e a assimetria é "
            "acidental — os dois arquivos foram escritos com meses de diferença."
        ),
        "impacto": (
            "Baixo e indireto. Este workflow não usa segredo nenhum — é o que permite que ele rode "
            "com segurança em PR vindo de fork —, e para pull_request de fork o GitHub já entrega "
            "token somente-leitura. O que se ganha declarando é deixar de depender de uma "
            "configuração que mora fora do arquivo e pode mudar sem ninguém notar."
        ),
        "condicao": (
            "Só vira consequência se a configuração padrão do repositório for permissiva e algum "
            "passo do job for comprometido — por dependência, por exemplo."
        ),
        "situacao": "aberto",
        "correcao": (
            "Duas linhas no topo de verificacao.yml, iguais às de vigilia.yml: permissions: "
            "contents: read. Nenhum passo do arquivo escreve nada no repositório, então não há o "
            "que quebrar."
        ),
    },
    {
        "id": 3,
        "sev": "info",
        "cat": "Processo",
        "titulo": "AGENTS.md duplica o CLAUDE.md inteiro, e é lá que moram as exigências de painel",
        "arquivos": ["AGENTS.md (2.573 linhas, não versionado)", "CLAUDE.md (2.573 linhas)"],
        "trecho": (
            "$ diff AGENTS.md CLAUDE.md\n"
            "685c685\n"
            "< Codex é superfície de gasto anônima — e a autenticação, quando entrou, não\n"
            "---\n"
            "> Claude é superfície de gasto anônima — e a autenticação, quando entrou, não\n"
            "982c982\n"
            "< primeira versão trazia `Codex-opus-5` escrito no JSX, e continuou exibindo isso\n"
            "---\n"
            "> primeira versão trazia `claude-opus-5` escrito no JSX, e continuou exibindo isso"
        ),
        "porque": (
            "São 2.573 linhas duplicadas que diferem em duas — o nome do agente. Não há segredo em "
            "nenhum dos dois arquivos, e isso foi conferido.\n\n"
            "O que faz disto assunto de segurança é o CONTEÚDO: é neste documento que vivem as "
            "quatro configurações obrigatórias do painel do Supabase, incluindo “Allow new users "
            "to sign up: desligado”, que é a correção do achado de severidade alta da passagem "
            "anterior. O projeto escolheu esse documento como o lugar onde a exigência sobrevive "
            "ao próximo deploy. Duas cópias significam que ela pode passar a existir em uma e não "
            "na outra, e o agente que ler a errada não saberá."
        ),
        "impacto": (
            "Nenhum imediato: hoje as duas cópias dizem a mesma coisa. O risco é de divergência "
            "silenciosa — a mesma classe de erro que o `marca.ts` do projeto existe para impedir, "
            "e que o próprio documento descreve como “é assim que uma tela fica com o nome antigo”."
        ),
        "condicao": "Não é uma falha explorável; é uma fonte de verdade duplicada.",
        "situacao": "aberto",
        "correcao": (
            "Duas saídas, e a escolha é de processo, não técnica. A primeira é AGENTS.md virar um "
            "arquivo de três linhas apontando para o CLAUDE.md, o que preserva a convenção que "
            "outros agentes procuram sem duplicar conteúdo. A segunda é gerar um do outro num "
            "passo do `npm run verificar`, que falha se divergirem — a mesma disciplina que "
            "`tests/vigilia.test.ts` aplica aos dois runtimes do filtro."
        ),
    },
    {
        "id": 4,
        "sev": "info",
        "cat": "Autenticação",
        "titulo": "“Secure password change” não é verificável de fora do painel",
        "arquivos": [
            "CLAUDE.md — tabela de configuração exigida no painel",
            "src/components/auth/redefinir-senha.tsx:53-62",
        ],
        "trecho": (
            "GET /auth/v1/settings  (endpoint público do Auth)\n"
            "  disable_signup ......... true    <- verificável, e está fechado\n"
            "  mailer_autoconfirm ..... true    <- verificável\n"
            "  external.email ......... true    <- verificável\n"
            "  secure_password_change . (ausente do payload)\n"
            "\n"
            "// src/components/auth/redefinir-senha.tsx:54\n"
            "const { error } = await supabase.auth.updateUser({ password: senha })\n"
            "//                                    ^ sem senha atual, por desenho do SDK"
        ),
        "porque": (
            "O produto depende de um interruptor do painel para fechar a troca de senha sem "
            "reautenticação, e o endpoint público de configurações não devolve esse campo. "
            "Confirmei os outros três; este não dá para afirmar nem negar de fora.\n\n"
            "A guarda que existe em código — o cookie `ipsis-recuperacao`, posto por "
            "/auth/confirmar e exigido por /redefinir-senha — impede o acidente de quem já está "
            "logado abrir a tela, e isso foi verificado no navegador. Ela não impede quem tem um "
            "cookie válido e chama o SDK sem passar por tela nenhuma."
        ),
        "impacto": (
            "Se o interruptor estiver desligado, um cookie de sessão obtido por outro caminho "
            "permite trocar a senha sem conhecer a antiga — tomada permanente da conta. Se estiver "
            "ligado, não há impacto. A auditoria não consegue dizer qual dos dois é o caso."
        ),
        "condicao": (
            "Depende de uma configuração fora do repositório. O dono relatou tê-la ligado; o que "
            "falta é evidência que a auditoria possa produzir sozinha."
        ),
        "situacao": "aberto",
        "correcao": (
            "Conferir uma vez no painel, e depois anotar a data da conferência ao lado da linha na "
            "tabela do CLAUDE.md — é o que o projeto já faz com `artigos.conferido_em` e com o "
            "`conferido_em` dos decretos: quando não dá para medir, registra-se quem olhou e "
            "quando. Alternativa mais forte: um caso de e2e que faça login, chame updateUser sem "
            "reautenticar e espere a recusa."
        ),
    },
]

# -----------------------------------------------------------------------------
# Pontos fortes verificados nesta passagem
# -----------------------------------------------------------------------------
FORTES = [
    ("RLS ligada em 20 de 20 tabelas, conferida nas migrations E no banco aplicado",
     "As 26 migrations declaram `enable row level security` para as 20 tabelas que criam — zero "
     "divergência entre o que se cria e o que se protege. Contra o banco de produção, a consulta "
     "a pg_class por relrowsecurity devolve nenhuma tabela sem RLS no schema public."),

    ("O isolamento entre usuários foi TESTADO, não inferido do SQL",
     "Assumindo o papel `authenticated` com um `sub` diferente do dono real, dentro de transação "
     "com rollback: SELECT em clientes, conversas, conversa_trocas e perfil devolveu 0 linhas nas "
     "quatro; UPDATE e DELETE em clientes pelo id do dono afetaram 0 linhas; DELETE em conversas "
     "pelo id do dono afetou 0 linhas. Contagens antes e depois idênticas — 1 cliente, 69 "
     "conversas. É o IDOR clássico tentado de propósito, e recusado."),

    ("A chave pública do bundle não alcança dado de pessoa, e isso foi exercitado",
     "Com a chave publishable extraída do próprio bundle, contra o PostgREST: GET em clientes, "
     "conversas, conversa_trocas e perfil devolve `[]` nas quatro. POST em clientes e conversas "
     "devolve 42501 com “new row violates row-level security policy”. PATCH em dispositivos — o "
     "texto legal, que a decisão nº 1 protege — devolve 42501. DELETE em conversas devolve 204 com "
     "zero linhas removidas, confirmado por contagem."),

    ("Os dois tetos de gasto estão fechados para quem não é o servidor",
     "has_function_privilege devolve false para anon e para authenticated, e true só para "
     "service_role, nas duas funções `security definer` do schema — consome_uso_llm e "
     "consome_uso_busca. Pelo PostgREST com a chave pública, as duas devolvem 42501 “permission "
     "denied for function”. Era o achado de severidade alta da passagem anterior, e está fechado."),

    ("As duas funções `security definer` têm search_path fixo",
     "`search_path=public, pg_temp` nas duas, o que impede sequestro de tabela por schema no "
     "caminho do chamador. As outras sete funções do schema são security invoker e ficam sujeitas "
     "à RLS de quem as chama."),

    ("Não existe caminho de SQL arbitrário para a chave pública",
     "Sete nomes usuais de RPC de execução (exec, exec_sql, execute_sql, sql, query, run_sql, "
     "pg_execute) foram tentados contra o PostgREST: todos 404. As únicas funções que anon executa "
     "são as sete de leitura do corpus — busca_hibrida, busca_decretos, saude, norm, norm_arr, "
     "arr_join e filtra_artigos_do_precedente."),

    ("Os seis route handlers têm, cada um, o porteiro que lhes cabe",
     "/api/consulta/aovivo e /api/peca/[casoId] chamam usuarioAtual() no próprio handler; "
     "/api/vigilia/coletar exige Authorization: Bearer $CRON_SECRET e recusa com 503 quando o "
     "segredo não está configurado; /api/health e /api/busca são públicas por decisão escrita; "
     "/auth/confirmar troca um código de uso único emitido pelo servidor de Auth."),

    ("O contorno do matcher que a passagem anterior encontrou está fechado",
     "Contra `next start`: /api/peca/caso.txt devolve 307 para /login, e não mais 200 — era o "
     "caminho que pulava o middleware por terminar em extensão excluída. /consulta, /clientes, "
     "/configuracoes, /api/consulta/aovivo e /api/peca/<id> também devolvem 307 sem sessão."),

    ("Cinco cabeçalhos de segurança, com nonce novo a cada requisição",
     "Contra o build de produção: X-Content-Type-Options, Referrer-Policy, X-Frame-Options: DENY, "
     "Permissions-Policy e Content-Security-Policy. Duas requisições seguidas trouxeram nonces "
     "diferentes, o que prova que a política é montada por requisição e não fixada no build."),

    ("Nenhum segredo no código versionado, no histórico ou no bundle",
     "Os três arquivos que casam o regex de segredo são placeholders: `.env.example:64` "
     "(SEU-PROJETO:SENHA@), `README.md:445` (<ref>:<senha>@) e uma linha de dados_auditoria.py que "
     "descreve o próprio regex. Nos 172 commits do histórico, nenhum arquivo .env, .pem, .key ou "
     "de credencial jamais foi adicionado — só .env.example. No bundle de um build limpo, a única "
     "ocorrência é código da biblioteca do Supabase testando prefixo de chave; a única chave "
     "presente é a publishable, pública por construção."),

    ("Nenhum default inseguro na leitura de variável de ambiente",
     "O único fallback literal em src/ e scripts/ é `OPENAI_MODEL ?? 'gpt-5.4-mini'`, que é nome "
     "de modelo, não credencial. Do lado Python, os quatro getenv usam default vazio. Quem falta "
     "variável lança no import (lib/supabase.ts) ou devolve null para quem sabe decidir "
     "(lib/servico.ts)."),

    ("O único sink de XSS recebe HTML saneado, e os bytes foram conferidos",
     "`dangerouslySetInnerHTML` aparece uma vez em produção, em vademecum/[leiId]/page.tsx:117. O "
     "HTML vem de scripts/vademecum.ts:360, saneado em build por allowlist com sanitize-html "
     "2.17.7 — o patch da passagem anterior está aplicado. Os 11 MB de acervo em disco foram "
     "varridos: ZERO ocorrências de <script>, javascript:, onerror=, onload=, onclick=, <iframe>, "
     "<object>, <embed>, <svg> ou <style>. As tags presentes são só de documento: p, span, a, br, "
     "h1–h5, li, td, i."),

    ("Zero eval, new Function, innerHTML, srcdoc ou document.write em todo o código",
     "A varredura de src/, e2e/ e scripts/ não devolve nenhuma ocorrência dos cinco. A prosa "
     "gerada pelo modelo é renderizada como filho de JSX, portanto escapada pelo React."),

    ("Os dados guardados não carregam esquema perigoso nem marcação executável",
     "Isto é mais forte que ler o código, e por isso foi feito: as 3.730 URLs do banco — 1.496 em "
     "decretos_pr, 894 em vigilia_alteracoes, 1.340 em artigos.fonte_redacao — casam todas "
     "`^https?://`, nenhuma com javascript: ou data:. Os 32.086 textos guardados (3.771 "
     "dispositivos e 28.315 blocos de decreto) não têm uma única ocorrência de <script, "
     "javascript:, onerror= ou onload=."),

    ("O workflow que carrega a service role não interpola entrada no shell",
     "Em vigilia.yml, `inputs.desde` e `inputs.seco` aparecem apenas sob `env:`, nas linhas 131 e "
     "132, e são referenciados como variáveis citadas dentro do script, com validação de formato "
     "ISO antes do uso. O job declara `permissions: contents: read`. Nenhum segredo está escrito "
     "no arquivo — todos vêm de `secrets.`."),

    ("O cadastro público está fechado, confirmado no servidor de Auth",
     "`GET /auth/v1/settings` responde `disable_signup: true`. Não é a leitura do painel: é o que "
     "o servidor de Auth informa a quem pergunta. Era o achado de severidade alta nº 1 da "
     "passagem anterior — o que dava sessão authenticated a qualquer visitante."),

    ("As suítes seguem verdes, e são elas que trancam o que erra em silêncio",
     "`npm run verificar`: 271 asserções em 11 suítes. `pytest coletores`: 120. "
     "`tests/acesso.test.ts` guarda as três regras que falham sem avisar — o matcher do middleware "
     "(conferindo que o regex do teste é literalmente o do arquivo), a lista de rotas públicas, e "
     "a normalização da chave do cache de embedding."),
]

FRACOS = [
    ("A camada de grant não acompanhou o schema",
     "0004 escreveu a regra e a executou sobre as tabelas que existiam naquele instante. Sete "
     "migrations depois, dez tabelas voltaram a ter grant amplo por default do Supabase. A RLS "
     "cobre o que é alcançável hoje; o TRUNCATE ela não cobre, e a única razão de isso não doer é "
     "que falta caminho, não tranca."),
    ("Um controle de que a segurança depende não é verificável pela auditoria",
     "“Secure password change” mora no painel e não aparece em nenhum endpoint público. O produto "
     "aposta nele e não tem como demonstrá-lo — o que é diferente de estar errado."),
    ("A fonte de verdade que guarda as exigências de painel existe em duas cópias",
     "AGENTS.md e CLAUDE.md têm 2.573 linhas cada e diferem em duas. É onde vive a exigência de "
     "manter o cadastro fechado — a correção do achado mais grave da passagem anterior."),
]

NAO_SE_APLICA = [
    ("Multi-inquilino: organização, workspace, equipe",
     "Não existe conceito de organização ou equipe no schema. O isolamento pedido pela categoria 1 "
     "é por usuário, e está implementado por RLS — e desta vez foi testado com um segundo sub, não "
     "só lido. Não há “query de listagem que esqueceu o tenant” porque não há tenant: a listagem "
     "sem filtro explícito é correta por construção, já que a policy o aplica no banco."),
    ("Papéis, admin, gestão de usuários",
     "isAdmin, canEdit e role não existem em src/ — verificado por busca. Não há o par “UI esconde "
     "/ servidor não confere” da categoria 2 na forma clássica. Ela foi aplicada como “gate do app "
     "não espelhado no dado”, e o caso que existia — o teto de gasto concedido a anon — está "
     "fechado e foi reconferido."),
    ("ORM e SQL montado por concatenação",
     "Não há ORM. O acesso é PostgREST parametrizado e funções SQL declaradas. Os dois pontos que "
     "montam filtro com texto do usuário removem os curingas antes (clientes.ts:184, "
     "historico.ts:247), e os ids herdados do fio passam por regex estrito. Não há superfície de "
     "injeção de SQL."),
    ("HTML de e-mail e motor de template no servidor",
     "O projeto não envia e-mail: quem envia é o servidor de Auth do Supabase, a partir de "
     "templates do painel. Nenhuma rota renderiza HTML a partir de string. A metade “backend” da "
     "categoria 5 não tem onde acontecer."),
    ("Docker, Helm, Terraform",
     "Não existem no repositório. A superfície de deploy é vercel.json e dois workflows do GitHub "
     "Actions, ambos auditados."),
]

RECOMENDACOES = [
    ("P1", "Devolver a camada de grant ao mínimo — feito nesta passagem", [
        "`0026_escrita_do_dono.sql`, aplicada e conferida: 44 linhas de escrita para anon e "
        "authenticated viraram 9, TRUNCATE saiu de todas as tabelas, e o `alter default "
        "privileges` faz a próxima tabela nascer fechada. `npm run e2e` seguiu 24/24. (achado 1)",
        "O revoke em bloco que este relatório recomendava foi ENSAIADO e recusado: ele derruba "
        "clientes, conversas, perfil e o botão de marcar como conferido. RLS decide quais linhas, "
        "não se o papel pode escrever — e revogar UPDATE de tabela apaga o grant por coluna junto. "
        "O que entrou é nominal, levantado da superfície de escrita real de `src/`.",
        "Continua em aberto: somar a asserção ao `npm run verificar`, na forma que o projeto já "
        "usa para o matcher — uma consulta que falhe se anon voltar a ter escrita. Grant é estado "
        "do banco, e estado que ninguém observa é estado que volta. 0026 fecha a porta de hoje; só "
        "a asserção impede a 0027 de reabri-la.",
    ]),
    ("P2", "Fechar as duas frouxidões de processo", [
        "Declarar `permissions: contents: read` em verificacao.yml, como vigilia.yml já faz. Duas "
        "linhas, nenhum passo do arquivo escreve no repositório. (achado 2)",
        "Resolver a duplicação de AGENTS.md — apontar para o CLAUDE.md, ou gerar um do outro com "
        "uma asserção que falhe na divergência. É onde moram as exigências de painel. (achado 3)",
    ]),
    ("P3", "Tornar verificável o que hoje é declarado", [
        "Conferir “Secure password change” no painel e anotar a data ao lado da linha na tabela do "
        "CLAUDE.md — a mesma disciplina de `conferido_em` que o projeto aplica ao corpus e aos "
        "decretos. (achado 4)",
        "Opcionalmente, um caso de e2e que faça login, chame updateUser sem reautenticar e espere "
        "a recusa: transforma uma configuração de painel em asserção que roda.",
        "Quando a landing page existir, decidir robots.ts e sitemap.ts: hoje o app inteiro é "
        "rastreável por padrão e /login e /cadastro entram no índice.",
    ]),
]

# Categoria canônica usada nos gráficos: as cinco pedidas na auditoria, mais dois
# baldes honestos para o que não cabe em nenhuma delas sem forçar.
CAT_CHAVE = {
    1: "1 · Banco sem tranca",
    2: "4 · Chaves expostas",
    3: "Extra · Processo",
    4: "Extra · Autenticação",
}

ORDEM_CAT = [
    "1 · Banco sem tranca",
    "2 · Permissão no navegador",
    "3 · IDOR / autorização",
    "4 · Chaves expostas",
    "5 · Inputs sem tratamento",
    "Extra · Processo",
    "Extra · Autenticação",
]
