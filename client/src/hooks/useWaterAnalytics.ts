/**
 * useWaterAnalytics.ts  (UPDATED)
 *
 * KEY CHANGE: The hook no longer calculates state/rate locally.
 * It reads waterState, rateLitresPerMin, consumedTodayLitres, etc.
 * from the backend API response (tankBehavior field).
 *
 * The backend's analyzeWaterTank() engine does the strict 200-reading
 * window classification.  The frontend just displays what the backend says.
 *
 * Local calculation is kept ONLY as a fallback when tankBehavior is missing
 * (e.g. device not yet updated to new backend).
 */

import { useMemo, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export type WaterState = 'CONSUMPTION' | 'REFILL' | 'STABLE' | 'LEARNING';

export interface WaterAnalyticsResult {
  // State from the 200-reading window
  waterState: WaterState;

  // Rates (from backend engine)
  fillRateLpm: number;
  drainRateLpm: number;
  rateDataValid: boolean;

  // Estimations
  estimatedEmptyTimeMinutes: number | null;
  estimatedFullTimeMinutes: number | null;

  // Daily totals
  todaysConsumptionLiters: number;
  refillsToday: number;
  lastRefillTime: string | null;
  avgRefillTimeMinutes: number | null;
  peakConsumptionTime: string | null;
  peakConsumptionRateLpm: number | null;

  // Threshold info
  thresholdsLearned: boolean;
  thresholdLower: number | null;
  thresholdUpper: number | null;

  // Alerts (derived from current state)
  alerts: {
    lowLevel: boolean;
    overflow: boolean;
    highDrain: boolean;
    activeCount: number;
  };

  // Device health
  deviceHealth: {
    status: 'Healthy' | 'Warning' | 'Critical';
    sensorOk: boolean;
    dataValid: boolean;
  };
}


// ─── Main hook ─────────────────────────────────────────────────────────────
/**
 * useWaterAnalytics
 *
 * Now reads analytics from tankBehavior (API response) instead of
 * computing them locally.
 *
 * @param tankHeightM       — from DB config
 * @param capacityLitres    — computed capacity
 * @param sensorDistanceM   — current raw sensor reading in metres
 * @param volumeLitres      — current volume in litres (from metrics)
 * @param percentage        — current fill percentage
 * @param timestamp         — latest telemetry timestamp
 * @param liveFeeds         — live feed history (for fallback)
 * @param lengthM           — tank length (for fallback volume calc)
 * @param breadthM          — tank breadth (for fallback volume calc)
 * @param deadBandM         — dead band
 * @param isCorrected       — whether data was corrected
 * @param originalValue     — original uncorrected value
 * @param confidence        — confidence score
 * @param isDeviceOnline    — device online status
 * @param tankBehavior      — from API getNodeAnalytics response (the key addition)
 */
export const useWaterAnalytics = (
  tankHeightM: number,
  capacityLitres: number,
  sensorDistanceM: number | null,
  volumeLitres: number,
  percentage: number,
  timestamp: string,
  liveFeeds: any[],
  lengthM: number,
  breadthM: number,
  deadBandM: number,
  isCorrected: boolean = false,
  originalValue?: number,
  confidence?: number,
  isDeviceOnline: boolean = true,
  tankBehavior?: any        // ← NEW: from API getNodeAnalytics().tankBehavior
): WaterAnalyticsResult => {

  const lastRefillTimeRef = useRef<string | null>(null);
  const refillTimesRef = useRef<number[]>([]);
  const prevStateRef = useRef<WaterState>('STABLE');

  return useMemo(() => {

    // ── Read from API tankBehavior (new backend) ──────────────────────────
    const hasBehavior = tankBehavior && tankBehavior.waterState;

    const waterState: WaterState = hasBehavior
      ? tankBehavior.waterState as WaterState
      : 'STABLE';

    const fillRateLpm: number  = hasBehavior ? (tankBehavior.fillRateLpm  || 0) : 0;
    const drainRateLpm: number = hasBehavior ? (tankBehavior.drainRateLpm || 0) : 0;
    const rateDataValid = hasBehavior && waterState !== 'LEARNING';

    const estimatedEmptyTimeMinutes: number | null =
      hasBehavior ? tankBehavior.timeToEmpty ?? null : null;
    const estimatedFullTimeMinutes: number | null =
      hasBehavior ? tankBehavior.timeToFull  ?? null : null;

    const todaysConsumptionLiters: number =
      hasBehavior ? (tankBehavior.consumedTodayLitres || 0) : 0;

    const thresholdsLearned: boolean =
      hasBehavior ? (tankBehavior.thresholdsLearned || false) : false;
    const thresholdLower: number | null =
      hasBehavior ? (tankBehavior.thresholdLower ?? null) : null;
    const thresholdUpper: number | null =
      hasBehavior ? (tankBehavior.thresholdUpper ?? null) : null;

    // ── Refill tracking (still tracked in frontend across sessions) ────────
    const refillsToday = hasBehavior ? 0 : 0; // backend will add this later
    let lastRefillTime = lastRefillTimeRef.current;
    let avgRefillTimeMinutes: number | null = null;

    if (waterState === 'REFILL' && prevStateRef.current !== 'REFILL') {
      lastRefillTimeRef.current = timestamp;
      lastRefillTime = timestamp;
    }
    if (refillTimesRef.current.length > 0) {
      avgRefillTimeMinutes =
        refillTimesRef.current.reduce((a, b) => a + b, 0) /
        refillTimesRef.current.length;
    }
    prevStateRef.current = waterState;

    // ── Peak consumption (track locally from liveFeeds) ───────────────────
    let peakConsumptionTime: string | null = null;
    let peakConsumptionRateLpm: number | null = null;

    if (liveFeeds && liveFeeds.length >= 4 && !hasBehavior) {
      let maxDrop = 0;
      for (let i = 1; i < liveFeeds.length; i++) {
        const prev = liveFeeds[i-1];
        const curr = liveFeeds[i];
        const prevPct = prev.level_percentage ?? prev.level ?? 0;
        const currPct = curr.level_percentage ?? curr.level ?? 0;
        const drop = prevPct - currPct;
        if (drop > maxDrop) {
          maxDrop = drop;
          peakConsumptionTime = curr.timestamp || null;
          peakConsumptionRateLpm = drop * capacityLitres / 100 / 2.09;
        }
      }
    }

    // ── Alerts ──────────────────────────────────────────────────────────────
    const lowLevel   = percentage < 20;
    const overflow   = percentage > 95;
    const highDrain  = drainRateLpm > 10;
    const activeCount = [lowLevel, overflow, highDrain].filter(Boolean).length;

    // ── Device health ───────────────────────────────────────────────────────
    const sensorOk = !!timestamp &&
      (Date.now() - new Date(timestamp).getTime()) < 5 * 60 * 1000;
    const dataValid = sensorDistanceM !== null && sensorDistanceM > 0;

    let healthStatus: 'Healthy' | 'Warning' | 'Critical' = 'Healthy';
    if (!isDeviceOnline) {
      healthStatus = 'Critical';
    } else if (!sensorOk || !dataValid || activeCount >= 2) {
      healthStatus = 'Warning';
    }

    return {
      waterState,
      fillRateLpm,
      drainRateLpm,
      rateDataValid,
      estimatedEmptyTimeMinutes,
      estimatedFullTimeMinutes,
      todaysConsumptionLiters,
      refillsToday,
      lastRefillTime,
      avgRefillTimeMinutes,
      peakConsumptionTime,
      peakConsumptionRateLpm,
      thresholdsLearned,
      thresholdLower,
      thresholdUpper,
      alerts: { lowLevel, overflow, highDrain, activeCount },
      deviceHealth: { status: healthStatus, sensorOk, dataValid },
    };
  }, [
    tankBehavior,
    percentage,
    capacityLitres,
    timestamp,
    liveFeeds,
    sensorDistanceM,
    isDeviceOnline,
  ]);
};
