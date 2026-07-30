export function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    `Vencimento: ${payment.vencimento_atual}`,
    '',
    'Como prefere pagar?',
    'Digite 1 para Pix copia e cola',
    'Digite 2 para Link de pagamento / QRCode',
  ].join('\n');
}

export function buildPixMessage(payment) {
  if (!payment?.pix_copia_cola) return 'Não encontrei código Pix disponível para essa fatura.';
  return [
    'Pix copia e cola:',
    '```',
    payment.pix_copia_cola,
    '```',
  ].join('\n');
}

export function buildPaymentLinkMessage(payment) {
  if (!payment?.link_pagamento) return 'Não encontrei link de pagamento disponível para essa fatura.';
  return ['Link de pagamento / QRCode:', payment.link_pagamento].join('\n');
}

export function buildPaymentDeadlineMessage() {
  return 'Após pagamento por PIX, o reconhecimento costuma ocorrer em até 15 minutos. Boleto pode levar até 3 dias úteis.';
}

export function buildCustomerPaymentMessages(payment) {
  if (!payment?.fatura) return [buildPaymentMenuMessage(payment)];
  return [buildPaymentMenuMessage(payment)];
}

export function buildCustomerPaymentMessage(payment) {
  return buildCustomerPaymentMessages(payment).join('\n\n');
}
