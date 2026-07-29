# Secrets da Emy V2

## Decisão

Credenciais reais não devem ser gravadas em SQL nem commitadas no GitHub.

Use:

- `.env.local` no ambiente local.
- Secrets do servidor/VPS no staging/produção.
- Supabase Vault apenas se algum código rodando dentro do próprio Supabase precisar acessar segredo.

## O que vai no `.env.local`

Copie `.env.local.example` para `.env.local` e preencha localmente:

```bash
cp .env.local.example .env.local
```

Credenciais:

- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_ANON_KEY` somente se legacy estiver habilitada
- `SUPABASE_SERVICE_ROLE_KEY` somente se legacy estiver habilitada
- `EVOLUTION_API_TOKEN`
- `SGP_API_TOKEN`

## O que pode ir no Supabase via SQL

Apenas configurações não sensíveis, como:

- modo de runtime;
- flags de segurança;
- nome da instância de teste;
- escopo da POC.

Arquivo preparado:

```text
supabase/migrations/202607290002_app_config_non_secret.sql
```

## O que nunca deve ir em SQL comum

- `service_role` legacy do Supabase;
- `SUPABASE_SECRET_KEY`;
- tokens da Evolution API;
- token do SGP;
- senha;
- chave privada;
- credencial administrativa.

## Regra operacional

Para POC e staging:

- `AUTO_SEND_TO_CUSTOMER=false`
- `SGP_WRITE_ENABLED=false`
- `LOG_REDACTION=true`
