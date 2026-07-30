import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCpfCnpj, maskDocument } from '../src/core/document.js';
import { assertSafeOutbound, isAllowlistedWhatsappNumber, whatsappNumberVariants } from '../src/core/safety.js';
import {
  buildCustomerPaymentMessage,
  buildCustomerPaymentMessages,
  buildPaymentLinkMessage,
  buildPixMessage,
} from '../src/core/payment-message.js';
import { extractEvolutionMessage, shouldIgnoreRecentInboundDuplicate, shouldIgnoreRecentOutboundEcho } from '../src/whatsapp-test-runtime.js';

test('extractCpfCnpj extracts formatted CPF from financial message', () => {
  assert.equal(extractCpfCnpj('quero boleto do CPF 031.346.044-26'), '03134604426');
  assert.equal(maskDocument('03134604426'), '031.***.***-26');
});

test('assertSafeOutbound blocks when allowlist is empty or recipient differs', () => {
  assert.deepEqual(assertSafeOutbound({ to: '5581999999999', env: { AUTO_SEND_TO_CUSTOMER: 'true', EMY_TEST_MODE: 'true', EMY_TEST_WHATSAPP_ALLOWLIST: '' } }), {
    allowed: false,
    reason: 'empty_test_allowlist',
  });
  assert.deepEqual(assertSafeOutbound({ to: '5581888888888', env: { AUTO_SEND_TO_CUSTOMER: 'true', EMY_TEST_MODE: 'true', EMY_TEST_WHATSAPP_ALLOWLIST: '5581999999999' } }), {
    allowed: false,
    reason: 'recipient_not_allowlisted',
  });
});

test('whatsappNumberVariants normalizes Brazilian mobile with and without 9th digit', () => {
  assert.deepEqual(new Set(whatsappNumberVariants('5581981956964')), new Set(['5581981956964', '558181956964']));
  assert.equal(isAllowlistedWhatsappNumber('558181956964', '5581981956964'), true);
  assert.equal(isAllowlistedWhatsappNumber('5581981956964', '558181956964'), true);
});

test('assertSafeOutbound allows only test allowlisted recipient with auto send enabled', () => {
  assert.deepEqual(assertSafeOutbound({ to: '55 81 99999-9999', env: { AUTO_SEND_TO_CUSTOMER: 'true', EMY_TEST_MODE: 'true', EMY_TEST_WHATSAPP_ALLOWLIST: '5581999999999' } }), {
    allowed: true,
    reason: 'recipient_allowlisted_test_mode',
  });
});

test('extractEvolutionMessage detects fromMe messages to prevent self-reply loops', () => {
  const inbound = extractEvolutionMessage({
    data: {
      key: { remoteJid: '5581920016907@s.whatsapp.net', fromMe: true, id: 'abc' },
      message: { conversation: 'mensagem enviada pela própria instância' },
    },
  });

  assert.equal(inbound.from, '5581920016907');
  assert.equal(inbound.fromMe, true);
});

test('shouldIgnoreRecentInboundDuplicate blocks repeated inbound text briefly', () => {
  const store = new Map([
    ['558181956964', { text: 'quero falar sobre pagamento', at: 1000 }],
  ]);

  assert.equal(shouldIgnoreRecentInboundDuplicate({
    from: '558181956964',
    text: 'Quero falar sobre pagamento',
    now: 2000,
    store,
    ttlMs: 3000,
  }), true);

  assert.equal(shouldIgnoreRecentInboundDuplicate({
    from: '558181956964',
    text: 'Quero falar sobre suporte',
    now: 2000,
    store,
    ttlMs: 3000,
  }), false);

  assert.equal(shouldIgnoreRecentInboundDuplicate({
    from: '558181956964',
    text: 'Quero falar sobre pagamento',
    now: 10000,
    store,
    ttlMs: 3000,
  }), false);
});

test('shouldIgnoreRecentOutboundEcho blocks recent echoed outbound text', () => {
  const store = new Map([
    ['558181956964', { text: 'Não consegui identificar um CPF/CNPJ válido nessa mensagem.', at: 1000 }],
  ]);

  assert.equal(shouldIgnoreRecentOutboundEcho({
    from: '558181956964',
    text: 'Não consegui identificar um CPF/CNPJ válido nessa mensagem.',
    now: 2000,
    store,
    ttlMs: 3000,
  }), true);

  assert.equal(shouldIgnoreRecentOutboundEcho({
    from: '558181956964',
    text: 'Mensagem nova do cliente',
    now: 2000,
    store,
    ttlMs: 3000,
  }), false);

  assert.equal(shouldIgnoreRecentOutboundEcho({
    from: '558181956964',
    text: 'Não consegui identificar um CPF/CNPJ válido nessa mensagem.',
    now: 10000,
    store,
    ttlMs: 3000,
  }), false);
});

test('buildCustomerPaymentMessages returns a clean payment menu', () => {
  const payment = {
    contrato: 12044,
    fatura: 160368,
    valor_atual: 130.25,
    vencimento_atual: '2026-04-25',
    pix_copia_cola: 'pix',
    linha_digitavel: 'linha',
    link_pagamento: 'https://example.invalid/pagar',
    boleto_link: 'https://example.invalid/boleto',
  };

  const messages = buildCustomerPaymentMessages(payment);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Contrato: 12044/);
  assert.match(messages[0], /Digite 1 para Pix copia e cola/);
  assert.match(messages[0], /Digite 2 para Link de pagamento \/ QRCode/);

  assert.match(buildPixMessage(payment), /Pix copia e cola/);
  assert.match(buildPixMessage(payment), /```\npix\n```/);
  assert.match(buildPaymentLinkMessage(payment), /Link de pagamento \/ QRCode/);
  assert.match(buildCustomerPaymentMessage(payment), /Como prefere pagar/);
});
