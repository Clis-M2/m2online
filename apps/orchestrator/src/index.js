import { createMockOrchestrator } from './orchestrator.js';

const sampleEvent = {
  conversationId: 'conv_mock_001',
  channel: 'whatsapp',
  whatsappInstance: process.env.EVOLUTION_INSTANCE || 'CLIS',
  from: '5581999990001',
  messageText: 'Oi, preciso da segunda via do boleto deste mês',
};

const orchestrator = createMockOrchestrator();
const result = await orchestrator.handleInboundMessage(sampleEvent);

console.log(JSON.stringify({
  classification: result.classification,
  action: result.action,
  draft: result.draft,
  logs: {
    conversationState: orchestrator.adapters.supabase.conversationState.length,
    toolCallLog: orchestrator.adapters.supabase.toolCallLog.length,
    decisionLog: orchestrator.adapters.supabase.decisionLog.length,
  },
}, null, 2));
