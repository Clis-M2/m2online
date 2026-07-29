# Runtime WhatsApp de Teste — Emy V2

## Objetivo

Permitir que Clistenis valide a Emy V2 pelo WhatsApp de teste antes de qualquer produção automática.

## Escopo inicial

- Financeiro read-only.
- Consulta SGP por CPF/CNPJ informado na conversa.
- Retorno de Pix, boleto, linha digitável e link de pagamento quando houver fatura aberta.
- Envio permitido somente para número allowlist.
- Nenhuma escrita no SGP.
- Nenhum envio para cliente real fora do teste.

## Configuração obrigatória

```env
AUTO_SEND_TO_CUSTOMER=true
SGP_WRITE_ENABLED=false
LOG_REDACTION=true
EMY_TEST_MODE=true
EMY_TEST_WHATSAPP_ALLOWLIST=5581XXXXXXXXX
EMY_TEST_PORT=3333
```

> Observação: `AUTO_SEND_TO_CUSTOMER=true` só é aceitável neste runtime porque `EMY_TEST_MODE=true` e `EMY_TEST_WHATSAPP_ALLOWLIST` limitam o destinatário. Se a allowlist estiver vazia, o envio é bloqueado.

## Rodar localmente

```bash
npm run dev:whatsapp-test
```

Healthcheck:

```bash
curl http://localhost:3333/health
```

Webhook Evolution:

```text
POST /webhooks/evolution
```

## Mensagem de teste sugerida

```text
Quero o boleto e o Pix do CPF 031.346.044-26
```

## Travas de segurança

O runtime bloqueia envio quando:

- `AUTO_SEND_TO_CUSTOMER` não está `true`;
- `EMY_TEST_MODE` não está `true`;
- `EMY_TEST_WHATSAPP_ALLOWLIST` está vazio;
- o remetente/destinatário não está na allowlist;
- a mensagem não tem texto suportado.

## Fora do escopo

- promessa/liberação em confiança;
- abertura de OS;
- baixa de título;
- alteração cadastral;
- resposta para clientes reais;
- produção sem deploy/rollback/observabilidade.
