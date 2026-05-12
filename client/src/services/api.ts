import axios, {
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { io } from 'socket.io-client';
import { auth } from "../lib/firebase";
import { getApiBaseUrl, getSocketUrl } from "../utils/runtimeUrls";
import logger from "../utils/logger";

// Use same-domain defaults unless an explicit env override is provided.
const VITE_API_URL = getApiBaseUrl();
const SOCKET_URL = getSocketUrl();

logger.log('[API Config] VITE_API_URL:', VITE_API_URL);
logger.log('[API Config] SOCKET_URL:', SOCKET_URL);
logger.log('[API Config] DEV mode:', import.meta.env.DEV);

// Token cache — refresh only when it's about to expire
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * Smart token retriever:
 * 1. Returns cached token if valid and far from expiry
 * 2. Uses getIdToken(false) to let Firebase handle internal caching
 * 3. Decodes JWT to track expiry locally
 */
async function getSmartToken(): Promise<string | null> {
  const now = Date.now();

  // Return cached token if still valid (with buffer)
  if (cachedToken && now < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const user = auth.currentUser;
  if (!user) return null;

  try {
    // getIdToken(false) uses Firebase's internal cache if possible
    const token = await user.getIdToken(false);
    
    // Simple JWT decode to find 'exp' field
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    cachedToken = token;
    tokenExpiresAt = payload.exp * 1000; // convert to ms
    
    return cachedToken;
  } catch (err) {
    logger.error('[API] Failed to refresh token:', err);
    return null;
  }
}

/**
 * Clear the token cache (e.g. on logout)
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export const socket = io(SOCKET_URL, {
  autoConnect: false, // Prevents 400 Bad Request on page load before auth is ready
  auth: async (cb) => {
    try {
      const token = await getSmartToken();
      cb({ token: token || undefined });
    } catch (err) {
      cb({});
    }
  }
});

// Create Axios Instance
const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000, // 15 seconds global timeout for telemetry stability
});

// Request Interceptor: Inject Firebase Auth Token (CRITICAL)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getSmartToken();
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        logger.log(`[API Interceptor] ✅ Token injected for ${config.method?.toUpperCase()} ${config.url}`);
      } else {
        logger.warn('[API Interceptor] No token available, skipping injection');
      }
    } catch (error) {
      logger.error("[API Interceptor] Failed to get token:", error);
    }
    return config;
  }
);

// Response Interceptor: Auto-unwrap StandardResponse & Handle Errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Standard Response Unwrapping (Envelope Pattern)
    const data = response.data;
    if (
      data &&
      typeof data === "object" &&
      ("status" in data || "success" in data) &&
      "data" in data
    ) {
      return {
        ...response,
        data: data.data,
        meta: data.meta,
      };
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const errorData = error.response?.data as any;
    const message = errorData?.error?.message || errorData?.error || error.message;
    
    logger.error(`[API Error] ${status || 'Network'}: ${typeof message === 'object' ? JSON.stringify(message) : message}`, {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
    });
    
    // Log 401 errors specifically for debugging
    if (status === 401) {
      const hasCurrentUser = !!auth.currentUser;
      const authHeader = (error.config?.headers as any)?.Authorization;

      if (!hasCurrentUser) {
        logger.warn('[API Error] 401 received while logged out. This can happen during route transitions after sign-out.');
      } else {
        logger.error('[API Error] 🔐 AUTHENTICATION FAILED - Check if user is logged in and token is valid');
        logger.error('[API Error] Authorization header present:', !!authHeader);
      }
    }
    
    return Promise.reject(error);
  },
);

export default api;
