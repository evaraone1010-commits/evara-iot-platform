#!/bin/sh
# Docker Entrypoint: Handle graceful startup with port conflict prevention
# This runs inside the container before starting the main Node process

set -e

echo "[$(date)] 🚀 Docker Container Startup"

# Kill any lingering Node processes (shouldn't happen, but safety first)
# In a clean container this should be a no-op
pkill -f "node.*src/server.js" 2>/dev/null || true
sleep 1

# Verify PORT environment variable is set
if [ -z "$PORT" ]; then
    export PORT=8000
    echo "[$(date)] No PORT env var set, defaulting to 8000"
fi

echo "[$(date)] ✅ Starting Node.js backend on port $PORT"

# Execute main process directly (don't fork, so container PID 1 is node)
# This ensures container receives SIGTERM for graceful shutdown
exec node src/server.js
