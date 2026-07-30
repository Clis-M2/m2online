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

function addOneMonth(dateText) {
  if (!dateText) return '';
  const [year, month, day] = String(dateText).split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateText, now = new Date()) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00-03:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function inferNextInvoiceFromPaidInvoices(invoices) {
  const latestPaid = invoices.find((invoice) => invoice.dueDate);
  if (!latestPaid) return null;
  const nextDueDate = addOneMonth(latestPaid.dueDate);
  return {
    basedOnInvoiceId: latestPaid.invoiceId,
    basedOnDueDate: latestPaid.dueDate,
    nextDueDate,
    daysUntilNextDue: daysUntil(nextDueDate),
  };
}

function uniqueContractsFromInvoices(invoices) {
  return [...new Set((invoices || []).map((invoice) => invoice.contractId).filter(Boolean))];
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

  async getInvoiceById(invoiceId) {
    const data = await this.postJson('/api/ura/titulos/', {
      titulo_id: invoiceId,
      limit: 1,
      offset: 0,
    });
    const invoice = (data.titulos || []).map(normalizeInvoice)[0] || null;
    return invoice;
  }

  async getPaymentInfoByCpf(cpfcnpj) {
    const { pagination, invoices } = await this.listInvoicesByCpf(cpfcnpj, {
      status: 'abertos',
      limit: 20,
      ordenar: 'data_vencimento',
      ordenar_ordem: 'desc',
    });

    const paidResult = await this.listInvoicesByCpf(cpfcnpj, {
      status: 'pagos',
      limit: 20,
      ordenar: 'data_vencimento',
      ordenar_ordem: 'desc',
    }).catch(() => ({ pagination: {}, invoices: [] }));

    const canceledResult = await this.listInvoicesByCpf(cpfcnpj, {
      status: 'cancelados',
      limit: 20,
      ordenar: 'data_vencimento',
      ordenar_ordem: 'desc',
    }).catch(() => ({ pagination: {}, invoices: [] }));

    return {
      cpfcnpj: onlyDigits(cpfcnpj),
      pagination,
      openInvoices: invoices,
      paidInvoices: paidResult.invoices,
      canceledInvoices: canceledResult.invoices,
      historicalContracts: uniqueContractsFromInvoices([...invoices, ...paidResult.invoices]),
      allKnownContracts: uniqueContractsFromInvoices([...invoices, ...paidResult.invoices, ...canceledResult.invoices]),
      primaryInvoice: invoices[0] || null,
      nextInvoiceEstimate: invoices.length ? null : inferNextInvoiceFromPaidInvoices(paidResult.invoices),
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
      open_invoices_count: 0,
      open_invoices: [],
      historical_contracts: paymentInfo.historicalContracts || [],
      all_known_contracts: paymentInfo.allKnownContracts || paymentInfo.historicalContracts || [],
      next_invoice_estimate: paymentInfo.nextInvoiceEstimate || null,
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
    open_invoices_count: paymentInfo.openInvoices?.length || 1,
    historical_contracts: paymentInfo.historicalContracts || [],
    all_known_contracts: paymentInfo.allKnownContracts || paymentInfo.historicalContracts || [],
    open_invoices: (paymentInfo.openInvoices || [invoice]).map((item) => ({
      boleto_link: item.boletoLink,
      link_pagamento: item.paymentLink,
      linha_digitavel: item.paymentLine,
      codigo_barras: item.barcode,
      pix_copia_cola: item.pixCopyPaste,
      vencimento_atual: item.dueDate,
      vencimento_original: item.dueDate,
      dias_em_atraso: item.daysLate,
      valor_original: item.originalAmount,
      valor_atual: item.currentAmount,
      contrato: item.contractId,
      fatura: item.invoiceId,
    })),
    next_invoice_estimate: null,
  };
}
