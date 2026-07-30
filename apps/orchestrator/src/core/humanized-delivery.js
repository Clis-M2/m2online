import { parseBoolean } from './safety.js';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

export function humanDelayConfig(env = process.env) {
  return {
    enabled: parseBoolean(env.EMY_HUMANIZED_DELIVERY_ENABLED, true),
    firstMinMs: Number(env.EMY_FIRST_RESPONSE_DELAY_MIN_MS || 20000),
    firstMaxMs: Number(env.EMY_FIRST_RESPONSE_DELAY_MAX_MS || 30000),
    betweenMs: Number(env.EMY_BETWEEN_MESSAGES_DELAY_MS || 5000),
    typingEnabled: parseBoolean(env.EMY_TYPING_PRESENCE_ENABLED, true),
  };
}

export function randomDelay(minMs, maxMs) {
  const min = Math.max(0, Number(minMs || 0));
  const max = Math.max(min, Number(maxMs || min));
  return Math.round(min + Math.random() * (max - min));
}

export async function waitHumanized({ first = false, env = process.env } = {}) {
  const config = humanDelayConfig(env);
  if (!config.enabled) return 0;
  const delay = first ? randomDelay(config.firstMinMs, config.firstMaxMs) : config.betweenMs;
  await sleep(delay);
  return delay;
}
