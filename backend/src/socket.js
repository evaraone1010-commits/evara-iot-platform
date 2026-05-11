const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { admin, db } = require("./config/firebase.js");
const cache = require("./config/cache.js");
const { logger } = require("./config/pino.js");
const { checkOwnership } = require("./middleware/auth.middleware.js");
const socketValidation = require("./services/socketValidation.js");
const { telemetryEvents } = require("./workers/telemetryWorker.js");
const crypto = require("crypto");

// Connection Limit Config
const MAX_CONNECTIONS_PER_USER = 10;
const CONNECTION_TTL = 86400; // 24 hours
const lastEmitTime = new Map(); // deviceId → timestamp
const EMIT_THROTTLE_MS = 2000;  // max 1 broadcast per device per 2 seconds
const INSTANCE_ID = process.env.INSTANCE_ID || `inst-${crypto.randomBytes(8).toString('hex')}`;

/**
 * Throttles broadcasts to prevent frontend flooding
 */
function throttledEmit(io, deviceId, event, data) {
  const now = Date.now();
  const last = lastEmitTime.get(deviceId) ?? 0;

  if (now - last < EMIT_THROTTLE_MS) {
    return; // drop duplicate/noisy update
  }

  lastEmitTime.set(deviceId, now);
  io.to(`room:${deviceId}`).emit(event, data);
}

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

/**
 * Coordinated Firestore listener registration
 * Tracks ownership in Redis so other instances don't orphan listeners
 */
async function registerListener(socketId, deviceId, unsubscribeFn) {
  if (!socketId || !deviceId || !unsubscribeFn) return;
  
  const key = `${socketId}:${deviceId}`;
  
  // Track in Redis which instance owns this listener
  if (cache.isRedisReady && cache.redis) {
    await cache.redis.set(
      `listener:${key}`,
      INSTANCE_ID,
      'EX', 3600 // 1 hour TTL
    );
  }

  firestoreListeners.set(key, unsubscribeFn);
  logger.debug(`[Socket.io] Registered listener for ${key} on instance ${INSTANCE_ID}`);
}

/**
 * Coordinated cleanup
 */
async function cleanupListeners(socketId, deviceId = null) {
  if (!socketId) return;

  const keysToClean = [];
  if (deviceId) {
    keysToClean.push(`${socketId}:${deviceId}`);
  } else {
    // Clean all for this socket
    for (const key of firestoreListeners.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        keysToClean.push(key);
      }
    }
  }

  for (const key of keysToClean) {
    const unsubscribe = firestoreListeners.get(key);
    if (unsubscribe) {
      try {
        unsubscribe();
        logger.debug(`[Socket.io] Cleaned up local listener for ${key}`);
      } catch (err) {
        logger.error(`[Socket.io] Failed to unsubscribe ${key}:`, err.message);
      }
      firestoreListeners.delete(key);
    }
    
    if (cache.isRedisReady && cache.redis) {
      await cache.redis.del(`listener:${key}`);
    }
  }
}

/**
 * On startup — clean up stale Redis keys from this specific instance
 * to prevent leaking old records if we crashed previously.
 */
async function cleanStaleListeners() {
  if (!cache.isRedisReady || !cache.redis) return;

  try {
    const keys = await cache.redis.keys('listener:*');
    let cleaned = 0;
    
    for (const key of keys) {
      const owner = await cache.redis.get(key);
      // Only clean up if we are the owner or if the key is obviously stale
      // In a real production system, we'd check if the 'owner' instance is still alive
      if (owner === INSTANCE_ID) {
        await cache.redis.del(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`[Socket.io] Cleaned up ${cleaned} stale listener records for instance ${INSTANCE_ID}`);
    }
  } catch (err) {
    logger.warn('[Socket.io] Stale listener cleanup failed:', err.message);
  }
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
                await cleanupListeners(socket.id);
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
            } catch (err) {
                logger.warn('[Socket.io] Unsubscribe device failed', { error: err.message, payload: rawData });
            }
        });
    });

    // Telemetry Broadcasts
    if (pubSub) {
        pubSub.sub.psubscribe("device:update:*");
        pubSub.sub.on("pmessage", (pattern, channel, message) => {
            try {
                const payload = JSON.parse(message);
                const deviceId = channel.split(":")[2];
                if (deviceId) throttledEmit(io, deviceId, "device:update", payload);
            } catch (err) { logger.error("Redis pubsub parse error:", err); }
        });
    }

    telemetryEvents.on("device:update", (payload) => {
        if (payload?.deviceId) throttledEmit(io, payload.deviceId, "device:update", payload);
    });

    // SaaS Architecture: Multi-Instance coordination
    cleanStaleListeners();

    global.io = io;
    return io;
}

module.exports = { initSocket, registerListener };
