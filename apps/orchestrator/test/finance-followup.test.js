import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBoletoStillPendingMessage,
  buildPaymentConfirmedMessage,
  buildPixStillPendingMessage,
  buildWaitingDocumentFollowupMessage,
  createPaymentFollowup,
  createWaitingDocumentFollowup,
  FOLLOWUP_TYPES,
  isFollowupDue,
  nextPaymentFollowup,
  nextWaitingDocumentFollowup,
} from '../src/core/finance-followup.js';

const env = {
  EMY_WAITING_DOCUMENT_FOLLOWUP_1_MS: '600000',
  EMY_WAITING_DOCUMENT_FOLLOWUP_2_MS: '2700000',
  EMY_WAITING_DOCUMENT_ABANDON_MS: '7200000',
  EMY_PIX_PAYMENT_CHECK_1_MS: '900000',
  EMY_PIX_PAYMENT_CHECK_2_MS: '2700000',
  EMY_BOLETO_PAYMENT_CHECK_1_MS: '86400000',
  EMY_BOLETO_PAYMENT_CHECK_2_MS: '259200000',
};

test('createWaitingDocumentFollowup schedules first reminder', () => {
  const now = new Date('2026-07-30T03:00:00.000Z');
  const followup = createWaitingDocumentFollowup(now, env);
  assert.equal(followup.type, FOLLOWUP_TYPES.WAITING_DOCUMENT);
  assert.equal(followup.attempts, 0);
  assert.equal(followup.nextAt, '2026-07-30T03:10:00.000Z');
});

test('waiting document followup advances and then abandons', () => {
  const now = new Date('2026-07-30T03:10:00.000Z');
  const first = nextWaitingDocumentFollowup({ type: FOLLOWUP_TYPES.WAITING_DOCUMENT, attempts: 0, status: 'pending' }, env, now);
  assert.equal(first.attempts, 1);
  assert.equal(first.nextAt, '2026-07-30T03:55:00.000Z');
  const second = nextWaitingDocumentFollowup({ ...first }, env, now);
  assert.equal(second.attempts, 2);
  const done = nextWaitingDocumentFollowup({ ...second }, env, now);
  assert.equal(done.status, 'done');
  assert.equal(done.reason, 'abandoned_waiting_document');
});

test('payment followup uses pix cadence for pix and general payment', () => {
  const payment = { fatura: 123, contrato: 456 };
  assert.equal(createPaymentFollowup({ payment, requestType: 'pix', now: new Date('2026-07-30T03:00:00.000Z'), env }).type, FOLLOWUP_TYPES.PIX_SENT);
  assert.equal(createPaymentFollowup({ payment, requestType: 'payment_general', now: new Date('2026-07-30T03:00:00.000Z'), env }).type, FOLLOWUP_TYPES.PIX_SENT);
  assert.equal(createPaymentFollowup({ payment, requestType: 'boleto', now: new Date('2026-07-30T03:00:00.000Z'), env }).type, FOLLOWUP_TYPES.BOLETO_SENT);
});

test('payment followup finishes with pending reminder after checks', () => {
  const now = new Date('2026-07-30T03:00:00.000Z');
  const first = nextPaymentFollowup({ type: FOLLOWUP_TYPES.PIX_SENT, attempts: 0, status: 'pending', fatura: 123 }, env, now);
  assert.equal(first.nextAt, '2026-07-30T03:45:00.000Z');
  const done = nextPaymentFollowup(first, env, now);
  assert.equal(done.status, 'done');
  assert.equal(done.reason, 'pix_followup_finished');
});

test('followup messages are cordial', () => {
  assert.match(buildWaitingDocumentFollowupMessage({ name: 'Clistenis', attempt: 1 }), /só passando/);
  assert.match(buildPixStillPendingMessage(), /ainda não apareceu/);
  assert.match(buildBoletoStillPendingMessage(), /3 dias úteis/);
  assert.match(buildPaymentConfirmedMessage(), /Pagamento confirmado/);
});

test('isFollowupDue detects due pending followup only', () => {
  const now = new Date('2026-07-30T03:00:00.000Z');
  assert.equal(isFollowupDue({ status: 'pending', nextAt: '2026-07-30T02:59:00.000Z' }, now), true);
  assert.equal(isFollowupDue({ status: 'pending', nextAt: '2026-07-30T03:01:00.000Z' }, now), false);
  assert.equal(isFollowupDue({ status: 'done', nextAt: '2026-07-30T02:59:00.000Z' }, now), false);
});
