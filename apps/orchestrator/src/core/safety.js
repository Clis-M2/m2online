export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

export function normalizeWhatsappNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

export function parseAllowlist(value = '') {
  return String(value)
    .split(',')
    .map((item) => normalizeWhatsappNumber(item))
    .filter(Boolean);
}

export function assertSafeOutbound({ to, env = process.env }) {
  const autoSend = parseBoolean(env.AUTO_SEND_TO_CUSTOMER, false);
  const testMode = parseBoolean(env.EMY_TEST_MODE, true);
  const allowlist = parseAllowlist(env.EMY_TEST_WHATSAPP_ALLOWLIST || '');
  const normalizedTo = normalizeWhatsappNumber(to);

  if (!autoSend) {
    return { allowed: false, reason: 'auto_send_disabled' };
  }

  if (!testMode) {
    return { allowed: false, reason: 'test_mode_required_for_current_runtime' };
  }

  if (!allowlist.length) {
    return { allowed: false, reason: 'empty_test_allowlist' };
  }

  if (!allowlist.includes(normalizedTo)) {
    return { allowed: false, reason: 'recipient_not_allowlisted' };
  }

  return { allowed: true, reason: 'recipient_allowlisted_test_mode' };
}
