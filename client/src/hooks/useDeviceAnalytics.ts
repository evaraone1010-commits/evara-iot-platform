import { useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { deviceService } from "../services/DeviceService";
import { useRealtimeTelemetry } from "./useRealtimeTelemetry";
import type { Device, TelemetrySnapshot } from "../types/entities";

export interface TelemetryData {
  timestamp: string;
  data: {
    entry_id: number;
    [key: string]: any;
  };
}

export interface NodeInfoData {
  id: string;
  hardware_id: string;
  name: string;
  asset_type: string;
  last_seen: string | null;
  zone_name?: string;
  community_name?: string;
  customer_config?: any;
  customer_name?: string | null;
}

export interface AnalyticsData {
  device: Device | null | undefined;
  telemetry: TelemetrySnapshot | null | undefined;
  history: any[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null | undefined;
  isStale: boolean;           // NEW: true when last data is > 5 min old
  deviceOffline: boolean;     // NEW: true when device hasn't sent data in > 5 min
  lastDataTimestamp: string | null; // NEW: exact time of last real data point
  data?: {
    config?: any;
    latest?: any;
    info?: { data: NodeInfoData };
    history?: { feeds: any[] };
    predictive?: {
      trends24h: any[];
      dailyConsumption: any[];
    };
    tankBehavior?: any;
    active_fields?: string[];
  };
  refetch: () => void;
  isError: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 60_000;          // Fetch from backend every 60 seconds
const STALE_THRESHOLD_MS = 5 * 60_000;   // Data older than 5 min = device offline
const STALE_TIME_MS = 55_000;            // React Query cache: slightly less than poll interval
                                          // so every poll actually hits the network

export const useDeviceAnalytics = (
  hardwareIdOverride?: string,
  options: {
    refetchInterval?: number | false;
    staleTime?: number;
    filter?: { range?: string; startDate?: string; endDate?: string };
  } = {}
): AnalyticsData => {
  const { hardwareId: routeHardwareId } = useParams<{ hardwareId: string }>();
  const hardwareId = hardwareIdOverride || routeHardwareId || '';

  // Track last known entryId to avoid duplicate appends when device is stopped
  const lastEntryIdRef = useRef<number | string | null>(null);

  // ── Device config query (slow-changing, 30s stale is fine) ─────────────────
  const {
    data: device,
    isLoading: deviceLoading,
    isFetching: deviceFetching,
    error: deviceError,
    refetch: refetchDevice,
    isError: isDeviceError,
  } = useQuery({
    queryKey: ["device_config", hardwareId],
    queryFn: async () => {
      if (!hardwareId) return null;
      return await deviceService.getNodeDetails(hardwareId);
    },
    enabled: !!hardwareId,
    staleTime: 30_000,
    refetchInterval: false, // Config doesn't change often — no auto-poll needed
  });

  // ── Telemetry query — THIS is what polls every 60 seconds ─────────────────
  const {
    data: telemetryResult,
    isLoading: telemetryLoading,
    isFetching: telemetryFetching,
    error: telemetryError,
    refetch: refetchTelemetry,
    isError: isTelemetryError,
  } = useQuery({
    queryKey: ["telemetry_backend", hardwareId, options.filter],
    queryFn: async () => {
      if (!hardwareId) return null;
      return await deviceService.getNodeAnalytics(hardwareId, options.filter);
    },
    enabled: !!hardwareId,
    // ✅ FIX 1: staleTime slightly less than poll interval
    // This ensures every 60s tick actually hits the network (not served from cache)
    staleTime: options.staleTime ?? STALE_TIME_MS,
    // ✅ FIX 2: Auto-poll every 60 seconds — this is the core fix
    refetchInterval: options.refetchInterval ?? POLL_INTERVAL_MS,
    // ✅ FIX 3: Keep polling even when browser tab is in background
    refetchIntervalInBackground: false,
  });

  const { telemetry: realtimeData } = useRealtimeTelemetry(device?.id || hardwareId);

  const isFetching = telemetryFetching || deviceFetching;
  const isLoading = deviceLoading || telemetryLoading;
  const isError = isDeviceError || isTelemetryError;
  const error = (deviceError as any)?.message || (telemetryError as any)?.message || null;

  const refetch = useCallback(() => {
    refetchDevice();
    refetchTelemetry();
  }, [refetchDevice, refetchTelemetry]);

  // Guard against synthetic fallback objects (e.g. default level=0 with no timestamp)
  // so stale devices can still show true last-known values when available.
  const hasUsableTelemetry = useCallback((payload: any): boolean => {
    if (!payload || typeof payload !== "object") return false;

    const ts = payload.timestamp || payload.created_at || payload.time;
    if (!ts) return false;

    const level = payload.level_percentage ?? payload.level ?? payload.Level ?? payload.percentage;
    const volume = payload.total_liters ?? payload.volume ?? payload.currentVolume;
    const flow = payload.flow_rate;

    return [level, volume, flow].some((v) => Number.isFinite(v));
  }, []);

  // ── Stale / offline detection ─────────────────────────────────────────────
  // Computed BEFORE unifiedData so we can inject it into the return value
  const { isStale, deviceOffline, lastDataTimestamp } = useMemo(() => {
    // Best available timestamp: realtime socket > API snapshot > history last point
    const realtimeTs = realtimeData?.timestamp;
    const snapshotTs = (device as any)?.telemetry_snapshot?.timestamp
      || (device as any)?.last_seen;
    const historyLastTs = telemetryResult?.history?.length > 0
      ? telemetryResult.history[telemetryResult.history.length - 1]?.timestamp
      : null;

    const bestTs = realtimeTs || snapshotTs || historyLastTs || null;

    if (!bestTs) {
      return { isStale: false, deviceOffline: false, lastDataTimestamp: null };
    }

    const lastDataMs = new Date(bestTs).getTime();
    const ageMs = Date.now() - lastDataMs;
    const stale = ageMs > STALE_THRESHOLD_MS;

    return {
      isStale: stale,
      deviceOffline: stale,           // offline = stale (no new data for > 5 min)
      lastDataTimestamp: bestTs,
    };
  }, [realtimeData, device, telemetryResult]);

  // ── Unified data assembly ─────────────────────────────────────────────────
  const unifiedData = useMemo(() => {
    if (!device) return undefined;

    const d = device as any;
    const hw = d.hardwareId || d.hardware_id || d.node_key || device.id || '';

    const snapshot = d.telemetry_snapshot || d.telemetry || null;
    const historyFeeds = telemetryResult?.history || [];
    const latestFromAPI = historyFeeds.length > 0
      ? historyFeeds[historyFeeds.length - 1]
      : null;

    let latestTelemetry = null;

    if (realtimeData) {
      // ✅ FIX 4: Only use realtime data if it's NOT stale
      // If device stopped at 12:00, realtime socket won't send new events anyway,
      // but this guard prevents stale socket reconnection replays from being used
      const realtimeAgeMs = Date.now() - new Date(realtimeData.timestamp || 0).getTime();
      const realtimeIsStale = realtimeAgeMs > STALE_THRESHOLD_MS;

      if (!realtimeIsStale) {
        latestTelemetry = {
          timestamp: realtimeData.timestamp || realtimeData.time || new Date().toISOString(),
          level_percentage: realtimeData.level_percentage,
          total_liters: realtimeData.total_liters,
          flow_rate: realtimeData.flow_rate,
          is_corrected: realtimeData.is_corrected,
          original_value: realtimeData.original_value,
          confidence: realtimeData.confidence,
          pattern: realtimeData.pattern,
          data: realtimeData,
        };
      }
    }

    // Fallback chain when realtime is absent or stale
    if (!latestTelemetry) {
      if (hasUsableTelemetry(snapshot)) {
        latestTelemetry = {
          timestamp: snapshot.timestamp,
          level_percentage: snapshot.level_percentage ?? snapshot.level ?? snapshot.percentage,
          total_liters: snapshot.total_liters ?? snapshot.volume ?? snapshot.currentVolume,
          flow_rate: snapshot.flow_rate,
          is_corrected: snapshot.is_corrected,
          original_value: snapshot.original_value,
          confidence: snapshot.confidence,
          pattern: snapshot.pattern,
          data: snapshot,
        };
      } else if (hasUsableTelemetry(latestFromAPI)) {
        latestTelemetry = {
          timestamp: latestFromAPI.timestamp,
          level_percentage: latestFromAPI.level,
          total_liters: latestFromAPI.volume ?? latestFromAPI.total_liters,
          flow_rate: latestFromAPI.flow_rate,
          is_corrected: latestFromAPI.is_corrected,
          original_value: latestFromAPI.original_value,
          confidence: latestFromAPI.confidence,
          pattern: latestFromAPI.pattern,
          data: latestFromAPI,
        };
      } else if (hasUsableTelemetry(d.last_telemetry)) {
        latestTelemetry = {
          timestamp: d.last_telemetry.timestamp || d.last_online_at,
          level_percentage: d.last_telemetry.level_percentage ?? d.last_telemetry.Level ?? d.last_level,
          total_liters: d.last_telemetry.total_liters ?? d.last_telemetry.Volume ?? d.last_volume,
          flow_rate: d.last_telemetry.flow_rate,
          is_corrected: d.last_telemetry.is_corrected,
          original_value: d.last_telemetry.original_value,
          confidence: d.last_telemetry.confidence,
          pattern: d.last_telemetry.pattern,
          data: d.last_telemetry,
        };
      }
    }

    // ✅ FIX 5: Dedup guard — track last entryId so the same point is never
    // appended twice when the device is stopped and poll returns same data
    const incomingEntryId = latestTelemetry?.data?.entry_id
      ?? latestTelemetry?.data?.entryId
      ?? latestTelemetry?.timestamp;

    if (incomingEntryId && incomingEntryId === lastEntryIdRef.current) {
      // Same data point as last poll — don't trigger a chart update
      // We still return the data so the UI shows the last known value,
      // but consumers can check `isStale` to show the offline state
    } else if (incomingEntryId) {
      lastEntryIdRef.current = incomingEntryId;
    }

    return {
      config: { config: d },
      latest: latestTelemetry,
      info: {
        data: {
          id: device.id || hw,
          hardware_id: hw,
          name: d.displayName || d.name || hw,
          asset_type: d.asset_type || 'Generic',
          last_seen: d.last_seen || null,
          zone_name: d.zone_name,
          community_name: d.community_name,
          customer_config: d.customer_config,
          customer_name: d.customer_name || null,
        } as NodeInfoData,
      },
      history: {
        feeds: historyFeeds.map((h: any) => ({
          ...h,
          level_percentage: h.level,
          total_liters: h.volume,
        })),
      },
      predictive: telemetryResult?.predictive,
      tankBehavior: telemetryResult?.tankBehavior,
      active_fields: telemetryResult?.active_fields,
    };
  }, [device, telemetryResult, realtimeData, hasUsableTelemetry]);

  return {
    device,
    telemetry: device?.telemetry_snapshot as any,
    isLoading,
    isFetching,
    isError,
    error,
    isStale,
    deviceOffline,
    lastDataTimestamp,
    data: unifiedData,
    history: telemetryResult?.history || [],
    refetch,
  };
};