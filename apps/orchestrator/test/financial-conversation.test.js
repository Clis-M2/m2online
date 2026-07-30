import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCpfRequestMessage,
  buildFoundInvoiceMessage,
  detectFinancialRequest,
  detectTone,
  messagesForRequestType,
} from '../src/core/financial-conversation.js';
import { buildPaymentLinkMessage, buildPixMessage } from '../src/core/payment-message.js';

test('detectFinancialRequest identifies direct pix intent', () => {
  assert.equal(detectFinancialRequest('Quero pagar, manda o Pix').type, 'pix');
  assert.equal(detectFinancialRequest('me manda o link de pagamento').type, 'link');
});

test('buildCpfRequestMessage adapts to objective tone and name', () => {
  const text = buildCpfRequestMessage({ name: 'Clistenis Souza', tone: 'objetivo' });
  assert.match(text, /Oi, Clistenis/);
  assert.match(text, /confirma o CPF\/CNPJ/);
});

test('buildFoundInvoiceMessage is concise and personalized', () => {
  const text = buildFoundInvoiceMessage({
    name: 'Clistenis Souza',
    requestType: 'pix',
    payment: { contrato: 12333, fatura: 162097, valor_atual: 150.43, vencimento_atual: '2026-07-05' },
  });
  assert.match(text, /Clistenis, encontrei sua fatura/);
  assert.match(text, /Já vou te enviar o Pix/);
});

test('messagesForRequestType returns only requested payment channel', () => {
  const payment = { pix_copia_cola: 'pix', link_pagamento: 'https://example.invalid' };
  assert.equal(messagesForRequestType({ payment, requestType: 'pix', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 1);
  assert.equal(messagesForRequestType({ payment, requestType: 'link', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 1);
  assert.equal(messagesForRequestType({ payment, requestType: 'payment_general', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 2);
});

test('detectTone marks short dry message as objective', () => {
  assert.equal(detectTone('Manda o pix'), 'objetivo');
});
