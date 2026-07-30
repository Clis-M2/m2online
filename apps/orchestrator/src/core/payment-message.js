export function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildCustomerPaymentMessages(payment) {
  if (!payment?.fatura) {
    return ['Não encontrei fatura em aberto para esse CPF/CNPJ. Vou deixar registrado para conferência do atendimento.'];
  }

  const messages = [
    [
      'Encontrei sua fatura em aberto:',
      `Contrato: ${payment.contrato}`,
      `Fatura: ${payment.fatura}`,
      `Valor atualizado: ${formatCurrency(payment.valor_atual)}`,
      `Vencimento: ${payment.vencimento_atual}`,
    ].join('\n'),
  ];

  if (payment.link_pagamento) {
    messages.push([
      'QRCode / Link de pagamento:',
      payment.link_pagamento,
      'Abra o link acima para visualizar o QR Code na tela.',
    ].join('\n'));
  }

  if (payment.pix_copia_cola) {
    messages.push([
      'Código PIX copia e cola:',
      payment.pix_copia_cola,
    ].join('\n'));
  }

  if (payment.linha_digitavel) {
    messages.push([
      'Linha digitável do boleto:',
      payment.linha_digitavel,
    ].join('\n'));
  }

  if (payment.boleto_link) {
    messages.push([
      'Boleto em PDF/link:',
      payment.boleto_link,
    ].join('\n'));
  }

  messages.push('Após pagamento por PIX, o reconhecimento costuma ocorrer em até 15 minutos. Boleto pode levar até 3 dias úteis.');
  return messages;
}

export function buildCustomerPaymentMessage(payment) {
  return buildCustomerPaymentMessages(payment).join('\n\n');
}
