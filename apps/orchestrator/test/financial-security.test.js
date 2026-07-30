import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDocumentAttemptMessage,
  buildExpiredDocumentMessage,
  documentValidationExpired,
  incrementDocumentAttempts,
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

test('security messages are protective and customer friendly', () => {
  assert.match(buildDocumentAttemptMessage({ attempts: 1, maxAttempts: 3 }), /CPF ou CNPJ do titular/);
  assert.match(buildDocumentAttemptMessage({ attempts: 3, maxAttempts: 3 }), /proteger seus dados/);
  assert.match(buildExpiredDocumentMessage({ name: 'Clistenis' }), /validação anterior expirou/);
});
