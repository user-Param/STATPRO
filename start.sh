#!/bin/bash

# Statpro Ecosystem Orchestrator
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $DATAFEED_PID $ENGINE_PID $BACKEND_PID $EXECUTOR_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

echo "================================================"
echo "  Starting Statpro Ecosystem"
echo "================================================"

# --- 1. Infrastructure ---
echo "[1/6] Checking Infrastructure..."

# Redis
if ! pgrep -x "redis-server" > /dev/null; then
    echo "  Starting Redis..."
    redis-server --daemonize yes 2>/dev/null || {
        echo "  ERROR: Failed to start Redis. Please install: sudo apt-get install redis-server"
        exit 1
    }
else
    echo "  Redis is already running."
fi

# PostgreSQL
if ! pg_isready -q 2>/dev/null; then
    echo "  Attempting to start PostgreSQL..."
    # Try systemd first, then pg_ctlcluster
    sudo systemctl start postgresql 2>/dev/null || \
    sudo pg_ctlcluster 14 main start 2>/dev/null || \
    sudo pg_ctlcluster 16 main start 2>/dev/null || {
        echo "  ERROR: Failed to start PostgreSQL. Please install: sudo apt-get install postgresql"
        exit 1
    }
    sleep 1
fi

if pg_isready -q 2>/dev/null; then
    echo "  PostgreSQL is ready."
else
    echo "  ERROR: PostgreSQL is not responding."
    exit 1
fi

# --- 2. Initialize Database ---
echo "[2/6] Initializing Database..."

# Create user and database if they don't exist
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='statpro'" 2>/dev/null | grep -q 1 || {
    echo "  Creating database user 'statpro'..."
    sudo -u postgres psql -c "CREATE USER statpro WITH PASSWORD 'statpro' CREATEDB;" 2>/dev/null
}

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='statpro'" 2>/dev/null | grep -q 1 || {
    echo "  Creating database 'statpro'..."
    sudo -u postgres psql -c "CREATE DATABASE statpro OWNER statpro;" 2>/dev/null
}

# Run schema initialization
cd "$PROJECT_ROOT/backend"
bun run init_db.ts 2>/dev/null
echo "  Database initialized."

# --- 3. Cleanup Old Processes ---
echo "[3/6] Cleaning up old processes on service ports..."
for port in 3001 4000 4001 9000 9001; do
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1

# --- 4. Build & Start C++ Microservices ---
echo "[4/6] Building C++ Services..."

# Datafeed
echo "  Building Datafeed..."
cd "$PROJECT_ROOT/datafeed"
mkdir -p build && cd build
if cmake .. > "$LOG_DIR/datafeed_build.log" 2>&1 && make -j$(nproc) >> "$LOG_DIR/datafeed_build.log" 2>&1; then
    echo "  Datafeed built successfully."
    ./datafeed 0.0.0.0 9000 4 > "$LOG_DIR/datafeed.log" 2>&1 &
    DATAFEED_PID=$!
    echo "  Datafeed started (PID: $DATAFEED_PID) on port 9000"
else
    echo "  WARNING: Datafeed build failed. Check $LOG_DIR/datafeed_build.log"
    echo "  Install dependencies: sudo apt-get install libboost-all-dev nlohmann-json3-dev cmake g++ libpqxx-dev"
fi

# Engine
echo "  Building Engine..."
cd "$PROJECT_ROOT/engine"
mkdir -p build && cd build
if cmake .. > "$LOG_DIR/engine_build.log" 2>&1 && make -j$(nproc) >> "$LOG_DIR/engine_build.log" 2>&1; then
    echo "  Engine built successfully."
    sleep 2  # Wait for datafeed to be ready
    ./engine > "$LOG_DIR/engine.log" 2>&1 &
    ENGINE_PID=$!
    echo "  Engine started (PID: $ENGINE_PID)"
else
    echo "  WARNING: Engine build failed. Check $LOG_DIR/engine_build.log"
    echo "  Install dependencies: sudo apt-get install python3-dev pybind11-dev"
fi

# --- 5. Start TypeScript/Bun Services ---
echo "[5/6] Starting TypeScript Services..."

# Executor (must start before Engine tries to connect on port 9001)
echo "  Starting Execution Service..."
cd "$PROJECT_ROOT/executor"
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null
bun run index.ts > "$LOG_DIR/executor.log" 2>&1 &
EXECUTOR_PID=$!
echo "  Execution Service started (PID: $EXECUTOR_PID) on port 4001"

# Backend API
echo "  Starting Backend API..."
cd "$PROJECT_ROOT/backend"
bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null
bun run index.ts > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  Backend API started (PID: $BACKEND_PID) on port 4000"

# --- 6. Start Frontend ---
echo "[6/6] Starting Frontend..."
cd "$PROJECT_ROOT/frontend"
npm install --silent 2>/dev/null
npm run dev -- -p 3001 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend started (PID: $FRONTEND_PID) on port 3001"

sleep 2

echo ""
echo "================================================"
echo "  All services are running!"
echo ""
echo "  Frontend:  http://localhost:3001"
echo "  Backend:   http://localhost:4000"
echo "  Executor:  http://localhost:4001"
echo "  Datafeed:  ws://localhost:9000"
echo "  Engine:    Connected to Datafeed + Executor"
echo ""
echo "  Logs:      $LOG_DIR/"
echo "  Press Ctrl+C to stop all services."
echo "================================================"

# Tail logs and wait
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/executor.log" "$LOG_DIR/datafeed.log" "$LOG_DIR/engine.log" 2>/dev/null &
wait
