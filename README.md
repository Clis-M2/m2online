# M2 Online — Emy V2

Projeto de reconstrução controlada da Agente Emy para atendimento operacional da M2.

## Princípios

- Emy é a identidade única para o cliente.
- OpenClaw/orquestrador decide e coordena.
- n8n fica como automação auxiliar, não como cérebro principal.
- Supabase exclusivo guarda estado, logs e auditoria.
- GitHub versiona código, docs, prompts e migrations.
- Nenhuma ação sensível sem ferramenta limitada, log e regra aprovada.

## POC inicial

Financeiro em modo **read-only + resposta assistida**.

Fora do escopo inicial:

- envio automático para cliente real;
- escrita no SGP;
- abertura de OS;
- liberação em confiança automática;
- cobrança ativa automática;
- comandos de rede.
