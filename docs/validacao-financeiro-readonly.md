# Validação Financeiro Read-only — Emy V2

## Objetivo

Validar que a Emy V2 consegue consultar informações financeiras reais no SGP sem alterar dados, sem enviar mensagem ao cliente e sem executar ações sensíveis.

## Segurança

Travas obrigatórias no ambiente:

```env
AUTO_SEND_TO_CUSTOMER=false
SGP_WRITE_ENABLED=false
LOG_REDACTION=true
```

## Fluxo implementado

Comando local:

```bash
node apps/orchestrator/src/cli/payment-info.js <cpf-cnpj>
```

O comando:

1. carrega `.env.local`;
2. usa `SGP_APP` + `SGP_API_TOKEN`;
3. consulta `/api/ura/titulos/` em modo read-only;
4. filtra títulos abertos por CPF/CNPJ;
5. normaliza a primeira fatura aberta;
6. retorna resposta estruturada com formas de pagamento.

## Campos retornados para a Emy

- `response`
- `boleto_link`
- `link_pagamento`
- `linha_digitavel`
- `codigo_barras`
- `pix_copia_cola`
- `vencimento_atual`
- `vencimento_original`
- `dias_em_atraso`
- `valor_original`
- `valor_atual`
- `contrato`
- `fatura`

## Validação real realizada

Em 2026-07-29, foi usado um CPF real informado por Clistenis para validação controlada.

Resultado sanitizado:

- consulta SGP OK;
- 1 fatura aberta encontrada;
- contrato retornado: `12044`;
- fatura retornada: `160368`;
- vencimento: `2026-04-25`;
- valor original: `104.90`;
- valor atualizado: `130.25`;
- boleto/link disponível: sim;
- link de pagamento disponível: sim;
- linha digitável disponível: sim;
- código de barras disponível: sim;
- PIX copia e cola disponível: sim.

## Próximo passo técnico

Integrar esse adapter ao fluxo do orquestrador para substituir o mock do Financeiro, mantendo resposta assistida e `sentToCustomer=false`.

## Fora do escopo nesta etapa

- `liberarEmConfianca`;
- `abrirOS`;
- `enviafatura`;
- baixa/liquidação de título;
- qualquer escrita no SGP;
- qualquer envio automático para cliente real.
