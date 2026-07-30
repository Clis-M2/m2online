export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

export function normalizeWhatsappNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

export function whatsappNumberVariants(value) {
  const normalized = normalizeWhatsappNumber(value);
  const variants = new Set();
  if (normalized) variants.add(normalized);

  // Brazil mobile numbers may arrive from WhatsApp/Evolution with or without the 9th digit.
  // Example: 5581981956964 <-> 558181956964.
  if (normalized.startsWith('55') && normalized.length === 13 && normalized[4] === '9') {
    variants.add(`${normalized.slice(0, 4)}${normalized.slice(5)}`);
  }
  if (normalized.startsWith('55') && normalized.length === 12) {
    variants.add(`${normalized.slice(0, 4)}9${normalized.slice(4)}`);
  }

  return [...variants];
}

export function parseAllowlist(value = '') {
  return String(value)
    .split(',')
    .flatMap((item) => whatsappNumberVariants(item))
    .filter(Boolean);
}

export function isAllowlistedWhatsappNumber(number, allowlistValue = '') {
  const allowlist = new Set(parseAllowlist(allowlistValue));
  return whatsappNumberVariants(number).some((variant) => allowlist.has(variant));
}

export function assertSafeOutbound({ to, env = process.env }) {
  const autoSend = parseBoolean(env.AUTO_SEND_TO_CUSTOMER, false);
  const testMode = parseBoolean(env.EMY_TEST_MODE, true);
  const allowlistValue = env.EMY_TEST_WHATSAPP_ALLOWLIST || '';

  if (!autoSend) {
    return { allowed: false, reason: 'auto_send_disabled' };
  }

  if (!testMode) {
    return { allowed: false, reason: 'test_mode_required_for_current_runtime' };
  }

  if (!parseAllowlist(allowlistValue).length) {
    return { allowed: false, reason: 'empty_test_allowlist' };
  }

  if (!isAllowlistedWhatsappNumber(to, allowlistValue)) {
    return { allowed: false, reason: 'recipient_not_allowlisted' };
  }

  return { allowed: true, reason: 'recipient_allowlisted_test_mode' };
}
