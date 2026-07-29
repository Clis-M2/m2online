import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockOrchestrator } from '../src/orchestrator.js';

test('financial POC creates assisted reply without sending to customer', async () => {
  const orchestrator = createMockOrchestrator();

  const result = await orchestrator.handleInboundMessage({
    conversationId: 'conv_test_financeiro',
    channel: 'whatsapp',
    whatsappInstance: 'CLIS',
    from: '5581999990001',
    messageText: 'Preciso da segunda via do boleto',
  });

  assert.equal(result.classification.area, 'financeiro');
  assert.equal(result.action.requiresHuman, true);
  assert.equal(result.draft.sentToCustomer, false);
  assert.equal(orchestrator.adapters.supabase.conversationState.length, 1);
  assert.equal(orchestrator.adapters.supabase.toolCallLog.length, 2);
  assert.equal(orchestrator.adapters.supabase.decisionLog.length, 2);
});

test('non-financial message falls back to human/specialist flow', async () => {
  const orchestrator = createMockOrchestrator();

  const result = await orchestrator.handleInboundMessage({
    conversationId: 'conv_test_suporte',
    from: '5581999990001',
    messageText: 'Estou sem internet',
  });

  assert.equal(result.classification.area, 'suporte');
  assert.equal(result.action.reason, 'outside_financial_poc');
  assert.equal(orchestrator.adapters.supabase.toolCallLog.length, 0);
});
