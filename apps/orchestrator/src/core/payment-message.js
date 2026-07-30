export function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBr(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

export function buildPaymentMenuMessage(payment) {
  if (!payment?.fatura) {
    return 'Não encontrei fatura em aberto para esse CPF/CNPJ. Vou deixar registrado para conferência do atendimento.';
  }

  return [
    'Encontrei sua fatura em aberto:',
    `Contrato: ${payment.contrato}`,
    `Fatura: ${payment.fatura}`,
    `Valor atualizado: ${formatCurrency(payment.valor_atual)}`,
    `Vencimento: ${formatDateBr(payment.vencimento_atual)}`,
    '',
    'Como prefere pagar?',
    'Digite 1 para Pix copia e cola',
    'Digite 2 para Link de pagamento / QRCode',
  ].join('\n');
}

export function buildPixMessage(payment) {
  if (!payment?.pix_copia_cola) return 'Não encontrei código Pix disponível para essa fatura.';
  const header = payment.fatura ? `Pix copia e cola da fatura ${payment.fatura}:` : 'Pix copia e cola:';
  return [header, '```', payment.pix_copia_cola, '```'].join('\n');
}

export function buildPaymentLinkMessage(payment) {
  if (!payment?.link_pagamento) return 'Não encontrei link de pagamento disponível para essa fatura.';
  const header = payment.fatura ? `Link de pagamento / QRCode da fatura ${payment.fatura}:` : 'Link de pagamento / QRCode:';
  return [header, payment.link_pagamento].join('\n');
}

export function buildPaymentDeadlineMessage() {
  return 'Após pagamento por PIX, o reconhecimento costuma ocorrer em até 15 minutos. Boleto pode levar até 3 dias úteis.';
}

export function buildNoOpenInvoiceMessage({ name = '', nextDueDate = '', daysUntilNextDue = null } = {}) {
  const prefix = name ? `${name}, consultei aqui e não encontrei fatura em aberto no momento.` : 'Consultei aqui e não encontrei fatura em aberto no momento.';
  if (nextDueDate && Number.isFinite(daysUntilNextDue) && daysUntilNextDue > 15) {
    return [
      prefix,
      '',
      `Pelo histórico, o próximo vencimento fica para ${formatDateBr(nextDueDate)}.`,
      'Como ainda faltam mais de 15 dias, é provável que essa fatura ainda não tenha sido gerada pelo sistema.',
      '',
      'Se você quiser pagar antecipado mesmo assim, me diga “quero pagar antecipado” que eu aviso a equipe para gerar o boleto para você.',
    ].join('\n');
  }

  return [
    prefix,
    '',
    'Pode ser que a próxima fatura ainda não tenha sido gerada pelo sistema.',
    'Se você quiser pagar antecipado, me diga “quero pagar antecipado” que eu aviso a equipe para gerar o boleto para você.',
  ].join('\n');
}

export function buildAnticipatedPaymentClientMessage({ name = '' } = {}) {
  const prefix = name ? `${name}, sem problema.` : 'Sem problema.';
  return `${prefix} Vou avisar a equipe financeira para gerar o boleto antecipado. Assim que estiver pronto, enviamos para você por aqui.`;
}

export function buildAnticipatedPaymentInternalMessage({ name = '', from = '', document = '', nextDueDate = '' } = {}) {
  return [
    '⚠️ Emy V2 - gerar boleto antecipado',
    '',
    `Cliente: ${name || 'não informado'}`,
    `WhatsApp: ${from || 'não informado'}`,
    `Documento: ${document || 'não informado'}`,
    nextDueDate ? `Próximo vencimento estimado: ${formatDateBr(nextDueDate)}` : '',
    '',
    'Cliente informou que quer pagar antecipado, mas a fatura ainda não apareceu como aberta no SGP. Favor gerar o boleto e enviar ao cliente o quanto antes.',
  ].filter(Boolean).join('\n');
}

export function buildCustomerPaymentMessages(payment) {
  if (!payment?.fatura) return [buildPaymentMenuMessage(payment)];
  return [buildPaymentMenuMessage(payment)];
}

export function buildCustomerPaymentMessage(payment) {
  return buildCustomerPaymentMessages(payment).join('\n\n');
}
