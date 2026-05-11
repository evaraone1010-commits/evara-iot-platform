/**
 * Memory Optimization Utilities
 * Pattern extracted from TDS-app_main with enhancements
 * 
 * Prevents memory leaks in React components:
 * - Subscription cleanup tracking
 * - Event listener management
 * - Request cancellation
 * - Resource disposal
 */

import { useEffect, useRef } from 'react';

// ============================================================================
// CLEANUP TRACKER
// ============================================================================

export class CleanupTracker {
    private cleanupFunctions: (() => void)[] = [];
    private isDestroyed = false;

    /**
     * Register a cleanup function
     */
    add(cleanup: () => void): void {
        if (this.isDestroyed) {
            console.warn('[CleanupTracker] Attempted to add cleanup after destruction');
            return;
        }
        this.cleanupFunctions.push(cleanup);
    }

    /**
     * Execute all cleanup functions
     */
    cleanup(): void {
        this.isDestroyed = true;
        this.cleanupFunctions.forEach((fn) => {
            try {
                fn();
            } catch (error) {
                console.error('[CleanupTracker] Cleanup error:', error);
            }
        });
        this.cleanupFunctions = [];
    }

    /**
     * Check if tracker is destroyed
     */
    get destroyed(): boolean {
        return this.isDestroyed;
    }
}

/**
 * Hook: Create cleanup tracker for component
 * 
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const cleanup = useCleanup();
 *   
 *   useEffect(() => {
 *     const ws = new WebSocket('...');
 *     cleanup.add(() => ws.close());
 *     
 *     const interval = setInterval(...);
 *     cleanup.add(() => clearInterval(interval));
 *   }, []);
 * }
 * ```
 */
export function useCleanup() {
    const trackerRef = useRef<CleanupTracker>(new CleanupTracker());

    useEffect(() => {
        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            trackerRef.current.cleanup();
        };
    }, []);

     
    return trackerRef.current;
}

// ============================================================================
// ABORT CONTROLLER POOL
// ============================================================================

/**
 * Manages AbortControllers for API requests
 * Automatically aborts all pending requests on component unmount
 * 
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const abortPool = useAbortPool();
 *   
 *   const fetchData = async () => {
 *     const signal = abortPool.createSignal();
 *     const response = await fetch('/api/data', { signal });
 *     return response.json();
 *   };
 * }
 * ```
 */
export class AbortPool {
    private controllers: AbortController[] = [];
    private isDestroyed = false;

    /**
     * Create new AbortSignal and track controller
     */
    createSignal(): AbortSignal {
        if (this.isDestroyed) {
            const controller = new AbortController();
            controller.abort();
            return controller.signal;
        }

        const controller = new AbortController();
        this.controllers.push(controller);
        return controller.signal;
    }

    /**
     * Abort all pending requests
     */
    abortAll(): void {
        this.isDestroyed = true;
        this.controllers.forEach((controller) => {
            try {
                controller.abort();
            } catch (error) {
                console.error('[AbortPool] Abort error:', error);
            }
        });
        this.controllers = [];
    }
}

export function useAbortPool() {
    const poolRef = useRef<AbortPool>(new AbortPool());

    useEffect(() => {
        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            poolRef.current.abortAll();
        };
    }, []);

     
    return poolRef.current;
}

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

/**
 * Debounce a value to prevent excessive re-renders
 * 
 * Usage:
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebounce(searchQuery, 300);
 * 
 * useEffect(() => {
 *   // Only fires 300ms after user stops typing
 *   fetchResults(debouncedQuery);
 * }, [debouncedQuery]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

    React.useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

// ============================================================================
// INTERVAL HOOK WITH AUTO-CLEANUP
// ============================================================================

/**
 * setInterval with automatic cleanup
 * 
 * Usage:
 * ```tsx
 * useInterval(() => {
 * }, 1000);
 * ```
 */
export function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef(callback);

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (delay === null) return;

        const id = setInterval(() => savedCallback.current(), delay);
        return () => clearInterval(id);
    }, [delay]);
}

// ============================================================================
// PREVIOUS VALUE HOOK
// ============================================================================

/**
 * Get previous value of a prop/state
 * Useful for detecting changes
 * 
 * Usage:
 * ```tsx
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 * 
 * if (prevCount !== count) {
 * }
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    // eslint-disable-next-line react-hooks/refs
    return ref.current;
}

// Need to import React for useDebounce
import * as React from 'react';
