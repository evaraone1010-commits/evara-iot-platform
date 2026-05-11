/**
 * Frontend Performance Monitoring
 * Tracks component render times, API calls, and page load metrics
 */

import { useEffect, useRef } from 'react';

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

interface PerformanceMetric {
    name: string;
    duration: number;
    timestamp: number;
}

class PerformanceMonitor {
    private metrics: PerformanceMetric[] = [];
    private maxMetrics = 1000;

    /**
     * Record a performance metric
     */
    record(name: string, duration: number) {
        this.metrics.push({
            name,
            duration,
            timestamp: Date.now()
        });

        // Keep only recent metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }
    }

    /**
     * Get metrics summary
     */
    getSummary() {
        if (this.metrics.length === 0) return null;

        const grouped = this.metrics.reduce((acc, metric) => {
            if (!acc[metric.name]) {
                acc[metric.name] = [];
            }
            acc[metric.name].push(metric.duration);
            return acc;
        }, {} as Record<string, number[]>);

        return Object.entries(grouped).map(([name, durations]) => ({
            name,
            count: durations.length,
            avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
            min: Math.min(...durations),
            max: Math.max(...durations),
            p95: this.percentile(durations, 95)
        }));
    }

    /**
     * Clear all metrics
     */
    clear() {
        this.metrics = [];
    }

    private percentile(values: number[], percentile: number): number {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
}

export const performanceMonitor = new PerformanceMonitor();

// ============================================================================
// PERFORMANCE HOOKS
// ============================================================================

/**
 * Track component render time
 * 
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useRenderTime('MyComponent');
 *   // ... component code
 * }
 * ```
 */
export function useRenderTime(componentName: string) {
    // eslint-disable-next-line react-hooks/purity
    const renderStartRef = useRef<number>(performance.now());

    useEffect(() => {
        const renderDuration = performance.now() - renderStartRef.current;
        performanceMonitor.record(`render:${componentName}`, renderDuration);
    });
}

/**
 * Track API call duration
 * 
 * Usage:
 * ```tsx
 * const trackApiCall = useApiTimer();
 * 
 * const fetchData = async () => {
 *   const endTimer = trackApiCall('GET /api/devices');
 *   const data = await api.get('/devices');
 *   endTimer();
 *   return data;
 * };
 * ```
 */
export function useApiTimer() {
    return (name: string) => {
        const start = performance.now();
        return () => {
            const duration = performance.now() - start;
            performanceMonitor.record(`api:${name}`, duration);
        };
    };
}

/**
 * Measure page load time
 */
export function usePageLoadTime(pageName: string) {
    useEffect(() => {
        const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        if (navigationEntry) {
            const loadTime = navigationEntry.loadEventEnd - navigationEntry.fetchStart;
            performanceMonitor.record(`page-load:${pageName}`, loadTime);
        }
    }, [pageName]);
}

// ============================================================================
// WEB VITALS TRACKING
// ============================================================================

/**
 * Track Core Web Vitals (LCP, FID, CLS)
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   useWebVitals();
 *   return <div>...</div>;
 * }
 * ```
 */
export function useWebVitals() {
    useEffect(() => {
        // Track Largest Contentful Paint (LCP)
        const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime: number };
            performanceMonitor.record('web-vital:LCP', lastEntry.renderTime);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // Track First Input Delay (FID)
        const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { processingStart: number; startTime: number })[];
            entries.forEach((entry) => {
                const fid = entry.processingStart - entry.startTime;
                performanceMonitor.record('web-vital:FID', fid);
            });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Track Cumulative Layout Shift (CLS)
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[];
            entries.forEach((entry) => {
                if (!entry.hadRecentInput) {
                    clsValue += entry.value;
                }
            });
            performanceMonitor.record('web-vital:CLS', clsValue * 1000); // Convert to ms scale
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });

        return () => {
            lcpObserver.disconnect();
            fidObserver.disconnect();
            clsObserver.disconnect();
        };
    }, []);
}

// ============================================================================
// PERFORMANCE REPORTING
// ============================================================================

/**
 * Get performance report for debugging
 */
export function getPerformanceReport() {
    return {
        timestamp: new Date().toISOString(),
        summary: performanceMonitor.getSummary(),
        navigation: performance.getEntriesByType('navigation')[0],
        memory: (performance as any).memory ? {
            usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
            jsHeapSizeLimit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)
        } : null
    };
}

/**
 * Log performance report to console (dev mode only)
 */
export function logPerformanceReport() {
    if (import.meta.env.DEV) {
        console.group('📊 Performance Report');
        console.table(performanceMonitor.getSummary());
        console.groupEnd();
    }
}

// ============================================================================
// LAZY LOADING UTILITIES
// ============================================================================

/**
 * Intersection Observer hook for lazy loading
 * 
 * Usage:
 * ```tsx
 * const [ref, isVisible] = useInView();
 * 
 * return (
 *   <div ref={ref}>
 *     {isVisible && <HeavyComponent />}
 *   </div>
 * );
 * ```
 */
export function useInView(options = {}) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = React.useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1, ...options }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => {
            observer.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return [ref, isVisible] as const;
}

// Need React import for useState
import * as React from 'react';
