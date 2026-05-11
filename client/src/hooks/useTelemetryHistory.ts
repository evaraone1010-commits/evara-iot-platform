/**
 * useTelemetryHistory.ts
 *
 * Canonical hook for fetching historical telemetry feeds for any device.
 * This is the ONLY place in the frontend that constructs the
 * `['telemetry', deviceId, 'history', timeRange]` React Query cache key.
 *
 * Features:
 *  - Converts TimeRange → result count via telemetryPipeline.timeRangeToResults
 *  - Auto-refetch every 2 minutes
 *  - Stale-while-revalidate with 5-min TTL
 *  - Returns typed feeds array ready for Recharts
 */

import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { timeRangeToResults, type TimeRange } from '../utils/telemetryPipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single history feed row as returned by the backend history endpoint.
 * `created_at` is the ISO-8601 timestamp of the feed entry.
 * All other keys are raw ThingSpeak field names or pre-computed typed metrics.
 */
export type HistoryFeed = {
    created_at: string;
    level_percentage?: number | null;
    depth_value?: number | null;
    temperature_value?: number | null;
    flow_rate?: number | null;
    total_liters?: number | null;
    [key: string]: unknown;
};

export interface TelemetryHistoryResult {
    /** Ordered array of feed rows, oldest-first. Empty array until loaded. */
    feeds: HistoryFeed[];
    /** Full raw backend response (channels + feeds) if needed. */
    rawResponse: { channel?: unknown; feeds?: HistoryFeed[] } | null;
    isLoading: boolean;
    isError: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param deviceId  UUID of the device node.
 * @param timeRange Time window to request (maps to result-count automatically).
 * @param enabled   Optional — set false to suspend the query (e.g. when deviceId is empty).
 */
export function useTelemetryHistory(
    deviceId: string | undefined | null,
    timeRange: TimeRange,
    enabled?: boolean,
): TelemetryHistoryResult {
    const isEnabled = enabled !== undefined ? enabled : Boolean(deviceId);
    const results = timeRangeToResults(timeRange);

    const {
        data: rawResponse,
        isLoading,
        isError,
    } = useQuery<{ channel?: unknown; feeds?: HistoryFeed[] } | null>({
        queryKey: ['telemetry', deviceId, 'history', timeRange],
        queryFn: async () => {
            if (!deviceId) return null;
            try {
                const { data } = await api.get<{ feeds?: HistoryFeed[] }>(
                    `/telemetry/devices/${deviceId}/telemetry/history?results=${results}`,
                );
                return data ?? null;
            } catch (err) {
                console.error('[useTelemetryHistory] fetch failed for', deviceId, ':', err);
                // Return controlled fallback — never throw so UI gets empty feeds
                return null;
            }
        },
        enabled: isEnabled,
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchInterval: 300000, // Reduced from 5s to 5m
        refetchOnWindowFocus: false,
        retry: 2,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
    });

    const feeds: HistoryFeed[] = rawResponse?.feeds ?? [];

    return { feeds, rawResponse: rawResponse ?? null, isLoading, isError };
}
