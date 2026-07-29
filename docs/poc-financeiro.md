# POC Financeiro — Read-only + resposta assistida

## Objetivo

Validar a arquitetura com uma demanda de menor risco: intenção financeira, consulta read-only e sugestão de resposta para aprovação humana.

## Fluxo

1. Receber mensagem de teste.
2. Criar/atualizar estado no Supabase.
3. Classificar intenção.
4. Validar identidade mínima.
5. Consultar SGP em modo leitura.
6. Gerar sugestão de resposta.
7. Registrar decisão e tool calls.
8. Humano aprova ou descarta.

## Implementação mockada atual

A POC local já possui um fluxo mockado em `apps/orchestrator`:

- `MockSupabaseAdapter`: simula estado, logs de ferramentas e decisões.
- `MockSgpAdapter`: simula busca de cliente e faturas abertas.
- `MockEvolutionAdapter`: cria apenas rascunho, com `sentToCustomer = false`.
- Router simples: classifica Financeiro, Suporte, Comercial ou Triagem por termos-chave.

## Como validar

```bash
npm run dev:orchestrator
npm test
npm run lint
```

## Critérios de aceite

- Nenhum dado de outro cliente exposto.
- Nenhuma ação duplicada.
- Log completo.
- Fallback humano em erro.
- Sem escrita no SGP.
- Sem envio automático para cliente real.
- Toda resposta financeira começa como sugestão assistida.

## Próximos passos

1. Configurar secrets novos fora do repositório.
2. Criar adapter real do Supabase.
3. Mapear endpoints reais do SGP.
4. Criar adapter SGP read-only.
5. Conectar Chatwoot/Evolution em ambiente de teste.
