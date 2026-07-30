import assert from 'node:assert/strict';
import { test } from 'node:test';
import { humanDelayConfig, randomDelay, waitHumanized } from '../src/core/humanized-delivery.js';

test('humanDelayConfig uses safe defaults', () => {
  const config = humanDelayConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.firstMinMs, 20000);
  assert.equal(config.firstMaxMs, 30000);
  assert.equal(config.betweenMs, 5000);
});

test('randomDelay stays within range', () => {
  for (let i = 0; i < 20; i += 1) {
    const delay = randomDelay(20, 30);
    assert.ok(delay >= 20 && delay <= 30);
  }
});

test('waitHumanized returns immediately when disabled', async () => {
  const started = Date.now();
  const waited = await waitHumanized({ first: true, env: { EMY_HUMANIZED_DELIVERY_ENABLED: 'false' } });
  assert.equal(waited, 0);
  assert.ok(Date.now() - started < 50);
});
