import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDocumentAttemptMessage,
  buildDocumentWaitAcknowledgementMessage,
  buildExpiredDocumentMessage,
  documentValidationExpired,
  handoffRecentlySent,
  incrementDocumentAttempts,
  isDocumentWaitAcknowledgement,
} from '../src/core/financial-security.js';

test('documentValidationExpired expires validated document after ttl', () => {
  const now = new Date('2026-07-30T03:00:00.000Z');
  assert.equal(documentValidationExpired({ document: '041.***.***-16', documentValidatedAt: '2026-07-30T02:20:00.000Z' }, 30 * 60 * 1000, now), true);
  assert.equal(documentValidationExpired({ document: '041.***.***-16', documentValidatedAt: '2026-07-30T02:45:00.000Z' }, 30 * 60 * 1000, now), false);
});

test('documentValidationExpired requires document presence', () => {
  assert.equal(documentValidationExpired({ documentValidatedAt: '2026-07-30T02:45:00.000Z' }), true);
});

test('incrementDocumentAttempts blocks after max attempts', () => {
  assert.deepEqual(incrementDocumentAttempts({ documentAttempts: 0 }, 3), { attempts: 1, blocked: false });
  assert.deepEqual(incrementDocumentAttempts({ documentAttempts: 2 }, 3), { attempts: 3, blocked: true });
});

test('document wait acknowledgements do not count as invalid document attempts', () => {
  assert.equal(isDocumentWaitAcknowledgement('Claro, vou enviar agora...'), true);
  assert.equal(isDocumentWaitAcknowledgement('Opa, tinha esquecido... ainda bem que me lembrou!'), true);
  assert.equal(isDocumentWaitAcknowledgement('pera aí que vou procurar'), true);
  assert.equal(isDocumentWaitAcknowledgement('meu cpf é inválido'), false);
  assert.match(buildDocumentWaitAcknowledgementMessage({ name: 'Clistenis' }), /Fico aguardando/);
});

test('handoffRecentlySent applies cooldown to avoid duplicate human escalation', () => {
  const now = new Date('2026-07-30T14:40:00.000Z');
  assert.equal(handoffRecentlySent({ securityHandoffSentAt: '2026-07-30T14:39:00.000Z' }, 10 * 60 * 1000, now), true);
  assert.equal(handoffRecentlySent({ securityHandoffSentAt: '2026-07-30T14:20:00.000Z' }, 10 * 60 * 1000, now), false);
});

test('security messages are protective and customer friendly', () => {
  assert.match(buildDocumentAttemptMessage({ attempts: 1, maxAttempts: 3 }), /CPF ou CNPJ do titular/);
  assert.match(buildDocumentAttemptMessage({ attempts: 3, maxAttempts: 3 }), /proteger seus dados/);
  assert.match(buildExpiredDocumentMessage({ name: 'Clistenis' }), /validação anterior expirou/);
});
