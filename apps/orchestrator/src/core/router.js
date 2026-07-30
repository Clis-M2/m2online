const ROUTE_AREAS = {
  FINANCEIRO: 'financeiro',
  SUPORTE: 'suporte',
  COMERCIAL: 'comercial',
  HUMANO: 'humano',
  TRIAGEM: 'triagem',
};

const AGENTS_BY_AREA = {
  [ROUTE_AREAS.FINANCEIRO]: 'emy-financeiro',
  [ROUTE_AREAS.SUPORTE]: 'emy-suporte',
  [ROUTE_AREAS.COMERCIAL]: 'emy-comercial',
  [ROUTE_AREAS.HUMANO]: 'humano',
  [ROUTE_AREAS.TRIAGEM]: 'emy-orquestradora',
};

const PRIORITY_BY_AREA = {
  [ROUTE_AREAS.HUMANO]: 100,
  [ROUTE_AREAS.FINANCEIRO]: 80,
  [ROUTE_AREAS.SUPORTE]: 70,
  [ROUTE_AREAS.COMERCIAL]: 60,
  [ROUTE_AREAS.TRIAGEM]: 10,
};

const TERMS = {
  financeiro: [
    'financeiro', 'financeira',
    'boleto', 'segunda via', '2 via', '2ª via', 'pix', 'linha digitavel', 'linha digitável', 'codigo de barras', 'código de barras',
    'pagamento', 'pagar', 'mensalidade', 'fatura', 'vencimento', 'cobranca', 'cobrança', 'debito', 'débito', 'atrasado',
    'bloqueio', 'bloqueado', 'desbloqueio', 'liberar internet', 'comprovante', 'paguei', 'quitar', 'renegociar', 'desconto',
  ],
  suporte: [
    'suporte', 'tecnico', 'técnico',
    'sem internet', 'sem acesso', 'internet caiu', 'caiu', 'nao navega', 'não navega', 'lento', 'lenta', 'lentidao', 'lentidão',
    'oscilando', 'oscila', 'sinal', 'wifi', 'wi-fi', 'roteador', 'onu', 'los', 'pon', 'cabo rompido', 'cabo', 'conexao', 'conexão',
    'ping', 'travando', 'intermitente', 'abrir chamado', 'visita tecnica', 'visita técnica',
  ],
  comercial: [
    'comercial', 'vendas', 'venda',
    'plano', 'planos', 'instalacao', 'instalação', 'instalar', 'contratar', 'assinar', 'valor', 'preco', 'preço', 'cobertura',
    'viabilidade', 'tem fibra', 'internet para minha casa', 'quero ser cliente', 'novo cliente', 'mudar plano', 'upgrade', 'downgrade',
  ],
  pedidoHumano: [
    'atendente', 'humano', 'pessoa', 'falar com alguem', 'falar com alguém', 'me liga', 'ligacao', 'ligação', 'quero falar',
    'supervisor', 'gerente', 'responsavel', 'responsável', 'suporte humano',
  ],
  reclamacao: [
    'reclamar', 'reclamacao', 'reclamação', 'absurdo', 'insatisfeito', 'insatisfeita', 'chateado', 'chateada', 'raiva',
    'nao aguento', 'não aguento', 'péssimo', 'pessimo', 'horrivel', 'horrível', 'procon', 'processo', 'advogado',
  ],
  cancelamento: ['cancelar', 'cancelamento', 'encerrar contrato', 'nao quero mais', 'não quero mais', 'desistir', 'cancelar minha internet'],
  risco: ['choque', 'faisca', 'faísca', 'pegando fogo', 'incendio', 'incêndio', 'poste caiu', 'fio caido', 'fio caído', 'risco', 'perigo'],
};

function normalizeText(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(normalizedText, terms) {
  const normalizedTerms = terms.map(normalizeText);
  const matchedTerms = normalizedTerms.filter((term) => normalizedText.includes(term));
  return { count: matchedTerms.length, matchedTerms };
}

function scoreDomain(normalizedText, area) {
  const { count, matchedTerms } = countMatches(normalizedText, TERMS[area] || []);
  if (!count) return { area, score: 0, matchedTerms };
  const score = Math.min(0.55 + count * 0.14, 0.94);
  return { area, score, matchedTerms };
}

function primaryIntentForArea(area, text) {
  if (area === ROUTE_AREAS.FINANCEIRO) {
    if (text.includes('pix')) return 'pix_request';
    if (text.includes('boleto') || text.includes('segunda via') || text.includes('2 via')) return 'boleto_request';
    if (text.includes('bloque') || text.includes('liberar')) return 'financial_block_or_unlock';
    if (text.includes('comprovante') || text.includes('paguei')) return 'payment_confirmation';
    return 'financial_request';
  }
  if (area === ROUTE_AREAS.SUPORTE) {
    if (text.includes('sem internet') || text.includes('sem acesso') || text.includes('nao navega')) return 'internet_offline';
    if (text.includes('lento') || text.includes('lentidao') || text.includes('travando')) return 'slow_connection';
    if (text.includes('wifi') || text.includes('wi-fi') || text.includes('roteador')) return 'wifi_or_router_issue';
    return 'support_request';
  }
  if (area === ROUTE_AREAS.COMERCIAL) {
    if (text.includes('cobertura') || text.includes('viabilidade') || text.includes('tem fibra')) return 'coverage_check';
    if (text.includes('contratar') || text.includes('assinar') || text.includes('novo cliente')) return 'new_sale';
    if (text.includes('mudar plano') || text.includes('upgrade') || text.includes('downgrade')) return 'plan_change';
    return 'commercial_request';
  }
  if (area === ROUTE_AREAS.HUMANO) return 'human_requested';
  return 'needs_clarification';
}

function buildHandoffSummary({ messageText, area, intent, matchedDomains = [] }) {
  return {
    resumo: String(messageText || '').slice(0, 280),
    area,
    intent,
    matchedDomains: matchedDomains.map((domain) => ({ area: domain.area, score: domain.score, matchedTerms: domain.matchedTerms.slice(0, 5) })),
    pendencias: [],
  };
}

export function classifyIntent(messageText, context = {}) {
  const rawText = String(messageText || '');
  const text = normalizeText(rawText);
  if (!text) {
    return {
      area: ROUTE_AREAS.TRIAGEM,
      intent: 'empty_or_unsupported_message',
      confidence: 0.1,
      requiresHuman: false,
      activeAgent: AGENTS_BY_AREA[ROUTE_AREAS.TRIAGEM],
      reason: 'Mensagem vazia ou sem texto suportado.',
      handoff: buildHandoffSummary({ messageText: rawText, area: ROUTE_AREAS.TRIAGEM, intent: 'empty_or_unsupported_message' }),
    };
  }

  const risk = countMatches(text, TERMS.risco);
  const cancellation = countMatches(text, TERMS.cancelamento);
  const complaint = countMatches(text, TERMS.reclamacao);
  const human = countMatches(text, TERMS.pedidoHumano);

  if (risk.count) {
    return {
      area: ROUTE_AREAS.HUMANO,
      intent: 'emergency_or_physical_risk',
      confidence: 0.98,
      requiresHuman: true,
      activeAgent: AGENTS_BY_AREA[ROUTE_AREAS.HUMANO],
      priority: 'urgent',
      reason: 'Mensagem indica risco físico, segurança ou situação emergencial.',
      handoff: buildHandoffSummary({ messageText: rawText, area: ROUTE_AREAS.HUMANO, intent: 'emergency_or_physical_risk' }),
    };
  }

  if (cancellation.count) {
    return {
      area: ROUTE_AREAS.HUMANO,
      intent: 'cancellation_request',
      confidence: 0.94,
      requiresHuman: true,
      activeAgent: AGENTS_BY_AREA[ROUTE_AREAS.HUMANO],
      priority: 'high',
      reason: 'Pedido de cancelamento deve ser tratado por humano conforme regra operacional.',
      handoff: buildHandoffSummary({ messageText: rawText, area: ROUTE_AREAS.HUMANO, intent: 'cancellation_request' }),
    };
  }

  if (human.count || complaint.count) {
    return {
      area: ROUTE_AREAS.HUMANO,
      intent: complaint.count ? 'complaint_or_sensitive_case' : 'human_requested',
      confidence: complaint.count ? 0.9 : 0.88,
      requiresHuman: true,
      activeAgent: AGENTS_BY_AREA[ROUTE_AREAS.HUMANO],
      priority: complaint.count ? 'high' : 'normal',
      reason: complaint.count ? 'Mensagem contém reclamação/sinal de insatisfação sensível.' : 'Cliente pediu atendimento humano.',
      handoff: buildHandoffSummary({ messageText: rawText, area: ROUTE_AREAS.HUMANO, intent: complaint.count ? 'complaint_or_sensitive_case' : 'human_requested' }),
    };
  }

  const domains = [ROUTE_AREAS.FINANCEIRO, ROUTE_AREAS.SUPORTE, ROUTE_AREAS.COMERCIAL]
    .map((area) => scoreDomain(text, area))
    .filter((domain) => domain.score > 0)
    .sort((a, b) => (b.score - a.score) || (PRIORITY_BY_AREA[b.area] - PRIORITY_BY_AREA[a.area]));

  if (!domains.length) {
    return {
      area: ROUTE_AREAS.TRIAGEM,
      intent: 'needs_clarification',
      confidence: 0.42,
      requiresHuman: false,
      activeAgent: AGENTS_BY_AREA[ROUTE_AREAS.TRIAGEM],
      priority: 'normal',
      reason: 'Intenção não ficou clara o suficiente para rotear com segurança.',
      handoff: buildHandoffSummary({ messageText: rawText, area: ROUTE_AREAS.TRIAGEM, intent: 'needs_clarification' }),
    };
  }

  const multipleDomains = domains.length > 1 && domains[1].score >= 0.69;
  let selected = domains[0];

  // Regra operacional: se houver indício financeiro combinado com suporte/comercial, tratar impedimento financeiro primeiro.
  const financeDomain = domains.find((domain) => domain.area === ROUTE_AREAS.FINANCEIRO);
  if (financeDomain && domains.length > 1 && financeDomain.score >= 0.69) selected = financeDomain;

  const intent = multipleDomains ? 'multiple_intents_routed_by_priority' : primaryIntentForArea(selected.area, text);
  const confidence = multipleDomains ? Math.min(selected.score, 0.84) : selected.score;

  return {
    area: selected.area,
    intent,
    confidence,
    requiresHuman: false,
    activeAgent: AGENTS_BY_AREA[selected.area],
    priority: selected.area === ROUTE_AREAS.FINANCEIRO ? 'high' : 'normal',
    reason: multipleDomains
      ? `Mensagem tem múltiplas intenções; roteada para ${selected.area} por prioridade operacional.`
      : `Intenção classificada como ${selected.area}.`,
    multipleIntents: multipleDomains,
    candidates: domains.map((domain) => ({ area: domain.area, confidence: domain.score, matchedTerms: domain.matchedTerms })),
    handoff: buildHandoffSummary({ messageText: rawText, area: selected.area, intent, matchedDomains: domains }),
    context: {
      previousArea: context.area || null,
      previousStage: context.stage || null,
    },
  };
}

export function buildRouterClientMessage(classification, { name } = {}) {
  const firstName = String(name || '').trim().split(/\s+/)[0];
  const prefix = firstName ? `${firstName}, ` : '';
  if (classification.area === ROUTE_AREAS.SUPORTE) {
    return `${prefix}entendi que seu caso é de suporte técnico. Vou registrar aqui e direcionar para o fluxo de Suporte da Emy V2. Neste teste, ainda não vou executar comandos técnicos automaticamente.`;
  }
  if (classification.area === ROUTE_AREAS.COMERCIAL) {
    return `${prefix}entendi que seu caso é comercial. Vou registrar aqui e direcionar para o fluxo Comercial da Emy V2. Neste teste, ainda não vou apresentar oferta ou condição sem validação.`;
  }
  if (classification.area === ROUTE_AREAS.HUMANO) {
    return `${prefix}vou encaminhar seu atendimento para uma pessoa da equipe acompanhar por aqui.`;
  }
  return `${prefix}para eu te direcionar certinho, me diz rapidinho se você quer falar sobre Financeiro, Suporte ou Comercial.`;
}

export function buildRouterPrivateNote({ inbound = {}, classification = {} } = {}) {
  const handoff = classification.handoff || {};
  return [
    '🧭 Emy V2 Orquestradora',
    '',
    `Área identificada: ${classification.area || 'indefinida'}`,
    `Intenção: ${classification.intent || 'indefinida'}`,
    `Confiança: ${classification.confidence ?? 'n/a'}`,
    `Agente destino: ${classification.activeAgent || 'n/a'}`,
    `Humano obrigatório: ${classification.requiresHuman ? 'sim' : 'não'}`,
    `Motivo: ${classification.reason || 'n/a'}`,
    inbound.from ? `WhatsApp: ${inbound.from}` : '',
    inbound.pushName ? `Nome WhatsApp: ${inbound.pushName}` : '',
    '',
    `Mensagem resumida: ${handoff.resumo || inbound.text || 'não informado'}`,
    classification.multipleIntents ? `Candidatos: ${(classification.candidates || []).map((candidate) => `${candidate.area}(${candidate.confidence})`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export { ROUTE_AREAS, AGENTS_BY_AREA };
