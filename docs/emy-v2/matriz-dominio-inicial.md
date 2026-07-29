# Matriz Inicial por Domínio — Emy V2

## Emy Orquestradora

Responsável por:

- classificar intenção;
- validar identidade quando necessário;
- localizar cliente/lead;
- preservar contexto;
- rotear para especialista;
- detectar mudança de intenção;
- escalar para humano.

Não deve:

- executar ação sensível diretamente;
- pedir dado já validado;
- fazer o cliente recontar o caso.

## Emy Financeiro

Casos mínimos:

- segunda via;
- boleto;
- Pix;
- dados de pagamento;
- fatura em aberto;
- vencimento;
- confirmação de pagamento;
- comprovante;
- promessa/liberação em confiança, apenas em fase futura aprovada.

Status atual:

- consulta read-only validada via SGP URA;
- Pix/boleto/linha digitável/link disponíveis para fatura aberta;
- escrita bloqueada por configuração.

Escalar quando houver:

- divergência de valor;
- pagamento duplicado;
- contrato errado;
- fraude;
- estorno;
- desconto;
- renegociação especial;
- contestação complexa;
- erro de SGP.

## Emy Comercial

Casos esperados:

- responder dúvidas de planos;
- qualificar necessidade;
- consultar cobertura/viabilidade;
- apresentar oferta autorizada;
- coletar dados;
- pré-cadastrar;
- agendar instalação quando permitido.

Bloqueios atuais:

- catálogo final pendente;
- preços divergentes a validar;
- política de descontos e fidelidade pendente;
- fonte oficial de cobertura/agenda pendente.

## Emy Suporte

Casos esperados:

- internet offline;
- lentidão;
- oscilação;
- Wi-Fi fraco;
- conecta mas não navega;
- sites/apps específicos;
- câmeras;
- telefonia;
- streaming;
- automação.

Princípio:

- diagnóstico antes de OS;
- verificar financeiro e incidente coletivo;
- abrir OS somente quando necessário ou seguro.

Bloqueios atuais:

- inventário de equipamentos;
- modelos ONU/roteador;
- OLTs;
- thresholds;
- comandos seguros;
- tipos de OS;
- SLA;
- árvore de diagnóstico aprovada.
