import http from 'node:http';
import { ChatwootClient } from './adapters/chatwoot.client.js';
import { EvolutionClient } from './adapters/evolution.client.js';
import { buildPaymentResponse, SgpClient } from './adapters/sgp.client.js';
import { SupabaseConversationStore } from './adapters/supabase.client.js';
import { extractCpfCnpj, maskDocument } from './core/document.js';
import { loadEnvFile } from './core/env.js';
import {
  buildCpfRequestMessage,
  buildFoundInvoiceMessage,
  detectFinancialRequest,
  detectTone,
  isAnticipatedPaymentRequest,
  messagesForRequestType,
} from './core/financial-conversation.js';
import {
  buildAnticipatedPaymentClientMessage,
  buildAnticipatedPaymentInternalMessage,
  buildNoOpenInvoiceMessage,
  buildPaymentLinkMessage,
  buildPixMessage,
} from './core/payment-message.js';
import {
  buildBoletoStillPendingMessage,
  buildPaymentConfirmedMessage,
  buildPixStillPendingMessage,
  buildWaitingDocumentAbandonedNote,
  buildWaitingDocumentFollowupMessage,
  createPaymentFollowup,
  createWaitingDocumentFollowup,
  financeFollowupConfig,
  FOLLOWUP_TYPES,
  isFollowupDue,
  nextPaymentFollowup,
  nextWaitingDocumentFollowup,
} from './core/finance-followup.js';
import {
  buildDocumentAttemptMessage,
  buildExpiredDocumentMessage,
  buildSecurityHandoffMessage,
  DEFAULT_DOCUMENT_TTL_MS,
  DEFAULT_MAX_DOCUMENT_ATTEMPTS,
  documentValidationExpired,
  incrementDocumentAttempts,
} from './core/financial-security.js';
import { classifyIntent } from './core/router.js';
import { isAllowlistedWhatsappNumber, normalizeWhatsappNumber, parseAllowlist } from './core/safety.js';

loadEnvFile();

const PORT = Number(process.env.EMY_TEST_PORT || 3333);
const sgp = new SgpClient();
const evolution = new EvolutionClient();
const chatwoot = new ChatwootClient();
const conversationStore = new SupabaseConversationStore();
const DOCUMENT_TTL_MS = Number(process.env.EMY_DOCUMENT_VALIDATION_TTL_MS || DEFAULT_DOCUMENT_TTL_MS);
const MAX_DOCUMENT_ATTEMPTS = Number(process.env.EMY_MAX_DOCUMENT_ATTEMPTS || DEFAULT_MAX_DOCUMENT_ATTEMPTS);
const lastPaymentBySender = new Map();
const conversationStateBySender = new Map();
const latestInboundMessageBySender = new Map();
let followupRunnerActive = false;
let followupRunnerBusy = false;

function summarizePayment(payment) {
  return {
    contrato: payment.contrato,
    fatura: payment.fatura,
    valor_atual: payment.valor_atual,
    vencimento_atual: payment.vencimento_atual,
    has_pix: Boolean(payment.pix_copia_cola),
    has_linha_digitavel: Boolean(payment.linha_digitavel),
    has_link_pagamento: Boolean(payment.link_pagamento),
    has_boleto_link: Boolean(payment.boleto_link),
  };
}

function buildFinanceHandoffNote({ inbound, state, reason = 'boleto_antecipado' }) {
  return [
    '🧾 Nota Emy V2 Financeiro',
    '',
    `Motivo: ${reason === 'boleto_antecipado' ? 'cliente quer pagar antecipado; fatura não está aberta/gerada no SGP' : reason}`,
    `WhatsApp: ${inbound.from}`,
    `Cliente: ${state.name || inbound.pushName || 'não informado'}`,
    `Documento: ${state.document || 'não informado'}`,
    state.historicalContracts?.length ? `Contratos identificados no CPF: ${state.historicalContracts.join(', ')}` : '',
    state.nextInvoiceEstimate?.nextDueDate ? `Próximo vencimento estimado: ${state.nextInvoiceEstimate.nextDueDate}` : '',
    '',
    'Ação da Emy: informou o cliente e acionou o grupo Suporte FINANCEIRO💰💳 para geração manual do boleto, se aplicável.',
  ].filter(Boolean).join('\n');
}

function humanControlLabels(env = process.env) {
  return String(env.CHATWOOT_HUMAN_CONTROL_LABELS || 'humano,ia_desligada')
    .split(',')
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

async function getChatwootHumanControlStatus(phone) {
  if (!chatwoot.enabled) return { blocked: false, skipped: true, reason: 'chatwoot_disabled' };
  try {
    const conversation = await chatwoot.findLatestConversationByPhone(phone);
    if (!conversation?.id) return { blocked: false, skipped: true, reason: 'conversation_not_found' };
    const labels = (conversation.labels || []).map((label) => String(label).toLowerCase());
    const matchedLabel = labels.find((label) => humanControlLabels().includes(label));
    return {
      blocked: Boolean(matchedLabel),
      reason: matchedLabel ? 'chatwoot_human_control_label' : 'no_human_control_label',
      matchedLabel: matchedLabel || null,
      conversationId: conversation.id,
      displayId: conversation.display_id,
      labels,
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'chatwoot_human_control_check_failed', error: error.message, phone, checked_at: new Date().toISOString() }));
    return { blocked: false, skipped: true, reason: 'chatwoot_check_failed', error: error.message };
  }
}

async function createChatwootHandoffNote(inbound, state) {
  try {
    const result = await chatwoot.createPrivateNoteByPhone(inbound.from, buildFinanceHandoffNote({ inbound, state }));
    console.log(JSON.stringify({
      event: 'chatwoot_private_note_result',
      ok: result?.ok || false,
      skipped: result?.skipped || false,
      reason: result?.reason || null,
      conversationId: result?.conversationId || null,
      noteId: result?.noteId || null,
      checked_at: new Date().toISOString(),
    }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ event: 'chatwoot_private_note_failed', error: error.message, from: inbound.from, checked_at: new Date().toISOString() }));
    return { ok: false, error: error.message };
  }
}

function sanitizeConversationState(state = {}) {
  return {
    stage: state.stage,
    requestType: state.requestType,
    tone: state.tone,
    name: state.name,
    document: state.document,
    nextInvoiceEstimate: state.nextInvoiceEstimate,
    historicalContracts: state.historicalContracts,
    paymentSummary: state.payment ? summarizePayment(state.payment) : state.paymentSummary,
    documentValidatedAt: state.documentValidatedAt,
    documentAttempts: state.documentAttempts || 0,
    securityBlocked: state.securityBlocked || false,
    followup: state.followup,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  };
}

async function loadConversationState(inbound) {
  const localState = conversationStateBySender.get(inbound.from);
  if (!conversationStore.enabled) return localState;
  try {
    const persisted = await conversationStore.getConversationState({
      conversationId: inbound.from,
      whatsappInstance: process.env.EVOLUTION_INSTANCE || 'CLIS',
    });
    if (!persisted) return localState;
    const state = { ...(persisted.recentContext || {}), stage: persisted.stage || persisted.recentContext?.stage };
    conversationStateBySender.set(inbound.from, state);
    return state;
  } catch (error) {
    console.error(JSON.stringify({ event: 'supabase_conversation_state_load_failed', error: error.message, from: inbound.from, checked_at: new Date().toISOString() }));
    return localState;
  }
}

async function saveConversationState(inbound, state) {
  const updatedState = { ...state, updatedAt: new Date().toISOString() };
  conversationStateBySender.set(inbound.from, updatedState);
  if (!conversationStore.enabled) return updatedState;
  try {
    await conversationStore.upsertConversationState({
      conversationId: inbound.from,
      whatsappInstance: process.env.EVOLUTION_INSTANCE || 'CLIS',
      from: inbound.from,
      area: 'financeiro',
      intent: updatedState.requestType || null,
      stage: updatedState.stage,
      activeAgent: 'emy-financeiro',
      pendingQuestion: updatedState.stage === 'awaiting_document',
      recentContext: sanitizeConversationState(updatedState),
      safeToClose: false,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'supabase_conversation_state_save_failed', error: error.message, from: inbound.from, stage: updatedState.stage, checked_at: new Date().toISOString() }));
  }
  return updatedState;
}

async function auditDecision(inbound, entry) {
  if (!conversationStore.enabled) return null;
  try {
    return await conversationStore.logDecision({
      conversationId: inbound.from,
      whatsappInstance: process.env.EVOLUTION_INSTANCE || 'CLIS',
      agentName: 'emy-financeiro',
      ...entry,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'supabase_decision_log_failed', error: error.message, from: inbound.from, checked_at: new Date().toISOString() }));
    return null;
  }
}

async function auditToolCall(inbound, entry) {
  if (!conversationStore.enabled) return null;
  try {
    return await conversationStore.logToolCall({
      conversationId: inbound.from,
      whatsappInstance: process.env.EVOLUTION_INSTANCE || 'CLIS',
      ...entry,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'supabase_tool_call_log_failed', error: error.message, from: inbound.from, checked_at: new Date().toISOString() }));
    return null;
  }
}

async function escalateSecurityHandoff(inbound, state, reason, sendCustomerText) {
  const text = buildSecurityHandoffMessage({ name: state?.name || inbound.pushName });
  const send = await sendCustomerText(text);
  const savedState = await saveConversationState(inbound, { ...(state || {}), stage: 'human_escalation_requested', securityBlocked: true, securityReason: reason });
  await auditDecision(inbound, {
    decisionType: 'financeiro.security_handoff',
    decision: { reason, stage: savedState.stage, document: savedState.document || null, attempts: savedState.documentAttempts || 0 },
    requiresHuman: true,
    confidence: 1,
  });
  return { ok: true, classification: { area: 'financeiro', intent: 'security_handoff', confidence: 1 }, action: send, requiresHuman: true };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (error) { reject(error); }
    });
  });
}

export function extractEvolutionMessage(payload) {
  const data = payload?.data || payload;
  const key = data?.key || payload?.key || {};
  const message = data?.message || payload?.message || {};
  const fromRaw = key?.remoteJid || data?.remoteJid || data?.from || payload?.from || '';
  const from = normalizeWhatsappNumber(String(fromRaw).split('@')[0]);
  const text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    data?.text ||
    data?.messageText ||
    payload?.messageText ||
    '';

  return {
    from,
    fromMe: Boolean(key?.fromMe || data?.fromMe || payload?.fromMe),
    text: String(text || '').trim(),
    messageId: key?.id || data?.id || payload?.id || '',
    pushName: data?.pushName || payload?.pushName || '',
    event: payload?.event || data?.event || '',
  };
}

export async function handleInbound(payload) {
  const inbound = extractEvolutionMessage(payload);
  const allowlistValue = process.env.EMY_TEST_WHATSAPP_ALLOWLIST || '';

  if (!inbound.from || !inbound.text) {
    return { ok: true, ignored: true, reason: 'empty_or_unsupported_message' };
  }

  if (inbound.fromMe) {
    return { ok: true, ignored: true, reason: 'from_me_message' };
  }

  if (!isAllowlistedWhatsappNumber(inbound.from, allowlistValue)) {
    return { ok: true, ignored: true, reason: 'sender_not_allowlisted', from: inbound.from };
  }

  const initialHumanControl = await getChatwootHumanControlStatus(inbound.from);
  if (initialHumanControl.blocked) {
    console.log(JSON.stringify({
      event: 'customer_reply_skipped_by_chatwoot_human_control',
      from: inbound.from,
      reason: initialHumanControl.reason,
      matchedLabel: initialHumanControl.matchedLabel,
      conversationId: initialHumanControl.conversationId,
      checked_at: new Date().toISOString(),
    }));
    return { ok: true, ignored: true, reason: 'chatwoot_human_control_label', chatwoot: initialHumanControl };
  }

  const inboundToken = inbound.messageId || `${Date.now()}-${Math.random()}`;
  latestInboundMessageBySender.set(inbound.from, inboundToken);
  let customerMessagesSent = 0;
  const sendCustomerText = async (text) => {
    const result = await evolution.sendTextHumanized({
      to: inbound.from,
      text,
      first: customerMessagesSent === 0,
      shouldSend: async () => {
        if (latestInboundMessageBySender.get(inbound.from) !== inboundToken) return false;
        const humanControl = await getChatwootHumanControlStatus(inbound.from);
        if (humanControl.blocked) {
          console.log(JSON.stringify({
            event: 'customer_reply_cancelled_by_chatwoot_human_control',
            from: inbound.from,
            reason: humanControl.reason,
            matchedLabel: humanControl.matchedLabel,
            conversationId: humanControl.conversationId,
            checked_at: new Date().toISOString(),
          }));
          return false;
        }
        return true;
      },
    });
    customerMessagesSent += 1;
    return result;
  };

  const optionText = inbound.text.toLowerCase().trim();
  const existingState = await loadConversationState(inbound);

  if (existingState?.securityBlocked) {
    return escalateSecurityHandoff(inbound, existingState, existingState.securityReason || 'security_block_active', sendCustomerText);
  }

  if (existingState?.stage === 'payment_returned' && documentValidationExpired(existingState, DOCUMENT_TTL_MS)) {
    lastPaymentBySender.delete(inbound.from);
    const request = detectFinancialRequest(inbound.text);
    const savedState = await saveConversationState(inbound, {
      ...existingState,
      stage: 'awaiting_document',
      requestType: request.type,
      payment: null,
      paymentSummary: null,
      document: null,
      documentValidatedAt: null,
      documentAttempts: 0,
    });
    const text = buildExpiredDocumentMessage({ name: savedState.name || inbound.pushName });
    const send = await sendCustomerText(text);
    await auditDecision(inbound, {
      decisionType: 'financeiro.document_expired',
      decision: { previousStage: existingState.stage, newStage: 'awaiting_document', ttlMs: DOCUMENT_TTL_MS },
      requiresHuman: false,
      confidence: 1,
    });
    return { ok: true, classification: { area: 'financeiro', intent: 'document_validation_expired', confidence: 1 }, needsDocument: true, action: send };
  }

  if (existingState?.stage === 'no_open_invoice' && isAnticipatedPaymentRequest(inbound.text)) {
    const text = buildAnticipatedPaymentClientMessage({ name: existingState.name });
    const send = await sendCustomerText(text);
    const internalAlert = await evolution.sendInternalText({
      to: process.env.FINANCE_HUMAN_GROUP_JID || '',
      text: buildAnticipatedPaymentInternalMessage({
        name: existingState.name,
        from: inbound.from,
        document: existingState.document,
        nextDueDate: existingState.nextInvoiceEstimate?.nextDueDate,
      }),
    });
    console.log(JSON.stringify({
      event: 'finance_human_escalation_needed',
      reason: 'anticipated_payment_invoice_not_generated',
      from: inbound.from,
      document: existingState.document,
      nextDueDate: existingState.nextInvoiceEstimate?.nextDueDate || null,
      internalAlertMode: internalAlert.mode,
      internalAlertSent: internalAlert.sentToInternalGroup || false,
      checked_at: new Date().toISOString(),
    }));
    const savedState = await saveConversationState(inbound, { ...existingState, stage: 'human_escalation_requested' });
    const chatwootNote = await createChatwootHandoffNote(inbound, savedState);
    return { ok: true, classification: { area: 'financeiro', intent: 'anticipated_payment_human_escalation', confidence: 1 }, action: send, internalAlert, chatwootNote, requiresHuman: true };
  }

  const lastPayment = lastPaymentBySender.get(inbound.from);
  if (lastPayment && existingState && documentValidationExpired(existingState, DOCUMENT_TTL_MS)) {
    lastPaymentBySender.delete(inbound.from);
    const savedState = await saveConversationState(inbound, { ...existingState, stage: 'awaiting_document', payment: null, paymentSummary: null, document: null, documentValidatedAt: null, documentAttempts: 0 });
    const send = await sendCustomerText(buildExpiredDocumentMessage({ name: savedState.name || inbound.pushName }));
    await auditDecision(inbound, { decisionType: 'financeiro.payment_option_blocked_expired_document', decision: { optionText, ttlMs: DOCUMENT_TTL_MS }, requiresHuman: false, confidence: 1 });
    return { ok: true, classification: { area: 'financeiro', intent: 'document_validation_expired', confidence: 1 }, needsDocument: true, action: send };
  }
  if (lastPayment && ['1', 'pix', 'pix copia e cola', 'copia e cola'].includes(optionText)) {
    const send = await sendCustomerText(buildPixMessage(lastPayment));
    await auditDecision(inbound, { decisionType: 'financeiro.payment_pix_option', decision: { payment: summarizePayment(lastPayment) }, requiresHuman: false, confidence: 1 });
    return { ok: true, classification: { area: 'financeiro', intent: 'payment_pix_option', confidence: 1 }, action: send };
  }
  if (lastPayment && ['2', 'link', 'link de pagamento', 'qrcode', 'qr code', 'boleto'].includes(optionText)) {
    const send = await sendCustomerText(buildPaymentLinkMessage(lastPayment));
    await auditDecision(inbound, { decisionType: 'financeiro.payment_link_option', decision: { payment: summarizePayment(lastPayment) }, requiresHuman: false, confidence: 1 });
    return { ok: true, classification: { area: 'financeiro', intent: 'payment_link_option', confidence: 1 }, action: send };
  }

  const pendingState = existingState;
  const cpfcnpj = extractCpfCnpj(inbound.text);

  if (pendingState?.stage === 'awaiting_document' && !cpfcnpj) {
    const attempt = incrementDocumentAttempts(pendingState, MAX_DOCUMENT_ATTEMPTS);
    const savedState = await saveConversationState(inbound, { ...pendingState, documentAttempts: attempt.attempts, securityBlocked: attempt.blocked });
    await auditDecision(inbound, {
      decisionType: attempt.blocked ? 'financeiro.document_attempts_exceeded' : 'financeiro.invalid_document_attempt',
      decision: { attempts: attempt.attempts, maxAttempts: MAX_DOCUMENT_ATTEMPTS, stage: savedState.stage },
      requiresHuman: attempt.blocked,
      confidence: 1,
    });
    if (attempt.blocked) return escalateSecurityHandoff(inbound, savedState, 'document_attempts_exceeded', sendCustomerText);
    const text = buildDocumentAttemptMessage({ attempts: attempt.attempts, maxAttempts: MAX_DOCUMENT_ATTEMPTS });
    const send = await sendCustomerText(text);
    return { ok: true, classification: { area: 'financeiro', intent: 'invalid_document_attempt', confidence: 1 }, needsDocument: true, action: send };
  }

  if (pendingState?.stage === 'awaiting_document' && cpfcnpj) {
    const paymentInfo = await sgp.getPaymentInfoByCpf(cpfcnpj);
    const payment = buildPaymentResponse(paymentInfo);
    await auditToolCall(inbound, {
      toolName: 'sgp.getPaymentInfoByCpf',
      toolScope: 'read',
      input: { document: maskDocument(cpfcnpj) },
      output: { payment: summarizePayment(payment), openInvoicesCount: payment.open_invoices_count || 0, historicalContracts: payment.historical_contracts || [] },
      status: 'success',
    });
    if (!payment.fatura) {
      await saveConversationState(inbound, {
        ...pendingState,
        stage: 'no_open_invoice',
        document: maskDocument(cpfcnpj),
        documentValidatedAt: new Date().toISOString(),
        documentAttempts: 0,
        nextInvoiceEstimate: payment.next_invoice_estimate,
        historicalContracts: payment.historical_contracts || [],
      });
      const text = buildNoOpenInvoiceMessage({
        name: pendingState.name,
        nextDueDate: payment.next_invoice_estimate?.nextDueDate,
        daysUntilNextDue: payment.next_invoice_estimate?.daysUntilNextDue,
        contracts: payment.historical_contracts || [],
      });
      const send = await sendCustomerText(text);
      return { ok: true, classification: { area: 'financeiro', intent: 'no_open_invoice', confidence: 1 }, document: maskDocument(cpfcnpj), action: send };
    }
    lastPaymentBySender.set(inbound.from, payment);
    await saveConversationState(inbound, {
      ...pendingState,
      stage: 'payment_returned',
      document: maskDocument(cpfcnpj),
      documentValidatedAt: new Date().toISOString(),
      documentAttempts: 0,
      payment,
      followup: createPaymentFollowup({ payment, requestType: pendingState.requestType }),
    });

    const messages = [
      buildFoundInvoiceMessage({ name: pendingState.name, payment, requestType: pendingState.requestType }),
      ...messagesForRequestType({
        payment,
        requestType: pendingState.requestType,
        builders: { pix: buildPixMessage, link: buildPaymentLinkMessage },
      }),
    ];
    const sends = [];
    for (const text of messages) sends.push(await sendCustomerText(text));
    return {
      ok: true,
      classification: { area: 'financeiro', intent: 'financial_document_received', confidence: 1 },
      document: maskDocument(cpfcnpj),
      payment: summarizePayment(payment),
      action: sends.at(-1),
      actions: sends,
    };
  }

  const classification = classifyIntent(inbound.text);
  if (classification.area !== 'financeiro') {
    const text = 'Recebi sua mensagem no ambiente de teste da Emy V2. Neste primeiro teste estou validando apenas o Financeiro: boleto, PIX, linha digitável e link de pagamento.';
    const send = await sendCustomerText(text);
    return { ok: true, classification, action: send };
  }

  if (!cpfcnpj) {
    const request = detectFinancialRequest(inbound.text);
    const tone = detectTone(inbound.text);
    await saveConversationState(inbound, {
      stage: 'awaiting_document',
      requestType: request.type,
      tone,
      name: inbound.pushName,
      startedAt: new Date().toISOString(),
      followup: createWaitingDocumentFollowup(),
    });
    const text = buildCpfRequestMessage({ name: inbound.pushName, tone });
    const send = await sendCustomerText(text);
    return { ok: true, classification: { ...classification, financialRequest: request, tone }, needsDocument: true, action: send };
  }

  const paymentInfo = await sgp.getPaymentInfoByCpf(cpfcnpj);
  const payment = buildPaymentResponse(paymentInfo);
  await auditToolCall(inbound, {
    toolName: 'sgp.getPaymentInfoByCpf',
    toolScope: 'read',
    input: { document: maskDocument(cpfcnpj) },
    output: { payment: summarizePayment(payment), openInvoicesCount: payment.open_invoices_count || 0, historicalContracts: payment.historical_contracts || [] },
    status: 'success',
  });
  const request = detectFinancialRequest(inbound.text);
  if (!payment.fatura) {
    await saveConversationState(inbound, {
      stage: 'no_open_invoice',
      requestType: request.type,
      tone: detectTone(inbound.text),
      name: inbound.pushName,
      document: maskDocument(cpfcnpj),
      documentValidatedAt: new Date().toISOString(),
      documentAttempts: 0,
      nextInvoiceEstimate: payment.next_invoice_estimate,
      historicalContracts: payment.historical_contracts || [],
    });
    const text = buildNoOpenInvoiceMessage({
      name: inbound.pushName,
      nextDueDate: payment.next_invoice_estimate?.nextDueDate,
      daysUntilNextDue: payment.next_invoice_estimate?.daysUntilNextDue,
      contracts: payment.historical_contracts || [],
    });
    const send = await sendCustomerText(text);
    return { ok: true, classification: { ...classification, intent: 'no_open_invoice' }, document: maskDocument(cpfcnpj), action: send };
  }
  lastPaymentBySender.set(inbound.from, payment);
  await saveConversationState(inbound, {
    stage: 'payment_returned',
    requestType: request.type,
    tone: detectTone(inbound.text),
    name: inbound.pushName,
    document: maskDocument(cpfcnpj),
    documentValidatedAt: new Date().toISOString(),
    documentAttempts: 0,
    payment,
    followup: createPaymentFollowup({ payment, requestType: request.type }),
  });
  const messages = [
    buildFoundInvoiceMessage({ name: inbound.pushName, payment, requestType: request.type }),
    ...messagesForRequestType({ payment, requestType: request.type, builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }),
  ];
  const sends = [];
  for (const text of messages) {
    sends.push(await sendCustomerText(text));
  }

  return {
    ok: true,
    classification,
    document: maskDocument(cpfcnpj),
    payment: summarizePayment(payment),
    action: sends.at(-1),
    actions: sends,
  };
}

async function savePersistedContext(stateRecord, recentContextPatch, patch = {}) {
  const recentContext = { ...(stateRecord.recentContext || {}), ...recentContextPatch, updatedAt: new Date().toISOString() };
  return conversationStore.upsertConversationState({
    conversationId: stateRecord.conversationId,
    whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
    from: stateRecord.customerRef || stateRecord.conversationId,
    area: 'financeiro',
    intent: patch.intent ?? stateRecord.intent,
    stage: patch.stage ?? stateRecord.stage,
    activeAgent: 'emy-financeiro',
    pendingQuestion: patch.pendingQuestion ?? stateRecord.pendingQuestion,
    recentContext,
    safeToClose: patch.safeToClose ?? stateRecord.safeToClose,
  });
}

async function processWaitingDocumentFollowup(stateRecord, followup) {
  const next = nextWaitingDocumentFollowup(followup, process.env);
  const context = stateRecord.recentContext || {};
  if (next.status === 'done') {
    await savePersistedContext(stateRecord, { followup: next }, { stage: 'abandoned_waiting_document', pendingQuestion: false });
    await chatwoot.createPrivateNoteByPhone(stateRecord.conversationId, buildWaitingDocumentAbandonedNote({ from: stateRecord.conversationId, name: context.name })).catch(() => null);
    await conversationStore.logDecision({
      conversationId: stateRecord.conversationId,
      whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
      agentName: 'emy-financeiro',
      decisionType: 'financeiro.followup_abandoned_waiting_document',
      decision: { attempts: next.attempts, reason: next.reason },
      requiresHuman: false,
      confidence: 1,
    }).catch(() => null);
    return { action: 'abandoned_waiting_document' };
  }

  const message = buildWaitingDocumentFollowupMessage({ name: context.name, attempt: next.attempts });
  const send = await evolution.sendTextHumanized({ to: stateRecord.conversationId, text: message, first: true });
  await savePersistedContext(stateRecord, { followup: next }, { stage: 'awaiting_document', pendingQuestion: true });
  await conversationStore.logDecision({
    conversationId: stateRecord.conversationId,
    whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
    agentName: 'emy-financeiro',
    decisionType: 'financeiro.followup_waiting_document_sent',
    decision: { attempts: next.attempts, sentToCustomer: send.sentToCustomer || false },
    requiresHuman: false,
    confidence: 1,
  }).catch(() => null);
  return { action: 'waiting_document_followup_sent', sent: send.sentToCustomer || false };
}

function invoiceIsPaid(invoice) {
  return invoice?.status === 'pago' || Boolean(invoice?.paidAt) || Number(invoice?.paidAmount || 0) > 0;
}

async function processPaymentFollowup(stateRecord, followup) {
  const invoice = followup.fatura ? await sgp.getInvoiceById(followup.fatura).catch(() => null) : null;
  await conversationStore.logToolCall({
    conversationId: stateRecord.conversationId,
    whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
    toolName: 'sgp.getInvoiceById',
    toolScope: 'read',
    input: { fatura: followup.fatura },
    output: { status: invoice?.status || null, paidAt: invoice?.paidAt || null, paidAmount: invoice?.paidAmount || null },
    status: invoice ? 'success' : 'error',
    errorMessage: invoice ? null : 'invoice_not_found',
  }).catch(() => null);

  if (invoiceIsPaid(invoice)) {
    const done = { ...followup, status: 'done', completedAt: new Date().toISOString(), reason: 'payment_confirmed' };
    const send = await evolution.sendTextHumanized({ to: stateRecord.conversationId, text: buildPaymentConfirmedMessage(), first: true });
    await savePersistedContext(stateRecord, { followup: done }, { stage: 'payment_confirmed', pendingQuestion: false, safeToClose: true });
    await chatwoot.createPrivateNoteByPhone(stateRecord.conversationId, `✅ Emy V2 Financeiro\n\nPagamento confirmado no SGP para a fatura ${followup.fatura}. A Emy avisou o cliente e marcou o follow-up como concluído.`).catch(() => null);
    await conversationStore.logDecision({
      conversationId: stateRecord.conversationId,
      whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
      agentName: 'emy-financeiro',
      decisionType: 'financeiro.payment_confirmed_followup',
      decision: { fatura: followup.fatura, sentToCustomer: send.sentToCustomer || false },
      requiresHuman: false,
      confidence: 1,
    }).catch(() => null);
    return { action: 'payment_confirmed', sent: send.sentToCustomer || false };
  }

  const next = nextPaymentFollowup(followup, process.env);
  let send = null;
  if (next.status === 'done') {
    const text = followup.type === FOLLOWUP_TYPES.PIX_SENT ? buildPixStillPendingMessage() : buildBoletoStillPendingMessage();
    send = await evolution.sendTextHumanized({ to: stateRecord.conversationId, text, first: true });
  }
  await savePersistedContext(stateRecord, { followup: next }, { stage: stateRecord.stage, pendingQuestion: false });
  await conversationStore.logDecision({
    conversationId: stateRecord.conversationId,
    whatsappInstance: stateRecord.whatsappInstance || process.env.EVOLUTION_INSTANCE || 'CLIS',
    agentName: 'emy-financeiro',
    decisionType: next.status === 'done' ? 'financeiro.payment_pending_followup_sent' : 'financeiro.payment_pending_recheck_scheduled',
    decision: { fatura: followup.fatura, attempts: next.attempts, nextAt: next.nextAt || null, sentToCustomer: send?.sentToCustomer || false },
    requiresHuman: false,
    confidence: 1,
  }).catch(() => null);
  return { action: next.status === 'done' ? 'payment_pending_followup_sent' : 'payment_recheck_scheduled', sent: send?.sentToCustomer || false };
}

export async function processFinanceFollowups({ now = new Date(), limit = 100 } = {}) {
  const config = financeFollowupConfig(process.env);
  if (!config.enabled || !conversationStore.enabled) return { ok: true, skipped: true, reason: 'followups_disabled_or_store_unavailable' };
  if (followupRunnerBusy) return { ok: true, skipped: true, reason: 'followup_runner_busy' };
  followupRunnerBusy = true;
  const results = [];
  try {
    const states = await conversationStore.listFinanceConversationStates({ limit });
    for (const state of states) {
      const followup = state.recentContext?.followup;
      if (!isFollowupDue(followup, now)) continue;
      if (followup.type === FOLLOWUP_TYPES.WAITING_DOCUMENT) results.push(await processWaitingDocumentFollowup(state, followup));
      else if ([FOLLOWUP_TYPES.PIX_SENT, FOLLOWUP_TYPES.BOLETO_SENT].includes(followup.type)) results.push(await processPaymentFollowup(state, followup));
    }
    return { ok: true, processed: results.length, results };
  } finally {
    followupRunnerBusy = false;
  }
}

function startFinanceFollowupRunner() {
  const config = financeFollowupConfig(process.env);
  if (followupRunnerActive || !config.enabled) return;
  followupRunnerActive = true;
  setInterval(() => {
    processFinanceFollowups().then((result) => {
      if (result.processed) console.log(JSON.stringify({ event: 'finance_followups_processed', ...result, checked_at: new Date().toISOString() }));
    }).catch((error) => console.error(JSON.stringify({ event: 'finance_followups_failed', error: error.message, checked_at: new Date().toISOString() })));
  }, config.checkIntervalMs).unref?.();
}

export function createWhatsappTestServer() {
  return http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && ['/health', '/emy-v2/health'].includes(req.url)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'emy-whatsapp-test-runtime', checked_at: new Date().toISOString() }));
      return;
    }

    if (req.method === 'POST' && ['/webhooks/evolution', '/emy-v2/webhooks/evolution'].includes(req.url)) {
      const payload = await readJson(req);
      const result = await handleInbound(payload);
      console.log(JSON.stringify({
        event: 'evolution_webhook_handled',
        ok: result.ok,
        ignored: result.ignored || false,
        reason: result.reason || result.action?.reason || null,
        area: result.classification?.area || null,
        sentToCustomer: result.action?.sentToCustomer || false,
        messagesSent: Array.isArray(result.actions) ? result.actions.filter((item) => item.sentToCustomer).length : (result.action?.sentToCustomer ? 1 : 0),
        to: result.action?.to || result.from || null,
        checked_at: new Date().toISOString(),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startFinanceFollowupRunner();
  const server = createWhatsappTestServer();
  server.listen(PORT, () => {
    console.log(JSON.stringify({
      ok: true,
      service: 'emy-whatsapp-test-runtime',
      port: PORT,
      auto_send_to_customer: process.env.AUTO_SEND_TO_CUSTOMER,
      test_mode: process.env.EMY_TEST_MODE,
      allowlist_count: parseAllowlist(process.env.EMY_TEST_WHATSAPP_ALLOWLIST || '').length,
    }));
  });
}
