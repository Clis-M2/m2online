export function detectFinancialRequest(text = '') {
  const normalized = String(text).toLowerCase();
  const wantsPix = /\bpix\b|copia e cola|copia-e-cola/.test(normalized);
  const wantsLink = /link|qr ?code|qrcode|pagamento online/.test(normalized);
  const wantsBoleto = /boleto|linha digit[áa]vel|segunda via|2[ªa]? via|fatura/.test(normalized);
  const wantsPay = /pagar|pagamento|quitar|mensalidade/.test(normalized);

  if (wantsPix && wantsLink) return { type: 'pix_and_link', confidence: 0.95 };
  if (wantsPix) return { type: 'pix', confidence: 0.92 };
  if (wantsLink) return { type: 'link', confidence: 0.88 };
  if (wantsBoleto) return { type: 'boleto', confidence: 0.86 };
  if (wantsPay) return { type: 'payment_general', confidence: 0.78 };
  return { type: 'financial_general', confidence: 0.65 };
}

export function detectTone(text = '') {
  const raw = String(text || '').trim();
  const normalized = raw.toLowerCase();
  if (/urgente|absurdo|de novo|reclama|chateado|raiva|cancelar|péssimo|pessimo/.test(normalized)) return 'irritado';
  if (/não sei|nao sei|como faço|como faco|me ajuda|dúvida|duvida/.test(normalized)) return 'confuso';
  if (raw.length <= 35 && !/[?]/.test(raw)) return 'objetivo';
  return 'neutro';
}

export function firstName(name = '') {
  const cleaned = String(name || '').trim();
  if (!cleaned || /^\+?\d+$/.test(cleaned)) return '';
  return cleaned.split(/\s+/)[0];
}

export function buildCpfRequestMessage({ name = '', tone = 'neutro' } = {}) {
  const greeting = firstName(name) ? `Oi, ${firstName(name)}.` : 'Oi.';
  if (tone === 'objetivo') {
    return `${greeting} Te ajudo com isso agora.\n\nPor segurança, me confirma o CPF/CNPJ do titular para eu localizar a fatura correta?`;
  }
  if (tone === 'irritado') {
    return `${greeting} Vou verificar isso com cuidado.\n\nPor segurança, me confirma o CPF/CNPJ do titular para eu acessar a fatura correta?`;
  }
  return `${greeting} A partir de agora vou te acompanhar neste atendimento, ok?\n\nPor segurança, me confirma o CPF/CNPJ do titular para eu localizar a fatura correta?`;
}

export function buildFoundInvoiceMessage({ name = '', payment, requestType = 'payment_general' }) {
  const prefix = firstName(name) ? `${firstName(name)}, encontrei sua fatura:` : 'Encontrei sua fatura:';
  const next = requestType === 'pix'
    ? 'Já vou te enviar o Pix copia e cola.'
    : requestType === 'link'
      ? 'Já vou te enviar o link de pagamento.'
      : 'Já vou te enviar o Pix e o link de pagamento.';

  return [
    prefix,
    '',
    `Contrato: ${payment.contrato}`,
    `Fatura: ${payment.fatura}`,
    `Valor atualizado: ${Number(payment.valor_atual || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    `Vencimento: ${payment.vencimento_atual}`,
    '',
    next,
  ].join('\n');
}

export function messagesForRequestType({ payment, requestType, builders }) {
  if (requestType === 'pix') return [builders.pix(payment)];
  if (requestType === 'link') return [builders.link(payment)];
  if (requestType === 'boleto') return [builders.link(payment)];
  return [builders.pix(payment), builders.link(payment)];
}
