# n8n — Agente Financeiro atual da Emy

Fonte: export JSON enviado por Clistenis em 2026-07-29.

> Documento sanitizado. Não registrar tokens reais aqui.

## Objetivo

Registrar como o Agente Financeiro atual funciona hoje para servir de base à Emy V2.

## Entradas do workflow

O workflow financeiro recebe de outro workflow:

- `resumo_financeiro`
- `identificador_lead`
- `cpfcnpj`
- `contrato_referencia`
- `tipo_solicitacao_financeira`
- `resumo_validacao`
- `nome_lead`
- `vencimento_mencionado`
- `valor_mencionado`
- `comprovante_informado`
- `urgencia_percebida`
- `contrato_central_senha`

Observação de Clistenis: no fluxo atual, a senha usada em certos contextos é o CPF do cliente; por isso CPF/CNPJ é obrigatório antes de continuar atendimento financeiro.

## Ferramentas SGP identificadas

### financeiroCliente

```http
POST /api/ura/fatura2via/
```

Uso atual:

- verificar informações financeiras pelo CPF/CNPJ;
- consultar boleto/segunda via;
- retornar formas de pagamento.

Parâmetros observados:

- `cpfcnpj`
- `app`
- `token`

### liberarEmConfianca

```http
POST /api/ura/liberacaopromessa/
```

Uso atual:

- liberar/restabelecer acesso por promessa;
- registrar data de promessa.

Parâmetros observados:

- `app`
- `token`
- `contrato`
- `data_promessa`

Regra atual do n8n: data de promessa = data atual + 3 dias.

### abrirOS

```http
POST /api/ura/chamado/
```

Uso atual:

- abrir ocorrência/OS quando o problema não é resolvido remotamente;
- usado em casos como pagamento não reconhecido, divergência financeira ou necessidade de análise interna.

Parâmetros observados:

- `app`
- `token`
- `contrato`
- `conteudo`
- `observacao`
- `ocorrenciatipo`
- `setor`
- `usuario`
- `responsaveloc`
- `contato_nome`
- `contato_telefone`
- `responsavel`
- `data_hora_agendamento`
- `sms_tecnico`
- `tipo_servico`

## Regras de comportamento identificadas

### Não repetir validação

O agente financeiro recebe cliente já validado e não deve:

- pedir CPF/CNPJ novamente;
- refazer validação;
- pedir informações já fornecidas;
- confirmar contrato sem necessidade.

### Resolver antes de escalar

Regra explícita do prompt atual:

1. agir;
2. corrigir;
3. escalar somente se necessário.

### Pagamento/boleto/PIX

Quando o cliente pedir PIX, boleto, segunda via ou link de pagamento:

1. usar CPF/CNPJ já recebido no fluxo;
2. consultar `financeiroCliente`;
3. entregar todas as formas de pagamento disponíveis;
4. não confirmar plano/contrato salvo ambiguidade real.

Mapeamento atual:

- `codigopix` → `pix_copia_cola`
- `link_pix_html` → `pix_link`
- `link` → `boleto_link`

### Pagou, comprovante, bloqueio ou cobrança indevida

Prompt atual manda:

1. demonstrar empatia;
2. acionar `liberarEmConfianca`;
3. acionar `abrirOS`;
4. informar cliente com segurança.

Para Emy V2, essa regra deve ser refinada para evitar abertura de OS desnecessária quando o caso for simples e já resolvido pela promessa/consulta.

### Encaminhar humano

Usar humano quando:

- cliente pede humano;
- cliente demonstra irritação;
- negociação fora do padrão;
- falha crítica de sistema;
- situação fora do fluxo;
- atendimento exigir análise humana.

## Saída estruturada atual

O agente deve retornar JSON com:

```json
{
  "response": "",
  "boleto_link": "",
  "pix_link": "",
  "pix_copia_cola": "",
  "vencimento_atual": "",
  "vencimento_original": "",
  "dias_em_atraso": "",
  "valor_atual": "",
  "houve_liberacao_em_confianca": false
}
```

## Validação feita para Emy V2

Em 2026-07-29, após extrair `app` e token do JSON enviado por Clistenis, a autenticação SGP URA foi validada com sucesso em:

```http
POST /api/ura/titulos/
```

Resultado sanitizado:

- autenticação OK;
- endpoint URA títulos OK;
- retornou 1 título em chamada limitada;
- total reportado pela paginação: 3146.

## Decisão para POC

- `financeiroCliente` pode ser implementado primeiro em modo seguro.
- `liberarEmConfianca` fica mapeado como autonomia futura, mas bloqueado enquanto `SGP_WRITE_ENABLED=false`.
- `abrirOS` fica bloqueado na POC inicial, salvo modo assistido/humano.
- Nenhum envio automático ao cliente enquanto `AUTO_SEND_TO_CUSTOMER=false`.
