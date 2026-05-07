const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args); // Always log errors
  },
  debug: (...args: any[]) => {
    if (isDev && (import.meta.env.VITE_DEBUG_MODE === 'true')) {
      console.debug(...args);
    }
  }
};

export default logger;
