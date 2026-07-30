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

async function escalateSecurityHandoff(inbound, state, reason) {
  const text = buildSecurityHandoffMessage({ name: state?.name || inbound.pushName });
  const send = await evolution.sendText({ to: inbound.from, text });
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

  const optionText = inbound.text.toLowerCase().trim();
  const existingState = await loadConversationState(inbound);

  if (existingState?.securityBlocked) {
    return escalateSecurityHandoff(inbound, existingState, existingState.securityReason || 'security_block_active');
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
    const send = await evolution.sendText({ to: inbound.from, text });
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
    const send = await evolution.sendText({ to: inbound.from, text });
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
    const send = await evolution.sendText({ to: inbound.from, text: buildExpiredDocumentMessage({ name: savedState.name || inbound.pushName }) });
    await auditDecision(inbound, { decisionType: 'financeiro.payment_option_blocked_expired_document', decision: { optionText, ttlMs: DOCUMENT_TTL_MS }, requiresHuman: false, confidence: 1 });
    return { ok: true, classification: { area: 'financeiro', intent: 'document_validation_expired', confidence: 1 }, needsDocument: true, action: send };
  }
  if (lastPayment && ['1', 'pix', 'pix copia e cola', 'copia e cola'].includes(optionText)) {
    const send = await evolution.sendText({ to: inbound.from, text: buildPixMessage(lastPayment) });
    await auditDecision(inbound, { decisionType: 'financeiro.payment_pix_option', decision: { payment: summarizePayment(lastPayment) }, requiresHuman: false, confidence: 1 });
    return { ok: true, classification: { area: 'financeiro', intent: 'payment_pix_option', confidence: 1 }, action: send };
  }
  if (lastPayment && ['2', 'link', 'link de pagamento', 'qrcode', 'qr code', 'boleto'].includes(optionText)) {
    const send = await evolution.sendText({ to: inbound.from, text: buildPaymentLinkMessage(lastPayment) });
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
    if (attempt.blocked) return escalateSecurityHandoff(inbound, savedState, 'document_attempts_exceeded');
    const text = buildDocumentAttemptMessage({ attempts: attempt.attempts, maxAttempts: MAX_DOCUMENT_ATTEMPTS });
    const send = await evolution.sendText({ to: inbound.from, text });
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
      const send = await evolution.sendText({ to: inbound.from, text });
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
    for (const text of messages) sends.push(await evolution.sendText({ to: inbound.from, text }));
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
    const send = await evolution.sendText({ to: inbound.from, text });
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
    });
    const text = buildCpfRequestMessage({ name: inbound.pushName, tone });
    const send = await evolution.sendText({ to: inbound.from, text });
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
    const send = await evolution.sendText({ to: inbound.from, text });
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
  });
  const messages = [
    buildFoundInvoiceMessage({ name: inbound.pushName, payment, requestType: request.type }),
    ...messagesForRequestType({ payment, requestType: request.type, builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }),
  ];
  const sends = [];
  for (const text of messages) {
    sends.push(await evolution.sendText({ to: inbound.from, text }));
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
