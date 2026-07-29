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

## Critérios de aceite

- Nenhum dado de outro cliente exposto.
- Nenhuma ação duplicada.
- Log completo.
- Fallback humano em erro.
- Sem escrita no SGP.
- Sem envio automático para cliente real.
