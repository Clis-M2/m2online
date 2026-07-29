const SENSITIVE_KEYS = new Set([
  'cpf',
  'cnpj',
  'document',
  'token',
  'apiKey',
  'authorization',
  'service_role',
  'password',
]);

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}
