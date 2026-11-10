#!/bin/sh
# Entrada do contêiner da aplicação: espera o PostgreSQL, aplica migrations e seeders e inicia o servidor.
# Defina SKIP_MIGRATIONS=true para pular (ex.: ao rodar os testes).
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] Aguardando o PostgreSQL em ${DB_HOST}:${DB_PORT:-5432}..."
  node scripts/esperar-db.js
  echo "[entrypoint] Aplicando migrations..."
  npx sequelize-cli db:migrate
  echo "[entrypoint] Aplicando seeders pendentes..."
  npx sequelize-cli db:seed:all
fi

exec "$@"
