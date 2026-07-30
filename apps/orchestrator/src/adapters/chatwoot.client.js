function resolveConfig(env = process.env) {
  return {
    baseUrl: (env.CHATWOOT_URL || env.CHATWOOT_BASE_URL || '').replace(/\/$/, ''),
    accountId: env.CHATWOOT_ACCOUNT_ID || '1',
    token: env.CHATWOOT_API_TOKEN || '',
    enabled: ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.CHATWOOT_NOTES_ENABLED || '').toLowerCase()),
  };
}

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function payloadOf(data) {
  return data?.payload || data?.data?.payload || [];
}

export class ChatwootClient {
  constructor(config = {}) {
    const resolved = resolveConfig(config.env || process.env);
    this.baseUrl = config.baseUrl || resolved.baseUrl;
    this.accountId = config.accountId || resolved.accountId;
    this.token = config.token || resolved.token;
    this.enabled = config.enabled ?? Boolean(resolved.enabled && this.baseUrl && this.accountId && this.token);
  }

  headers() {
    return {
      api_access_token: this.token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async request(route, options = {}) {
    if (!this.enabled) return null;
    const response = await fetch(`${this.baseUrl}/api/v1/accounts/${this.accountId}${route}`, {
      headers: this.headers(),
      ...options,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
    if (!response.ok) throw new Error(`Chatwoot HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  }

  async searchContactsByPhone(phone) {
    if (!this.enabled) return [];
    const digits = onlyDigits(phone);
    const queries = [...new Set([digits, `+${digits}`, digits.slice(-8)].filter(Boolean))];
    const contacts = [];
    for (const query of queries) {
      const data = await this.request(`/contacts/search?q=${encodeURIComponent(query)}`);
      contacts.push(...payloadOf(data));
    }
    const unique = new Map();
    for (const contact of contacts) {
      if (contact?.id) unique.set(contact.id, contact);
    }
    return [...unique.values()];
  }

  async getContactConversations(contactId) {
    if (!this.enabled || !contactId) return [];
    const data = await this.request(`/contacts/${contactId}/conversations`);
    return payloadOf(data);
  }

  async findLatestConversationByPhone(phone) {
    if (!this.enabled) return null;
    const contacts = await this.searchContactsByPhone(phone);
    const conversations = [];
    for (const contact of contacts.slice(0, 3)) {
      const items = await this.getContactConversations(contact.id).catch(() => []);
      conversations.push(...items.map((conversation) => ({ ...conversation, _contact: contact })));
    }
    conversations.sort((a, b) => Number(b.last_activity_at || b.updated_at || 0) - Number(a.last_activity_at || a.updated_at || 0));
    return conversations[0] || null;
  }

  async createPrivateNote(conversationId, content) {
    if (!this.enabled || !conversationId || !content) return null;
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, private: true, message_type: 'outgoing' }),
    });
  }

  async createPrivateNoteByPhone(phone, content) {
    if (!this.enabled) return { ok: false, skipped: true, reason: 'chatwoot_notes_disabled' };
    const conversation = await this.findLatestConversationByPhone(phone);
    if (!conversation?.id) return { ok: false, skipped: true, reason: 'conversation_not_found' };
    const note = await this.createPrivateNote(conversation.id, content);
    return {
      ok: true,
      conversationId: conversation.id,
      displayId: conversation.display_id,
      contactId: conversation._contact?.id,
      noteId: note?.id || note?.payload?.id || null,
    };
  }
}
