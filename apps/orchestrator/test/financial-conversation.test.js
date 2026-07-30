import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCpfRequestMessage,
  buildFoundInvoiceMessage,
  detectFinancialRequest,
  detectTone,
  isAnticipatedPaymentRequest,
  messagesForRequestType,
} from '../src/core/financial-conversation.js';
import {
  buildAnticipatedPaymentInternalMessage,
  buildNoOpenInvoiceMessage,
  buildPaymentLinkMessage,
  buildPixMessage,
} from '../src/core/payment-message.js';

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

test('buildFoundInvoiceMessage summarizes multiple open invoices', () => {
  const text = buildFoundInvoiceMessage({
    name: 'Clistenis Souza',
    requestType: 'payment_general',
    payment: {
      open_invoices_count: 2,
      open_invoices: [
        { contrato: 1, fatura: 10, valor_atual: 100, vencimento_atual: '2026-08-05' },
        { contrato: 2, fatura: 20, valor_atual: 150, vencimento_atual: '2026-08-10' },
      ],
    },
  });
  assert.match(text, /encontrei 2 faturas/);
  assert.match(text, /Fatura 1:/);
  assert.match(text, /Fatura 2:/);
});

test('messagesForRequestType returns only requested payment channel', () => {
  const payment = { pix_copia_cola: 'pix', link_pagamento: 'https://example.invalid' };
  assert.equal(messagesForRequestType({ payment, requestType: 'pix', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 1);
  assert.equal(messagesForRequestType({ payment, requestType: 'link', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 1);
  assert.equal(messagesForRequestType({ payment, requestType: 'payment_general', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 2);
});

test('messagesForRequestType returns channels for each open invoice', () => {
  const payment = {
    open_invoices: [
      { fatura: 1, pix_copia_cola: 'pix1', link_pagamento: 'https://example.invalid/1' },
      { fatura: 2, pix_copia_cola: 'pix2', link_pagamento: 'https://example.invalid/2' },
    ],
  };
  assert.equal(messagesForRequestType({ payment, requestType: 'pix', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 2);
  assert.equal(messagesForRequestType({ payment, requestType: 'payment_general', builders: { pix: buildPixMessage, link: buildPaymentLinkMessage } }).length, 4);
});

test('isAnticipatedPaymentRequest detects customer insistence to pay early', () => {
  assert.equal(isAnticipatedPaymentRequest('quero pagar antecipado mesmo assim'), true);
  assert.equal(isAnticipatedPaymentRequest('pode gerar o boleto'), true);
});

test('buildNoOpenInvoiceMessage explains invoice not generated when due date is far', () => {
  const text = buildNoOpenInvoiceMessage({ name: 'Clistenis', nextDueDate: '2026-08-25', daysUntilNextDue: 20 });
  assert.match(text, /não encontrei fatura em aberto/);
  assert.match(text, /mais de 15 dias/);
  assert.match(text, /quero pagar antecipado/);
});

test('buildAnticipatedPaymentInternalMessage prepares human escalation', () => {
  const text = buildAnticipatedPaymentInternalMessage({ name: 'Clistenis', from: '558181956964', document: '086.***.***-60', nextDueDate: '2026-08-25' });
  assert.match(text, /gerar boleto antecipado/);
  assert.match(text, /558181956964/);
});

test('detectTone marks short dry message as objective', () => {
  assert.equal(detectTone('Manda o pix'), 'objetivo');
});
