#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-"$ROOT_DIR/.env"}"
COMPOSE_FILE="${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}"

log() {
  printf '[deploy] %s\n' "$*"
}

die() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  local file="$1"

  [[ -f "$file" ]] || die "Missing env file: $file"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"

    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    local key="${BASH_REMATCH[1]}"
    local value="${BASH_REMATCH[2]}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$file"
}

require_var() {
  local key="$1"
  [[ -n "${!key:-}" ]] || die "$key must be set in $ENV_FILE"
}

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || die "sudo is required for host directory setup"
  sudo "$@"
}

run_as_postgres_system_user() {
  local system_user="${POSTGRES_ADMIN_SYSTEM_USER:-postgres}"

  if command -v sudo >/dev/null 2>&1; then
    sudo -u "$system_user" "$@"
    return
  fi

  if command -v runuser >/dev/null 2>&1; then
    runuser -u "$system_user" -- "$@"
    return
  fi

  die "sudo or runuser is required when POSTGRES_USE_SUDO=true"
}

run_admin_psql() {
  if [[ "${POSTGRES_USE_SUDO:-true}" == "true" ]]; then
    run_as_postgres_system_user \
      psql -v ON_ERROR_STOP=1 -d "${POSTGRES_ADMIN_DB:-postgres}" "$@"
    return
  fi

  PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-}" \
    psql \
      -v ON_ERROR_STOP=1 \
      -h "${POSTGRES_HOST:-127.0.0.1}" \
      -p "${POSTGRES_PORT:-5432}" \
      -U "${POSTGRES_ADMIN_USER:-postgres}" \
      -d "${POSTGRES_ADMIN_DB:-postgres}" \
      "$@"
}

run_target_db_psql() {
  if [[ "${POSTGRES_USE_SUDO:-true}" == "true" ]]; then
    run_as_postgres_system_user \
      psql -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" "$@"
    return
  fi

  PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-}" \
    psql \
      -v ON_ERROR_STOP=1 \
      -h "${POSTGRES_HOST:-127.0.0.1}" \
      -p "${POSTGRES_PORT:-5432}" \
      -U "${POSTGRES_ADMIN_USER:-postgres}" \
      -d "$POSTGRES_DB" \
      "$@"
}

create_database_and_role() {
  log "Ensuring PostgreSQL role '$POSTGRES_USER' and database '$POSTGRES_DB' exist"

  run_admin_psql \
    --set app_user="$POSTGRES_USER" \
    --set app_password="$POSTGRES_PASSWORD" \
    --set app_db="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'app_user'
)\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'app_db'
)\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'app_user')\gexec
SQL

  run_target_db_psql --set app_user="$POSTGRES_USER" <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
SQL
}

prepare_host_storage() {
  require_var HOST_UPLOADS_DIR
  require_var HOST_API_DATA_DIR

  log "Ensuring host media directories exist"
  run_as_root mkdir -p "$HOST_UPLOADS_DIR" "$HOST_API_DATA_DIR"
  run_as_root chmod 775 "$HOST_UPLOADS_DIR" "$HOST_API_DATA_DIR"
}

run_compose() {
  log "Building and starting Docker services from $COMPOSE_FILE"
  DEPLOY_ENV_FILE="$ENV_FILE" \
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
}

main() {
  command -v psql >/dev/null 2>&1 || die "psql is required on the host"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"

  load_env_file "$ENV_FILE"

  require_var POSTGRES_DB
  require_var POSTGRES_USER
  require_var POSTGRES_PASSWORD
  require_var DATABASE_URL
  require_var BETTER_AUTH_SECRET
  require_var INTERNAL_WEB_API_KEY
  require_var RESEND_API_KEY
  require_var RESEND_FROM

  if [[ "$DATABASE_URL" == *"@postgres:"* ]]; then
    die "DATABASE_URL points at the old Docker Postgres service. Use host.docker.internal or the host IP for production."
  fi

  cd "$ROOT_DIR"

  create_database_and_role
  prepare_host_storage
  run_compose

  log "Deployment complete"
}

main "$@"
