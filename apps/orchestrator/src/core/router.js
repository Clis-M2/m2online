const FINANCEIRO_TERMS = [
  'boleto',
  'segunda via',
  '2 via',
  'pagamento',
  'pagar',
  'mensalidade',
  'fatura',
  'vencimento',
  'cobrança',
  'debito',
  'débito',
];

const SUPORTE_TERMS = ['sem internet', 'sem acesso', 'caiu', 'lento', 'oscilando', 'sinal'];
const COMERCIAL_TERMS = ['plano', 'instalação', 'instalacao', 'contratar', 'valor'];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function classifyIntent(messageText) {
  const text = String(messageText || '').toLowerCase();

  if (includesAny(text, FINANCEIRO_TERMS)) {
    return { area: 'financeiro', intent: 'financial_request', confidence: 0.86 };
  }

  if (includesAny(text, SUPORTE_TERMS)) {
    return { area: 'suporte', intent: 'support_request', confidence: 0.82 };
  }

  if (includesAny(text, COMERCIAL_TERMS)) {
    return { area: 'comercial', intent: 'commercial_request', confidence: 0.76 };
  }

  return { area: 'triagem', intent: 'needs_clarification', confidence: 0.42 };
}
