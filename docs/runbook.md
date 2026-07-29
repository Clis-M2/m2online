# Runbook — Emy V2 POC

## Ativação

1. Conferir `.env` local.
2. Conferir conexão Supabase.
3. Conferir Evolution instância de teste.
4. Rodar testes offline.
5. Ativar apenas em ambiente de teste.

## Desativação rápida

- Desligar webhook da instância Evolution de teste.
- Definir `AUTO_SEND_TO_CUSTOMER=false`.
- Desabilitar workers do orquestrador.
