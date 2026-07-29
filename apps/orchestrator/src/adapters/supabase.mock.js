import { redact } from '../core/redaction.js';

export class MockSupabaseAdapter {
  constructor() {
    this.conversationState = [];
    this.toolCallLog = [];
    this.decisionLog = [];
  }

  async upsertConversationState(state) {
    const existingIndex = this.conversationState.findIndex(
      (item) => item.conversationId === state.conversationId && item.whatsappInstance === state.whatsappInstance,
    );
    const record = {
      ...state,
      updatedAt: new Date().toISOString(),
      createdAt: state.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) this.conversationState[existingIndex] = record;
    else this.conversationState.push(record);

    return record;
  }

  async logToolCall(entry) {
    const record = {
      ...entry,
      inputRedacted: redact(entry.input || {}),
      outputRedacted: redact(entry.output || {}),
      createdAt: new Date().toISOString(),
    };
    delete record.input;
    delete record.output;
    this.toolCallLog.push(record);
    return record;
  }

  async logDecision(entry) {
    const record = {
      ...entry,
      decision: redact(entry.decision || {}),
      createdAt: new Date().toISOString(),
    };
    this.decisionLog.push(record);
    return record;
  }
}
