import { requireEnv } from '../core/env.js';
import { humanDelayConfig, sleep, waitHumanized } from '../core/humanized-delivery.js';
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

  async sendPresence({ to, presence = 'composing', delayMs = 5000 }) {
    if (!parseBoolean(this.env.EMY_TYPING_PRESENCE_ENABLED, true)) return { ok: false, skipped: true, reason: 'typing_presence_disabled' };
    const number = normalizeWhatsappNumber(to);
    const candidates = [
      { path: `/chat/sendPresence/${encodeURIComponent(this.instance)}`, body: { number, presence, delay: delayMs } },
      { path: `/chat/sendPresence/${encodeURIComponent(this.instance)}`, body: { number, presence, delay: Number(delayMs) } },
      { path: `/chat/sendPresence/${encodeURIComponent(this.instance)}`, body: { number, presence: presence === 'composing' ? 'typing' : presence, delay: delayMs } },
    ];

    for (const candidate of candidates) {
      try {
        const response = await fetch(`${this.baseUrl}${candidate.path}`, {
          method: 'POST',
          headers: {
            apikey: this.token,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(candidate.body),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) return { ok: true, mode: 'typing_presence', providerResponse: data };
      } catch {
        // Presence is best-effort only; text delivery must not fail because of it.
      }
    }
    return { ok: false, skipped: true, reason: 'typing_presence_endpoint_not_available' };
  }

  async sendTextHumanized({ to, text, first = false, shouldSend = null }) {
    const config = humanDelayConfig(this.env);
    let presence = null;
    if (config.enabled && config.typingEnabled) {
      const delayMs = first ? config.firstMaxMs : config.betweenMs;
      presence = await this.sendPresence({ to, delayMs }).catch((error) => ({ ok: false, error: error.message }));
    }
    const waitedMs = await waitHumanized({ first, env: this.env });
    if (shouldSend && !(await shouldSend())) {
      return { sentToCustomer: false, mode: 'skipped_by_debounce', reason: 'newer_inbound_message_received_or_human_control', to: normalizeWhatsappNumber(to), waitedMs, typingPresence: presence, createdAt: new Date().toISOString() };
    }
    const result = await this.sendText({ to, text });
    return { ...result, waitedMs, typingPresence: presence };
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
