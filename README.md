# Radar de oportunidades em Dados e Estatística

Painel pessoal local para coletar fontes públicas, comparar requisitos e revisar oportunidades. Não realiza candidaturas, uploads, preenchimento de formulários ou envio de mensagens. O entrypoint antigo de automação está desativado e não é importado pelo processo do painel.

## Executar

Use Node.js 24 LTS, versão recomendada em `.node-version` (mínimo 24.5 para o proxy nativo). Na raiz do projeto:

```sh
npm ci
npm run typecheck
npm run test:run
# Apenas na primeira instalação; depois personalize com fatos verificados:
cp config/search-profile.example.json config/search-profile.local.json
npm start
```

No Windows PowerShell, use `npm.cmd` e `Copy-Item` no lugar de `cp`. Não substitua um perfil local já existente. O perfil de exemplo é um modelo anônimo, não um currículo real e não é carregado automaticamente. Testes usam esse modelo explicitamente e bancos isolados em memória, sem gravar exemplos no painel. `better-sqlite3` tem componentes nativos; em sistemas sem binário compatível, a instalação pode precisar de Python e compilador C++.

Abra `http://127.0.0.1:3000` no computador que executa o app. Em ambiente Cloud, essa URL é interna; use o desktop compartilhado ou encaminhamento privado de porta. O servidor restringe Host e Origin a loopback e não deve ser exposto publicamente. `Ctrl+C` encerra o serviço.

`npm start`, `npm run dev` e `npm run collect` usam `node --use-env-proxy`, preservando HTTP_PROXY, HTTPS_PROXY, NO_PROXY e as CAs do ambiente. Não desative TLS. Não é necessário criar `.env`; `.env.example` documenta as opções locais:

| Variável | Padrão |
|---|---|
| SEARCH_PROFILE | config/search-profile.local.json |
| SEARCH_SOURCES | config/search-sources.json |
| SEARCH_DB | data/oportunidades.db |
| DASHBOARD_PORT | 3000 |

Execute a partir da raiz. Caminhos relativos partem do diretório de execução. Sem perfil privado válido, o app falha em vez de usar um perfil fictício. O startup reavalia o banco existente, mas não coleta automaticamente nem agenda tarefas.

## Perfil e privacidade

O perfil ativo, PDFs, banco SQLite, credenciais, logs e pareceres privados ficam fora do Git. O repositório contém apenas configuração pública das fontes e um modelo anônimo. Não coloque nome, contatos, vínculos pessoais, currículo ou segredos no modelo. Exportações incluem notas e devem ser tratadas como dados privados.

- `education`: situação declarada, instituição e previsão. A passagem do calendário não conclui a graduação automaticamente.
- `experience`: um objeto por vínculo, com organização, função, tipo, início e fim próprios. O cálculo de duração une somente intervalos sobrepostos, sem apagar a separação dos vínculos; não conta tempo acadêmico como experiência profissional. Tempo total não comprova experiência específica exigida pela vaga.
- `professionalEvidence`: atividades profissionais relatadas no documento fornecido, sem verificação independente. Uma lista conjunta não é atribuída automaticamente a cada vínculo.
- `skills`: conhecimentos declarados e, quando conhecido, nível e origem da evidência. Não inferir nível intermediário/avançado a partir da menção à ferramenta.
- `toConfirm`: detalhes ausentes, atribuição de atividades aos vínculos, níveis e resultados que precisam ser comprovados.
- `roles`: cargos prioritários e equivalentes em português/inglês. Títulos genéricos precisam de pelo menos duas evidências de atividades analíticas na descrição.
- `preferences`: remoto com contratação no Brasil e presença física nos municípios explicitamente configurados no Pará. Não usa raio que inclua outras cidades.

Após alterar o perfil, reavalie pelo botão ou reinicie. A versão SHA-256 do perfil e o horário acompanham cada avaliação. Favoritas, descartes e notas são preservados.

## Fontes públicas

Configure `config/search-sources.json`. As empresas iniciais na Gupy são Equatorial, AmazonCred e Unimed Belém (presença no Pará), Bancorbrás, Global Hitss, Lanlink e Grupo Boticário (pesquisa de oportunidades nacionais/remotas). A lista é um ponto de partida; não garante vaga aderente ou elegibilidade para Belém. Greenhouse/Nubank é uma fonte pública adicional; um feed vazio é diferente de falha de acesso.

| Fonte | Implementação e limites |
|---|---|
| Gupy por empresa | GET da página pública. Extrai os dados JSON embutidos e/ou links de vagas da própria empresa, sem executar scripts. Lê detalhes dos títulos prioritários e genéricos até `maxDetailsPerSource`. Usa modalidade, município, UF, país, prazo de inscrição e status públicos. Sem login e sem paginação oculta. Layout não reconhecido gera erro explícito. |
| Greenhouse | API pública `boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true`. Sem autenticação. Não presume contratação no Brasil pela existência de um escritório brasileiro. |
| Remotive | Feed internacional com atraso e cobertura limitada. Região remota inferida do campo de localização exigida e restrições na descrição. |
| Arbeitnow | Primeira página do feed internacional, predominantemente europeu. `remote=true` não comprova contratação no Brasil. |

Limites: resposta de até 15 MB, timeout configurável, até 2.000 itens por fonte e até 100 detalhes por empresa; as configurações iniciais são menores. Destinos de coleta são fixos e slugs são validados. Redirecionamentos HTTP são bloqueados; URLs importadas não são acessadas pelo servidor. As fontes são consultadas sequencialmente, sem repetição automática. Evite coletas sucessivas e respeite limites dos provedores.

Na rede restrita, libere exatamente os domínios das empresas configuradas, além de `remotive.com`, `www.arbeitnow.com` e `boards-api.greenhouse.io`. CONNECT 403 indica bloqueio de rede; HTTP 404, erro de formato e falha de detalhe são relatados separadamente. Zero recebido com sucesso não comprova ausência de oportunidades em todo o mercado.

Cada execução registra, por fonte: recebidas, aproveitadas (cargos/atividades relevantes), inválidas, excluídas por escopo, compatíveis, em revisão e incompatíveis. Aproveitadas incluem as incompatíveis, para transparência. Itens repetidos atualizam a mesma URL; não são necessariamente vagas novas. Erro de uma fonte não impede as demais nem apaga registros antigos. Limites atingidos e falhas nos detalhes são explicitados. O CLI retorna código 1 se qualquer fonte falhar, inclusive parcialmente em detalhes.

LinkedIn, Indeed, Gupy e Vagas.com também têm links de pesquisa manual gerados a partir do perfil. Links não contam como vagas encontradas; não há coleta autenticada, contorno de CAPTCHA ou envio.

## Elegibilidade e score

A avaliação usa campos estruturados e regras conservadoras na descrição, com trechos exibidos no detalhe. Não é um extrator semântico completo: informação não reconhecida fica para revisão. Pode ser necessário corrigir campos manualmente com evidência do anúncio.

- Restrições explícitas de país, residência ou presença fora dos municípios aceitos geram impedimento mesmo com alto score técnico.
- Presença desejada, modalidade contraditória ou país não confirmado exigem revisão; benefício genérico de home office não comprova trabalho remoto no Brasil.
- Diploma concluído obrigatório conflita com curso em andamento; formação apenas desejável ou que admite cursando não gera esse impedimento.
- Inglês fluente obrigatório conflita com inglês declarado avançado. Idioma ausente no currículo fica a confirmar, sem presumir incapacidade.
- Competência ausente no currículo exige confirmação, mesmo quando obrigatória na vaga. Nível conhecido abaixo de um mínimo obrigatório é evidência de incompatibilidade; nível desconhecido exige revisão.
- Datas/status de encerramento, experiência mínima superior ao período declarado e outros impedimentos explícitos são destacados. Equivalências e escopo da experiência precisam de leitura humana.
- Estágio exige confirmar matrícula, semestre, jornada e prazo até a formatura; trainee depende da janela do programa.

O score soma cargo/atividades (35), geografia (15), competências citadas (até 25), senioridade priorizada (10), período mínimo de experiência (5) e inglês estruturado (5). É afinidade explicável, não probabilidade de contratação. A ordenação padrão prioriza elegibilidade antes do score. Informações faltantes impedem confirmação automática de compatibilidade; nenhuma vaga é promovida apenas por citar ferramentas.

## Revisão e exportação

Filtre por texto, modalidade, elegibilidade, classificação pessoal, senioridade, fonte e score. Abra detalhes para ver evidências, justificativas, lacunas, incertezas, versão do perfil e anúncio original. Classificações pessoais: nova, favorita, revisar e descartada. A classificação pessoal é independente da elegibilidade calculada.

A importação recebe uma lista JSON de até 2.000 vagas e 2 MB, no formato `Job` documentado em `src/discovery/model.ts`. Apenas campos permitidos são persistidos; URLs precisam ser HTTP(S), sem credenciais. O lote é validado antes da gravação. Não inclua campos desconhecidos como se fossem confirmados. CSV/JSON exportam todas as vagas, independentemente dos filtros; células CSV perigosas são escapadas. A reimportação recalcula avaliações e não restaura a classificação pessoal em um banco novo.

O banco usa WAL. Para backup, pare o processo e preserve também os arquivos auxiliares pertinentes. Não lê nem migra o banco legado de candidaturas. CSP, token local, Host/Origin e renderização por textContent protegem o painel local; não substituem autenticação para uso público.

## Validação

```sh
npm run typecheck
npm run test:run
npm run collect
```

Os testes de rede das fontes usam respostas controladas para validar tratamento de erros; a coleta real é uma validação separada e seus resultados ficam no banco local. Não introduz dados demonstrativos no painel. O teste legado do SDK de Gemini permanece separado da aplicação ativa; não são necessárias chaves de Gemini para o painel ou a coleta.

## Regras de candidatura e simulação

`applicationRules` no perfil **privado** define contratos, exclusão de estágios (também históricos), origem brasileira, trabalho remoto integral, localização, salário CLT, benefícios e disponibilidade. Salário/benefícios omitidos não geram impedimento; exclusão explícita de benefício esperado exige revisão. Empresa com origem incerta exige revisão, sem presumir nacionalidade pela plataforma ou pelo endereço da vaga. Requisitos obrigatórios incompatíveis com informações confirmadas geram impedimento. Essas regras são reavaliadas sem apagar registros ou notas.

A graduação distingue situação atual (Cursando), previsão de término das atividades acadêmicas e previsão de colação. Interesses de desenvolvimento ficam separados das competências. Os vínculos profissionais permanecem separados, inclusive quando há transição no mesmo mês.

Use `npm run simulate` ou o botão **Simular planejamento local**. Preenchimento apenas local, pendências, prevenção de duplicatas e prévia de e-mail estão descritos em [Simulação de candidaturas](docs/simulacao-candidaturas.md). Nenhum envio real pode ser ativado nesta versão; as APIs de envio consultadas requerem credenciamento organizacional/parceiro que não foi confirmado para esta conta de candidato.
