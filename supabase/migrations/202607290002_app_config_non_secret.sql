-- Emy V2 app config — non-secret values only
-- Não coloque tokens, service_role, senhas ou credenciais neste arquivo.
-- Use .env.local / secrets do ambiente para credenciais reais.

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_config_no_secrets check (is_secret = false)
);

alter table public.app_config enable row level security;

-- Sem policies públicas por enquanto: acesso apenas via service role/backend.
-- Configurações seguras e não sensíveis para a POC local/staging.
insert into public.app_config (key, value, description)
values
  ('emy.runtime_mode', '"local_poc"'::jsonb, 'Modo atual de execução da Emy V2'),
  ('emy.auto_send_to_customer', 'false'::jsonb, 'Envio automático para cliente real permanece bloqueado'),
  ('emy.sgp_write_enabled', 'false'::jsonb, 'Escrita no SGP permanece bloqueada'),
  ('emy.default_whatsapp_instance', '"CLIS"'::jsonb, 'Instância de teste da Evolution API'),
  ('emy.poc_scope', '"financeiro_readonly_assisted_reply"'::jsonb, 'Escopo aprovado para a POC inicial')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();
