# Plano de Consolidação da Base Global — Emy V2

## Diagnóstico inicial

A base global da M2 foi recebida e contém material suficiente para estruturar a Emy V2 em três domínios principais:

- Comercial/Vendas;
- Financeiro;
- Suporte.

A base está rica, mas mistura fatos confirmados, hipóteses, projetos futuros e lacunas. Por isso, a próxima etapa não é “jogar tudo no prompt”. A próxima etapa correta é transformar a base em conhecimento operacional controlado.

## Decisão de arquitetura

A Emy deve continuar sendo uma identidade única para o cliente. Internamente, o orquestrador deve rotear para especialistas:

```text
Emy Orquestradora
├── Emy Financeiro
├── Emy Comercial
└── Emy Suporte
```

## Ordem recomendada

### Fase 1 — Financeiro assistido/read-only

Status: em andamento e já validado tecnicamente.

Objetivo:

- consultar faturas;
- retornar Pix, boleto, linha digitável e link;
- manter resposta assistida;
- não enviar automaticamente ao cliente;
- não escrever no SGP.

### Fase 2 — Catálogo comercial oficial

Objetivo:

- separar planos vigentes de hipóteses;
- validar preços;
- validar taxas, fidelidade e campanhas;
- criar catálogo versionado;
- permitir respostas comerciais seguras.

### Fase 3 — Emy Orquestradora

Objetivo:

- classificar intenção;
- preservar contexto;
- não repetir dados já validados;
- escolher especialista;
- escalar corretamente.

### Fase 4 — Suporte internet

Objetivo:

- reduzir abertura precoce de OS;
- diagnosticar antes de agendar;
- consultar financeiro, contrato, sinal, conexão, incidentes e OS;
- resolver casos remotos elegíveis.

### Fase 5 — Serviços adicionais

Objetivo:

- M2 Digital;
- M2 Móvel;
- M2 Fixo;
- M2 Smart;
- câmeras;
- M2 Vision;
- automação.

## Donos recomendados

- Otto: prioridade, decisões, riscos e aprovação executiva.
- Íris: regra operacional, jornada, atendimento, scripts e critérios de escalonamento.
- Nexo: tools, permissões, integrações, logs, testes e deploy seguro.

## Critério para produção

Nenhum domínio deve entrar em produção automática sem:

- fonte de verdade definida;
- tool com escopo mínimo;
- testes obrigatórios;
- logs auditáveis;
- modo rollback;
- aprovação explícita de Clistenis.
