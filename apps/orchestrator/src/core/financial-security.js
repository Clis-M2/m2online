export const DEFAULT_DOCUMENT_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_DOCUMENT_ATTEMPTS = 3;

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function isExpired(isoDate, ttlMs = DEFAULT_DOCUMENT_TTL_MS, now = new Date()) {
  if (!isoDate) return true;
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) return true;
  return now.getTime() - time > ttlMs;
}

export function documentValidationExpired(state = {}, ttlMs = DEFAULT_DOCUMENT_TTL_MS, now = new Date()) {
  if (!state.document) return true;
  return isExpired(state.documentValidatedAt || state.updatedAt, ttlMs, now);
}

export function incrementDocumentAttempts(state = {}, maxAttempts = DEFAULT_MAX_DOCUMENT_ATTEMPTS) {
  const attempts = Number(state.documentAttempts || 0) + 1;
  return {
    attempts,
    blocked: attempts >= maxAttempts,
  };
}

export function buildDocumentAttemptMessage({ attempts, maxAttempts = DEFAULT_MAX_DOCUMENT_ATTEMPTS } = {}) {
  const remaining = Math.max(0, maxAttempts - Number(attempts || 0));
  if (remaining <= 0) {
    return 'Não consegui validar o CPF/CNPJ com segurança. Para proteger seus dados, vou encaminhar esse atendimento para uma pessoa da equipe conferir com você.';
  }
  return `Não consegui identificar um CPF/CNPJ válido nessa mensagem. Me envia o CPF ou CNPJ do titular, por favor. Você ainda tem ${remaining} tentativa${remaining === 1 ? '' : 's'} antes de eu encaminhar para atendimento humano.`;
}

export function buildExpiredDocumentMessage({ name = '' } = {}) {
  const prefix = name ? `${name}, por segurança preciso confirmar o CPF/CNPJ novamente.` : 'Por segurança preciso confirmar o CPF/CNPJ novamente.';
  return `${prefix}\n\nA validação anterior expirou, e eu não quero expor dados financeiros sem confirmar o titular.`;
}

export function buildSecurityHandoffMessage({ name = '' } = {}) {
  const prefix = name ? `${name}, vou chamar uma pessoa da equipe para conferir isso com segurança.` : 'Vou chamar uma pessoa da equipe para conferir isso com segurança.';
  return `${prefix}\n\nAssim evitamos qualquer risco com seus dados financeiros.`;
}
