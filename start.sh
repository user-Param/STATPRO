#!/bin/bash

# Stashpro Ecosystem Orchestrator
PROJECT_ROOT=$(pwd)
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

echo "Starting Stashpro Ecosystem..."

# --- 1. Infrastructure ---
echo "Checking Infrastructure..."

# Redis
if ! pgrep -x "redis-server" > /dev/null; then
    echo "Starting Redis..."
    redis-server --daemonize yes
else
    echo "Redis is already running."
fi

# PostgreSQL (Assuming brew or system service)
if ! pg_isready > /dev/null 2>&1; then
    echo "Attempting to start PostgreSQL..."
    brew services start postgresql@14 || brew services start postgresql || echo "Failed to start PostgreSQL. Please ensure it is running."
else
    echo "PostgreSQL is ready."
fi

# --- 2. Cleanup Old Processes ---
echo "Cleaning up old processes..."
lsof -ti:3000,3001,3002 | xargs kill -9 2>/dev/null || true
lsof -ti:9000,9001 | xargs kill -9 2>/dev/null || true

# --- 3. Build & Start C++ Microservices ---

# Datafeed
echo "Building Datafeed..."
cd "$PROJECT_ROOT/datafeed"
mkdir -p build && cd build
cmake .. > /dev/null && make -j4 > /dev/null
./datafeed 0.0.0.0 9000 4 > "$LOG_DIR/datafeed.log" 2>&1 &
DATAFEED_PID=$!
echo " Datafeed started (PID: $DATAFEED_PID)"

# Engine
echo " Building Engine..."
cd "$PROJECT_ROOT/engine"
mkdir -p build && cd build
cmake .. > /dev/null && make -j4 > /dev/null
./engine > "$LOG_DIR/engine.log" 2>&1 &
ENGINE_PID=$!
echo " Engine started (PID: $ENGINE_PID)"

# --- 4. Start TypeScript/Bun Services ---

# Backend API
echo " Starting Backend API (Bun)..."
cd "$PROJECT_ROOT/backend"
bun run index.ts > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo " Backend API started (PID: $BACKEND_PID)"

# Execution Service
echo " Starting Execution Service (Bun)..."
cd "$PROJECT_ROOT/executor"
bun run index.ts > "$LOG_DIR/executor.log" 2>&1 &
EXECUTOR_PID=$!
echo " Execution Service started (PID: $EXECUTOR_PID)"

# --- 5. Start Frontend ---

# Frontend (Next.js)
echo " Starting Frontend (Next.js)..."
cd "$PROJECT_ROOT/frontend"
npm run dev -- -p 3001 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo " Frontend started at http://localhost:3001"

echo "------------------------------------------------"
echo " All services are running!"
echo " Logs: $LOG_DIR/"
echo "⌨  Press Ctrl+C to stop all services."
echo "------------------------------------------------"

# Consolidated Logging
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/executor.log" "$LOG_DIR/engine.log"

# Cleanup on exit
trap "echo 'Stopping all services...'; kill $DATAFEED_PID $ENGINE_PID $BACKEND_PID $EXECUTOR_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
