import { requireEnv } from '../core/env.js';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function toIsoDate(value) {
  return value || '';
}

function daysLate(dueDate, now = new Date()) {
  if (!dueDate) return '';
  const due = new Date(`${dueDate}T00:00:00-03:00`);
  if (Number.isNaN(due.getTime())) return '';
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? String(diff) : '0';
}

export class SgpClient {
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || requireEnv('SGP_API_URL')).replace(/\/$/, '');
    this.app = config.app || requireEnv('SGP_APP');
    this.token = config.token || requireEnv('SGP_API_TOKEN');
  }

  async postJson(path, body = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ app: this.app, token: this.token, ...body }),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(`SGP HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async listInvoicesByCpf(cpfcnpj, options = {}) {
    const data = await this.postJson('/api/ura/titulos/', {
      cpfcnpj: onlyDigits(cpfcnpj),
      limit: options.limit || 10,
      offset: options.offset || 0,
      status: options.status || 'abertos',
      ordenar: options.ordenar || 'data_vencimento',
      ordenar_ordem: options.ordenar_ordem || 'desc',
    });

    return {
      pagination: data.paginacao || {},
      invoices: (data.titulos || []).map(normalizeInvoice),
    };
  }

  async getPaymentInfoByCpf(cpfcnpj) {
    const { pagination, invoices } = await this.listInvoicesByCpf(cpfcnpj, {
      status: 'abertos',
      limit: 10,
      ordenar: 'data_vencimento',
      ordenar_ordem: 'desc',
    });

    return {
      cpfcnpj: onlyDigits(cpfcnpj),
      pagination,
      openInvoices: invoices,
      primaryInvoice: invoices[0] || null,
    };
  }
}

export function normalizeInvoice(raw) {
  const originalAmount = parseMoney(raw.valor);
  const currentAmount = parseMoney(raw.valorCorrigido || raw.valor);

  return {
    invoiceId: raw.id,
    customerName: raw.clienteNome || '',
    customerDocument: onlyDigits(raw.clienteCpfcnpj),
    contractId: raw.clienteContrato,
    provider: raw.portador || '',
    documentNumber: raw.numeroDocumento,
    status: raw.status || '',
    originalAmount,
    currentAmount,
    paidAmount: parseMoney(raw.valorPago),
    partialPaidAmount: parseMoney(raw.valorPagoParcial),
    issuedAt: toIsoDate(raw.dataEmissao),
    dueDate: toIsoDate(raw.dataVencimento),
    paidAt: toIsoDate(raw.dataPagamento),
    canceledAt: toIsoDate(raw.dataCancelamento),
    boletoLink: raw.link || '',
    paymentLink: raw.link_cobranca || '',
    barcode: raw.codigoBarras || '',
    paymentLine: raw.linhaDigitavel || '',
    pixCopyPaste: raw.codigoPix || '',
    daysLate: daysLate(raw.dataVencimento),
    hasPaymentData: Boolean(raw.link || raw.link_cobranca || raw.linhaDigitavel || raw.codigoPix || raw.codigoBarras),
  };
}

export function buildPaymentResponse(paymentInfo) {
  const invoice = paymentInfo.primaryInvoice;
  if (!invoice) {
    return {
      response: 'Não encontrei fatura em aberto para este CPF/CNPJ.',
      boleto_link: '',
      link_pagamento: '',
      linha_digitavel: '',
      codigo_barras: '',
      pix_copia_cola: '',
      vencimento_atual: '',
      vencimento_original: '',
      dias_em_atraso: '',
      valor_original: '',
      valor_atual: '',
      contrato: '',
      fatura: '',
    };
  }

  return {
    response: [
      `Encontrei uma fatura em aberto no contrato ${invoice.contractId}.`,
      `Fatura: ${invoice.invoiceId}`,
      `Valor original: R$ ${invoice.originalAmount.toFixed(2).replace('.', ',')}`,
      `Valor atualizado: R$ ${invoice.currentAmount.toFixed(2).replace('.', ',')}`,
      `Vencimento: ${invoice.dueDate}`,
    ].join('\n'),
    boleto_link: invoice.boletoLink,
    link_pagamento: invoice.paymentLink,
    linha_digitavel: invoice.paymentLine,
    codigo_barras: invoice.barcode,
    pix_copia_cola: invoice.pixCopyPaste,
    vencimento_atual: invoice.dueDate,
    vencimento_original: invoice.dueDate,
    dias_em_atraso: invoice.daysLate,
    valor_original: invoice.originalAmount,
    valor_atual: invoice.currentAmount,
    contrato: invoice.contractId,
    fatura: invoice.invoiceId,
  };
}
