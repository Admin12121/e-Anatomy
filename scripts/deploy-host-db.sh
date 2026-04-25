#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-"$ROOT_DIR/.env"}"
COMPOSE_FILE="${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}"
APP_DIR="$ROOT_DIR"

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

env_bool() {
  local value="${1:-false}"

  case "${value,,}" in
    1 | true | yes | y | on) return 0 ;;
    *) return 1 ;;
  esac
}

set_deploy_defaults() {
  DEPLOY_USER="${DEPLOY_USER:-altharld}"
  DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-1233}"
  DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-/srv/anatomy/app}"
  DEPLOY_SYNC_PROJECT="${DEPLOY_SYNC_PROJECT:-true}"
  HARDEN_SERVER="${HARDEN_SERVER:-true}"
  SSH_PORT="${SSH_PORT:-22}"
  SSH_PASSWORD_AUTH="${SSH_PASSWORD_AUTH:-true}"
  UFW_ALLOW_PORTS="${UFW_ALLOW_PORTS:-80/tcp,443/tcp}"
  UFW_ENABLE="${UFW_ENABLE:-true}"
  FAIL2BAN_ENABLE="${FAIL2BAN_ENABLE:-true}"
  JOURNALD_PERSISTENT="${JOURNALD_PERSISTENT:-true}"
  UNATTENDED_UPGRADES_ENABLE="${UNATTENDED_UPGRADES_ENABLE:-true}"
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

run_as_deploy_user() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    runuser -u "$DEPLOY_USER" -- "$@"
    return
  fi

  if [[ "$(id -un)" == "$DEPLOY_USER" ]]; then
    "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || die "sudo is required to run commands as $DEPLOY_USER"
  sudo -u "$DEPLOY_USER" "$@"
}

install_server_packages() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    log "apt-get not found; skipping package installation"
    return
  fi

  log "Installing hardening and deployment packages"
  run_as_root apt-get update
  run_as_root apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fail2ban \
    logrotate \
    openssh-server \
    postgresql-client \
    rsync \
    ufw \
    unattended-upgrades
}

ensure_deploy_user() {
  log "Ensuring deploy user '$DEPLOY_USER' exists"

  if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
    run_as_root useradd --create-home --shell /bin/bash "$DEPLOY_USER"
  fi

  if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
    printf '%s:%s\n' "$DEPLOY_USER" "$DEPLOY_PASSWORD" | run_as_root chpasswd
  fi

  run_as_root usermod -aG sudo "$DEPLOY_USER"

  if getent group docker >/dev/null 2>&1; then
    run_as_root usermod -aG docker "$DEPLOY_USER"
  else
    log "Docker group not found; install Docker before running compose as $DEPLOY_USER"
  fi

  run_as_root install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

  if [[ -n "${DEPLOY_AUTHORIZED_KEYS:-}" ]]; then
    printf '%s\n' "$DEPLOY_AUTHORIZED_KEYS" \
      | run_as_root tee "/home/$DEPLOY_USER/.ssh/authorized_keys" >/dev/null
    run_as_root chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
    run_as_root chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
  fi
}

configure_ssh_hardening() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  log "Configuring SSH hardening"

  local password_auth="no"
  if env_bool "$SSH_PASSWORD_AUTH"; then
    password_auth="yes"
  elif [[ ! -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
    die "SSH_PASSWORD_AUTH=false requires DEPLOY_AUTHORIZED_KEYS to avoid lockout"
  fi

  run_as_root install -d -m 755 /etc/ssh/sshd_config.d

  run_as_root tee /etc/ssh/sshd_config.d/99-anatomy-hardening.conf >/dev/null <<EOF
Port $SSH_PORT
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication $password_auth
KbdInteractiveAuthentication no
AllowUsers $DEPLOY_USER
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

  if command -v sshd >/dev/null 2>&1; then
    run_as_root sshd -t
  elif [[ -x /usr/sbin/sshd ]]; then
    run_as_root /usr/sbin/sshd -t
  fi

  run_as_root systemctl enable ssh >/dev/null 2>&1 || true
  run_as_root systemctl reload ssh >/dev/null 2>&1 \
    || run_as_root systemctl reload sshd >/dev/null 2>&1 \
    || run_as_root systemctl restart ssh >/dev/null 2>&1 \
    || true
}

configure_firewall() {
  if ! env_bool "$HARDEN_SERVER" || ! env_bool "$UFW_ENABLE"; then
    return
  fi

  command -v ufw >/dev/null 2>&1 || {
    log "ufw not installed; skipping firewall configuration"
    return
  }

  log "Configuring UFW firewall"
  run_as_root ufw default deny incoming
  run_as_root ufw default allow outgoing
  run_as_root ufw allow "${SSH_PORT}/tcp"

  IFS=',' read -ra allowed_ports <<< "$UFW_ALLOW_PORTS"
  for port in "${allowed_ports[@]}"; do
    port="${port//[[:space:]]/}"
    [[ -z "$port" ]] && continue
    run_as_root ufw allow "$port"
  done

  run_as_root ufw logging on
  run_as_root ufw --force enable
}

configure_fail2ban() {
  if ! env_bool "$HARDEN_SERVER" || ! env_bool "$FAIL2BAN_ENABLE"; then
    return
  fi

  command -v fail2ban-client >/dev/null 2>&1 || {
    log "fail2ban not installed; skipping fail2ban configuration"
    return
  }

  log "Configuring fail2ban for SSH"
  run_as_root install -d -m 755 /etc/fail2ban/jail.d
  run_as_root tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<EOF
[sshd]
enabled = true
port = $SSH_PORT
maxretry = 5
findtime = 10m
bantime = 1h
EOF

  run_as_root systemctl enable --now fail2ban
  run_as_root systemctl restart fail2ban
}

configure_logging() {
  if ! env_bool "$HARDEN_SERVER" || ! env_bool "$JOURNALD_PERSISTENT"; then
    return
  fi

  log "Enabling persistent systemd journal logging"
  run_as_root install -d -m 755 /var/log/journal
  run_as_root install -d -m 755 /etc/systemd/journald.conf.d
  run_as_root tee /etc/systemd/journald.conf.d/99-anatomy.conf >/dev/null <<'EOF'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=1G
MaxRetentionSec=1month
EOF

  run_as_root systemctl restart systemd-journald >/dev/null 2>&1 || true
}

configure_unattended_upgrades() {
  if ! env_bool "$HARDEN_SERVER" || ! env_bool "$UNATTENDED_UPGRADES_ENABLE"; then
    return
  fi

  if [[ ! -d /etc/apt/apt.conf.d ]]; then
    return
  fi

  log "Enabling unattended security updates"
  run_as_root tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

  run_as_root systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
}

configure_sysctl_hardening() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  log "Applying baseline network sysctl hardening"
  run_as_root tee /etc/sysctl.d/99-anatomy-hardening.conf >/dev/null <<'EOF'
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
EOF

  run_as_root sysctl --system >/dev/null 2>&1 || true
}

hardening_bootstrap() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  install_server_packages
  ensure_deploy_user
  configure_logging
  configure_sysctl_hardening
  configure_ssh_hardening
  configure_firewall
  configure_fail2ban
  configure_unattended_upgrades
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

  if id "$DEPLOY_USER" >/dev/null 2>&1; then
    run_as_root chown -R "$DEPLOY_USER:$DEPLOY_USER" "$HOST_UPLOADS_DIR" "$HOST_API_DATA_DIR"
  fi
}

ensure_safe_deploy_dir() {
  local deploy_dir="$1"

  [[ "$deploy_dir" = /* ]] || die "DEPLOY_APP_DIR must be an absolute path"

  case "$deploy_dir" in
    / | /root | /home | "/home/$DEPLOY_USER")
      die "Refusing to deploy into unsafe DEPLOY_APP_DIR=$deploy_dir"
      ;;
  esac
}

sync_project_to_deploy_user() {
  if ! env_bool "$DEPLOY_SYNC_PROJECT"; then
    return
  fi

  ensure_safe_deploy_dir "$DEPLOY_APP_DIR"

  if [[ "$ROOT_DIR" == "$DEPLOY_APP_DIR" ]]; then
    APP_DIR="$ROOT_DIR"
    return
  fi

  command -v rsync >/dev/null 2>&1 || die "rsync is required when DEPLOY_SYNC_PROJECT=true"

  log "Syncing project to $DEPLOY_APP_DIR for user $DEPLOY_USER"
  run_as_root mkdir -p "$DEPLOY_APP_DIR"
  run_as_root rsync -a \
    --exclude '.git' \
    --exclude 'apps/web/.next' \
    --exclude 'apps/web/node_modules' \
    --exclude 'apps/web/public/playground-uploads' \
    --exclude 'services/api/target' \
    --exclude 'services/api/data' \
    "$ROOT_DIR"/ "$DEPLOY_APP_DIR"/

  if [[ "$ENV_FILE" != "$DEPLOY_APP_DIR/.env" ]]; then
    run_as_root install -m 600 "$ENV_FILE" "$DEPLOY_APP_DIR/.env"
  fi

  run_as_root chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_APP_DIR"

  APP_DIR="$DEPLOY_APP_DIR"
  ENV_FILE="$DEPLOY_APP_DIR/.env"
  COMPOSE_FILE="$DEPLOY_APP_DIR/docker-compose.prod.yml"
}

run_compose() {
  log "Building and starting Docker services from $COMPOSE_FILE"
  run_as_deploy_user bash -lc "cd '$APP_DIR' && DEPLOY_ENV_FILE='$ENV_FILE' docker compose --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --build --remove-orphans"
}

main() {
  load_env_file "$ENV_FILE"
  set_deploy_defaults

  require_var POSTGRES_DB
  require_var POSTGRES_USER
  require_var POSTGRES_PASSWORD
  require_var DATABASE_URL
  require_var BETTER_AUTH_SECRET
  require_var INTERNAL_WEB_API_KEY
  require_var RESEND_API_KEY
  require_var RESEND_FROM

  hardening_bootstrap

  command -v psql >/dev/null 2>&1 || die "psql is required on the host"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"

  if [[ "$DATABASE_URL" == *"@postgres:"* ]]; then
    die "DATABASE_URL points at the old Docker Postgres service. Use host.docker.internal or the host IP for production."
  fi

  cd "$ROOT_DIR"

  create_database_and_role
  prepare_host_storage
  sync_project_to_deploy_user
  run_compose

  log "Deployment complete"
  log "SSH root login is disabled. Use: ssh -p $SSH_PORT $DEPLOY_USER@<server-ip>"
}

main "$@"
