#!/bin/bash
# ✅ EC2 Startup Script: Port Conflict Prevention & Process Cleanup
# Usage: Add to EC2 User Data or cron job
# This script prevents EADDRINUSE (port already in use) errors by cleaning up orphaned Node processes

set -e

echo "[$(date)] 🚀 EC2 Startup Script: Starting backend service"

# Kill any orphaned Node processes (from previous failed deploys)
# The || true prevents script failure if no processes exist
echo "[$(date)] 🧹 Cleaning up orphaned Node processes..."
pkill -f "node.*src/server.js" || true
pkill -f "pm2-runtime" || true
pkill -f "pm2-daemon" || true

# Wait a moment for processes to terminate
sleep 2

# Verify ports are free
echo "[$(date)] 🔍 Checking if port 8000 is available..."
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null; then
    echo "[$(date)] ❌ ERROR: Port 8000 is still in use!"
    echo "[$(date)] Forcing port cleanup..."
    fuser -k 8000/tcp || true
    sleep 2
fi

# Navigate to app directory
cd /opt/app || cd ~/app || cd /app || exit 1

# Load environment variables (production usually has these in /etc/environment or task definition)
export NODE_ENV=production

echo "[$(date)] ✅ Environment ready. Starting Node backend service..."

# Start using PM2 in fork mode (single process) or directly with node
if command -v pm2 &> /dev/null; then
    echo "[$(date)] Using PM2 (fork mode)"
    pm2 start ecosystem.config.js --watch=false --no-daemon
else
    echo "[$(date)] Using node directly"
    exec node src/server.js
fi
