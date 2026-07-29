# Emy Orchestrator

Orquestrador local da Emy V2.

## Estado atual

POC mockada para o primeiro fluxo seguro:

- Financeiro read-only.
- Resposta assistida para aprovação humana.
- Nenhum envio automático para cliente real.
- Nenhuma escrita no SGP.
- Logs simulados compatíveis com as tabelas iniciais do Supabase.

## Rodar localmente

```bash
npm run dev:orchestrator
```

## Testar

```bash
npm test
npm run lint
```

## Fluxo mockado

1. Recebe uma mensagem simulada de WhatsApp.
2. Classifica intenção: financeiro, suporte, comercial ou triagem.
3. Se for financeiro, consulta `MockSgpAdapter`.
4. Gera sugestão de resposta, sempre com `requiresHuman = true`.
5. Cria rascunho em `MockEvolutionAdapter`, sempre com `sentToCustomer = false`.
6. Registra estado, tool calls e decisões no `MockSupabaseAdapter`.

## Próximas trocas planejadas

- `MockSupabaseAdapter` → adapter real Supabase.
- `MockSgpAdapter` → adapter real SGP read-only.
- `MockEvolutionAdapter` → adapter real Evolution/Chatwoot em modo draft/teste.

## Regras de segurança

- Não commitar secrets.
- Não enviar mensagem automática para cliente real nesta fase.
- Não escrever no SGP.
- Não expor CPF, token ou dados sensíveis nos logs.
