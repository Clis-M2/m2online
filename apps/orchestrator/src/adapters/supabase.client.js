function supabaseConfig(env = process.env) {
  const restUrl = (env.SUPABASE_REST_URL || (env.SUPABASE_URL ? `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1` : '')).replace(/\/$/, '');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { restUrl, key };
}

function toDbState(state) {
  return {
    conversation_id: state.conversationId,
    channel: state.channel || 'whatsapp',
    whatsapp_instance: state.whatsappInstance,
    customer_ref: state.customerRef || state.from || null,
    area: state.area || 'financeiro',
    intent: state.intent || null,
    stage: state.stage || null,
    active_agent: state.activeAgent || 'emy-financeiro',
    pending_question: Boolean(state.pendingQuestion),
    recent_context: state.recentContext || {},
    safe_to_close: Boolean(state.safeToClose),
    last_error: state.lastError || null,
    updated_at: new Date().toISOString(),
  };
}

function fromDbState(record) {
  if (!record) return null;
  return {
    id: record.id,
    conversationId: record.conversation_id,
    channel: record.channel,
    whatsappInstance: record.whatsapp_instance,
    customerRef: record.customer_ref,
    area: record.area,
    intent: record.intent,
    stage: record.stage,
    activeAgent: record.active_agent,
    pendingQuestion: record.pending_question,
    recentContext: record.recent_context || {},
    safeToClose: record.safe_to_close,
    lastError: record.last_error,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export class SupabaseConversationStore {
  constructor(config = {}) {
    const resolved = supabaseConfig(config.env || process.env);
    this.restUrl = config.restUrl || resolved.restUrl;
    this.key = config.key || resolved.key;
    this.enabled = Boolean(this.restUrl && this.key);
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extra,
    };
  }

  async getConversationState({ conversationId, whatsappInstance }) {
    if (!this.enabled) return null;
    const url = new URL(`${this.restUrl}/conversation_state`);
    url.searchParams.set('conversation_id', `eq.${conversationId}`);
    url.searchParams.set('whatsapp_instance', `eq.${whatsappInstance}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, { headers: this.headers() });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(`Supabase conversation_state GET ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return fromDbState(Array.isArray(data) ? data[0] : null);
  }

  async upsertConversationState(state) {
    if (!this.enabled) return null;
    const url = new URL(`${this.restUrl}/conversation_state`);
    url.searchParams.set('on_conflict', 'conversation_id,whatsapp_instance');
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(toDbState(state)),
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(`Supabase conversation_state UPSERT ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return fromDbState(Array.isArray(data) ? data[0] : data);
  }
}
