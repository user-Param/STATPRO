#!/bin/bash

PROJECT_ROOT=$(pwd)
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Default: show all logs unless flags are given
SHOW_ALL=true
SHOW_ENGINE=false
SHOW_EXECUTOR=false
SHOW_DATAFEED=false
SHOW_ADAPTER=false
SHOW_RESEARCH=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --engine)   SHOW_ENGINE=false; SHOW_ALL=false ;;
        --executor) SHOW_EXECUTOR=false; SHOW_ALL=false ;;
        --datafeed) SHOW_DATAFEED=false; SHOW_ALL=false ;;
        --adapter)  SHOW_ADAPTER=false; SHOW_ALL=false ;;
        --research) SHOW_RESEARCH=false; SHOW_ALL=false ;;
        --all)      SHOW_ALL=false ;;
        --none)      SHOW_ENGINE=false; SHOW_EXECUTOR=false; 
        SHOW_DATAFEED=false; SHOW_ADAPTER=false; SHOW_RESEARCH=false; SHOW_ALL=false ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

echo "Cleaning up old processes..."
lsof -ti:9000 | xargs kill -9 2>/dev/null || true
lsof -ti:9001 | xargs kill -9 2>/dev/null || true
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Building and starting STATPRO Ecosystem"

# 1. Datafeed
cd "$PROJECT_ROOT/datafeed"
if [ ! -d "build" ]; then mkdir build; fi
cd build && cmake .. && make -j4
./datafeed 0.0.0.0 9000 4 > "$LOG_DIR/datafeed.log" 2>&1 &
DATAFEED_PID=$!
echo "Datafeed server started (PID: $DATAFEED_PID)"

# 2. Dadapter
./dadapter > "$LOG_DIR/adapter.log" 2>&1 &
ADAPTER_PID=$!
echo "Dadapter started (PID: $ADAPTER_PID)"

# 3. Executor
cd "$PROJECT_ROOT/executor"
if [ ! -d "build" ]; then mkdir build; fi
cd build && cmake .. && make -j4
./executor > "$LOG_DIR/executor.log" 2>&1 &
EXECUTOR_PID=$!
echo "Executor started (PID: $EXECUTOR_PID)"

sleep 2

# 4. Engine
echo "Starting statpro engine...."
cd "$PROJECT_ROOT/engine"
if [ ! -d "build" ]; then mkdir build; fi
cd build && cmake .. && make -j4
./engine > "$LOG_DIR/engine.log" 2>&1 &
ENGINE_PID=$!

# 5. Research Executor Backend (Python)
echo "Starting STATPRO Research Executor Backend..."
cd "$PROJECT_ROOT"
# Ensure dependencies are installed in the current python environment
python3 -m pip install --quiet Flask flask-cors 2>/dev/null
# Try to apply database permissions if psql is available
psql -h localhost -U statpro -d statpro -f "$PROJECT_ROOT/database/init.sql" >/dev/null 2>&1 || \
psql -h localhost -d statpro -f "$PROJECT_ROOT/database/init.sql" >/dev/null 2>&1 || \
echo "⚠️  Note: Database permissions might need manual update if psql is not in PATH."

python3 research_executor.py > "$LOG_DIR/research.log" 2>&1 &
RESEARCH_PID=$!


# 6. Frontend
echo "Starting React frontend..."
cd "$PROJECT_ROOT/user/statpro"
# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install --quiet
fi
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
REACT_PID=$!

echo "All services are running. Logs are in $LOG_DIR/"

# Determine which logs to tail
TAIL_CMD="tail -f"
if [ "$SHOW_ALL" = true ]; then
    TAIL_CMD="$TAIL_CMD $LOG_DIR/*.log"
else
    [ "$SHOW_ENGINE" = true ]   && TAIL_CMD="$TAIL_CMD $LOG_DIR/engine.log"
    [ "$SHOW_EXECUTOR" = true ] && TAIL_CMD="$TAIL_CMD $LOG_DIR/executor.log"
    [ "$SHOW_DATAFEED" = true ] && TAIL_CMD="$TAIL_CMD $LOG_DIR/datafeed.log"
    [ "$SHOW_ADAPTER" = true ]  && TAIL_CMD="$TAIL_CMD $LOG_DIR/adapter.log"
    [ "$SHOW_RESEARCH" = true ] && TAIL_CMD="$TAIL_CMD $LOG_DIR/research.log"
fi

echo "Showing logs for selected services. Press Ctrl+C to stop."
$TAIL_CMD

# Cleanup on exit
trap "echo 'Stopping...'; kill $DATAFEED_PID $ADAPTER_PID $EXECUTOR_PID $ENGINE_PID $RESEARCH_PID $REACT_PID 2>/dev/null; exit" INT
wait