# Auditoria da normalização

gerado em 2026-08-16T03:39:01.623Z

## Contagem por lei

| lei | artigos | revogados | dispositivos | rubricas | ordinais | notas rodapé | notas editor | emendas | rubrica marginal |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| lei_11343_2006 | 94 | 10 | 390 | 0 | 43 | 1 | 2 | 3 | 0 |
| dl_2848_1940 | 421 | 19 | 1312 | 414 | 76 | 7 | 13 | 5 | 379 |
| dl_3689_1941 | 825 | 16 | 2069 | 7 | 104 | 50 | 54 | 3 | 6 |

Total: 838 alterações em 765 dispositivos — rubrica_marginal 385, ordinal 179, redacao 161, nota_rodape 58, nota_editor 42, emenda 11, estrutura 2.

Estes são os números que o CLAUDE.md cita, e é daqui que eles saem. Se mudarem depois de um `npm run normalize`, o documento muda junto — divergência entre os dois é sinal de regra alterada, não de dado errado.

## Suspeitos de truncamento

Dispositivos que, depois de toda a limpeza, continuam sem pontuação terminal. Foi assim que o art. 37 da Lei de Drogas apareceu partido. Nem todo suspeito é defeito — enumeração pode terminar em "e". Confira contra o PDF.

- `dl_3689_1941_art761_caput` …iver sentenciado por último ou a autoridade de jurisdição prevalente no caso do art. 82.49

## Headings

### nao-segmentado — 155

Nenhuma rubrica extraída. Ou o heading está limpo (esperado na Lei 11.343), ou a rubrica é Title Case e escapou das duas regras. Confira contra o PDF e, se houver rubrica, copie a entrada de `headings.propostas.yaml` para `data/curadoria/headings.yaml` já corrigida.

- `lei_11343_2006_art1` TÍTULO I – Disposições Preliminares
- `lei_11343_2006_art3` TÍTULO II – Do Sistema Nacional de Políticas Públicas sobre Drogas
- `lei_11343_2006_art4` CAPÍTULO I – Dos Princípios e dos Objetivos do Sistema Nacional de Políticas Públicas sobre Drogas
- `lei_11343_2006_art6` SEÇÃO I – Da Composição do Sistema Nacional de Políticas Públicas sobre Drogas
- `lei_11343_2006_art6` CAPÍTULO II – Do Sistema Nacional de Políticas Públicas sobre Drogas
- `lei_11343_2006_art8-a` SEÇÃO II – Das Competências
- `lei_11343_2006_art8-d` SEÇÃO I – Do Plano Nacional de Políticas sobre Drogas
- `lei_11343_2006_art8-d` CAPÍTULO II-A – Da Formulação das Políticas sobre Drogas
- `lei_11343_2006_art8-e` SEÇÃO II – Dos Conselhos de Políticas sobre Drogas
- `lei_11343_2006_art8-f` SEÇÃO III – Dos Membros dos Conselhos de Políticas sobre Drogas
- `lei_11343_2006_art15` CAPÍTULO IV – Do Acompanhamento e da Avaliação das Políticas sobre Drogas
- `lei_11343_2006_art18` SEÇÃO I – Das Diretrizes
- `lei_11343_2006_art18` CAPÍTULO I – Da Prevenção
- `lei_11343_2006_art18` TÍTULO III – Das Atividades de Prevenção do Uso Indevido, Atenção e Reinserção Social de Usuários e Dependentes de Drogas
- `lei_11343_2006_art19-a` SEÇÃO II – Da Semana Nacional de Políticas sobre Drogas
- `lei_11343_2006_art20` SEÇÃO I – Disposições Gerais
- `lei_11343_2006_art20` CAPÍTULO II – Das Atividades de Prevenção, Tratamento, Acolhimento e de Reinserção Social e Econômica de Usuários ou Dependentes de Drogas
- `lei_11343_2006_art22-a` SEÇÃO II – Da Educação na Reinserção Social e Econômica
- `lei_11343_2006_art22-b` SEÇÃO III – Do Trabalho na Reinserção Social e Econômica
- `lei_11343_2006_art23` SEÇÃO IV – Do Tratamento do Usuário ou Dependente de Drogas
- `lei_11343_2006_art23-b` SEÇÃO V – Do Plano Individual de Atendimento
- `lei_11343_2006_art26-a` SEÇÃO VI – Do Acolhimento em Comunidade Terapêutica Acolhedora
- `lei_11343_2006_art27` CAPÍTULO III – Dos Crimes e das Penas
- `lei_11343_2006_art31` CAPÍTULO I – Disposições Gerais
- `lei_11343_2006_art31` TÍTULO IV – Da Repressão à Produção Não Autorizada e ao Tráfico Ilícito de Drogas
- `lei_11343_2006_art33` CAPÍTULO II – Dos Crimes
- `lei_11343_2006_art48` CAPÍTULO III – Do Procedimento Penal
- `lei_11343_2006_art50` SEÇÃO I – Da Investigação
- `lei_11343_2006_art54` SEÇÃO II – Da Instrução Criminal
- `lei_11343_2006_art60` CAPÍTULO IV – Da Apreensão, Arrecadação e Destinação de Bens do Acusado
- `lei_11343_2006_art65` TÍTULO V – Da Cooperação Internacional
- `lei_11343_2006_art65-a` TÍTULO V-A – Do Financiamento das Políticas sobre Drogas
- `lei_11343_2006_art66` TÍTULO VI – Disposições Finais e Transitórias
- `dl_2848_1940_art29` TÍTULO IV – Do Concurso de Pessoas
- `dl_2848_1940_art32` CAPÍTULO I – Das Espécies de Pena
- `dl_2848_1940_art32` TÍTULO V – Das Penas
- `dl_2848_1940_art121` TÍTULO I – Dos Crimes contra a Pessoa
- `dl_2848_1940_art146` CAPÍTULO VI – Dos Crimes contra a Liberdade Individual
- `dl_2848_1940_art155` TÍTULO II – Dos Crimes contra o Patrimônio
- `dl_2848_1940_art181` CAPÍTULO VIII – Disposições Gerais
- `dl_2848_1940_art184` TÍTULO III – Dos Crimes contra a Propriedade Imaterial
- `dl_2848_1940_art196` CAPÍTULO IV – Dos Crimes de Concorrência Desleal
- `dl_2848_1940_art208` TÍTULO V – Dos Crimes contra o Sentimento Religioso e contra o Respeito aos Mortos
- `dl_2848_1940_art213` TÍTULO VI – Dos Crimes contra a Dignidade Sexual
- `dl_2848_1940_art223` CAPÍTULO IV – Disposições Gerais
- `dl_2848_1940_art235` TÍTULO VII – Dos Crimes contra a Família
- `dl_2848_1940_art250` TÍTULO VIII – Dos Crimes contra a Incolumidade Pública
- `dl_2848_1940_art289` TÍTULO X – Dos Crimes contra a Fé Pública
- `dl_2848_1940_art312` TÍTULO XI – Dos Crimes contra a Administração Pública
- `dl_2848_1940_art359-i` TÍTULO XII – Dos Crimes contra o Estado Democrático de Direito
- `dl_2848_1940_art359-t` CAPÍTULO VI – Disposições Comuns
- `dl_3689_1941_art1` TÍTULO I – Disposições Preliminares
- `dl_3689_1941_art4` TÍTULO II – Do Inquérito Policial
- `dl_3689_1941_art24` TÍTULO III – Da Ação Penal
- `dl_3689_1941_art63` TÍTULO IV – Da Ação Civil
- `dl_3689_1941_art69` TÍTULO V – Da Competência
- `dl_3689_1941_art70` CAPÍTULO I – Da Competência pelo Lugar da Infração
- `dl_3689_1941_art72` CAPÍTULO II – Da Competência pelo Domicílio ou Residência do Réu
- `dl_3689_1941_art74` CAPÍTULO III – Da Competência pela Natureza da Infração
- `dl_3689_1941_art75` CAPÍTULO IV – Da Competência por Distribuição
- `dl_3689_1941_art76` CAPÍTULO V – Da Competência por Conexão ou Continência
- `dl_3689_1941_art83` CAPÍTULO VI – Da Competência por Prevenção
- `dl_3689_1941_art84` CAPÍTULO VII – Da Competência pela Prerrogativa de Função
- `dl_3689_1941_art88` CAPÍTULO VIII – Disposições Especiais
- `dl_3689_1941_art92` CAPÍTULO I – Das Questões Prejudiciais
- `dl_3689_1941_art92` TÍTULO VI – Das Questões e Processos Incidentes
- `dl_3689_1941_art95` CAPÍTULO II – Das Exceções
- `dl_3689_1941_art112` CAPÍTULO III – Das Incompatibilidades e Impedimentos
- `dl_3689_1941_art113` CAPÍTULO IV – Do Conflito de Jurisdição
- `dl_3689_1941_art118` CAPÍTULO V – Da Restituição das Coisas Apreendidas
- `dl_3689_1941_art125` CAPÍTULO VI – Das Medidas Assecuratórias
- `dl_3689_1941_art145` CAPÍTULO VII – Do Incidente de Falsidade
- `dl_3689_1941_art149` CAPÍTULO VIII – Da Insanidade Mental do Acusado
- `dl_3689_1941_art155` CAPÍTULO I – Disposições Gerais
- `dl_3689_1941_art155` TÍTULO VII – Da Prova
- `dl_3689_1941_art158` CAPÍTULO II – Do Exame de Corpo de Delito, da Cadeia de Custódia e das Perícias em Geral
- `dl_3689_1941_art185` CAPÍTULO III – Do Interrogatório do Acusado
- `dl_3689_1941_art197` CAPÍTULO IV – Da Confissão
- `dl_3689_1941_art201` CAPÍTULO V – Do Ofendido
- `dl_3689_1941_art202` CAPÍTULO VI – Das Testemunhas
- `dl_3689_1941_art226` CAPÍTULO VII – Do Reconhecimento de Pessoas e Coisas
- `dl_3689_1941_art229` CAPÍTULO VIII – Da Acareação
- `dl_3689_1941_art231` CAPÍTULO IX – Dos Documentos
- `dl_3689_1941_art239` CAPÍTULO X – Dos Indícios
- `dl_3689_1941_art240` CAPÍTULO XI – Da Busca e da Apreensão
- `dl_3689_1941_art251` CAPÍTULO I – Do Juiz
- `dl_3689_1941_art251` TÍTULO VIII – Do Juiz, do Ministério Público, do Acusado e Defensor, dos Assistentes e Auxiliares da Justiça
- `dl_3689_1941_art257` CAPÍTULO II – Do Ministério Público
- `dl_3689_1941_art259` CAPÍTULO III – Do Acusado e Seu Defensor
- `dl_3689_1941_art268` CAPÍTULO IV – Dos Assistentes
- `dl_3689_1941_art274` CAPÍTULO V – Dos Funcionários da Justiça
- `dl_3689_1941_art275` CAPÍTULO VI – Dos Peritos e Intérpretes
- `dl_3689_1941_art282` TÍTULO IX – Da Prisão, das Medidas Cautelares e da Liberdade Provisória
- `dl_3689_1941_art301` CAPÍTULO II – Da Prisão em Flagrante
- `dl_3689_1941_art311` CAPÍTULO III – Da Prisão Preventiva
- `dl_3689_1941_art317` CAPÍTULO IV – Da Prisão Domiciliar
- `dl_3689_1941_art319` CAPÍTULO V – Das Outras Medidas Cautelares
- `dl_3689_1941_art321` CAPÍTULO VI – Da Liberdade Provisória, com ou sem Fiança
- `dl_3689_1941_art351` CAPÍTULO I – Das Citações
- `dl_3689_1941_art351` TÍTULO X – Das Citações e Intimações
- `dl_3689_1941_art370` CAPÍTULO II – Das Intimações
- `dl_3689_1941_art373` TÍTULO XI – Da Aplicação Provisória de Interdições de Direitos e Medidas de Segurança
- `dl_3689_1941_art381` TÍTULO XII – Da Sentença
- `dl_3689_1941_art394` CAPÍTULO I – Da Instrução Criminal
- `dl_3689_1941_art394` TÍTULO I – Do Processo Comum
- `dl_3689_1941_art406` SEÇÃO I – Da Acusação e da Instrução Preliminar
- `dl_3689_1941_art406` CAPÍTULO II – Do Procedimento Relativo aos Processos da Competência do Tribunal do Júri
- `dl_3689_1941_art413` SEÇÃO II – Da Pronúncia, da Impronúncia e da Absolvição Sumária
- `dl_3689_1941_art422` SEÇÃO III – Da Preparação do Processo para Julgamento em Plenário
- `dl_3689_1941_art425` SEÇÃO IV – Do Alistamento dos Jurados
- `dl_3689_1941_art427` SEÇÃO V – Do Desaforamento
- `dl_3689_1941_art429` SEÇÃO VI – Da Organização da Pauta
- `dl_3689_1941_art432` SEÇÃO VII – Do Sorteio e da Convocação dos Jurados
- `dl_3689_1941_art436` SEÇÃO VIII – Da Função do Jurado
- `dl_3689_1941_art447` SEÇÃO IX – Da Composição do Tribunal do Júri e da Formação do Conselho de Sentença
- `dl_3689_1941_art453` SEÇÃO X – Da Reunião e das Sessões do Tribunal do Júri
- `dl_3689_1941_art473` SEÇÃO XI – Da Instrução em Plenário
- `dl_3689_1941_art476` SEÇÃO XII – Dos Debates
- `dl_3689_1941_art482` SEÇÃO XIII – Do Questionário e Sua Votação
- `dl_3689_1941_art492` SEÇÃO XIV – Da Sentença
- `dl_3689_1941_art494` SEÇÃO XV – Da Ata dos Trabalhos
- `dl_3689_1941_art497` SEÇÃO XVI – Das Atribuições do Presidente do Tribunal do Júri
- `dl_3689_1941_art513` CAPÍTULO II – Do Processo e do Julgamento dos Crimes de Responsabilidade dos Funcionários Públicos
- `dl_3689_1941_art513` TÍTULO II – Dos Processos Especiais
- `dl_3689_1941_art519` CAPÍTULO III – Do Processo e do Julgamento dos Crimes de Calúnia e Injúria, de Competência do Juiz Singular
- `dl_3689_1941_art524` CAPÍTULO IV – Do Processo e do Julgamento dos Crimes contra a Propriedade Imaterial
- `dl_3689_1941_art531` CAPÍTULO V – Do Processo Sumário
- `dl_3689_1941_art541` CAPÍTULO VI – Do Processo de Restauração de Autos Extraviados ou Destruídos
- `dl_3689_1941_art549` CAPÍTULO VII – Do Processo de Aplicação de Medida de Segurança por Fato Não Criminoso
- `dl_3689_1941_art561` CAPÍTULO II – Do Julgamento
- `dl_3689_1941_art561` TÍTULO III – Dos Processos de Competência do Supremo Tribunal Federal e dos Tribunais de Apelação
- `dl_3689_1941_art563` TÍTULO I – Das Nulidades
- `dl_3689_1941_art574` TÍTULO II – Dos Recursos em Geral
- `dl_3689_1941_art581` CAPÍTULO II – Do Recurso em Sentido Estrito
- `dl_3689_1941_art593` CAPÍTULO III – Da Apelação
- `dl_3689_1941_art607` CAPÍTULO IV – Do Protesto por Novo Júri
- `dl_3689_1941_art609` CAPÍTULO V – Do Processo e do Julgamento dos Recursos em Sentido Estrito e das Apelações, nos Tribunais de Apelação
- `dl_3689_1941_art619` CAPÍTULO VI – Dos Embargos
- `dl_3689_1941_art621` CAPÍTULO VII – Da Revisão
- `dl_3689_1941_art639` CAPÍTULO IX – Da Carta Testemunhável
- `dl_3689_1941_art647` CAPÍTULO X – Do Habeas Corpus e Seu Processo
- `dl_3689_1941_art668` TÍTULO I – Disposições Gerais
- `dl_3689_1941_art674` CAPÍTULO I – Das Penas Privativas de Liberdade
- `dl_3689_1941_art674` TÍTULO II – Da Execução das Penas em Espécie
- `dl_3689_1941_art686` CAPÍTULO II – Das Penas Pecuniárias
- `dl_3689_1941_art691` CAPÍTULO III – Das Penas Acessórias
- `dl_3689_1941_art696` CAPÍTULO I – Da Suspensão Condicional da Pena
- `dl_3689_1941_art696` TÍTULO III – Dos Incidentes da Execução
- `dl_3689_1941_art710` CAPÍTULO II – Do Livramento Condicional
- `dl_3689_1941_art734` CAPÍTULO I – Da Graça, do Indulto e da Anistia
- `dl_3689_1941_art734` TÍTULO IV – Da Graça, do Indulto, da Anistia e da Reabilitação
- `dl_3689_1941_art743` CAPÍTULO II – Da Reabilitação
- `dl_3689_1941_art751` TÍTULO V – Da Execução das Medidas de Segurança
- `dl_3689_1941_art783` CAPÍTULO II – Das Cartas Rogatórias
- `dl_3689_1941_art787` CAPÍTULO III – Da Homologação das Sentenças Estrangeiras

### sentence-case — 47

- `dl_2848_1940_art13` TÍTULO II – Do Crime  **+ rubrica:** _Relação de causalidade_
- `dl_2848_1940_art33` SEÇÃO I – Das Penas Privativas de Liberdade  **+ rubrica:** _Reclusão e detenção_
- `dl_2848_1940_art43` SEÇÃO II – Das Penas Restritivas de Direitos  **+ rubrica:** _Penas restritivas de direitos_
- `dl_2848_1940_art53` CAPÍTULO II – Da Cominação das Penas  **+ rubrica:** _Penas privativas de liberdade_
- `dl_2848_1940_art59` CAPÍTULO III – Da Aplicação da Pena  **+ rubrica:** _Fixação da pena_
- `dl_2848_1940_art77` CAPÍTULO IV – Da Suspensão Condicional da Pena  **+ rubrica:** _Requisitos da suspensão da pena_
- `dl_2848_1940_art83` CAPÍTULO V – Do Livramento Condicional  **+ rubrica:** _Requisitos do livramento condicional_
- `dl_2848_1940_art91` CAPÍTULO VI – Dos Efeitos da Condenação  **+ rubrica:** _Efeitos genéricos e específicos_
- `dl_2848_1940_art96` TÍTULO VI – Das Medidas de Segurança  **+ rubrica:** _Espécies de medidas de segurança_
- `dl_2848_1940_art100` TÍTULO VII – Da Ação Penal  **+ rubrica:** _Ação pública e de iniciativa privada_
- `dl_2848_1940_art107` TÍTULO VIII – Da Extinção da Punibilidade  **+ rubrica:** _Extinção da punibilidade_
- `dl_2848_1940_art121` CAPÍTULO I – Dos Crimes contra a Vida  **+ rubrica:** _Homicídio simples_
- `dl_2848_1940_art129` CAPÍTULO II – Das Lesões Corporais  **+ rubrica:** _Lesão corporal_
- `dl_2848_1940_art130` CAPÍTULO III – Da Periclitação da Vida e da Saúde  **+ rubrica:** _Perigo de contágio venéreo_
- `dl_2848_1940_art146` SEÇÃO I – Dos Crimes contra a Liberdade Pessoal  **+ rubrica:** _Constrangimento ilegal_
- `dl_2848_1940_art150` SEÇÃO II – Dos Crimes contra a Inviolabilidade do Domicílio  **+ rubrica:** _Violação de domicílio_
- `dl_2848_1940_art151` SEÇÃO III – Dos Crimes contra a Inviolabilidade de Correspondência  **+ rubrica:** _Violação de correspondência_
- `dl_2848_1940_art153` SEÇÃO IV – Dos Crimes contra a Inviolabilidade dos Segredos  **+ rubrica:** _Divulgação de segredo_
- `dl_2848_1940_art161` CAPÍTULO III – Da Usurpação  **+ rubrica:** _Alteração de limites_
- `dl_2848_1940_art168` CAPÍTULO V – Da Apropriação Indébita  **+ rubrica:** _Apropriação indébita_
- `dl_2848_1940_art184` CAPÍTULO I – Dos Crimes contra a Propriedade Intelectual  **+ rubrica:** _Violação de direito autoral_
- `dl_2848_1940_art197` TÍTULO IV – Dos Crimes contra a Organização do Trabalho  **+ rubrica:** _Atentado contra a liberdade de trabalho_
- `dl_2848_1940_art208` CAPÍTULO I – Dos Crimes contra o Sentimento Religioso  **+ rubrica:** _Ultraje a culto e impedimento ou perturbação de ato a ele relativo_
- `dl_2848_1940_art209` CAPÍTULO II – Dos Crimes contra o Respeito aos Mortos  **+ rubrica:** _Impedimento ou perturbação de cerimônia funerária_
- `dl_2848_1940_art216-b` CAPÍTULO I-A – Da Exposição da Intimidade Sexual  **+ rubrica:** _Registro não autorizado da intimidade sexual_
- `dl_2848_1940_art227` CAPÍTULO V – Do Lenocínio e do Tráfico de Pessoa para Fim de Prostituição ou Outra Forma de Exploração Sexual  **+ rubrica:** _Mediação para servir a lascívia de outrem_
- `dl_2848_1940_art233` CAPÍTULO VI – Do Ultraje Público ao Pudor  **+ rubrica:** _Ato obsceno_
- `dl_2848_1940_art234-a` CAPÍTULO VII – Disposições Gerais  **+ rubrica:** _Aumento de pena_
- `dl_2848_1940_art241` CAPÍTULO II – Dos Crimes contra o Estado de Filiação  **+ rubrica:** _Registro de nascimento inexistente_
- `dl_2848_1940_art244` CAPÍTULO III – Dos Crimes contra a Assistência Familiar  **+ rubrica:** _Abandono material_
- `dl_2848_1940_art248` CAPÍTULO IV – Dos Crimes contra o Pátrio Poder, Tutela ou Curatela  **+ rubrica:** _Induzimento a fuga, entrega arbitrária ou sonegação de incapazes_
- `dl_2848_1940_art260` CAPÍTULO II – Dos Crimes contra a Segurança dos Meios de Comunicação e Transporte e Outros Serviços Públicos  **+ rubrica:** _Perigo de desastre ferroviário_
- `dl_2848_1940_art286` TÍTULO IX – Dos Crimes contra a Paz Pública  **+ rubrica:** _Incitação ao crime_
- `dl_2848_1940_art289` CAPÍTULO I – Da Moeda Falsa  **+ rubrica:** _Moeda falsa_
- `dl_2848_1940_art293` CAPÍTULO II – Da Falsidade de Títulos e Outros Papéis Públicos  **+ rubrica:** _Falsificação de papéis públicos_
- `dl_2848_1940_art296` CAPÍTULO III – Da Falsidade Documental  **+ rubrica:** _Falsificação do selo ou sinal público_
- `dl_2848_1940_art306` CAPÍTULO IV – De Outras Falsidades  **+ rubrica:** _Falsificação do sinal empregado no contraste de metal precioso ou na fiscalização alfandegária, ou para outros fins_
- `dl_2848_1940_art311-a` CAPÍTULO V – Das Fraudes em Certames de Interesse Público  **+ rubrica:** _Fraudes em certames de interesse público_
- `dl_2848_1940_art328` CAPÍTULO II – Dos Crimes Praticados por Particular contra a Administração em Geral  **+ rubrica:** _Usurpação de função pública_
- `dl_2848_1940_art337-b` CAPÍTULO II-A – Dos Crimes Praticados por Particular contra a Administração Pública Estrangeira  **+ rubrica:** _Corrupção ativa em transação comercial internacional_
- `dl_2848_1940_art337-e` CAPÍTULO II-B – Dos Crimes em Licitações e Contratos Administrativos  **+ rubrica:** _Contratação direta ilegal_
- `dl_2848_1940_art338` CAPÍTULO III – Dos Crimes contra a Administração da Justiça  **+ rubrica:** _Reingresso de estrangeiro expulso_
- `dl_2848_1940_art359-a` CAPÍTULO IV – Dos Crimes contra as Finanças Públicas  **+ rubrica:** _Contratação de operação de crédito_
- `dl_2848_1940_art359-i` CAPÍTULO I – Dos Crimes contra a Soberania Nacional  **+ rubrica:** _Atentado à soberania_
- `dl_2848_1940_art359-l` CAPÍTULO II – Dos Crimes contra as Instituições Democráticas  **+ rubrica:** _Abolição violenta do Estado Democrático de Direito_
- `dl_2848_1940_art359-n` CAPÍTULO III – Dos Crimes contra o Funcionamento das Instituições Democráticas no Processo Eleitoral  **+ rubrica:** _Interrupção do processo eleitoral_
- `dl_3689_1941_art637` CAPÍTULO VIII – Do Recurso Extraordinário  **+ rubrica:** _Arts. 632 a 636. (Revogados)_

### repeticao — 8

- `dl_2848_1940_art49` SEÇÃO III – Da Pena de Multa  **+ rubrica:** _Multa_
- `dl_2848_1940_art93` CAPÍTULO VII – Da Reabilitação  **+ rubrica:** _Reabilitação_
- `dl_2848_1940_art137` CAPÍTULO IV – Da Rixa  **+ rubrica:** _Rixa_
- `dl_2848_1940_art155` CAPÍTULO I – Do Furto  **+ rubrica:** _Furto_
- `dl_2848_1940_art157` CAPÍTULO II – Do Roubo e da Extorsão  **+ rubrica:** _Roubo_
- `dl_2848_1940_art163` CAPÍTULO IV – Do Dano  **+ rubrica:** _Dano_
- `dl_2848_1940_art171` CAPÍTULO VI – Do Estelionato e Outras Fraudes  **+ rubrica:** _Estelionato_
- `dl_2848_1940_art180` CAPÍTULO VII – Da Receptação  **+ rubrica:** _Receptação_

### curadoria — 10

- `dl_2848_1940_art1` TÍTULO I – Da Aplicação da Lei Penal  **+ rubrica:** _Anterioridade da Lei_
- `dl_2848_1940_art26` TÍTULO III – Da Imputabilidade Penal  **+ rubrica:** _Inimputáveis_
- `dl_2848_1940_art138` CAPÍTULO V – Dos Crimes contra a Honra  **+ rubrica:** _Calúnia_
- `dl_2848_1940_art213` CAPÍTULO I – Dos Crimes contra a Liberdade Sexual  **+ rubrica:** _Estupro_
- `dl_2848_1940_art217` CAPÍTULO II – Dos Crimes Sexuais contra Vulnerável  **+ rubrica:** _Sedução_
- `dl_2848_1940_art235` CAPÍTULO I – Dos Crimes contra o Casamento  **+ rubrica:** _Bigamia_
- `dl_2848_1940_art250` CAPÍTULO I – Dos Crimes de Perigo Comum  **+ rubrica:** _Incêndio_
- `dl_2848_1940_art267` CAPÍTULO III – Dos Crimes contra a Saúde Pública  **+ rubrica:** _Epidemia_
- `dl_2848_1940_art312` CAPÍTULO I – Dos Crimes Praticados por Funcionário Público contra a Administração em Geral  **+ rubrica:** _Peculato_
- `dl_2848_1940_art359-r` CAPÍTULO IV – Dos Crimes contra o Funcionamento dos Serviços Essenciais  **+ rubrica:** _Sabotagem_

## Fronteira de bloco corrigida (curadoria) — 11

- `lei_11343_2006_art23-a_p8`
  …gilo das informações disponíveis no sistema referido no[- ∅ -][+ § 7o e o acesso será permitido apenas às pessoas autorizadas a conhecê-las, sob pena de responsabilidade. +]
- `lei_11343_2006_art37_caput`
  … de qualquer dos crimes previstos nos arts. 33, caput e[- ∅ -][+ § 1o, e 34 desta Lei: Pena – reclusão, de 2 (dois) a 6 (seis) anos, e pagamento de 300 (trezentos) a 700 (setecentos) dias-multa. +]
- `lei_11343_2006_art60-a_p3`
  … sobre o destino da moeda estrangeira a que se refere o[- ∅ -][+ § 2o deste artigo, caso seja verificada a inexistência de valor de mercado, seus espécimes poderão ser destruídos ou doados à representação diplomática do país de origem. +]
- `dl_2848_1940_art147-a_p1_inc2`
  … por razões da condição de sexo feminino, nos termos do[- ∅ -][+ § 2o-A do art. 121 deste Código; +]
- `dl_2848_1940_art186_inc4`
  …a condicionada à representação, nos crimes previstos no[- ∅ -][+ § 3o do art. 184. +]
- `dl_2848_1940_art218-b_p3`
  § 3o Na hipótese do inciso II do[- ∅ -][+ § 2o, constitui efeito obrigatório da condenação a cassação da licença de localização e de funcionamento do estabelecimento. Divulgação de cena de estupro ou de cena de estupro de vulnerável, de cena de sexo ou de pornografia +]
- `dl_2848_1940_art234-b_p2`
  …elecido o sigilo sobre as informações a que se refere o[- ∅ -][+ § 1o deste artigo. +]
- `dl_2848_1940_art293_p4`
  …ados ou alterados, a que se referem este artigo e o seu[- ∅ -][+ § 2o, depois de conhecer a falsidade ou alteração, incorre na pena de detenção, de seis meses a dois anos, ou multa. +]
- `dl_3689_1941_art28-a_p7`
  … quando não for realizada a adequação a que se refere o[- ∅ -][+ § 5o deste artigo. +]
- `dl_3689_1941_art709_p3`
  § 3o Não se aplicará o disposto no[- ∅ -][+ § 2o, quando houver sido imposta ou resultar de condenação pena acessória consistente em interdição de direitos. +]
- `dl_3689_1941_art800_p2`
  … vista, salvo para a interposição do recurso (art. 798,[- ∅ -][+ § 5o). +]

## Nota do Editor removida do texto legal (curadoria) — 42

- `lei_11343_2006_art37_caput`
  … como informante, com grupo, organização ou associação [- 1 Nota do Editor (NE): ver ADI no 4.274. 2 NE: ver Resolução do Senado Federal no 5/2012. -][+ ∅ +]destinados à prática de qualquer dos crimes previstos n…
- `dl_2848_1940_art24_p2`
  …açado, a pena poderá ser reduzida de um a dois terços. [- 1 Nota do Editor (NE): ver ADPF no 779. -][+ ∅ +]Legítima defesa
- `dl_2848_1940_art28_p1`
  …da omissão, inteiramente incapaz de entender o caráter [- 2 NE: ver ADPF no 779. 3 NE: ver ADPF no 779. -][+ ∅ +]ilícito do fato ou de determinar-se de acordo com esse …
- `dl_2848_1940_art55_caput`
  … substituída, ressalvado o disposto no § 4o do art. 46.[- 4 NE: ver ADIs nos 3.150 e 7.032. -][+ ∅ +]
- `dl_2848_1940_art60_p2`
  …ritérios dos incisos II e III do art. 44 deste Código. [- 5 NE: ver ADPF no 1.107. -][+ ∅ +]Circunstâncias agravantes
- `dl_2848_1940_art91-a_p1_inc2`
  …erceiros a título gratuito ou mediante contraprestação [- 6 NE: ver ADPF no 569. -][+ ∅ +]irrisória, a partir do início da atividade criminal.
- `dl_2848_1940_art128_inc1`
  se não há outro meio de salvar a vida da gestante; [- 7 no NE: ver ADPF 54. 8 NE: ver ADPF no 54. 9 NE: ver ADPF no 54. -][+ ∅ +]Aborto no caso de gravidez resultante de estupro
- `dl_2848_1940_art129_p5_inc2`
  se as lesões são recíprocas. [- 10 NE: conforme determinação do art. 2o da Lei no 7.209/1984, em razão do cancelamento das referências a valores de multas, a expressão “multa de” foi substituída por “multa”. -][+ ∅ +]Lesão corporal culposa
- `dl_2848_1940_art273_p1-b_inc5`
  de procedência ignorada;[- 11 NE: a ordem de apresentação dos parágrafos deste artigo obedece à publicação original. -][+ ∅ +]
- `dl_2848_1940_art289_caput`
  …ificar, fabricando-a ou alterando-a, moeda metálica ou [- 12 NE: ver ADPF no 187. -][+ ∅ +]papel-moeda de curso legal no país ou no estrangeiro: P…
- `dl_2848_1940_art291_caput`
  …bjeto especialmente destinado à falsificação de moeda: [- 13 NE: o valor máximo da multa foi suprimido conforme o estabelecido pelo art. 2o da Lei no 7.209/1984, que determinou o cancelamento das referências a valores de multas. -][+ ∅ +]Pena – reclusão, de dois a seis anos, e multa. Emissão …
- `dl_3689_1941_art3-a_caput`
  …dadas a iniciativa do juiz na fase de investigação e a [- 1 Nota do Editor (NE): os artigos mencionados são os da Constituição de 1937. 2 NE: o artigo mencionado é o da Constituição de 1937. 3 NE: ver ADPF no 130. -][+ ∅ +]substituição da atuação probatória do órgão de acusação…
- `dl_3689_1941_art3-b_inc9`
  …ento razoável para sua instauração ou prosseguimento;10[- 4 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 5 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 6 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 7 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 8 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 9 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 10 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. -][+ ∅ +]
- `dl_3689_1941_art3-b_p2`
  …oderá, mediante representação da autoridade policial e [- 11 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 12 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. -][+ ∅ +]ouvido o Ministério Público, prorrogar, uma única vez, …
- `dl_3689_1941_art3-e_caput`
  …normas de organização judiciária da União, dos Estados [- 13 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 14 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 15 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 16 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 17 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 18 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 19 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 20 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. -][+ ∅ +]e do Distrito Federal, observando critérios objetivos a…
- `dl_3689_1941_art5_p2`
  …ra de inquérito caberá recurso para o chefe de Polícia.[- 21 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 22 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. -][+ ∅ +]
- `dl_3689_1941_art28-a_inc5`
  …roporcional e compatível com a infração penal imputada.[- 23 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. 24 NE: ver ADIs nos 6.298, 6.299, 6.300 e 6.305. -][+ ∅ +]
- `dl_3689_1941_art69_inc2`
  o domicílio ou residência do réu;[- 25 NE: ver ADPF no 779. -][+ ∅ +]
- `dl_3689_1941_art80_caput`
  …hes prolongar a prisão provisória, ou por outro motivo [- 26 NE: os dispositivos mencionados são os do texto original do Código Penal. -][+ ∅ +]relevante, o juiz reputar conveniente a separação.
- `dl_3689_1941_art84_p1`
  …iciados após a cessação do exercício da função pública.[- 27 NE: ver ADIs nos 2.797 e 2.860. -][+ ∅ +]

_(22 omitidas — `npm run audit -- --tudo`)_

## Marcador de nota de rodapé removido — 58

- `lei_11343_2006_art33_p4`
  …tividades criminosas nem integre organização criminosa.[- 2 -][+ ∅ +]
- `dl_2848_1940_art23_inc2`
  em legítima defesa;[- 1 -][+ ∅ +]
- `dl_2848_1940_art25_caput`
  …gressão, atual ou iminente, a direito seu ou de outrem.[- 2 -][+ ∅ +]
- `dl_2848_1940_art25_pu`
  …são a vítima mantida refém durante a prática de crimes.[- 3 -][+ ∅ +]
- `dl_2848_1940_art51_caput`
  …ne às causas interruptivas e suspensivas da prescrição.[- 4 -][+ ∅ +]
- `dl_2848_1940_art59_caput`
  …ário e suficiente para reprovação e prevenção do crime:[- 5 -][+ ∅ +]
- `dl_2848_1940_art91_inc2_alb`
  …o auferido pelo agente com a prática do fato criminoso.[- 6 -][+ ∅ +]
- `dl_2848_1940_art128_caput`
  Não se pune o aborto praticado por médico:[- 9 -][+ ∅ +]
- `dl_3689_1941_art1_inc5`
  os processos por crimes de imprensa.[- 3 -][+ ∅ +]
- `dl_3689_1941_art3-a_caput`
  …ubstituição da atuação probatória do órgão de acusação.[- 4 -][+ ∅ +]
- `dl_3689_1941_art3-b_caput`
  …évia do Poder Judiciário, competindo-lhe especialmente:[- 5 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc4`
  … sobre a instauração de qualquer investigação criminal;[- 6 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc6`
  …osto neste Código ou em legislação especial pertinente;[- 7 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc7`
  …raditório e a ampla defesa em audiência pública e oral;[- 8 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc8`
  …e policial e observado o disposto no § 2º deste artigo;[- 9 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc9`
  …amento razoável para sua instauração ou prosseguimento;[- 10 -][+ ∅ +]
- `dl_3689_1941_art3-b_inc14`
  …enúncia ou queixa, nos termos do art. 399 deste Código;[- 11 -][+ ∅ +]
- `dl_3689_1941_art3-b_p1`
  …gado constituído, vedado o emprego de videoconferência.[- 12 -][+ ∅ +]
- `dl_3689_1941_art3-b_p2`
  …ão for concluída, a prisão será imediatamente relaxada.[- 13 -][+ ∅ +]
- `dl_3689_1941_art3-c_caput`
  …a denúncia ou queixa na forma do art. 399 deste Código.[- 14 -][+ ∅ +]

_(38 omitidas — `npm run audit -- --tudo`)_

## Divisor estrutural removido do fim do dispositivo — 2

- `dl_2848_1940_art120_caput`
  …cial não será considerada para efeitos de reincidência.[- PARTE ESPECIAL -][+ ∅ +]
- `dl_2848_1940_art359-u_caput`
  (Vetado)[- DISPOSIÇÕES FINAIS -][+ ∅ +]

## Rubrica marginal removida do fim do dispositivo — 385

`[- removido -]` sai do dispositivo e vira a rubrica do dispositivo em **→**.

- `dl_2848_1940_art1_caput`
  …r que o defina. Não há pena sem prévia cominação legal.[- Lei penal no tempo -][+ ∅ +]
  → rubrica _"Lei penal no tempo"_ para `dl_2848_1940_art2_caput`
- `dl_2848_1940_art2_pu`
  …ididos por sentença condenatória transitada em julgado.[- Lei excepcional ou temporária -][+ ∅ +]
  → rubrica _"Lei excepcional ou temporária"_ para `dl_2848_1940_art3_caput`
- `dl_2848_1940_art3_caput`
  …aram, aplica-se ao fato praticado durante sua vigência.[- Tempo do crime -][+ ∅ +]
  → rubrica _"Tempo do crime"_ para `dl_2848_1940_art4_caput`
- `dl_2848_1940_art4_caput`
  …u omissão, ainda que outro seja o momento do resultado.[- Territorialidade -][+ ∅ +]
  → rubrica _"Territorialidade"_ para `dl_2848_1940_art5_caput`
- `dl_2848_1940_art5_p2`
  …ondente, e estas em porto ou mar territorial do Brasil.[- Lugar do crime -][+ ∅ +]
  → rubrica _"Lugar do crime"_ para `dl_2848_1940_art6_caput`
- `dl_2848_1940_art6_caput`
  …mo onde se produziu ou deveria produzir-se o resultado.[- Extraterritorialidade -][+ ∅ +]
  → rubrica _"Extraterritorialidade"_ para `dl_2848_1940_art7_caput`
- `dl_2848_1940_art8_caput`
  …quando diversas, ou nela é computada, quando idênticas.[- Eficácia de sentença estrangeira -][+ ∅ +]
  → rubrica _"Eficácia de sentença estrangeira"_ para `dl_2848_1940_art9_caput`
- `dl_2848_1940_art10_caput`
  …m-se os dias, os meses e os anos pelo calendário comum.[- Frações não computáveis da pena -][+ ∅ +]
  → rubrica _"Frações não computáveis da pena"_ para `dl_2848_1940_art11_caput`
- `dl_2848_1940_art11_caput`
  …es de dia, e, na pena de multa, as frações de cruzeiro.[- Legislação especial -][+ ∅ +]
  → rubrica _"Legislação especial"_ para `dl_2848_1940_art12_caput`
- `dl_2848_1940_art13_caput`
  …o ou omissão sem a qual o resultado não teria ocorrido.[- Superveniência de causa independente -][+ ∅ +]
  → rubrica _"Superveniência de causa independente"_ para `dl_2848_1940_art13_p1`
- `dl_2848_1940_art13_p1`
  … anteriores, entretanto, imputam-se a quem os praticou.[- Relevância da omissão -][+ ∅ +]
  → rubrica _"Relevância da omissão"_ para `dl_2848_1940_art13_p2`
- `dl_2848_1940_art14_caput`
  Diz-se o crime:[- Crime consumado -][+ ∅ +]
  → rubrica _"Crime consumado"_ para `dl_2848_1940_art14_inc1`
- `dl_2848_1940_art14_inc1`
  …le se reúnem todos os elementos de sua definição legal;[- Tentativa -][+ ∅ +]
  → rubrica _"Tentativa"_ para `dl_2848_1940_art14_inc2`
- `dl_2848_1940_art14_inc2`
  …consuma por circunstâncias alheias à vontade do agente.[- Pena de tentativa -][+ ∅ +]
  → rubrica _"Pena de tentativa"_ para `dl_2848_1940_art14_pu`
- `dl_2848_1940_art14_pu`
  …ente ao crime consumado, diminuída de um a dois terços.[- Desistência voluntária e arrependimento eficaz -][+ ∅ +]
  → rubrica _"Desistência voluntária e arrependimento eficaz"_ para `dl_2848_1940_art15_caput`
- `dl_2848_1940_art15_caput`
  …ltado se produza, só responde pelos atos já praticados.[- Arrependimento posterior -][+ ∅ +]
  → rubrica _"Arrependimento posterior"_ para `dl_2848_1940_art16_caput`
- `dl_2848_1940_art16_caput`
  …io do agente, a pena será reduzida de um a dois terços.[- Crime impossível -][+ ∅ +]
  → rubrica _"Crime impossível"_ para `dl_2848_1940_art17_caput`
- `dl_2848_1940_art18_caput`
  Diz-se o crime:[- Crime doloso -][+ ∅ +]
  → rubrica _"Crime doloso"_ para `dl_2848_1940_art18_inc1`
- `dl_2848_1940_art18_inc1`
  …ente quis o resultado ou assumiu o risco de produzi-lo;[- Crime culposo -][+ ∅ +]
  → rubrica _"Crime culposo"_ para `dl_2848_1940_art18_inc2`
- `dl_2848_1940_art18_pu`
  …revisto como crime, senão quando o pratica dolosamente.[- Agravação pelo resultado -][+ ∅ +]
  → rubrica _"Agravação pelo resultado"_ para `dl_2848_1940_art19_caput`

_(365 omitidas — `npm run audit -- --tudo`)_

## Ordinal normalizado — 179

- `lei_11343_2006_art5_inc4`
  …ão e a articulação das atividades de que trata o art. 3[- o -][+ º +] desta Lei.
- `lei_11343_2006_art19-a_p1_inc6`
  mobilização dos sistemas de ensino previstos na Lei n[- o -][+ º +] 9.394, de 20 de dezembro de 1996 – Lei de Diretrizes e…
- `lei_11343_2006_art23-a_p8`
  … das informações disponíveis no sistema referido no § 7[- o -][+ º +] e o acesso será permitido apenas às pessoas autorizada…
- `lei_11343_2006_art23-a_p10`
  …al deverão observar, no que couber, o previsto na Lei n[- o -][+ º +] 10.216, de 6 de abril de 2001, que dispõe sobre a prot…
- `lei_11343_2006_art23-b_p3`
  …o civil, administrativa e criminal, nos termos da Lei n[- o -][+ º +] 8.069, de 13 de julho de 1990 – Estatuto da Criança e …
- `lei_11343_2006_art29_caput`
  … da medida educativa a que se refere o inciso II do § 6[- o -][+ º +] do art. 28, o juiz, atendendo à reprovabilidade da con…
- `lei_11343_2006_art29_pu`
  …decorrentes da imposição da multa a que se refere o § 6[- o -][+ º +] do art. 28 serão creditados à conta do Fundo Nacional …
- `lei_11343_2006_art32_p3`
  …as à proteção ao meio ambiente, o disposto no Decreto n[- o -][+ º +] 2.661, de 8 de julho de 1998, no que couber, dispensad…
- `lei_11343_2006_art33_p4`
  Nos delitos definidos no caput e no § 1[- o -][+ º +] deste artigo, as penas poderão ser reduzidas de um sex…
- `lei_11343_2006_art35_caput`
  …qualquer dos crimes previstos nos arts. 33, caput e § 1[- o -][+ º +], e 34 desta Lei: Pena – reclusão, de 3 (três) a 10 (de…
- `lei_11343_2006_art36_caput`
  …qualquer dos crimes previstos nos arts. 33, caput e § 1[- o -][+ º +], e 34 desta Lei: Pena – reclusão, de 8 (oito) a 20 (vi…
- `lei_11343_2006_art37_caput`
  …qualquer dos crimes previstos nos arts. 33, caput e § 1[- o -][+ º +], e 34 desta Lei: Pena – reclusão, de 2 (dois) a 6 (sei…
- `lei_11343_2006_art44_caput`
  Os crimes previstos nos arts. 33, caput e § 1[- o -][+ º +], e 34 a 37 desta Lei são inafiançáveis e insuscetíveis…
- `lei_11343_2006_art48_p1`
  …do e julgado na forma dos arts. 60 e seguintes da Lei n[- o -][+ º +] 9.099, de 26 de setembro de 1995, que dispõe sobre os …
- `lei_11343_2006_art48_p3`
  …a autoridade judicial, as providências previstas no § 2[- o -][+ º +] deste artigo serão tomadas de imediato pela autoridade…
- `lei_11343_2006_art48_p4`
  Concluídos os procedimentos de que trata o § 2[- o -][+ º +] deste artigo, o agente será submetido a exame de corpo…
- `lei_11343_2006_art48_p5`
  Para os fins do disposto no art. 76 da Lei n[- o -][+ º +] 9.099, de 1995, que dispõe sobre os Juizados Especiais…
- `lei_11343_2006_art49_caput`
  …do-se de condutas tipificadas nos arts. 33, caput e § 1[- o, e 34 a 37 desta Lei, o juiz, sempre que as circunstâncias o recomendem, empregará os instrumentos protetivos de colaboradores e testemunhas previstos na Lei no -][+ º, e 34 a 37 desta Lei, o juiz, sempre que as circunstâncias o recomendem, empregará os instrumentos protetivos de colaboradores e testemunhas previstos na Lei nº +] 9.807, de 13 de julho de 1999.
- `lei_11343_2006_art50_p2`
  O perito que subscrever o laudo a que se refere o § 1[- o -][+ º +] deste artigo não ficará impedido de participar da elab…
- `lei_11343_2006_art50_p5`
  …is de efetivada a destruição das drogas referida no § 3[- o -][+ º +], sendo lavrado auto circunstanciado pelo delegado de p…

_(159 omitidas — `npm run audit -- --tudo`)_
