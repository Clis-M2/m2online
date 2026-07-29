-- Emy V2 initial schema
-- Safe to review before applying. Do not run blindly in production.

create extension if not exists pgcrypto;

create table if not exists public.conversation_state (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  channel text,
  inbox_id text,
  whatsapp_instance text,
  customer_ref text,
  area text check (area in ('triagem','financeiro','comercial','suporte','humano','indefinido')) default 'triagem',
  intent text,
  stage text,
  active_agent text,
  pending_question boolean not null default false,
  last_human_instruction text,
  recent_context jsonb not null default '{}'::jsonb,
  safe_to_close boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, whatsapp_instance)
);

create table if not exists public.tool_call_log (
  id uuid primary key default gen_random_uuid(),
  conversation_state_id uuid references public.conversation_state(id),
  tool_name text not null,
  tool_scope text not null default 'read',
  input_redacted jsonb not null default '{}'::jsonb,
  output_redacted jsonb not null default '{}'::jsonb,
  status text not null check (status in ('success','error','timeout','blocked')),
  error_message text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.decision_log (
  id uuid primary key default gen_random_uuid(),
  conversation_state_id uuid references public.conversation_state(id),
  agent_name text not null,
  decision_type text not null,
  decision jsonb not null default '{}'::jsonb,
  confidence numeric,
  requires_human boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_version (
  id uuid primary key default gen_random_uuid(),
  prompt_name text not null,
  version text not null,
  content_hash text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (prompt_name, version)
);

create table if not exists public.test_case (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  title text not null,
  input_sanitized jsonb not null,
  expected_decision jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_identity_map (
  id uuid primary key default gen_random_uuid(),
  external_ref text not null,
  source text not null,
  customer_ref text not null,
  confidence numeric,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (external_ref, source)
);

create table if not exists public.handoff_log (
  id uuid primary key default gen_random_uuid(),
  conversation_state_id uuid references public.conversation_state(id),
  from_agent text,
  to_agent text,
  reason text not null,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_error_log (
  id uuid primary key default gen_random_uuid(),
  integration text not null,
  operation text not null,
  error_type text,
  error_message text,
  payload_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.idempotency_key (
  key text primary key,
  operation text not null,
  status text not null default 'started',
  result_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS enabled by default. Policies must be reviewed before client-side access.
alter table public.conversation_state enable row level security;
alter table public.tool_call_log enable row level security;
alter table public.decision_log enable row level security;
alter table public.prompt_version enable row level security;
alter table public.test_case enable row level security;
alter table public.customer_identity_map enable row level security;
alter table public.handoff_log enable row level security;
alter table public.integration_error_log enable row level security;
alter table public.idempotency_key enable row level security;
