import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCpfCnpj, maskDocument } from '../src/core/document.js';
import { assertSafeOutbound } from '../src/core/safety.js';
import { buildCustomerPaymentMessage } from '../src/core/payment-message.js';

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

test('assertSafeOutbound allows only test allowlisted recipient with auto send enabled', () => {
  assert.deepEqual(assertSafeOutbound({ to: '55 81 99999-9999', env: { AUTO_SEND_TO_CUSTOMER: 'true', EMY_TEST_MODE: 'true', EMY_TEST_WHATSAPP_ALLOWLIST: '5581999999999' } }), {
    allowed: true,
    reason: 'recipient_allowlisted_test_mode',
  });
});

test('buildCustomerPaymentMessage includes payment channels when available', () => {
  const text = buildCustomerPaymentMessage({
    contrato: 12044,
    fatura: 160368,
    valor_atual: 130.25,
    vencimento_atual: '2026-04-25',
    pix_copia_cola: 'pix',
    linha_digitavel: 'linha',
    link_pagamento: 'https://example.invalid/pagar',
    boleto_link: 'https://example.invalid/boleto',
  });

  assert.match(text, /contrato 12044/);
  assert.match(text, /PIX copia e cola/);
  assert.match(text, /Linha digitável/);
  assert.match(text, /Link de pagamento/);
  assert.match(text, /Boleto/);
});
