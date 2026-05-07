const DEFAULT_API_URL = "/api/v1";
const DEFAULT_SOCKET_URL = typeof window !== "undefined" ? window.location.origin : "http://localhost:8000";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || DEFAULT_API_URL;
}

export function getSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // In development, the vite dev server proxies /socket.io to the backend
  // so we can just use the same origin.
  if (import.meta.env.DEV) {
    return typeof window !== "undefined" ? window.location.origin : "http://localhost:8000";
  }
  return DEFAULT_SOCKET_URL;
}
