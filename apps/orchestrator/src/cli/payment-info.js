#!/usr/bin/env node
import { loadEnvFile } from '../core/env.js';
import { buildPaymentResponse, SgpClient } from '../adapters/sgp.client.js';

loadEnvFile();

const cpfcnpj = process.argv[2];
if (!cpfcnpj) {
  console.error('Uso: node apps/orchestrator/src/cli/payment-info.js <cpf-cnpj>');
  process.exit(2);
}

const client = new SgpClient();
const paymentInfo = await client.getPaymentInfoByCpf(cpfcnpj);
const response = buildPaymentResponse(paymentInfo);

console.log(JSON.stringify({
  ok: true,
  checked_at: new Date().toISOString(),
  payment: response,
}, null, 2));
