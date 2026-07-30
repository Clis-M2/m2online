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

function displayFirstName(name = '') {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (!first || /^\+?\d+$/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function buildNoOpenInvoiceMessage({ name = '', nextDueDate = '', daysUntilNextDue = null, contracts = [] } = {}) {
  const displayName = displayFirstName(name);
  const first = displayName ? `${displayName}, localizei seu cadastro, mas não encontrei nenhuma fatura em aberto agora.` : 'Localizei seu cadastro, mas não encontrei nenhuma fatura em aberto agora.';
  const contractLine = contracts.length > 1
    ? `Vi histórico em mais de um contrato nesse CPF (${contracts.join(', ')}), então conferi o cadastro como um todo.`
    : contracts.length === 1
      ? `Conferi o contrato ${contracts[0]} nesse CPF.`
      : '';

  if (nextDueDate && Number.isFinite(daysUntilNextDue) && daysUntilNextDue > 15) {
    return [
      first,
      contractLine,
      '',
      `O próximo vencimento estimado é ${formatDateBr(nextDueDate)}.`,
      'Como o sistema só gera a fatura 15 dias antes do vencimento, ela provavelmente ainda não foi gerada.',
      '',
      'Se você quiser pagar antecipado mesmo assim, me diga “quero pagar antecipado” que eu aviso a equipe para gerar o boleto para você.',
    ].filter((line) => line !== '').join('\n');
  }

  return [
    first,
    contractLine,
    '',
    'Para não te passar uma informação errada, não vou gerar nenhum link ou Pix sem uma fatura disponível no sistema.',
    'Se você quiser pagar antecipado, me diga “quero pagar antecipado” que eu aviso a equipe para gerar o boleto para você.',
  ].filter((line) => line !== '').join('\n');
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
