# Regras Operacionais — Emy V2

## Financeiro

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
