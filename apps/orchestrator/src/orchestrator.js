import { MockEvolutionAdapter } from './adapters/evolution.mock.js';
import { MockSgpAdapter } from './adapters/sgp.mock.js';
import { MockSupabaseAdapter } from './adapters/supabase.mock.js';
import { buildFinancialAssistedReply } from './core/financeiro.js';
import { classifyIntent } from './core/router.js';

export function createMockOrchestrator(adapters = {}) {
  const supabase = adapters.supabase || new MockSupabaseAdapter();
  const sgp = adapters.sgp || new MockSgpAdapter();
  const evolution = adapters.evolution || new MockEvolutionAdapter();

  return {
    adapters: { supabase, sgp, evolution },

    async handleInboundMessage(event) {
      const classification = classifyIntent(event.messageText);
      const state = await supabase.upsertConversationState({
        conversationId: event.conversationId,
        channel: event.channel || 'whatsapp',
        whatsappInstance: event.whatsappInstance || 'CLIS',
        customerRef: null,
        area: classification.area,
        intent: classification.intent,
        stage: 'classified',
        activeAgent: classification.area === 'financeiro' ? 'emy-financeiro' : 'emy-router',
        pendingQuestion: false,
        recentContext: {
          lastMessage: event.messageText,
          from: event.from,
        },
        safeToClose: false,
      });

      await supabase.logDecision({
        conversationStateId: state.conversationId,
        agentName: 'emy-router',
        decisionType: 'intent_classification',
        confidence: classification.confidence,
        requiresHuman: true,
        decision: classification,
      });

      if (classification.area !== 'financeiro') {
        const fallback = {
          requiresHuman: true,
          reason: 'outside_financial_poc',
          text: 'Fora do escopo da POC Financeiro. Encaminhar para atendimento humano ou fluxo especialista correspondente.',
        };
        await supabase.logDecision({
          conversationStateId: state.conversationId,
          agentName: 'emy-router',
          decisionType: 'fallback',
          requiresHuman: true,
          decision: fallback,
        });
        return { state, classification, action: fallback };
      }

      const customer = await sgp.findCustomerByPhone(event.from);
      await supabase.logToolCall({
        conversationStateId: state.conversationId,
        toolName: 'sgp.findCustomerByPhone',
        toolScope: 'read',
        status: customer ? 'success' : 'blocked',
        input: { phone: event.from },
        output: customer || { reason: 'not_found' },
      });

      const invoices = customer ? await sgp.listOpenInvoices(customer.customerRef) : [];
      await supabase.logToolCall({
        conversationStateId: state.conversationId,
        toolName: 'sgp.listOpenInvoices',
        toolScope: 'read',
        status: customer ? 'success' : 'blocked',
        input: { customerRef: customer?.customerRef },
        output: { invoices },
      });

      const assistedReply = buildFinancialAssistedReply({ customer, invoices });
      const draft = await evolution.sendMessageDraft({
        conversationId: event.conversationId,
        to: event.from,
        text: assistedReply.text,
      });

      await supabase.logDecision({
        conversationStateId: state.conversationId,
        agentName: 'emy-financeiro',
        decisionType: 'assisted_reply',
        requiresHuman: true,
        decision: { ...assistedReply, draft },
      });

      return {
        state: { ...state, customerRef: customer?.customerRef || null },
        classification,
        customer,
        invoices,
        action: assistedReply,
        draft,
      };
    },
  };
}
