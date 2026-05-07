const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { admin, db } = require("./config/firebase.js");
const cache = require("./config/cache.js");
const { logger } = require("./config/pino.js");
const { checkOwnership } = require("./middleware/auth.middleware.js");
const socketValidation = require("./services/socketValidation.js");
const { telemetryEvents } = require("./workers/telemetryWorker.js");

// Connection Limit Config
const MAX_CONNECTIONS_PER_USER = 10;
const CONNECTION_TTL = 86400; // 24 hours

const CONNECTION_LIMIT_LUA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
current = tonumber(current) or 0
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current >= max then
  return 'LIMIT_EXCEEDED'
end

local newCount = redis.call('INCR', KEYS[1])
if newCount == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end

return newCount
`;

const firestoreListeners = new Map();

function registerListener(socketId, unsubscribeFn) {
  if (!socketId || !unsubscribeFn) return;
  const existing = firestoreListeners.get(socketId);
  if (existing && typeof existing === 'function') {
    firestoreListeners.set(socketId, [existing, unsubscribeFn]);
  } else if (Array.isArray(existing)) {
    existing.push(unsubscribeFn);
  } else {
    firestoreListeners.set(socketId, unsubscribeFn);
  }
}

function cleanupListeners(socketId) {
  if (!socketId) return;
  const listeners = firestoreListeners.get(socketId);
  if (!listeners) return;
  const listenerArray = Array.isArray(listeners) ? listeners : [listeners];
  for (const unsubscribeFn of listenerArray) {
    try { unsubscribeFn(); } catch (err) { logger.error('[Firestore] Listener unsubscribe failed', { socketId, error: err.message }); }
  }
  firestoreListeners.delete(socketId);
}

function initSocket(server, allowedOrigins) {
    const io = new Server(server, { 
        cors: { 
            origin: allowedOrigins,
            credentials: true
        } 
    });

    const pubSub = cache.getPubSub();
    if (pubSub) {
        io.adapter(createAdapter(pubSub.pub, pubSub.sub));
        logger.debug("[Socket.io] Redis adapter enabled");
    }

    // Connection Limiter & Auth
    io.use(async (socket, next) => {
        try {
            const uid = socket.handshake.auth?.uid || socket.ip || 'anonymous';
            const redisKey = `socket_connections:${uid}`;

            if (cache.isRedisReady && cache.redis) {
                const result = await cache.redis.eval(CONNECTION_LIMIT_LUA_SCRIPT, 1, redisKey, MAX_CONNECTIONS_PER_USER, CONNECTION_TTL);
                if (result === 'LIMIT_EXCEEDED') {
                    return next(new Error(`Too many connections. Max ${MAX_CONNECTIONS_PER_USER} allowed.`));
                }
            }

            socket.on('disconnect', async () => {
                cleanupListeners(socket.id);
                if (cache.isRedisReady && cache.redis) {
                    await cache.redis.decr(redisKey);
                }
            });

            next();
        } catch (err) {
            logger.error('[Socket.io] Connection check failed:', err.message);
            next();
        }
    });

    // Token Authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error: Missing token"));
            const decodedToken = await admin.auth().verifyIdToken(token);
            
            const cacheKey = `auth_role_${decodedToken.uid}`;
            let userData = await cache.get(cacheKey);

            if (!userData) {
                let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                let sourceCollection = "superadmins";
                
                if (!userDoc.exists) {
                    userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                    sourceCollection = "customers";
                }

                if (userDoc.exists) {
                    userData = { ...userDoc.data(), id: userDoc.id };
                    
                    // Fallback to determine role if missing
                    if (!userData.role) {
                        userData.role = sourceCollection === "superadmins" ? "superadmin" : "customer";
                    }
                    
                    await cache.set(cacheKey, userData, 180);
                } else {
                    return next(new Error("User not found"));
                }
            }

            const role = (userData.role || "customer").trim().toLowerCase();
            socket.user = { 
                uid: decodedToken.uid, 
                role, 
                community_id: userData.community_id || "", 
                customer_id: userData.customer_id || userData.id || "" 
            };
            next();
        } catch (err) {
            next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        if (socket.user?.customer_id) {
            socket.join(`customer:${socket.user.customer_id}`);
        }

        socket.on("subscribe_device", async (rawData) => {
            try {
                const data = socketValidation.validateRoomJoin({ room: `room:${rawData}`, deviceId: rawData });
                const isOwner = await checkOwnership(socket.user.customer_id || socket.user.uid, data.deviceId, socket.user.role, socket.user.community_id);
                if (isOwner) {
                    socket.join(`room:${data.deviceId}`);
                    socket.emit('subscribe_ack', { success: true, deviceId: data.deviceId });
                } else {
                    socket.emit('error', { message: 'Access denied' });
                }
            } catch (err) {
                socket.emit('error', { message: 'Invalid request' });
            }
        });

        socket.on("unsubscribe_device", (rawData) => {
            try {
                const data = socketValidation.validateRoomJoin({ room: `room:${rawData}`, deviceId: rawData });
                socket.leave(`room:${data.deviceId}`);
            } catch (err) {}
        });
    });

    // Telemetry Broadcasts
    if (pubSub) {
        pubSub.sub.psubscribe("device:update:*");
        pubSub.sub.on("pmessage", (pattern, channel, message) => {
            try {
                const payload = JSON.parse(message);
                const deviceId = channel.split(":")[2];
                if (deviceId) io.to(`room:${deviceId}`).emit("device:update", payload);
            } catch (err) { logger.error("Redis pubsub parse error:", err); }
        });
    }

    telemetryEvents.on("device:update", (payload) => {
        if (payload?.deviceId) io.to(`room:${payload.deviceId}`).emit("device:update", payload);
    });

    global.io = io;
    return io;
}

module.exports = { initSocket, registerListener };
