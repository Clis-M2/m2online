export const FOLLOWUP_TYPES = {
  WAITING_DOCUMENT: 'waiting_document',
  PIX_SENT: 'pix_sent',
  BOLETO_SENT: 'boleto_sent',
  HUMAN_ESCALATION: 'human_escalation',
};

export const FOLLOWUP_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

export function addMs(date = new Date(), ms = 0) {
  return new Date(date.getTime() + Number(ms || 0)).toISOString();
}

export function financeFollowupConfig(env = process.env) {
  return {
    enabled: !['0', 'false', 'no', 'nao', 'não', 'off'].includes(String(env.EMY_FINANCE_FOLLOWUP_ENABLED ?? 'true').toLowerCase()),
    checkIntervalMs: Number(env.EMY_FINANCE_FOLLOWUP_CHECK_INTERVAL_MS || 60_000),
    waitingDocumentFirstMs: Number(env.EMY_WAITING_DOCUMENT_FOLLOWUP_1_MS || 10 * 60_000),
    waitingDocumentSecondMs: Number(env.EMY_WAITING_DOCUMENT_FOLLOWUP_2_MS || 45 * 60_000),
    waitingDocumentAbandonMs: Number(env.EMY_WAITING_DOCUMENT_ABANDON_MS || 2 * 60 * 60_000),
    pixFirstCheckMs: Number(env.EMY_PIX_PAYMENT_CHECK_1_MS || 15 * 60_000),
    pixSecondCheckMs: Number(env.EMY_PIX_PAYMENT_CHECK_2_MS || 45 * 60_000),
    boletoFirstCheckMs: Number(env.EMY_BOLETO_PAYMENT_CHECK_1_MS || 24 * 60 * 60_000),
    boletoSecondCheckMs: Number(env.EMY_BOLETO_PAYMENT_CHECK_2_MS || 3 * 24 * 60 * 60_000),
  };
}

export function createWaitingDocumentFollowup(now = new Date(), env = process.env) {
  const config = financeFollowupConfig(env);
  return {
    type: FOLLOWUP_TYPES.WAITING_DOCUMENT,
    status: FOLLOWUP_STATUS.PENDING,
    attempts: 0,
    nextAt: addMs(now, config.waitingDocumentFirstMs),
    startedAt: now.toISOString(),
  };
}

export function createPaymentFollowup({ payment, requestType = 'payment_general', now = new Date(), env = process.env } = {}) {
  const config = financeFollowupConfig(env);
  const type = ['pix', 'payment_general', 'pix_and_link'].includes(requestType) ? FOLLOWUP_TYPES.PIX_SENT : FOLLOWUP_TYPES.BOLETO_SENT;
  return {
    type,
    status: FOLLOWUP_STATUS.PENDING,
    attempts: 0,
    nextAt: addMs(now, type === FOLLOWUP_TYPES.PIX_SENT ? config.pixFirstCheckMs : config.boletoFirstCheckMs),
    startedAt: now.toISOString(),
    fatura: payment?.fatura || null,
    contrato: payment?.contrato || null,
    paymentKind: type === FOLLOWUP_TYPES.PIX_SENT ? 'pix' : 'boleto_link',
  };
}

export function cancelFollowup(reason = 'cancelled') {
  return { status: FOLLOWUP_STATUS.CANCELLED, cancelledAt: new Date().toISOString(), reason };
}

export function isFollowupDue(followup = {}, now = new Date()) {
  if (!followup || followup.status !== FOLLOWUP_STATUS.PENDING || !followup.nextAt) return false;
  return new Date(followup.nextAt).getTime() <= now.getTime();
}

export function buildWaitingDocumentFollowupMessage({ name = '', attempt = 1 } = {}) {
  const prefix = name ? `${name}, ` : '';
  if (attempt <= 1) {
    return `${prefix}só passando para te ajudar com o pagamento. Me envia o CPF/CNPJ do titular quando puder, que eu localizo a fatura para você.`;
  }
  return `${prefix}continuo por aqui. Quando você me enviar o CPF/CNPJ do titular, eu consulto a fatura com segurança.`;
}

export function buildWaitingDocumentAbandonedNote({ from = '', name = '' } = {}) {
  return [
    '🧾 Emy V2 Financeiro — conversa sem retorno',
    '',
    `Cliente: ${name || 'não informado'}`,
    `WhatsApp: ${from || 'não informado'}`,
    'Contexto: cliente pediu atendimento financeiro, a Emy solicitou CPF/CNPJ, mas o cliente não respondeu após os lembretes.',
    'Ação: follow-up encerrado sem acionar humano, pois não havia dados suficientes para consulta segura.',
  ].join('\n');
}

export function buildPixStillPendingMessage() {
  return 'Conferi aqui e ainda não apareceu a baixa do pagamento. Se você já pagou, pode levar alguns minutos para atualizar. Se precisar, eu te envio o Pix novamente.';
}

export function buildPaymentConfirmedMessage() {
  return 'Pagamento confirmado por aqui. Obrigada! Sua fatura já consta como paga no sistema.';
}

export function buildBoletoStillPendingMessage() {
  return 'Só passando para te avisar: boleto pode levar até 3 dias úteis para compensar. Por enquanto ainda não apareceu a baixa no sistema. Se você pagou via Pix ou link, me avisa que eu confiro novamente.';
}

export function nextWaitingDocumentFollowup(followup = {}, env = process.env, now = new Date()) {
  const config = financeFollowupConfig(env);
  const attempts = Number(followup.attempts || 0) + 1;
  if (attempts === 1) return { ...followup, attempts, nextAt: addMs(now, config.waitingDocumentSecondMs) };
  if (attempts === 2) return { ...followup, attempts, nextAt: addMs(now, config.waitingDocumentAbandonMs) };
  return { ...followup, attempts, status: FOLLOWUP_STATUS.DONE, completedAt: now.toISOString(), reason: 'abandoned_waiting_document' };
}

export function nextPaymentFollowup(followup = {}, env = process.env, now = new Date()) {
  const config = financeFollowupConfig(env);
  const attempts = Number(followup.attempts || 0) + 1;
  if (followup.type === FOLLOWUP_TYPES.PIX_SENT) {
    if (attempts === 1) return { ...followup, attempts, nextAt: addMs(now, config.pixSecondCheckMs) };
    return { ...followup, attempts, status: FOLLOWUP_STATUS.DONE, completedAt: now.toISOString(), reason: 'pix_followup_finished' };
  }
  if (attempts === 1) return { ...followup, attempts, nextAt: addMs(now, config.boletoSecondCheckMs) };
  return { ...followup, attempts, status: FOLLOWUP_STATUS.DONE, completedAt: now.toISOString(), reason: 'boleto_followup_finished' };
}
