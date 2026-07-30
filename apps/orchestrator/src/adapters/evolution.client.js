import { requireEnv } from '../core/env.js';
import { assertSafeOutbound, normalizeWhatsappNumber, parseBoolean } from '../core/safety.js';

export class EvolutionClient {
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || requireEnv('EVOLUTION_API_URL')).replace(/\/$/, '');
    this.instance = config.instance || requireEnv('EVOLUTION_INSTANCE');
    this.token = config.token || requireEnv('EVOLUTION_API_TOKEN');
    this.env = config.env || process.env;
  }

  async sendInternalText({ to, text }) {
    if (!parseBoolean(this.env.FINANCE_HUMAN_ESCALATION_ENABLED, false)) {
      return { sentToInternalGroup: false, mode: 'disabled', reason: 'human_escalation_disabled', to, createdAt: new Date().toISOString() };
    }

    if (!to) {
      return { sentToInternalGroup: false, mode: 'blocked', reason: 'missing_internal_target', createdAt: new Date().toISOString() };
    }

    const response = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      headers: {
        apikey: this.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ number: to, text }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Evolution HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return { sentToInternalGroup: true, mode: 'internal_human_escalation', to, providerResponse: data, createdAt: new Date().toISOString() };
  }

  async sendText({ to, text }) {
    const safety = assertSafeOutbound({ to, env: this.env });
    if (!safety.allowed) {
      return {
        sentToCustomer: false,
        mode: 'blocked_by_safety',
        reason: safety.reason,
        to: normalizeWhatsappNumber(to),
        text,
        createdAt: new Date().toISOString(),
      };
    }

    const response = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      headers: {
        apikey: this.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        number: normalizeWhatsappNumber(to),
        text,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Evolution HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      sentToCustomer: true,
      mode: 'test_allowlist_send',
      to: normalizeWhatsappNumber(to),
      providerResponse: data,
      createdAt: new Date().toISOString(),
    };
  }
}
