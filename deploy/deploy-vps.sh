#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENV="$ROOT_DIR/.env.deploy.local"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Arquivo .env.deploy.local não encontrado. Copie .env.deploy.example e preencha os dados da VPS." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$DEPLOY_ENV"
set +a

: "${EMY_VPS_HOST:?}"
: "${EMY_VPS_USER:?}"
: "${EMY_VPS_PORT:=22}"
: "${EMY_DEPLOY_PATH:=/opt/m2online}"

SSH_OPTS=(-p "$EMY_VPS_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "${EMY_VPS_SSH_KEY_PATH:-}" ]]; then
  SSH_OPTS+=(-i "${EMY_VPS_SSH_KEY_PATH/#\~/$HOME}")
fi

ssh "${SSH_OPTS[@]}" "$EMY_VPS_USER@$EMY_VPS_HOST" "mkdir -p '$EMY_DEPLOY_PATH' && node -v && npm -v"

echo "Conexão SSH OK. Próxima etapa: preparar clone, .env.local, PM2/systemd e proxy HTTPS."
