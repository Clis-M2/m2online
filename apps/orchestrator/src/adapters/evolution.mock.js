export class MockEvolutionAdapter {
  constructor() {
    this.messages = [];
  }

  async sendMessageDraft(payload) {
    const draft = {
      ...payload,
      mode: 'draft_only',
      sentToCustomer: false,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(draft);
    return draft;
  }
}
