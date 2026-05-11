// ✅ CRITICAL FIX: Disabled PM2 clustering to prevent port conflicts (EADDRINUSE)
// Why: When instances > 1, PM2 spawns multiple Node processes competing for the same port.
// On AWS EC2/ECS, if an old process doesn't exit cleanly, the new process fails to bind.
// Solution: Use horizontal scaling (multiple Railway replicas / ECS tasks) + Redis adapter (server.js)
// for real-time state sharing across instances.
//
// For local dev: Use `npm run dev` (nodemon) or `node src/bootstrap.js` directly.
// For production: Use Docker container with single process; orchestrator (K8s/ECS/Railway) manages scaling.

module.exports = {
  apps: [{
    name: "evara-backend",
    script: "./src/bootstrap.js",
    instances: 1,        // Single process — scaling handled by deployment platform
    exec_mode: "fork",   // Not cluster mode
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 8000
    }
  }]
};
