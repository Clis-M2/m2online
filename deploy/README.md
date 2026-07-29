# Deploy da Emy V2 na VPS

## Objetivo

Publicar o runtime da Emy V2 em uma URL pública estável para a Evolution API chamar diretamente, sem n8n e sem túnel temporário.

URL desejada:

```text
https://emy-v2.m2-online.com.br/webhooks/evolution
```

## Segurança

Não colocar credenciais em chat, GitHub ou arquivos versionados.

Use localmente:

```text
.env.deploy.local
```

Esse arquivo deve ficar fora do Git.

## Dados necessários

- Host/IP da VPS.
- Usuário SSH.
- Porta SSH.
- Chave SSH ou senha temporária.
- Confirmação se a VPS usa Nginx, Caddy, Traefik ou Docker proxy.
- Controle DNS para criar `emy-v2.m2-online.com.br` apontando para a VPS.

## Estratégia recomendada

1. Acessar VPS.
2. Instalar/validar Node.js 22+ ou Docker.
3. Clonar/puxar repo `Clis-M2/m2online`.
4. Criar `.env.local` na VPS com secrets reais.
5. Rodar Emy V2 na porta interna `3333`.
6. Configurar reverse proxy HTTPS para `emy-v2.m2-online.com.br`.
7. Testar `/health` público.
8. Configurar Evolution webhook para `/webhooks/evolution`.
9. Enviar mensagem pelo WhatsApp de teste.
10. Monitorar logs.

## Variáveis obrigatórias na VPS

```env
AUTO_SEND_TO_CUSTOMER=true
SGP_WRITE_ENABLED=false
LOG_REDACTION=true
EMY_TEST_MODE=true
EMY_TEST_WHATSAPP_ALLOWLIST=5581920016907
EMY_TEST_PORT=3333
```

## Importante

Enquanto estiver em teste, manter allowlist com apenas o número de Clistenis.
