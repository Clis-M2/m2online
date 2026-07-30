# Emy Orquestradora V2 — MVP

Status: implementação inicial para ambiente de teste assistido.

## Objetivo

A Emy Orquestradora é a camada de entrada da Emy V2. Ela identifica a intenção do cliente, preserva contexto e direciona para o especialista correto sem obrigar o cliente a repetir informações.

Fluxo lógico:

```text
Cliente
  ↓
Chatwoot / Evolution
  ↓
Emy Orquestradora
  ↓
Emy Financeiro | Emy Suporte | Emy Comercial | Humano
```

## Escopo deste MVP

A Orquestradora já classifica:

- `financeiro`
- `suporte`
- `comercial`
- `humano`
- `triagem`

Também detecta:

- pedido explícito de humano;
- reclamação/situação sensível;
- cancelamento;
- emergência ou risco físico;
- múltiplas intenções.

## Regras de prioridade

1. Emergência/risco físico → `humano`, prioridade urgente.
2. Cancelamento → `humano`.
3. Pedido explícito de humano ou reclamação sensível → `humano`.
4. Caso misto com financeiro, suporte ou comercial → financeiro primeiro quando houver bloqueio, fatura, pagamento ou liberação.
5. Caso sem confiança suficiente → `triagem`, pedindo esclarecimento.

Exemplo de regra combinada:

> “Minha internet está bloqueada, quero pagar a fatura para liberar.”

Resultado esperado:

- área: `financeiro`
- intenção: `multiple_intents_routed_by_priority`
- motivo: resolver impedimento financeiro antes do diagnóstico técnico.

## Contrato de saída

A classificação retorna objeto estruturado:

```json
{
  "area": "financeiro|suporte|comercial|humano|triagem",
  "intent": "string_curta",
  "confidence": 0.0,
  "requiresHuman": true,
  "activeAgent": "emy-financeiro|emy-suporte|emy-comercial|humano|emy-orquestradora",
  "priority": "urgent|high|normal",
  "reason": "motivo objetivo",
  "multipleIntents": false,
  "candidates": [],
  "handoff": {
    "resumo": "mensagem resumida",
    "area": "area escolhida",
    "intent": "intenção escolhida",
    "matchedDomains": [],
    "pendencias": []
  }
}
```

## Comportamento no runtime WhatsApp de teste

### Financeiro

Quando a área é `financeiro`, a mensagem segue para o fluxo Financeiro V2 já implementado.

### Suporte, Comercial, Humano ou Triagem

Como os especialistas Suporte e Comercial ainda não estão implementados, a Orquestradora:

1. registra decisão `orquestradora.intent_classification` no Supabase;
2. salva estado da conversa com `activeAgent` correspondente;
3. cria nota privada no Chatwoot com área, intenção, confiança, motivo e resumo;
4. responde ao cliente de forma controlada informando o direcionamento;
5. não executa comando técnico, oferta comercial ou promessa operacional.

## Controle humano

A Orquestradora herda as travas globais já publicadas:

- etiqueta `humano` bloqueia resposta automática;
- etiqueta `ia_desligada` bloqueia resposta automática;
- follow-ups também respeitam essas etiquetas.

## O que está pronto para teste assistido

Testar mensagens como:

- “Quero a segunda via do boleto.” → Financeiro.
- “Estou sem internet desde cedo.” → Suporte.
- “Quero contratar um plano.” → Comercial.
- “Quero falar com um atendente humano.” → Humano.
- “Tem fio caído com faísca no poste.” → Humano urgente.
- “Minha internet está bloqueada, quero pagar a fatura.” → Financeiro por prioridade.
- “Oi bom dia.” → Triagem/esclarecimento.

## O que ainda não está liberado para equipe

- Suporte técnico automatizado completo.
- Comercial com ofertas, preços ou viabilidade.
- Abertura automática de OS.
- Comandos em equipamentos, OLT, roteador ou NOC.
- Qualquer ação sensível/escrita em produção.

## Critério para avançar para Emy Suporte

A Orquestradora deve acertar a maioria dos roteamentos nos testes assistidos e não responder quando houver controle humano. Depois disso, o próximo especialista recomendado é a Emy Suporte V2.
