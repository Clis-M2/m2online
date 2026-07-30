import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPaymentResponse, normalizeInvoice } from '../src/adapters/sgp.client.js';

test('normalizeInvoice maps SGP URA title fields to Emy payment fields', () => {
  const invoice = normalizeInvoice({
    id: 160368,
    clienteNome: 'Cliente Teste',
    clienteCpfcnpj: '031.346.044-26',
    clienteContrato: 12044,
    portador: 'C J DE SOUZA',
    numeroDocumento: 165582,
    status: 'aberto',
    valor: 104.9,
    valorCorrigido: 130.25,
    valorPago: 0,
    dataEmissao: '2026-04-14',
    dataVencimento: '2026-04-25',
    link: 'https://example.invalid/boleto',
    link_cobranca: 'https://example.invalid/pagar',
    codigoBarras: '123',
    linhaDigitavel: '456',
    codigoPix: 'pix-copia-e-cola',
  });

  assert.equal(invoice.invoiceId, 160368);
  assert.equal(invoice.customerDocument, '03134604426');
  assert.equal(invoice.contractId, 12044);
  assert.equal(invoice.originalAmount, 104.9);
  assert.equal(invoice.currentAmount, 130.25);
  assert.equal(invoice.boletoLink, 'https://example.invalid/boleto');
  assert.equal(invoice.paymentLink, 'https://example.invalid/pagar');
  assert.equal(invoice.paymentLine, '456');
  assert.equal(invoice.pixCopyPaste, 'pix-copia-e-cola');
  assert.equal(invoice.hasPaymentData, true);
});

test('buildPaymentResponse returns no invoice estimate when there is no open invoice', () => {
  const response = buildPaymentResponse({
    primaryInvoice: null,
    openInvoices: [],
    nextInvoiceEstimate: { nextDueDate: '2026-08-25', daysUntilNextDue: 20 },
  });

  assert.equal(response.fatura, '');
  assert.equal(response.open_invoices_count, 0);
  assert.deepEqual(response.historical_contracts, []);
  assert.equal(response.next_invoice_estimate.nextDueDate, '2026-08-25');
});

test('buildPaymentResponse returns structured payment fields for open invoice', () => {
  const response = buildPaymentResponse({
    primaryInvoice: {
      invoiceId: 160368,
      contractId: 12044,
      originalAmount: 104.9,
      currentAmount: 130.25,
      dueDate: '2026-04-25',
      boletoLink: 'https://example.invalid/boleto',
      paymentLink: 'https://example.invalid/pagar',
      paymentLine: 'linha-digitavel',
      barcode: 'codigo-barras',
      pixCopyPaste: 'pix-copia-e-cola',
      daysLate: '95',
    },
  });

  assert.match(response.response, /contrato 12044/);
  assert.equal(response.boleto_link, 'https://example.invalid/boleto');
  assert.equal(response.link_pagamento, 'https://example.invalid/pagar');
  assert.equal(response.linha_digitavel, 'linha-digitavel');
  assert.equal(response.codigo_barras, 'codigo-barras');
  assert.equal(response.pix_copia_cola, 'pix-copia-e-cola');
  assert.equal(response.valor_atual, 130.25);
});
