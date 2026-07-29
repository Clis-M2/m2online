export function buildFinancialAssistedReply({ customer, invoices }) {
  if (!customer) {
    return {
      requiresHuman: true,
      reason: 'customer_not_found',
      text: 'Não encontrei o cadastro com segurança. Para evitar expor dados, encaminhe para atendimento humano validar a identidade do cliente.',
    };
  }

  if (!invoices.length) {
    return {
      requiresHuman: true,
      reason: 'no_open_invoice',
      text: `Cliente ${customer.name} localizado sem faturas abertas no mock. Confirmar no SGP antes de responder.`,
    };
  }

  const invoice = invoices[0];
  return {
    requiresHuman: true,
    reason: 'financial_reply_ready_for_approval',
    text: [
      `Sugestão para aprovação humana:`,
      `Olá! Encontrei uma fatura em aberto com vencimento em ${invoice.dueDate}, no valor de R$ ${invoice.amount.toFixed(2).replace('.', ',')}.`,
      `Posso te enviar a segunda via do boleto por aqui.`,
      `Observação interna: conferir identidade do cliente antes de enviar linha digitável ou PDF real.`,
    ].join('\n'),
    metadata: {
      invoiceRef: invoice.invoiceRef,
      dueDate: invoice.dueDate,
      amount: invoice.amount,
    },
  };
}
