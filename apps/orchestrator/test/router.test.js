import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRouterClientMessage, buildRouterPrivateNote, classifyIntent } from '../src/core/router.js';

test('router classifies financial boleto request', () => {
  const result = classifyIntent('Preciso da segunda via do boleto e do pix');

  assert.equal(result.area, 'financeiro');
  assert.equal(result.activeAgent, 'emy-financeiro');
  assert.equal(result.intent, 'pix_request');
  assert.equal(result.requiresHuman, false);
  assert.ok(result.confidence >= 0.8);
});

test('router classifies support issue', () => {
  const result = classifyIntent('Estou sem internet desde cedo, o roteador está com luz vermelha');

  assert.equal(result.area, 'suporte');
  assert.equal(result.activeAgent, 'emy-suporte');
  assert.equal(result.intent, 'internet_offline');
  assert.equal(result.requiresHuman, false);
});

test('router classifies commercial request', () => {
  const result = classifyIntent('Quero contratar um plano de internet, tem cobertura no meu bairro?');

  assert.equal(result.area, 'comercial');
  assert.equal(result.activeAgent, 'emy-comercial');
  assert.equal(result.intent, 'coverage_check');
});

test('router escalates explicit human request', () => {
  const result = classifyIntent('Quero falar com um atendente humano agora');

  assert.equal(result.area, 'humano');
  assert.equal(result.activeAgent, 'humano');
  assert.equal(result.intent, 'human_requested');
  assert.equal(result.requiresHuman, true);
});

test('router escalates emergency or physical risk', () => {
  const result = classifyIntent('Tem um fio caído com faísca no poste');

  assert.equal(result.area, 'humano');
  assert.equal(result.intent, 'emergency_or_physical_risk');
  assert.equal(result.priority, 'urgent');
  assert.equal(result.requiresHuman, true);
});

test('router routes mixed support and financial block to finance first', () => {
  const result = classifyIntent('Estou sem internet e também tenho uma fatura em aberto para pagar e liberar');

  assert.equal(result.area, 'financeiro');
  assert.equal(result.intent, 'multiple_intents_routed_by_priority');
  assert.equal(result.multipleIntents, true);
  assert.ok(result.candidates.some((candidate) => candidate.area === 'suporte'));
});

test('router routes direct menu replies', () => {
  assert.equal(classifyIntent('Financeiro').area, 'financeiro');
  assert.equal(classifyIntent('Suporte').area, 'suporte');
  assert.equal(classifyIntent('Comercial').area, 'comercial');
});

test('router asks for clarification when intent is weak', () => {
  const result = classifyIntent('oi bom dia');

  assert.equal(result.area, 'triagem');
  assert.equal(result.activeAgent, 'emy-orquestradora');
  assert.equal(result.intent, 'needs_clarification');
});

test('router client messages and notes are operational', () => {
  const classification = classifyIntent('Minha internet está lenta');
  const clientMessage = buildRouterClientMessage(classification, { name: 'Clistenis Souza' });
  const note = buildRouterPrivateNote({ inbound: { from: '558181956964', text: 'Minha internet está lenta' }, classification });

  assert.match(clientMessage, /Clistenis/);
  assert.match(clientMessage, /suporte técnico/);
  assert.match(note, /Emy V2 Orquestradora/);
  assert.match(note, /Área identificada: suporte/);
});
