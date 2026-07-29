# SGP — URA Financeiro para Emy V2

Fonte: documentação pública Postman do SGP informada por Clistenis.

- Documentação geral: `https://documenter.getpostman.com/view/6682240/2sB34hHg2V`
- 2ª via de boleto: `https://documenter.getpostman.com/view/6682240/2sB34hHg2V#1d98c678-4cdf-4be5-b889-f3634b053a1a`

## Autenticação

A pasta URA aceita principalmente:

- `app`: nome da aplicação no SGP.
- `token`: token da aplicação no SGP.

Também existe Basic Auth com usuário/senha do SGP, mas para a Emy V2 a preferência inicial é `token_app` por ser mais controlável.

Variáveis no `.env.local`:

```env
SGP_API_URL=https://...
SGP_API_TOKEN=...
SGP_APP=...
SGP_AUTH_MODE=token_app
SGP_USERNAME=
SGP_PASSWORD=
```

## Endpoints financeiros principais

### 1. Fatura — Listar

```http
POST /api/ura/titulos/
```

Uso na Emy V2:

- consultar títulos abertos;
- validar se cliente tem fatura em aberto;
- obter link de boleto, linha digitável, código de barras, valor, vencimento e status;
- base para segunda via e negociação financeira assistida.

Parâmetros relevantes:

- `app` obrigatório;
- `token` obrigatório;
- `offset`;
- `limit`;
- `titulo_id`;
- `cliente_id`;
- `cpfcnpj`;
- `contrato`;
- `status`: `abertos`, `pagos`, `cancelados`;
- `data_vencimento_inicio` / `data_vencimento_fim`;
- `data_pagamento_inicio` / `data_pagamento_fim`;
- `ordenar`: `data_documento`, `data_vencimento`, `data_pagamento`;
- `ordenar_ordem`: `asc`, `desc`.

Campos úteis da resposta:

- `titulos[].id`;
- `titulos[].clienteNome`;
- `titulos[].clienteCpfcnpj`;
- `titulos[].clienteContrato`;
- `titulos[].link`;
- `titulos[].link_cobranca`;
- `titulos[].status`;
- `titulos[].valor`;
- `titulos[].valorCorrigido`;
- `titulos[].codigoBarras`;
- `titulos[].linhaDigitavel`;
- `titulos[].codigoPix`;
- `titulos[].dataVencimento`;
- `titulos[].dataPagamento`.

### 2. Fatura — Segunda via

```http
POST /api/ura/fatura2via/
```

Uso na Emy V2:

- emitir/obter segunda via de boleto;
- retornar link e linha digitável ao cliente;
- evitar geração de OS usando `nao_gerar_os=1` quando aplicável.

Parâmetros relevantes:

- `app` obrigatório;
- `token` obrigatório;
- `cpfcnpj` ou `contrato` obrigatório;
- `telefone`: tenta inferir CPF/CNPJ a partir do número;
- `notafiscal`;
- `faturas_abertas_todas`;
- `numero_documento`;
- `ocorrencia_conteudo`;
- `nao_gerar_os`;
- `tipo_ordenacao`: `data_documento` ou `data_vencimento`;
- `modo_ordenacao`: `asc` ou `desc`;
- `link_pdf`.

Campos úteis da resposta:

- `status`;
- `razaoSocial`;
- `protocolo`;
- `links[].linhadigitavel`;
- `links[].fatura`;
- `links[].vencimento`;
- `links[].link`;
- `links[].valor`;
- `links[].vencimento_original`;
- `links[].valor_original`;
- `cpfCnpj`;
- `contratoId`;
- `msg`.

### 3. Fatura — Gerar PIX

```http
POST /api/ura/pagamento/pix/{fatura}
```

Uso na Emy V2:

- gerar ou retornar PIX de uma fatura específica.

Parâmetros relevantes:

- `app` obrigatório;
- `token` obrigatório;
- `contrato` obrigatório;
- `{fatura}` no path.

Observação: precisa ser testado em ambiente seguro porque a documentação pública não mostra corpo de resposta.

### 4. Fatura — Enviar

```http
POST /api/ura/enviafatura/
```

Uso possível:

- enviar boleto por e-mail/SMS/WhatsApp pelo mecanismo do SGP.

Parâmetros relevantes:

- `app` obrigatório;
- `token` obrigatório;
- `contrato` obrigatório;
- `tipo`: `email` ou `sms` — SMS também tratado como WhatsApp;
- `email`;
- `celular`;
- `numero_documento`;
- `mensagem`;
- `conteudo`;
- `link_pdf`.

Regra da POC: não usar envio automático para cliente real enquanto `AUTO_SEND_TO_CUSTOMER=false`.

### 5. Fatura — Liquidar/Baixar

```http
POST /api/banco/titulo/{fatura_id}/baixar/
```

Uso na Emy V2: **fora do escopo inicial**.

Motivo: baixa/liquidação altera financeiro e exige autorização, regra de caixa e auditoria forte.

Parâmetros sensíveis:

- `data_pagamento`;
- `valor_pago`;
- `forma_pagamento`;
- `ponto_recebimento`;
- `tarifas`;
- `liquidacao_parcial`;
- `desconto`;
- `motivodesconto`;
- `observacao`.

Regra: Emy V2 não deve usar este endpoint na POC.

## Matriz inicial para Emy V2

| Fluxo | Endpoint | Modo inicial | Autonomia alvo |
|---|---|---:|---:|
| Consultar faturas abertas | `/api/ura/titulos/` | read-only | Resolver/sugerir |
| Segunda via de boleto | `/api/ura/fatura2via/` | assistido | Resolver sozinha após validação |
| Gerar PIX | `/api/ura/pagamento/pix/{fatura}` | assistido/teste | Resolver sozinha após validação |
| Enviar fatura pelo SGP | `/api/ura/enviafatura/` | bloqueado inicialmente | Avaliar depois |
| Baixar/liquidar título | `/api/banco/titulo/{fatura_id}/baixar/` | proibido | Humano/financeiro |

## Próxima validação técnica

1. Preencher `SGP_APP` no `.env.local`.
2. Validar chamada real controlada de `/api/ura/titulos/` com filtros seguros.
3. Validar `/api/ura/fatura2via/` com `nao_gerar_os=1` em cliente/teste ou cenário autorizado.
4. Mapear resposta real da M2 e adaptar o adapter SGP.
