# Arquitetura — Emy V2

```text
Evolution API teste
  ↓
Chatwoot / conversa simulada
  ↓
Emy Orchestrator
  ↓
Supabase: estado + auditoria
  ↓
Especialistas internos: Financeiro, Comercial, Suporte
  ↓
M2 Tool Gateway
  ↓
Ferramentas controladas: Chatwoot, SGP, Evolution, Audit
```

## Decisão

Nesta fase, apenas uma instância Evolution de teste será usada. Os quatro números reais não entram no piloto inicial.
