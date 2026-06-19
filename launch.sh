#!/usr/bin/env bash
#
# launch.sh — Single script to start the TradeAI Stock App
#
# Usage:
#   ./launch.sh          Start both backend and frontend
#   ./launch.sh stop     Stop all running services
#   ./launch.sh status   Check if services are running
#
# Requirements:
#   - Python 3.10+ with venv
#   - Node.js 18+ with npm
#   - (Optional) llama.cpp server running on port 8080 for AI features
#

set -e

# ─── Paths ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

BACKEND_PORT=8000
FRONTEND_PORT=3000

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

# ─── Stop ────────────────────────────────────────────────────────────────
stop_services() {
    log_info "Stopping TradeAI services..."
    local stopped=0

    if [ -f "$PID_DIR/backend.pid" ]; then
        BPID=$(cat "$PID_DIR/backend.pid")
        if kill -0 "$BPID" 2>/dev/null; then
            kill "$BPID" 2>/dev/null && log_ok "Backend stopped (PID $BPID)" || log_warn "Failed to stop backend"
            stopped=1
        else
            log_warn "Backend PID $BPID not running"
        fi
        rm -f "$PID_DIR/backend.pid"
    fi

    if [ -f "$PID_DIR/frontend.pid" ]; then
        FPID=$(cat "$PID_DIR/frontend.pid")
        if kill -0 "$FPID" 2>/dev/null; then
            kill "$FPID" 2>/dev/null && log_ok "Frontend stopped (PID $FPID)" || log_warn "Failed to stop frontend"
            stopped=1
        else
            log_warn "Frontend PID $FPID not running"
        fi
        rm -f "$PID_DIR/frontend.pid"
    fi

    if [ $stopped -eq 0 ]; then
        log_info "No services were running."
    fi
}

# ─── Status ──────────────────────────────────────────────────────────────
check_status() {
    echo -e "${BOLD}TradeAI Service Status${NC}"
    echo "─────────────────────────────────"

    # Backend
    if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
        echo -e "  Backend  (port $BACKEND_PORT):  ${GREEN}● Running${NC}  (PID $(cat "$PID_DIR/backend.pid"))"
    else
        echo -e "  Backend  (port $BACKEND_PORT):  ${RED}○ Stopped${NC}"
    fi

    # Frontend
    if [ -f "$PID_DIR/frontend.pid" ] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
        echo -e "  Frontend (port $FRONTEND_PORT):  ${GREEN}● Running${NC}  (PID $(cat "$PID_DIR/frontend.pid"))"
    else
        echo -e "  Frontend (port $FRONTEND_PORT):  ${RED}○ Stopped${NC}"
    fi

    # Llama Server
    if curl -s --connect-timeout 2 http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "  Llama Server (port 8080):  ${GREEN}● Running${NC}"
    else
        echo -e "  Llama Server (port 8080):  ${YELLOW}○ Not detected${NC} (AI features will be limited)"
    fi

    echo "─────────────────────────────────"
}

# ─── Start ───────────────────────────────────────────────────────────────
start_services() {
    banner
    ensure_dirs

    # Check if already running
    if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
        log_warn "Backend is already running (PID $(cat "$PID_DIR/backend.pid")). Run './launch.sh stop' first."
        exit 1
    fi
    if [ -f "$PID_DIR/frontend.pid" ] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
        log_warn "Frontend is already running (PID $(cat "$PID_DIR/frontend.pid")). Run './launch.sh stop' first."
        exit 1
    fi

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

    log_info "Installing backend dependencies (this may take a moment on first run)..."
    if ! "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" 2>&1 | tee "$LOG_DIR/pip_install.log"; then
        log_err "Failed to install dependencies. Check $LOG_DIR/pip_install.log"
        exit 1
    fi
    log_ok "Backend dependencies installed"

    # ── 2. Frontend Setup ────────────────────────────────────────────────
    log_info "Setting up frontend..."

    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        log_info "Installing frontend dependencies (npm install)..."
        (cd "$FRONTEND_DIR" && npm install --silent 2>"$LOG_DIR/npm_install.log")
        log_ok "Frontend dependencies installed"
    else
        log_ok "Frontend dependencies already installed"
    fi

    # ── 3. Start Backend ─────────────────────────────────────────────────
    log_info "Starting backend on port $BACKEND_PORT..."
    (cd "$BACKEND_DIR" && exec "$BACKEND_DIR/venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload \
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
    sleep 3

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

    # Setup trap to stop services on exit or interruption
    trap stop_services INT TERM EXIT

    # Block script and wait for background processes
    wait $BPID $FPID 2>/dev/null
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
