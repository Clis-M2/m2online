# Segurança — Emy V2

## Regras obrigatórias

- Nunca commitar tokens, conversas brutas ou dados reais de clientes.
- Usar `.env` local ou secrets do ambiente.
- Mascarar CPF/CNPJ, telefone, e-mail e identificadores sensíveis nos logs.
- Toda ferramenta deve ter timeout, validação de entrada, validação de saída e auditoria.
- A POC inicial não escreve no SGP.
- `AUTO_SEND_TO_CUSTOMER=false` até aprovação formal.
