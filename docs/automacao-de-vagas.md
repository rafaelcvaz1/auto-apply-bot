# Ciclo de busca e candidaturas

Na raiz do projeto, com as dependências instaladas, o perfil profissional e o arquivo privado de respostas configurados conforme o README, execute:

```sh
npm run radar
```

No PowerShell use `npm.cmd run radar`. O comando coleta os anúncios, reavalia o histórico com o perfil atual, executa o planejamento e imprime o caminho de um relatório privado em `private/radar/`. Cada execução tem seu próprio arquivo. O campo `sources` descreve a coleta atual. `opportunities` inclui o histórico processado, inclusive se a coleta falhar. Código de saída 1 indica falha parcial ou total. A lista traz a situação e as pendências de cada vaga. Os estados do simulador e o contador de envios se referem apenas à execução local.

## Prompt reutilizável para o ChatGPT com conectores

> Busque vagas abertas da área descrita no meu perfil privado, incluindo cargos com atividades equivalentes. Confirme o anúncio original, o prazo, a empregadora, os requisitos e o canal indicado para a vaga. Aplique minhas regras de contrato, remuneração, formação e localização. Use meu currículo vigente e minhas respostas confirmadas. Envie pelo Gmail quando o anúncio solicitar currículo para um endereço específico. Use formulários quando o canal permitir a automação e todas as respostas obrigatórias estiverem confirmadas. Quando faltar informação ou acesso, guarde o link e a pergunta exata. Consulte o histórico e a pasta Enviados antes do envio. Se o resultado da tentativa for incerto, confira o comprovante antes de repeti-la. Traga os envios com identificador, pendências e falhas por fonte. Mantenha currículo e histórico de envios em armazenamento privado. Use somente os serviços autorizados e o orçamento que eu especificar.

No ChatGPT, acrescente as preferências e o arquivo de currículo à configuração privada da tarefa. As conexões do ChatGPT com Gmail e outros serviços pertencem à tarefa que as utiliza. O comando local pode ser executado de forma independente e termina após gerar o relatório. Para testar o comando de coordenação, execute `node --test scripts/radar.check.mjs`.
