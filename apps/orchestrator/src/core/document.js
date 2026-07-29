export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function extractCpfCnpj(text) {
  const digits = onlyDigits(text);
  if (digits.length < 11) return null;

  const cpfMatch = digits.match(/\d{11}/);
  if (cpfMatch) return cpfMatch[0];

  const cnpjMatch = digits.match(/\d{14}/);
  if (cnpjMatch) return cnpjMatch[0];

  return null;
}

export function maskDocument(value) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
  return '[documento_mascarado]';
}
