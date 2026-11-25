# Planejamento local de candidaturas

Esta versão planeja o preenchimento e demonstra pendências e idempotência. Não transmite candidaturas, currículos, mensagens ou e-mails e não usa uma sessão autenticada. `submitReal()` sempre rejeita a operação. Não há variável de ambiente ou botão para ativar envio real.

## Executar

O perfil profissional continua no arquivo privado `config/search-profile.local.json`. As respostas ficam em `config/application-profile.local.json` (ou no caminho definido por APPLICATION_PROFILE), ambos ignorados pelo Git. O segundo arquivo contém:

- schemaVersion: 1;
- candidateKey: identificador estável privado, preservado entre execuções;
- contact: campos de contato efetivamente confirmados;
- baseAnswers: respostas pessoais confirmadas, indexadas por chaves semânticas;
- realSubmissionEnabled: false;
- emailDeliveryEnabled: false.

Não coloque segredos, contatos ou respostas pessoais no repositório. Mantenha o identificador estável para não perder a associação com os planejamentos anteriores.

```sh
npm run simulate
```

A saída JSON contém preenchimento local, perguntas pendentes, motivos de bloqueio, identificação de duplicatas e um resumo de e-mail. O painel também oferece **Simular planejamento local**. Nada é enviado ao provedor ou ao SMTP. O módulo legado de e-mail não é importado pelo simulador.

O formulário padrão é um **modelo local genérico**, não foi obtido ou validado em uma plataforma real. Para validar perguntas conhecidas localmente, APPLICATION_FORM pode apontar para uma lista JSON privada. Cada campo tem id, label, required e, opcionalmente, answerKey, type (text/number/boolean) e options. Os IDs são únicos; o mapeamento answerKey deve ser explícito, sem inferir resposta pelo texto livre da pergunta.

Chaves suportadas: full_name, email, phone, city, state, education_status, academic_completion_year, graduation_year, salary, availability, travel, driving_license, own_vehicle, work_sundays, weekday_nights, saturday_flexible, interest_in_job e as chaves presentes em baseAnswers. Um campo desconhecido obrigatório fica pendente. Valores negativos (false) continuam sendo respostas válidas. Opção ausente no formulário, pretensão PJ não definida, moeda/periodicidade salarial não suportada e aceite específico sem confirmação não são inventados.

A resposta de interesse usa uma atividade concreta e conhecimentos declarados. Ela é um rascunho local; não promove interesses de estudo para experiência comprovada. A resposta atual de graduação é Cursando; término das atividades e colação usam campos distintos.

## Estados e histórico

- blocked: impedimento de elegibilidade; dados pessoais não são preenchidos.
- pending: elegibilidade incerta ou pergunta obrigatória sem resposta confirmada.
- simulated_ready: somente o preenchimento local está pronto. Não significa candidatura enviada ou recebida.
- failed: reservado ao relatório de falhas, sem contar como envio.

Não existe estado de confirmação externa no simulador. receipt é null, realSubmission é false e o total de confirmadas é zero. O resumo de e-mail separa confirmadas, pendências, falhas e excluídas; sua entrega está desativada.

O SQLite mantém a tabela adicional application_simulations, sem alterar notas, favoritas, datas de descoberta ou histórico de coletas. A chave única reúne candidato, identidade da vaga e hash dos dados relevantes. Repetir a mesma simulação retorna o registro existente. Alterar perfil, respostas, requisitos ou formulário permite replanejar; isso nunca equivale a autorizar reenvio. URLs de tracking e rotas públicas alternativas da mesma vaga Gupy compartilham identidade.

Para uma integração futura, a prevenção de **envios** duplicados precisa de um registro separado por candidato/vaga, independente da versão de perfil. Antes de repetir uma tentativa com timeout, deverá reconciliar o resultado no provedor; não fazer retry cego de POST. A idempotência local demonstrada aqui não comprova idempotência de uma API externa.

## Pesquisa sobre envio autorizado

Documentação oficial consultada em 24/11/2026:

| Plataforma | O que a documentação oferece | Limite para uma conta pessoal de candidato |
|---|---|---|
| Gupy | Captação externa com token da plataforma, criação de applicationId e convite para a pessoa candidata aceitar/completar cadastro. | APIs dependem de acesso organizacional; criação de candidato manual ou convite não comprova candidatura concluída. |
| Greenhouse | Job Board API: consultas públicas e POST de candidatura autenticado com Job Board API Key. | A chave é gerenciada pela organização; o token público do board não é credencial de envio. |
| Lever | Postings API com POST autenticado por API key gerada por Super Admin. | O formulário hospedado é público, mas isso não concede acesso ao POST de integração. |
| SmartRecruiters | Application API para clientes/parceiros, perguntas, políticas e consulta de status. | Não foi confirmado credenciamento de integração disponível nesta conta pessoal. |

Fontes:

- [Gupy: autenticação](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o)
- [Gupy: captação externa e convite](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas)
- [Greenhouse: Job Board API](https://docs.greenhouse.io/job-board)
- [Greenhouse: criação da chave de integração](https://support.greenhouse.io/hc/en-us/articles/13446638483355-Create-a-job-board-API-key-for-an-integration)
- [Lever: documentação oficial](https://github.com/lever/postings-api#apply-to-a-job-posting)
- [SmartRecruiters: Application API](https://developers.smartrecruiters.com/docs/application-api-1)

Não foi confirmada uma integração viável para envio automático em nome de uma conta pessoal nesta rodada. Não foram testados POSTs nos provedores, endpoints internos ou credenciais de terceiros. Não é uma afirmação de que toda automação futura seja impossível: é o limite do acesso documentado e validado aqui.

## Condições para uma futura implementação

Se uma plataforma oferecer credenciamento autorizado para a finalidade e a conta, será necessário validar o escopo com o provedor, guardar as credenciais fora do repositório, ler o formulário real, mapear as perguntas e implementar os retornos documentados. Este planejamento não pede aprovação vaga por vaga: informações desconhecidas ficam pendentes para esclarecimento, conforme a regra do perfil.

O envio só poderá ser considerado confirmado com evidência de aceitação externa associada à vaga e ao candidato: protocolo/identificador retornado e estado documentado, ou outro comprovante oficial rastreável. Guardar horário, provedor, vaga, versão do formulário e comprovante; não tratar simulação, HTTP genérico, clique ou convite pendente como recebimento. Erros de validação viram pendências/falhas, e resultados incertos exigem reconciliação antes de nova tentativa. O resumo por e-mail deve listar apenas os envios com essa evidência em “confirmados”. Esta camada de envio e confirmação ainda não foi implementada.
