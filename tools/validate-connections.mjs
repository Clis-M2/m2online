#!/usr/bin/env node
import fs from 'node:fs';

const envPath = new URL('../.env.local', import.meta.url).pathname;
const raw = fs.readFileSync(envPath, 'utf8');
for (const line of raw.split(/\n/)) {
  if (!/^[A-Z0-9_]+=/.test(line)) continue;
  const [key, ...rest] = line.split('=');
  if (!(key in process.env)) process.env[key] = rest.join('=');
}

function isPlaceholder(value = '') {
  return !value || /cole_|PROJECT_REF|exemplo|example|\*\*\*/i.test(value);
}

function ok(name, detail = '') { return { name, ok: true, detail }; }
function fail(name, detail = '') { return { name, ok: false, detail }; }

async function testSupabase() {
  const url = (process.env.SUPABASE_REST_URL || '').replace(/\/$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (isPlaceholder(url) || isPlaceholder(secretKey)) return fail('supabase', 'missing_or_placeholder_config');

  const response = await fetch(`${url}/conversation_state?select=id&limit=1`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return fail('supabase', `http_${response.status}`);
  const data = await response.json();
  return ok('supabase', `rest_ok_rows_${Array.isArray(data) ? data.length : 'unknown'}`);
}

async function testEvolution() {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const instance = process.env.EVOLUTION_INSTANCE || '';
  const token = process.env.EVOLUTION_API_TOKEN || '';
  if (isPlaceholder(base) || isPlaceholder(instance) || isPlaceholder(token)) return fail('evolution', 'missing_or_placeholder_config');

  const routes = [
    `/instance/connectionState/${encodeURIComponent(instance)}`,
    `/instance/fetchInstances`,
  ];

  const headersList = [
    { apikey: token, Accept: 'application/json' },
    { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  ];

  for (const route of routes) {
    for (const headers of headersList) {
      const response = await fetch(`${base}${route}`, { headers });
      if (response.ok) {
        let detail = `route_ok_${route}`;
        try {
          const data = await response.json();
          const state = data?.instance?.state || data?.state || data?.connectionState || data?.instance?.status;
          if (state) detail += `_state_${state}`;
        } catch {}
        return ok('evolution', detail);
      }
      if (![401, 403, 404].includes(response.status)) return fail('evolution', `http_${response.status}_on_${route}`);
    }
  }

  return fail('evolution', 'no_known_read_endpoint_authorized');
}

async function testSgp() {
  const base = (process.env.SGP_API_URL || '').replace(/\/$/, '');
  const token = process.env.SGP_API_TOKEN || '';
  const app = process.env.SGP_APP || '';
  if (isPlaceholder(base) || isPlaceholder(token) || isPlaceholder(app)) return fail('sgp', 'missing_or_placeholder_config');

  const response = await fetch(`${base}/api/ura/titulos/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ app, token, limit: 1, offset: 0, status: 'abertos' }),
  });

  if (!response.ok) return fail('sgp', `ura_titulos_http_${response.status}`);
  const data = await response.json().catch(() => ({}));
  return ok('sgp', `ura_titulos_ok_total_${data?.paginacao?.total ?? 'unknown'}_returned_${Array.isArray(data?.titulos) ? data.titulos.length : 'unknown'}`);
}

const tests = [testSupabase, testEvolution, testSgp];
const results = [];
for (const test of tests) {
  try { results.push(await test()); }
  catch (error) { results.push(fail(test.name.replace(/^test/, '').toLowerCase(), error.name || 'error')); }
}

console.log(JSON.stringify({
  ok: results.every((item) => item.ok),
  checked_at: new Date().toISOString(),
  safety: {
    auto_send_to_customer: process.env.AUTO_SEND_TO_CUSTOMER,
    sgp_write_enabled: process.env.SGP_WRITE_ENABLED,
    log_redaction: process.env.LOG_REDACTION,
  },
  results,
}, null, 2));
