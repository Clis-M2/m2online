import http from 'node:http';
import { EvolutionClient } from './adapters/evolution.client.js';
import { buildPaymentResponse, SgpClient } from './adapters/sgp.client.js';
import { extractCpfCnpj, maskDocument } from './core/document.js';
import { loadEnvFile } from './core/env.js';
import { buildCustomerPaymentMessages } from './core/payment-message.js';
import { classifyIntent } from './core/router.js';
import { isAllowlistedWhatsappNumber, normalizeWhatsappNumber, parseAllowlist } from './core/safety.js';

loadEnvFile();

const PORT = Number(process.env.EMY_TEST_PORT || 3333);
const sgp = new SgpClient();
const evolution = new EvolutionClient();

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

  const classification = classifyIntent(inbound.text);
  if (classification.area !== 'financeiro') {
    const text = 'Recebi sua mensagem no ambiente de teste da Emy V2. Neste primeiro teste estou validando apenas o Financeiro: boleto, PIX, linha digitável e link de pagamento.';
    const send = await evolution.sendText({ to: inbound.from, text });
    return { ok: true, classification, action: send };
  }

  const cpfcnpj = extractCpfCnpj(inbound.text);
  if (!cpfcnpj) {
    const text = 'Para consultar sua fatura no teste financeiro, me envie o CPF/CNPJ do titular. Vou usar apenas para consulta segura no SGP.';
    const send = await evolution.sendText({ to: inbound.from, text });
    return { ok: true, classification, needsDocument: true, action: send };
  }

  const paymentInfo = await sgp.getPaymentInfoByCpf(cpfcnpj);
  const payment = buildPaymentResponse(paymentInfo);
  const messages = buildCustomerPaymentMessages(payment);
  const sends = [];
  for (const text of messages) {
    sends.push(await evolution.sendText({ to: inbound.from, text }));
  }

  return {
    ok: true,
    classification,
    document: maskDocument(cpfcnpj),
    payment: {
      contrato: payment.contrato,
      fatura: payment.fatura,
      valor_atual: payment.valor_atual,
      vencimento_atual: payment.vencimento_atual,
      has_pix: Boolean(payment.pix_copia_cola),
      has_linha_digitavel: Boolean(payment.linha_digitavel),
      has_link_pagamento: Boolean(payment.link_pagamento),
      has_boleto_link: Boolean(payment.boleto_link),
    },
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
