import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCpfCnpj, maskDocument } from '../src/core/document.js';
import { assertSafeOutbound, isAllowlistedWhatsappNumber, whatsappNumberVariants } from '../src/core/safety.js';
import { buildCustomerPaymentMessage, buildCustomerPaymentMessages } from '../src/core/payment-message.js';
import { extractEvolutionMessage } from '../src/whatsapp-test-runtime.js';

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

test('buildCustomerPaymentMessages separates summary and payment channels', () => {
  const messages = buildCustomerPaymentMessages({
    contrato: 12044,
    fatura: 160368,
    valor_atual: 130.25,
    vencimento_atual: '2026-04-25',
    pix_copia_cola: 'pix',
    linha_digitavel: 'linha',
    link_pagamento: 'https://example.invalid/pagar',
    boleto_link: 'https://example.invalid/boleto',
  });

  assert.equal(messages.length, 6);
  assert.match(messages[0], /Contrato: 12044/);
  assert.match(messages[1], /QRCode \/ Link de pagamento/);
  assert.match(messages[2], /Código PIX copia e cola/);
  assert.match(messages[3], /Linha digitável do boleto/);
  assert.match(messages[4], /Boleto em PDF\/link/);

  const text = buildCustomerPaymentMessage({
    contrato: 12044,
    fatura: 160368,
    valor_atual: 130.25,
    vencimento_atual: '2026-04-25',
    pix_copia_cola: 'pix',
  });
  assert.match(text, /Código PIX copia e cola/);
});
