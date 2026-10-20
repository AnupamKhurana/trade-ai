#!/usr/bin/env bash
#
# launch.sh — Single script to start the TradeAI Stock App
#
# Usage:
#   ./launch.sh          Start both backend and frontend
#   ./launch.sh stop     Stop all running services
#   ./launch.sh status   Check if services are running
#   ./launch.sh restart  Stop, then start again
#
# Requirements:
#   - Python 3.10+ with venv
#   - Node.js 20.9+ with npm
#   - (Optional) llama.cpp server running on port 8080 for AI features
#
# Optional environment variables:
#   TRADEAI_HOST=0.0.0.0   Let other machines on your network reach the backend
#                          (default 127.0.0.1: this machine only; the API has no login)
#   TRADEAI_RELOAD=0       Disable backend auto-reload on code changes
#

set -e

# ─── Paths ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

# The frontend expects the API on 8000 and the backend only allows
# origins on 3000/3001, so these ports are fixed.
BACKEND_PORT=8000
FRONTEND_PORT=3000

BACKEND_HOST="${TRADEAI_HOST:-127.0.0.1}"
BACKEND_RELOAD="${TRADEAI_RELOAD:-1}"

# ─── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────
log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

banner() {
    echo -e "${CYAN}${BOLD}"
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║        TradeAI Terminal Launcher      ║"
    echo "  ║   AI-Powered Stock Market Intelligence║"
    echo "  ╚══════════════════════════════════════╝"
    echo -e "${NC}"
}

ensure_dirs() {
    mkdir -p "$PID_DIR" "$LOG_DIR"
}

pid_alive() {
    [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

read_pid() {
    [ -f "$PID_DIR/$1.pid" ] && cat "$PID_DIR/$1.pid" || true
}

# True if something accepts connections on the port (bash's /dev/tcp, no extra tools)
port_in_use() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# PIDs listening on a TCP port (lsof on macOS, ss on Linux)
listener_pids() {
    if command -v lsof &> /dev/null; then
        lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true
    elif command -v ss &> /dev/null; then
        ss -ltnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true
    fi
}

proc_cwd() {
    if [ -e "/proc/$1/cwd" ]; then
        readlink -f "/proc/$1/cwd" 2>/dev/null
    elif command -v lsof &> /dev/null; then
        lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'
    fi
}

# Only ever touch processes running from this project's folder
owned_by_project() {
    case "$(proc_cwd "$1")" in
        "$SCRIPT_DIR"/*) return 0 ;;
        *) return 1 ;;
    esac
}

descendants() {
    local child
    for child in $(pgrep -P "$1" 2>/dev/null); do
        echo "$child"
        descendants "$child"
    done
}

# Stop a process and everything it started (uvicorn's reload worker, npm -> next -> next-server).
# The tree is collected first: once the parent exits its children are re-parented
# and could no longer be found, which used to leave next-server holding port 3000.
kill_tree() {
    local pids i
    pids="$(descendants "$1") $1"
    kill $pids 2>/dev/null || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
        local alive=0 p
        for p in $pids; do pid_alive "$p" && alive=1; done
        [ $alive -eq 0 ] && return 0
        sleep 0.5
    done
    kill -9 $pids 2>/dev/null || true
}

# ─── Stop ────────────────────────────────────────────────────────────────
stop_one() {
    local label="$1" name="$2" port="$3" pid lp stopped=1
    pid="$(read_pid "$name")"
    if pid_alive "$pid"; then
        kill_tree "$pid"
        log_ok "$label stopped (PID $pid)"
        stopped=0
    elif [ -n "$pid" ]; then
        log_warn "$label PID $pid not running"
    fi
    rm -f "$PID_DIR/$name.pid"

    # Anything of ours still holding the port (e.g. after the launcher was killed)
    for lp in $(listener_pids "$port"); do
        if owned_by_project "$lp"; then
            kill_tree "$lp"
            log_ok "$label: stopped leftover process on port $port (PID $lp)"
            stopped=0
        fi
    done
    return $stopped
}

stop_services() {
    log_info "Stopping TradeAI services..."
    local stopped=1
    stop_one "Backend" backend "$BACKEND_PORT" && stopped=0
    stop_one "Frontend" frontend "$FRONTEND_PORT" && stopped=0

    if [ $stopped -ne 0 ]; then
        log_info "No services were running."
    fi
    return 0
}

# ─── Status ──────────────────────────────────────────────────────────────
print_service_status() {
    local label="$1" name="$2" port="$3" pid
    pid="$(read_pid "$name")"
    if pid_alive "$pid"; then
        echo -e "  $label (port $port):  ${GREEN}● Running${NC}  (PID $pid)"
    elif port_in_use "$port"; then
        echo -e "  $label (port $port):  ${YELLOW}● In use${NC}  (not started by this script)"
    else
        echo -e "  $label (port $port):  ${RED}○ Stopped${NC}"
    fi
}

check_status() {
    echo -e "${BOLD}TradeAI Service Status${NC}"
    echo "─────────────────────────────────"

    print_service_status "Backend " backend "$BACKEND_PORT"
    print_service_status "Frontend" frontend "$FRONTEND_PORT"

    # Llama Server
    if curl -s --connect-timeout 2 http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "  Llama Server (port 8080):  ${GREEN}● Running${NC}"
    else
        echo -e "  Llama Server (port 8080):  ${YELLOW}○ Not detected${NC} (AI features will be limited)"
    fi

    echo "─────────────────────────────────"
}

# ─── Start ───────────────────────────────────────────────────────────────
check_requirements() {
    local missing_deps=0
    if ! command -v python3 &> /dev/null; then
        log_err "python3 is not installed or not in PATH."
        missing_deps=1
    elif ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
        log_err "Python 3.10+ is required (found $(python3 --version 2>&1))."
        missing_deps=1
    fi
    if ! command -v node &> /dev/null; then
        log_err "node (Node.js) is not installed or not in PATH."
        missing_deps=1
    elif ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)'; then
        log_err "Node.js 20.9+ is required by the frontend (found $(node --version))."
        missing_deps=1
    fi
    if ! command -v npm &> /dev/null; then
        log_err "npm is not installed or not in PATH."
        missing_deps=1
    fi

    if [ $missing_deps -eq 1 ]; then
        log_err "Please install the missing dependencies and try again."
        exit 1
    fi
}

check_ports_free() {
    local entry label name port pid
    for entry in "Backend:backend:$BACKEND_PORT" "Frontend:frontend:$FRONTEND_PORT"; do
        IFS=: read -r label name port <<< "$entry"
        pid="$(read_pid "$name")"
        if pid_alive "$pid"; then
            log_warn "$label is already running (PID $pid). Run './launch.sh stop' first."
            exit 1
        fi
        if port_in_use "$port"; then
            log_err "Port $port is already in use by another program, so the $label cannot start."
            log_err "Stop that program (or run './launch.sh stop' if it is a leftover TradeAI process) and try again."
            exit 1
        fi
    done
}

# Wait until a service accepts connections; fail early if its process died
wait_for_service() {
    local label="$1" pid="$2" port="$3" log="$4" timeout="$5" i
    for ((i = 0; i < timeout; i++)); do
        if port_in_use "$port"; then
            log_ok "$label is up"
            return 0
        fi
        if ! pid_alive "$pid"; then
            break
        fi
        sleep 1
    done
    log_err "$label did not start. Last lines of $log:"
    tail -n 15 "$log" 2>/dev/null | sed 's/^/    /'
    return 1
}

start_services() {
    banner
    ensure_dirs
    check_requirements
    check_ports_free

    # ── 1. Backend Setup ─────────────────────────────────────────────────
    log_info "Setting up backend..."

    # Check if venv exists AND is functional (pip must be executable)
    VENV_OK=false
    if [ -d "$BACKEND_DIR/venv" ] && [ -x "$BACKEND_DIR/venv/bin/pip" ]; then
        # Verify the venv's Python actually works (shebang may point to old path)
        if "$BACKEND_DIR/venv/bin/python3" --version >/dev/null 2>&1; then
            VENV_OK=true
        else
            log_warn "Existing venv is broken (Python binary not found). Recreating..."
            rm -rf "$BACKEND_DIR/venv"
        fi
    elif [ -d "$BACKEND_DIR/venv" ]; then
        log_warn "Existing venv is corrupt. Recreating..."
        rm -rf "$BACKEND_DIR/venv"
    fi

    if [ "$VENV_OK" = false ]; then
        log_info "Creating Python virtual environment..."
        python3 -m venv "$BACKEND_DIR/venv"
        if [ ! -x "$BACKEND_DIR/venv/bin/pip" ]; then
            log_err "Failed to create virtual environment. Is python3-venv installed?"
            exit 1
        fi
        log_ok "Virtual environment created"
    else
        log_ok "Virtual environment OK"
    fi

    # Only reinstall when requirements.txt changed (or the venv was just created),
    # so starting works offline and takes seconds.
    REQ_STAMP="$BACKEND_DIR/venv/.requirements.cksum"
    REQ_SUM="$(cksum < "$BACKEND_DIR/requirements.txt")"
    if [ "$VENV_OK" = true ] && [ -f "$REQ_STAMP" ] && [ "$(cat "$REQ_STAMP")" = "$REQ_SUM" ]; then
        log_ok "Backend dependencies up to date"
    else
        log_info "Installing backend dependencies (this may take a moment on first run)..."
        if ! "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" > "$LOG_DIR/pip_install.log" 2>&1; then
            log_err "Failed to install dependencies. Last lines of $LOG_DIR/pip_install.log:"
            tail -n 15 "$LOG_DIR/pip_install.log" | sed 's/^/    /'
            exit 1
        fi
        echo "$REQ_SUM" > "$REQ_STAMP"
        log_ok "Backend dependencies installed"
    fi

    # ── 2. Frontend Setup ────────────────────────────────────────────────
    log_info "Setting up frontend..."

    NPM_STAMP="$FRONTEND_DIR/node_modules/.package-lock.cksum"
    NPM_SUM="$(cksum < "$FRONTEND_DIR/package-lock.json")"
    if [ -d "$FRONTEND_DIR/node_modules" ] && [ -f "$NPM_STAMP" ] && [ "$(cat "$NPM_STAMP")" = "$NPM_SUM" ]; then
        log_ok "Frontend dependencies up to date"
    else
        # npm ci installs exactly what package-lock.json says and never rewrites it
        log_info "Installing frontend dependencies (npm ci)..."
        if ! (cd "$FRONTEND_DIR" && npm ci --silent > "$LOG_DIR/npm_install.log" 2>&1); then
            log_err "npm ci failed. Last lines of $LOG_DIR/npm_install.log:"
            tail -n 15 "$LOG_DIR/npm_install.log" | sed 's/^/    /'
            exit 1
        fi
        echo "$NPM_SUM" > "$NPM_STAMP"
        log_ok "Frontend dependencies installed"
    fi

    # From here on, always clean up whatever we started
    trap cleanup INT TERM EXIT

    # ── 3. Start Backend ─────────────────────────────────────────────────
    log_info "Starting backend on $BACKEND_HOST:$BACKEND_PORT..."
    local reload_args=()
    if [ "$BACKEND_RELOAD" != "0" ]; then
        reload_args=(--reload --reload-dir app)
    fi
    (cd "$BACKEND_DIR" && exec "$BACKEND_DIR/venv/bin/uvicorn" app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" "${reload_args[@]}" \
        > "$LOG_DIR/backend.log" 2>&1 </dev/null) &
    BPID=$!
    echo $BPID > "$PID_DIR/backend.pid"
    log_ok "Backend started (PID $BPID)"

    # ── 4. Start Frontend ────────────────────────────────────────────────
    log_info "Starting frontend on port $FRONTEND_PORT..."
    (cd "$FRONTEND_DIR" && exec npm run dev -- --port "$FRONTEND_PORT" \
        > "$LOG_DIR/frontend.log" 2>&1 </dev/null) &
    FPID=$!
    echo $FPID > "$PID_DIR/frontend.pid"
    log_ok "Frontend started (PID $FPID)"

    # ── 5. Wait for services to be ready ─────────────────────────────────
    log_info "Waiting for services to start..."
    wait_for_service "Backend" "$BPID" "$BACKEND_PORT" "$LOG_DIR/backend.log" 60 || exit 1
    wait_for_service "Frontend" "$FPID" "$FRONTEND_PORT" "$LOG_DIR/frontend.log" 90 || exit 1

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ TradeAI is ready!${NC}"
    echo ""
    echo -e "  ${BOLD}Frontend:${NC}  ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "  ${BOLD}Backend:${NC}   ${CYAN}http://localhost:$BACKEND_PORT${NC}"
    echo -e "  ${BOLD}API Docs:${NC}  ${CYAN}http://localhost:$BACKEND_PORT/docs${NC}"
    echo ""
    echo -e "  Logs:     $LOG_DIR/"
    echo -e "  Stop:     ${YELLOW}Press Ctrl+C to stop the application${NC}"
    echo ""

    # Llama server check
    if ! curl -s --connect-timeout 2 http://localhost:8080/health >/dev/null 2>&1; then
        log_warn "Llama server not detected on port 8080. AI features (sentiment, prediction, chat) will not work until the server is started."
    else
        log_ok "Llama server detected on port 8080"
    fi

    # Block until Ctrl+C, or until either service dies (so a crash is noticed)
    while pid_alive "$BPID" && pid_alive "$FPID"; do
        sleep 2
    done
    # './launch.sh stop' from another terminal removes the PID files first
    if [ ! -f "$PID_DIR/backend.pid" ] || [ ! -f "$PID_DIR/frontend.pid" ]; then
        trap - INT TERM EXIT
        log_info "Stopped by './launch.sh stop'."
        exit 0
    fi
    if ! pid_alive "$BPID"; then
        log_err "Backend stopped unexpectedly. See $LOG_DIR/backend.log"
    else
        log_err "Frontend stopped unexpectedly. See $LOG_DIR/frontend.log"
    fi
    exit 1
}

cleanup() {
    local rc=$?
    trap - INT TERM EXIT
    echo ""
    stop_services
    exit $rc
}

# ─── Main ────────────────────────────────────────────────────────────────
case "${1:-start}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    status)
        check_status
        ;;
    restart)
        stop_services
        sleep 1
        start_services
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
