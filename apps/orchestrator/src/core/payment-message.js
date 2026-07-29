export function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildCustomerPaymentMessage(payment) {
  if (!payment?.fatura) {
    return 'Não encontrei fatura em aberto para esse CPF/CNPJ. Vou deixar registrado para conferência do atendimento.';
  }

  const parts = [
    `Encontrei sua fatura em aberto do contrato ${payment.contrato}.`,
    `Valor atualizado: ${formatCurrency(payment.valor_atual)}.`,
    `Vencimento: ${payment.vencimento_atual}.`,
  ];

  if (payment.pix_copia_cola) parts.push(`PIX copia e cola:\n${payment.pix_copia_cola}`);
  if (payment.linha_digitavel) parts.push(`Linha digitável:\n${payment.linha_digitavel}`);
  if (payment.link_pagamento) parts.push(`Link de pagamento: ${payment.link_pagamento}`);
  if (payment.boleto_link) parts.push(`Boleto: ${payment.boleto_link}`);

  parts.push('Após o pagamento por PIX, o reconhecimento costuma ocorrer em até 15 minutos. Boleto pode levar até 3 dias úteis.');
  return parts.join('\n\n');
}
