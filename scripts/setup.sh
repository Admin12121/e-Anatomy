#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-"$ROOT_DIR/.env"}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
APP_DIR="$ROOT_DIR"

MODE="dev"
ACTION="up"
ACTION_SET="false"
ASSUME_YES="${ASSUME_YES:-false}"
DRY_RUN="${DRY_RUN:-false}"
ONLY_STEPS=""
SKIP_STEPS=""
LOG_LINES="150"
COMPOSE_EXTRA_ARGS=()

PROD_STEPS=(hardening db storage sync compose)
PROD_SERVICES=(redis-prod api-prod web-prod nginx-prod)

usage() {
  cat <<'EOF_USAGE'
Usage:
  scripts/setup.sh [--dev|-dev] [action] [options]
  scripts/setup.sh [--prod|-prod] [action] [options]

Default:
  scripts/setup.sh              Run the development stack.

Modes:
  --dev, -dev                   Use development mode. This is the default.
  --prod, -prod                 Use production mode.

Actions:
  up                            Dev: compose up. Prod: full deploy flow.
  deploy                        Production full deploy flow.
  compose                       Run only the compose up/build step for the mode.
  down                          Stop and remove mode containers.
  restart                       Restart mode containers.
  build                         Build mode images.
  pull                          Pull mode images.
  ps                            Show mode containers.
  logs                          Follow mode logs.
  config                        Render the Compose config.
  hardening                     Prod only: host packages, SSH, UFW, fail2ban.
  db                            Prod only: PostgreSQL role/database setup.
  storage                       Prod only: host upload/data directories.
  sync                          Prod only: sync project to DEPLOY_APP_DIR.
  check                         Validate local prerequisites and env.

Options:
  --env-file PATH               Load env values from PATH.
  --only LIST                   Prod deploy: run only comma-separated steps.
  --skip LIST                   Prod deploy: skip comma-separated steps.
  --no-hardening                Same as --skip hardening.
  --no-db                       Same as --skip db.
  --no-storage                  Same as --skip storage.
  --no-sync                     Same as --skip sync.
  --no-compose                  Same as --skip compose.
  -y, --yes                     Answer yes to script prompts.
  --dry-run                     Print privileged commands without running them.
  --log-lines N                 Tail N lines for logs action.
  -h, --help                    Show this help.
  --                            Pass remaining args to docker compose action.

Examples:
  scripts/setup.sh
  scripts/setup.sh -dev logs
  scripts/setup.sh -prod
  scripts/setup.sh -prod --only db
  scripts/setup.sh -prod --skip hardening
  scripts/setup.sh -prod compose
EOF_USAGE
}

log() {
  printf '[setup:%s] %s\n' "$MODE" "$*"
}

warn() {
  printf '[setup:%s] WARN: %s\n' "$MODE" "$*" >&2
}

die() {
  printf '[setup:%s] ERROR: %s\n' "$MODE" "$*" >&2
  exit 1
}

is_interactive() {
  [[ -t 0 && -t 1 ]]
}

env_bool() {
  local value="${1:-false}"
  case "${value,,}" in
    1 | true | yes | y | on) return 0 ;;
    *) return 1 ;;
  esac
}

csv_has() {
  local csv="$1"
  local needle="$2"
  local item
  local -a items

  IFS=',' read -ra items <<< "$csv"
  for item in "${items[@]}"; do
    item="${item//[[:space:]]/}"
    [[ "$item" == "$needle" ]] && return 0
  done

  return 1
}

csv_add() {
  local current="$1"
  local value="$2"

  if [[ -z "$current" ]]; then
    printf '%s' "$value"
  else
    printf '%s,%s' "$current" "$value"
  fi
}

ask_yn() {
  local question="$1"
  local default="${2:-no}"
  local prompt answer

  if env_bool "$ASSUME_YES"; then
    log "$question -> yes (--yes)"
    return 0
  fi

  case "${default,,}" in
    yes | y | true | 1) prompt='Y/n'; default='yes' ;;
    *) prompt='y/N'; default='no' ;;
  esac

  if ! is_interactive; then
    log "$question [$prompt] -> non-interactive default: $default"
    [[ "$default" == "yes" ]]
    return
  fi

  while true; do
    read -r -p "[setup:$MODE] $question [$prompt] " answer || answer=''
    answer="${answer:-$default}"
    case "${answer,,}" in
      yes | y) return 0 ;;
      no | n) return 1 ;;
      *) printf '[setup:%s] Please answer yes or no.\n' "$MODE" ;;
    esac
  done
}

should_do_action() {
  local mode="$1"
  local question="$2"
  local default="${3:-no}"

  case "${mode,,}" in
    1 | true | yes | y | on | update | reset | reassign | overwrite | create)
      return 0
      ;;
    0 | false | no | n | off | keep | skip | pass)
      return 1
      ;;
    ask | prompt | '')
      ask_yn "$question" "$default"
      return
      ;;
    *)
      warn "Unknown action '$mode'; asking instead"
      ask_yn "$question" "$default"
      return
      ;;
  esac
}

shell_quote() {
  printf '%q' "$1"
}

run_as_root() {
  if env_bool "$DRY_RUN"; then
    printf '[setup:%s] dry-run root:' "$MODE"
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || die "sudo is required for root actions"
  sudo "$@"
}

run_as_postgres_system_user() {
  local system_user="${POSTGRES_ADMIN_SYSTEM_USER:-postgres}"

  if env_bool "$DRY_RUN"; then
    printf '[setup:%s] dry-run postgres(%s):' "$MODE" "$system_user"
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  id "$system_user" >/dev/null 2>&1 || die "PostgreSQL system user '$system_user' does not exist"

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
  if env_bool "$DRY_RUN"; then
    printf '[setup:%s] dry-run deploy(%s):' "$MODE" "$DEPLOY_USER"
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  id "$DEPLOY_USER" >/dev/null 2>&1 || die "Deploy user '$DEPLOY_USER' does not exist"

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

load_env_file() {
  local file="$1"
  local line key value

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$file"
}

require_env_file_for_prod() {
  [[ -f "$ENV_FILE" ]] || die "Production requires an env file. Copy .env.production.example to .env or pass --env-file PATH."
}

require_var() {
  local key="$1"
  [[ -n "${!key:-}" ]] || die "$key must be set in $ENV_FILE"
}

set_deploy_defaults() {
  DEPLOY_USER="${DEPLOY_USER:-altharld}"
  DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-}"
  DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-/srv/anatomy/app}"
  DEPLOY_SYNC_PROJECT="${DEPLOY_SYNC_PROJECT:-true}"
  HARDEN_SERVER="${HARDEN_SERVER:-true}"
  SSH_PORT="${SSH_PORT:-22}"
  SSH_PASSWORD_AUTH="${SSH_PASSWORD_AUTH:-false}"
  UFW_ALLOW_PORTS="${UFW_ALLOW_PORTS:-80/tcp,443/tcp}"
  UFW_ENABLE="${UFW_ENABLE:-true}"
  FAIL2BAN_ENABLE="${FAIL2BAN_ENABLE:-true}"
  JOURNALD_PERSISTENT="${JOURNALD_PERSISTENT:-true}"
  UNATTENDED_UPGRADES_ENABLE="${UNATTENDED_UPGRADES_ENABLE:-true}"

  RESET_EXISTING_DEPLOY_PASSWORD="${RESET_EXISTING_DEPLOY_PASSWORD:-ask}"
  DEPLOY_AUTH_KEYS_ACTION="${DEPLOY_AUTH_KEYS_ACTION:-ask}"

  POSTGRES_USE_SUDO="${POSTGRES_USE_SUDO:-true}"
  POSTGRES_ADMIN_SYSTEM_USER="${POSTGRES_ADMIN_SYSTEM_USER:-postgres}"
  POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:-postgres}"
  POSTGRES_ADMIN_DB="${POSTGRES_ADMIN_DB:-postgres}"
  POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD:-}"
  POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  POSTGRES_EXISTING_ROLE_ACTION="${POSTGRES_EXISTING_ROLE_ACTION:-ask}"
  POSTGRES_EXISTING_DB_ACTION="${POSTGRES_EXISTING_DB_ACTION:-ask}"
  POSTGRES_MISSING_SYSTEM_USER_ACTION="${POSTGRES_MISSING_SYSTEM_USER_ACTION:-ask}"
  SKIP_DB_SETUP="${SKIP_DB_SETUP:-false}"

  HOST_UPLOADS_DIR="${HOST_UPLOADS_DIR:-/srv/anatomy/uploads}"
  HOST_API_DATA_DIR="${HOST_API_DATA_DIR:-/srv/anatomy/api-data}"
  SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
  WEB_HOST="${WEB_HOST:-127.0.0.1}"
  WEB_PORT="${WEB_PORT:-3000}"
  HTTP_PORT="${HTTP_PORT:-80}"
  REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
}

parse_args() {
  local arg

  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      --dev | -dev)
        MODE="dev"
        shift
        ;;
      --prod | -prod)
        MODE="prod"
        shift
        ;;
      --env-file)
        [[ $# -ge 2 ]] || die "--env-file requires a path"
        ENV_FILE="$2"
        shift 2
        ;;
      --env-file=*)
        ENV_FILE="${arg#*=}"
        shift
        ;;
      --only)
        [[ $# -ge 2 ]] || die "--only requires a comma-separated list"
        ONLY_STEPS="$2"
        shift 2
        ;;
      --only=*)
        ONLY_STEPS="${arg#*=}"
        shift
        ;;
      --skip)
        [[ $# -ge 2 ]] || die "--skip requires a comma-separated list"
        SKIP_STEPS="$2"
        shift 2
        ;;
      --skip=*)
        SKIP_STEPS="${arg#*=}"
        shift
        ;;
      --no-hardening)
        SKIP_STEPS="$(csv_add "$SKIP_STEPS" hardening)"
        shift
        ;;
      --no-db)
        SKIP_STEPS="$(csv_add "$SKIP_STEPS" db)"
        shift
        ;;
      --no-storage)
        SKIP_STEPS="$(csv_add "$SKIP_STEPS" storage)"
        shift
        ;;
      --no-sync)
        SKIP_STEPS="$(csv_add "$SKIP_STEPS" sync)"
        shift
        ;;
      --no-compose)
        SKIP_STEPS="$(csv_add "$SKIP_STEPS" compose)"
        shift
        ;;
      -y | --yes)
        ASSUME_YES="true"
        shift
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --log-lines)
        [[ $# -ge 2 ]] || die "--log-lines requires a number"
        LOG_LINES="$2"
        shift 2
        ;;
      --log-lines=*)
        LOG_LINES="${arg#*=}"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      --)
        shift
        COMPOSE_EXTRA_ARGS+=("$@")
        break
        ;;
      up | deploy | compose | down | restart | build | pull | ps | logs | config | hardening | db | storage | sync | check)
        ACTION="$arg"
        ACTION_SET="true"
        shift
        ;;
      *)
        COMPOSE_EXTRA_ARGS+=("$arg")
        shift
        ;;
    esac
  done

  ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
}

ensure_local_prereqs() {
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
}

validate_mode_action() {
  if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
    die "Unknown mode: $MODE"
  fi

  if [[ "$MODE" == "dev" ]]; then
    case "$ACTION" in
      up | compose | down | restart | build | pull | ps | logs | config | check) ;;
      deploy | hardening | db | storage | sync)
        die "Action '$ACTION' is production-only. Use -prod."
        ;;
      *) die "Unknown action: $ACTION" ;;
    esac
  fi

  if [[ "$MODE" == "prod" && "$ACTION" == "up" && "$ACTION_SET" != "true" ]]; then
    ACTION="deploy"
  fi
}

validate_prod_env() {
  require_env_file_for_prod
  load_env_file "$ENV_FILE"
  set_deploy_defaults

  require_var POSTGRES_DB
  require_var POSTGRES_USER
  require_var POSTGRES_PASSWORD
  require_var DATABASE_URL
  require_var BETTER_AUTH_SECRET
  require_var BETTER_AUTH_URL
  require_var BETTER_AUTH_TRUSTED_ORIGINS
  require_var INTERNAL_WEB_API_KEY
  require_var BOOTSTRAP_ADMIN_EMAIL
  require_var BOOTSTRAP_ADMIN_PASSWORD

  if [[ "$ACTION" == "compose" ]] || {
    [[ "$ACTION" == "deploy" ]] && { should_run_step storage || should_run_step compose; }
  }; then
    require_var HOST_UPLOADS_DIR
    require_var HOST_API_DATA_DIR
  fi

  if [[ "$DATABASE_URL" == *"@postgres:"* ]]; then
    die "DATABASE_URL points at the dev Docker Postgres service. Production uses host PostgreSQL; use 127.0.0.1 or the real host address."
  fi

  if [[ "$DATABASE_URL" == *"host.docker.internal"* ]]; then
    die "DATABASE_URL uses host.docker.internal. Production services now run with host networking, so use 127.0.0.1 for host PostgreSQL."
  fi

  if [[ "${SERVER_HOST:-127.0.0.1}" != "127.0.0.1" && "${ALLOW_PUBLIC_INTERNAL_PORTS:-false}" != "true" ]]; then
    die "SERVER_HOST must stay 127.0.0.1 in production unless ALLOW_PUBLIC_INTERNAL_PORTS=true is set."
  fi
}

install_server_packages() {
  if ! env_bool "$HARDEN_SERVER"; then
    log "Skipping hardening package install because HARDEN_SERVER=false"
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

ensure_deploy_access_is_safe() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  if [[ -n "${DEPLOY_AUTHORIZED_KEYS:-}" ]]; then
    return
  fi

  if [[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
    return
  fi

  if env_bool "$SSH_PASSWORD_AUTH" && [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
    return
  fi

  die "Hardening would disable root SSH without a clear deploy login. Set DEPLOY_AUTHORIZED_KEYS, or set SSH_PASSWORD_AUTH=true with DEPLOY_PASSWORD."
}

ensure_deploy_user() {
  log "Ensuring deploy user '$DEPLOY_USER' exists"

  if id "$DEPLOY_USER" >/dev/null 2>&1; then
    log "Deploy user '$DEPLOY_USER' already exists; passing user creation"

    if [[ -n "${DEPLOY_PASSWORD:-}" ]] && \
      should_do_action "$RESET_EXISTING_DEPLOY_PASSWORD" \
        "Deploy user '$DEPLOY_USER' already exists. Reset its password from DEPLOY_PASSWORD?" \
        "no"; then
      printf '%s:%s\n' "$DEPLOY_USER" "$DEPLOY_PASSWORD" | run_as_root chpasswd
      log "Password reset for existing deploy user '$DEPLOY_USER'"
    else
      log "Keeping existing password for deploy user '$DEPLOY_USER'"
    fi
  else
    run_as_root useradd --create-home --shell /bin/bash "$DEPLOY_USER"
    log "Created deploy user '$DEPLOY_USER'"

    if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
      printf '%s:%s\n' "$DEPLOY_USER" "$DEPLOY_PASSWORD" | run_as_root chpasswd
      log "Password set for new deploy user '$DEPLOY_USER'"
    fi
  fi

  run_as_root usermod -aG sudo "$DEPLOY_USER"

  if getent group docker >/dev/null 2>&1; then
    run_as_root usermod -aG docker "$DEPLOY_USER"
  else
    warn "Docker group not found; install Docker before running compose as $DEPLOY_USER"
  fi

  run_as_root install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

  if [[ -n "${DEPLOY_AUTHORIZED_KEYS:-}" ]]; then
    if [[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
      if should_do_action "$DEPLOY_AUTH_KEYS_ACTION" \
        "authorized_keys already exists for '$DEPLOY_USER'. Replace it with DEPLOY_AUTHORIZED_KEYS?" \
        "no"; then
        printf '%s\n' "$DEPLOY_AUTHORIZED_KEYS" \
          | run_as_root tee "/home/$DEPLOY_USER/.ssh/authorized_keys" >/dev/null
      else
        log "Keeping existing authorized_keys for '$DEPLOY_USER'"
      fi
    else
      printf '%s\n' "$DEPLOY_AUTHORIZED_KEYS" \
        | run_as_root tee "/home/$DEPLOY_USER/.ssh/authorized_keys" >/dev/null
    fi

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

  run_as_root tee /etc/ssh/sshd_config.d/99-anatomy-hardening.conf >/dev/null <<EOF_SSH
Port $SSH_PORT
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication $password_auth
KbdInteractiveAuthentication no
AllowUsers $DEPLOY_USER
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF_SSH

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
  run_as_root ufw allow "${SSH_PORT}/tcp" || true

  IFS=',' read -ra allowed_ports <<< "$UFW_ALLOW_PORTS"
  for port in "${allowed_ports[@]}"; do
    port="${port//[[:space:]]/}"
    [[ -z "$port" ]] && continue
    run_as_root ufw allow "$port" || true
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
  run_as_root tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<EOF_F2B
[sshd]
enabled = true
port = $SSH_PORT
maxretry = 5
findtime = 10m
bantime = 1h
EOF_F2B

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
  run_as_root tee /etc/systemd/journald.conf.d/99-anatomy.conf >/dev/null <<'EOF_JOURNAL'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=1G
MaxRetentionSec=1month
EOF_JOURNAL

  run_as_root systemctl restart systemd-journald >/dev/null 2>&1 || true
}

configure_unattended_upgrades() {
  if ! env_bool "$HARDEN_SERVER" || ! env_bool "$UNATTENDED_UPGRADES_ENABLE"; then
    return
  fi

  [[ -d /etc/apt/apt.conf.d ]] || return

  log "Enabling unattended security updates"
  run_as_root tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF_APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF_APT

  run_as_root systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
}

configure_sysctl_hardening() {
  if ! env_bool "$HARDEN_SERVER"; then
    return
  fi

  log "Applying baseline network sysctl hardening"
  run_as_root tee /etc/sysctl.d/99-anatomy-hardening.conf >/dev/null <<'EOF_SYSCTL'
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
EOF_SYSCTL

  run_as_root sysctl --system >/dev/null 2>&1 || true
}

hardening_bootstrap() {
  if ! env_bool "$HARDEN_SERVER"; then
    log "Skipping hardening because HARDEN_SERVER=false"
    return
  fi

  install_server_packages
  ensure_deploy_user
  ensure_deploy_access_is_safe
  configure_logging
  configure_sysctl_hardening
  configure_ssh_hardening
  configure_firewall
  configure_fail2ban
  configure_unattended_upgrades
}

ensure_postgres_access() {
  if ! env_bool "$POSTGRES_USE_SUDO"; then
    return
  fi

  if id "$POSTGRES_ADMIN_SYSTEM_USER" >/dev/null 2>&1; then
    return
  fi

  warn "POSTGRES_ADMIN_SYSTEM_USER='$POSTGRES_ADMIN_SYSTEM_USER' does not exist on this server"

  case "${POSTGRES_MISSING_SYSTEM_USER_ACTION,,}" in
    postgres)
      id postgres >/dev/null 2>&1 || die "System user 'postgres' does not exist either"
      POSTGRES_ADMIN_SYSTEM_USER="postgres"
      export POSTGRES_ADMIN_SYSTEM_USER
      log "Using PostgreSQL system user 'postgres'"
      return
      ;;
    tcp)
      POSTGRES_USE_SUDO="false"
      export POSTGRES_USE_SUDO
      log "Switching PostgreSQL admin connection to TCP mode"
      return
      ;;
    skip | pass)
      SKIP_DB_SETUP="true"
      export SKIP_DB_SETUP
      log "Skipping PostgreSQL setup because admin system user is missing"
      return
      ;;
    abort)
      die "Cannot run PostgreSQL setup as missing system user '$POSTGRES_ADMIN_SYSTEM_USER'"
      ;;
    ask | prompt | '') ;;
    *)
      warn "Unknown POSTGRES_MISSING_SYSTEM_USER_ACTION='$POSTGRES_MISSING_SYSTEM_USER_ACTION'; asking instead"
      ;;
  esac

  if id postgres >/dev/null 2>&1 && ask_yn "Use existing local system user 'postgres' instead?" "yes"; then
    POSTGRES_ADMIN_SYSTEM_USER="postgres"
    export POSTGRES_ADMIN_SYSTEM_USER
    log "Using PostgreSQL system user 'postgres'"
    return
  fi

  if ask_yn "Switch to TCP auth instead? This uses POSTGRES_HOST, POSTGRES_PORT, POSTGRES_ADMIN_USER, POSTGRES_ADMIN_PASSWORD." "no"; then
    POSTGRES_USE_SUDO="false"
    export POSTGRES_USE_SUDO
    log "Switching PostgreSQL admin connection to TCP mode"
    return
  fi

  if ask_yn "Skip PostgreSQL role/database setup and continue deployment?" "no"; then
    SKIP_DB_SETUP="true"
    export SKIP_DB_SETUP
    log "Skipping PostgreSQL setup"
    return
  fi

  die "Cannot continue PostgreSQL setup with missing system user '$POSTGRES_ADMIN_SYSTEM_USER'"
}

run_admin_psql() {
  if env_bool "$POSTGRES_USE_SUDO"; then
    run_as_postgres_system_user psql -v ON_ERROR_STOP=1 -d "${POSTGRES_ADMIN_DB:-postgres}" "$@"
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
  if env_bool "$POSTGRES_USE_SUDO"; then
    run_as_postgres_system_user psql -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" "$@"
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

psql_bool() {
  local result
  result="$("$@" | tr -d '[:space:]')"
  [[ "$result" == "t" || "$result" == "true" || "$result" == "1" ]]
}

postgres_role_exists() {
  psql_bool run_admin_psql -At --set app_user="$POSTGRES_USER" <<'SQL'
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user');
SQL
}

postgres_db_exists() {
  psql_bool run_admin_psql -At --set app_db="$POSTGRES_DB" <<'SQL'
SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db');
SQL
}

create_postgres_role() {
  run_admin_psql --set app_user="$POSTGRES_USER" --set app_password="$POSTGRES_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')\gexec
SQL
}

reset_postgres_role_password() {
  run_admin_psql --set app_user="$POSTGRES_USER" --set app_password="$POSTGRES_PASSWORD" <<'SQL'
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password')\gexec
SQL
}

create_postgres_database() {
  run_admin_psql --set app_db="$POSTGRES_DB" --set app_user="$POSTGRES_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')\gexec
SQL
}

reassign_postgres_database_owner() {
  run_admin_psql --set app_db="$POSTGRES_DB" --set app_user="$POSTGRES_USER" <<'SQL'
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'app_user')\gexec
SQL
}

apply_target_db_grants() {
  run_target_db_psql --set app_user="$POSTGRES_USER" <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
SQL
}

check_app_database_login() {
  if env_bool "$DRY_RUN"; then
    log "dry-run app database login check skipped"
    return
  fi

  command -v psql >/dev/null 2>&1 || die "psql is required for the production database check"

  log "Checking application PostgreSQL login from DATABASE_URL"
  PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT 1" >/dev/null
}

create_database_and_role() {
  if env_bool "$SKIP_DB_SETUP"; then
    log "Skipping PostgreSQL setup because SKIP_DB_SETUP=true"
    return
  fi

  command -v psql >/dev/null 2>&1 || die "psql is required on the host"
  ensure_postgres_access

  if env_bool "$SKIP_DB_SETUP"; then
    log "Skipping PostgreSQL setup"
    return
  fi

  log "Ensuring PostgreSQL role '$POSTGRES_USER' and database '$POSTGRES_DB' exist"

  if postgres_role_exists; then
    log "PostgreSQL role '$POSTGRES_USER' already exists; passing role creation"

    if should_do_action "$POSTGRES_EXISTING_ROLE_ACTION" \
      "PostgreSQL role '$POSTGRES_USER' already exists. Reset its password from POSTGRES_PASSWORD?" \
      "no"; then
      reset_postgres_role_password
      log "Password reset for existing PostgreSQL role '$POSTGRES_USER'"
    else
      log "Keeping existing PostgreSQL role password for '$POSTGRES_USER'"
    fi
  else
    create_postgres_role
    log "Created PostgreSQL role '$POSTGRES_USER'"
  fi

  if postgres_db_exists; then
    log "PostgreSQL database '$POSTGRES_DB' already exists; passing database creation"

    if should_do_action "$POSTGRES_EXISTING_DB_ACTION" \
      "PostgreSQL database '$POSTGRES_DB' already exists. Reassign owner to '$POSTGRES_USER'?" \
      "no"; then
      reassign_postgres_database_owner
      log "Owner reassigned for existing PostgreSQL database '$POSTGRES_DB'"
    else
      log "Keeping existing owner for PostgreSQL database '$POSTGRES_DB'"
    fi
  else
    create_postgres_database
    log "Created PostgreSQL database '$POSTGRES_DB' owned by '$POSTGRES_USER'"
  fi

  apply_target_db_grants
  check_app_database_login
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
    APP_DIR="$ROOT_DIR"
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
  run_as_root rsync -a --delete \
    --exclude '.git' \
    --exclude '.env' \
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
  COMPOSE_FILE="$DEPLOY_APP_DIR/docker-compose.yml"
}

compose_base_string() {
  local q_env_file q_compose_file
  q_compose_file="$(shell_quote "$COMPOSE_FILE")"

  if [[ -f "$ENV_FILE" ]]; then
    q_env_file="$(shell_quote "$ENV_FILE")"
    printf 'DEPLOY_ENV_FILE=%s docker compose --env-file %s -f %s' "$q_env_file" "$q_env_file" "$q_compose_file"
  else
    printf 'docker compose -f %s' "$q_compose_file"
  fi
}

run_compose_shell() {
  local command="$1"
  local q_app_dir
  q_app_dir="$(shell_quote "$APP_DIR")"

  if [[ "$MODE" == "prod" ]]; then
    run_as_deploy_user bash -lc "cd $q_app_dir && $command"
  else
    if env_bool "$DRY_RUN"; then
      printf '[setup:%s] dry-run:' "$MODE"
      printf ' %s\n' "$command"
      return 0
    fi
    bash -lc "cd $q_app_dir && $command"
  fi
}

compose_services_string() {
  if [[ "$MODE" == "prod" ]]; then
    printf '%q ' "${PROD_SERVICES[@]}"
  fi
}

compose_profile_string() {
  if [[ "$MODE" == "prod" ]]; then
    printf '%s' '--profile prod '
  fi
}

extra_args_string() {
  [[ ${#COMPOSE_EXTRA_ARGS[@]} -eq 0 ]] && return 0
  printf '%q ' "${COMPOSE_EXTRA_ARGS[@]}"
}

run_compose_up() {
  local base services profile extra
  base="$(compose_base_string)"
  services="$(compose_services_string)"
  profile="$(compose_profile_string)"
  extra="$(extra_args_string)"

  log "Building and starting Docker services from $COMPOSE_FILE"
  run_compose_shell "$base $profile up -d --build --remove-orphans $extra $services"
}

run_compose_action() {
  local base services profile extra
  base="$(compose_base_string)"
  services="$(compose_services_string)"
  profile="$(compose_profile_string)"
  extra="$(extra_args_string)"

  case "$ACTION" in
    up | compose)
      run_compose_up
      ;;
    down)
      log "Stopping Docker services"
      if [[ "$MODE" == "prod" ]]; then
        run_compose_shell "$base $profile stop $services $extra"
        run_compose_shell "$base $profile rm -f $services $extra"
      else
        run_compose_shell "$base down --remove-orphans $extra"
      fi
      ;;
    restart)
      run_compose_shell "$base $profile restart $services $extra"
      ;;
    build)
      run_compose_shell "$base $profile build $extra $services"
      ;;
    pull)
      run_compose_shell "$base $profile pull $extra $services"
      ;;
    ps)
      run_compose_shell "$base $profile ps $extra"
      ;;
    logs)
      run_compose_shell "$base $profile logs --tail=$(shell_quote "$LOG_LINES") -f $extra $services"
      ;;
    config)
      run_compose_shell "$base $profile config $extra"
      ;;
    *)
      die "Unsupported compose action: $ACTION"
      ;;
  esac
}

should_run_step() {
  local step="$1"

  if [[ -n "$ONLY_STEPS" ]] && ! csv_has "$ONLY_STEPS" "$step"; then
    return 1
  fi

  if [[ -n "$SKIP_STEPS" ]] && csv_has "$SKIP_STEPS" "$step"; then
    return 1
  fi

  return 0
}

run_prod_step() {
  local step="$1"

  case "$step" in
    hardening) hardening_bootstrap ;;
    db) create_database_and_role ;;
    storage) prepare_host_storage ;;
    sync) sync_project_to_deploy_user ;;
    compose) run_compose_up ;;
    *) die "Unknown production step: $step" ;;
  esac
}

run_prod_deploy() {
  local step

  ensure_local_prereqs
  validate_prod_env

  for step in "${PROD_STEPS[@]}"; do
    if should_run_step "$step"; then
      log "Running step: $step"
      run_prod_step "$step"
    else
      log "Skipping step: $step"
    fi
  done

  log "Production flow complete"
}

run_single_prod_step() {
  ensure_local_prereqs
  validate_prod_env
  run_prod_step "$ACTION"
}

run_check() {
  ensure_local_prereqs

  if [[ "$MODE" == "prod" ]]; then
    validate_prod_env
    command -v psql >/dev/null 2>&1 || die "psql is required for production database checks"
    check_app_database_login
  elif [[ -f "$ENV_FILE" ]]; then
    load_env_file "$ENV_FILE"
  fi

  log "Check complete"
}

main() {
  parse_args "$@"
  validate_mode_action

  if [[ "$MODE" == "prod" ]]; then
    case "$ACTION" in
      deploy)
        run_prod_deploy
        ;;
      hardening | db | storage | sync)
        run_single_prod_step
        ;;
      check)
        run_check
        ;;
      compose | down | restart | build | pull | ps | logs | config)
        ensure_local_prereqs
        validate_prod_env
        run_compose_action
        ;;
      up)
        run_prod_deploy
        ;;
      *)
        die "Unknown production action: $ACTION"
        ;;
    esac
  else
    [[ -f "$ENV_FILE" ]] && load_env_file "$ENV_FILE"
    case "$ACTION" in
      check)
        run_check
        ;;
      up | compose | down | restart | build | pull | ps | logs | config)
        ensure_local_prereqs
        run_compose_action
        ;;
      *)
        die "Unknown development action: $ACTION"
        ;;
    esac
  fi
}

main "$@"
