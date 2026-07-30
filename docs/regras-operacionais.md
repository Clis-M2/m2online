# Regras Operacionais — Emy V2

## Financeiro

### Consulta de faturas em um ou vários contratos

Decisão de Clistenis em 2026-07-30: se uma ou mais faturas estiverem no CPF/CNPJ confirmado, a Emy V2 deve tratar como fatura do cliente, mesmo quando houver mais de um contrato.

Regras:

- CPF/CNPJ é obrigatório antes de expor dados financeiros.
- Se o CPF/CNPJ vier na primeira mensagem, a Emy não deve pedir novamente no mesmo atendimento; deve consultar direto.
- Se houver uma fatura aberta, responder de forma curta e enviar o meio solicitado: Pix, link/QRCode ou ambos.
- Se houver várias faturas abertas em contratos diferentes do mesmo CPF/CNPJ, listar todas de forma objetiva e enviar os meios de pagamento correspondentes.
- A resposta deve ser humana, simples e sem excesso de texto.

### Fatura ainda não gerada e pagamento antecipado

Decisão de Clistenis em 2026-07-30: quando não houver fatura aberta e o próximo vencimento estiver a mais de 15 dias, a Emy deve explicar que a fatura provavelmente ainda não foi gerada pelo sistema.

Fluxo esperado:

1. Cliente pede pagamento/fatura.
2. Emy confirma CPF/CNPJ, se ainda não tiver sido informado.
3. Emy consulta faturas abertas no SGP.
4. Se não houver fatura aberta, estima o próximo vencimento pelo histórico disponível.
5. Se faltarem mais de 15 dias, informa ao cliente que a fatura provavelmente ainda não foi gerada.
6. Se o cliente quiser pagar antecipado mesmo assim, a Emy deve:
   - informar ao cliente que a equipe financeira vai gerar o boleto e enviar o quanto antes;
   - acionar humano no grupo interno do WhatsApp com cliente, WhatsApp, documento mascarado e contexto.

Mensagem-base ao cliente quando não houver fatura:

> Consultei aqui e não encontrei fatura em aberto no momento. Como ainda faltam mais de 15 dias para o próximo vencimento, é provável que essa fatura ainda não tenha sido gerada pelo sistema. Se você quiser pagar antecipado mesmo assim, me sinaliza por aqui que eu aviso a equipe para gerar o boleto para você.

Mensagem-base ao cliente quando ele insistir no pagamento antecipado:

> Sem problema. Vou avisar a equipe financeira para gerar o boleto antecipado. Assim que estiver pronto, enviamos para você por aqui.

Pendência operacional: configurar `FINANCE_HUMAN_GROUP_JID` e habilitar `FINANCE_HUMAN_ESCALATION_ENABLED=true` somente após Clistenis confirmar o grupo correto.

### Follow-up financeiro

Decisão de Clistenis em 2026-07-30: a conversa financeira não deve morrer quando o cliente demora, mas a Emy também não deve ser insistente ou parecer cobrança automática agressiva.

Regras implementadas:

- Quando a Emy pede CPF/CNPJ e o cliente não responde:
  - 1º lembrete após 10 minutos;
  - 2º lembrete após 45 minutos;
  - após 2 horas sem retorno, marcar como `abandoned_waiting_document`, registrar nota no Chatwoot e não chamar humano.
- Quando a Emy envia Pix ou Pix + link:
  - verificar SGP após 15 minutos;
  - se não baixou, verificar novamente após 45 minutos;
  - se ainda não baixou, enviar apenas 1 lembrete cordial.
- Quando a Emy envia boleto/link:
  - verificar SGP no dia seguinte;
  - verificar novamente após até 3 dias;
  - se não baixou, enviar apenas 1 lembrete cordial informando prazo de compensação.
- Se o SGP confirmar pagamento, a Emy avisa o cliente, marca follow-up como concluído, registra nota no Chatwoot e marca o atendimento como seguro para encerrar.
- A checagem de pagamento usa o ID da fatura, não CPF/CNPJ cru.
- Follow-ups são registrados dentro de `conversation_state.recent_context.followup` no Supabase.

### Ritmo humano de resposta no WhatsApp

Decisão de Clistenis em 2026-07-30: a Emy não deve responder de forma instantânea no WhatsApp, porque isso assusta o cliente e pode interromper quem ainda está escrevendo ou enviando áudio.

Regras implementadas:

- Primeira resposta ao cliente: aguardar entre 20 e 30 segundos (`EMY_FIRST_RESPONSE_DELAY_MIN_MS=20000`, `EMY_FIRST_RESPONSE_DELAY_MAX_MS=30000`).
- Mensagens separadas na mesma resposta: aguardar 5 segundos entre elas (`EMY_BETWEEN_MESSAGES_DELAY_MS=5000`).
- Se o cliente enviar outra mensagem durante a espera, a resposta antiga é cancelada por debounce e a Emy processa a mensagem mais recente.
- Presença “digitando” deve ser enviada quando suportada pela Evolution API (`EMY_TYPING_PRESENCE_ENABLED=true`), mas é best-effort: se o endpoint não responder, o envio da mensagem não pode falhar por causa disso.
- Alertas internos para grupo da equipe não precisam seguir esse atraso humano; são operacionais.

### Segurança financeira e validação de identidade

Decisão de segurança: a validação de CPF/CNPJ no atendimento financeiro não é permanente.

Regras implementadas:

- A validação de CPF/CNPJ expira após 30 minutos por padrão (`EMY_DOCUMENT_VALIDATION_TTL_MS=1800000`).
- Após expirar, a Emy deve pedir o CPF/CNPJ novamente antes de reenviar Pix, link, boleto, linha digitável ou dados financeiros.
- A Emy permite no máximo 3 tentativas inválidas de CPF/CNPJ (`EMY_MAX_DOCUMENT_ATTEMPTS=3`).
- Após exceder o limite, a Emy não insiste nem expõe dados; encaminha para humano por segurança.
- Eventos financeiros relevantes devem ser registrados no Supabase com dados mascarados.
- Logs persistidos não devem salvar Pix copia e cola, linha digitável, link de pagamento, código de barras ou CPF/CNPJ cru.

Mensagem-base quando a validação expira:

> Por segurança preciso confirmar o CPF/CNPJ novamente. A validação anterior expirou, e eu não quero expor dados financeiros sem confirmar o titular.

Mensagem-base após tentativas inválidas:

> Não consegui validar o CPF/CNPJ com segurança. Para proteger seus dados, vou encaminhar esse atendimento para uma pessoa da equipe conferir com você.

### Promessa de pagamento

Decisão de Clistenis em 2026-07-29: atendimentos simples de promessa de pagamento devem ser resolvidos pela Emy V2 sem chamar humano.

A Emy V2 pode resolver automaticamente quando todos os critérios forem verdadeiros:

- cliente pede promessa de pagamento ou restabelecimento por promessa;
- identidade do titular está validada pelo dado mínimo exigido pela regra da M2;
- contrato localizado com segurança no SGP;
- sistema permite registrar promessa de pagamento;
- data solicitada está dentro da política aprovada da M2;
- não há bloqueio especial, negociação sensível, contestação, ameaça de cancelamento ou conflito;
- ação executada no SGP retorna sucesso;
- Emy registra log/auditoria e informa claramente ao cliente o resultado.

Fluxo esperado:

1. Identificar intenção: `financeiro.promessa_pagamento`.
2. Validar identidade mínima.
3. Consultar cliente/contrato/títulos no SGP.
4. Validar se a data solicitada é permitida.
5. Registrar promessa de pagamento no SGP.
6. Confirmar ao cliente: data, condição e limite.
7. Registrar resumo no Chatwoot.
8. Encerrar somente se não houver nova dúvida do cliente.

Mensagem-base:

> Pronto, registrei sua promessa de pagamento para DD/MM. Seu acesso ficará restabelecido até essa data, conforme a política da M2. Se precisar de mais alguma coisa, me avisa por aqui.

### Quando escalar para humano

Escalar para humano quando ocorrer qualquer uma das condições abaixo:

- cliente pede data fora da política permitida;
- SGP bloqueia ou retorna erro;
- cliente já teve promessa recente e excedeu limite;
- há contestação de valor, pagamento não reconhecido ou cobrança indevida;
- cliente está irritado, ameaça cancelar ou relata prejuízo;
- titularidade/identidade não pôde ser validada;
- existe risco de exceção comercial/financeira;
- a ação exigiria liberação manual fora da regra.

### Estado atual de implementação

Na POC atual, Financeiro ainda está em modo read-only + resposta assistida. A regra acima define o alvo operacional, mas a execução automática só deve ser habilitada depois de adapter SGP seguro, testes e aprovação explícita.
