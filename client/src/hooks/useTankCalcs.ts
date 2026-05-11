/**
 * useTankCalcs — Physics-correct tank telemetry calculations
 *
 * Sensor physics:
 *   The ultrasonic sensor is mounted at the TOP of the tank.
 *   field1 = distance from sensor to water surface (empty gap in cm).
 *   waterColumnCm = tankHeightCm - field1
 *   percentage    = clamp(waterColumnCm / tankHeightCm, 0, 1) * 100
 *
 * Volume:
 *   Cylinder:     π × r² × h × 1000  (m³ → litres)
 *   Rectangular:  l × b × h × 1000   (m³ → litres)
 *   If capacity_liters is set, that value is used as capacityLiters.
 *
 * All dimensions stored in metres in the DB.
 */

import { useMemo } from 'react';
import type { TankConfig } from './useDeviceConfig';

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/** Derived capacity in litres from tank geometry. */
export function calcCapacityLiters(config: TankConfig, usableHeightM: number): number {
    if (config.capacity_liters && config.capacity_liters > 0) {
        return config.capacity_liters;
    }
    if (config.tank_shape === 'cylindrical') {
        const r = config.radius_m ?? 0;
        return Math.PI * r * r * usableHeightM * 1000;
    }
    // rectangular (default)
    const l = config.length_m ?? 0;
    const b = config.breadth_m ?? 0;
    return l * b * usableHeightM * 1000;
}

/** Convert raw sensor distance (in meters) → percentage filled and water height. */
export function calculateTankMetrics(distanceM: number, usableHeightM: number) {
    if (usableHeightM <= 0) return { percent: 0, waterHeightM: 0 };
    // User formula: Water height = min(Usable tank height, max(0, Usable tank height - Distance reading))
    const waterHeightM = Math.min(usableHeightM, Math.max(0, usableHeightM - distanceM));
    const percent = (waterHeightM / usableHeightM) * 100;
    return { percent, waterHeightM };
}

/** Format litres smart: ≥1000 L → KL with 2 dp, else L with 0 dp. */
export function formatVolume(liters: number): string {
    if (liters >= 1000) return `${(liters / 1000).toFixed(2)} KL`;
    return `${Math.round(liters)} L`;
}

// ── Main hook ────────────────────────────────────────────────────────────────

interface TelemetryFeed {
    created_at?: string;
    field1?: string | null;
    level_percentage?: number | string | null;
    temperature_value?: number | string | null;
}

interface TankCalcsInput {
    /** TankConfig from useDeviceConfig — may be undefined while loading */
    config: TankConfig | undefined;
    /** Latest telemetry payload from backend */
    telemetryData: {
        data?: { field1?: string | number | null };
        level_percentage?: number | string | null;
        temperature_value?: number | string | null;
    } | null | undefined;
    /** History feeds array from /telemetry/history */
    historyFeeds: TelemetryFeed[] | undefined;
    /** Fallback tank height in metres if config not yet loaded */
    fallbackHeightM?: number;
}

interface TankCalcsResult {
    /** 0-100, e.g. 73.4 */
    percentage: number;
    /** in litres */
    volumeLiters: number;
    /** in litres — total physical capacity */
    capacityLiters: number;
    /** human-readable volume string ("83.25 KL" or "523 L") */
    volumeStr: string;
    /** human-readable capacity string */
    capacityStr: string;
    /** temperature in °C, null if unavailable */
    temperatureCelsius: number | null;
    /** history array for level % chart */
    levelData: { time: string; level: number }[];
    /** history array for volume chart (in litres) */
    volumeData: { time: string; volume: number }[];
    /** estimated daily consumption in litres */
    dailyConsumptionL: number;
    /** estimated weekly consumption in litres */
    weeklyConsumptionL: number;
    /** trend direction */
    trend: 'up' | 'down' | 'stable';
}

export function useTankCalcs({
    config,
    telemetryData,
    historyFeeds,
    fallbackHeightM = 13.16,
}: TankCalcsInput): TankCalcsResult {
    const tankHeightM  = config?.height_m ?? fallbackHeightM;
    const deadBandM    = config?.dead_band_m ?? 0;
    const usableHeightM = Math.max(0, tankHeightM - deadBandM);

    // ── Capacity ──────────────────────────────────────────────────────────────
    const capacityLiters = useMemo(() => {
        if (!config) return 0;
        return calcCapacityLiters(config, usableHeightM);
    }, [config, usableHeightM]);

    // ── Current percentage & volume ───────────────────────────────────────────
    const { percentage, volumeLiters, temperatureCelsius } = useMemo(() => {
        if (!telemetryData) return { percentage: 0, volumeLiters: 0, temperatureCelsius: null };

        let pct: number;
        let vol: number;
        const cap = capacityLiters > 0 ? capacityLiters : usableHeightM * 1000; // rough fallback

        if (telemetryData.level_percentage != null && false /* disabled directly trusting level config over new formula */) {
             // If we must trust raw percentage from firmware, we do it here.
             // But the user requested strict formulas based on distance.
        }

        const rawCm = Number(telemetryData.data?.field1 ?? telemetryData.level_percentage ?? 0); // fallback distance
        const distanceM = (isNaN(rawCm) ? 0 : rawCm) / 100;
        
        const metrics = calculateTankMetrics(distanceM, usableHeightM);
        pct = metrics.percent;
        
        // Exact volume calculation per user formula based on derived waterHeightM
        if (config?.capacity_liters && config.capacity_liters > 0) {
            // Pre-defined capacity ignores L/B, relies on %
            vol = clamp((pct / 100) * cap, 0, cap);
        } else if (config?.tank_shape === 'cylindrical') {
            const r = config?.radius_m ?? 0;
            vol = Math.PI * r * r * metrics.waterHeightM * 1000;
        } else {
            const l = config?.length_m ?? 0;
            const b = config?.breadth_m ?? 0;
            vol = l * b * metrics.waterHeightM * 1000;
        }

        const temp = telemetryData.temperature_value != null
            ? Number(telemetryData.temperature_value)
            : null;

        return { percentage: pct, volumeLiters: Number(vol.toFixed(2)), temperatureCelsius: isNaN(temp!) ? null : temp };
    }, [telemetryData, usableHeightM, capacityLiters, config]);

    // ── History charts ────────────────────────────────────────────────────────
    const { levelData, volumeData } = useMemo(() => {
        const feeds = historyFeeds ?? [];
        const levelArr: { time: string; level: number }[] = [];
        const volArr:   { time: string; volume: number }[] = [];

        for (const feed of feeds) {
            const d = new Date(feed.created_at ?? '');
            const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

            const rawCm = Number(feed.field1 ?? feed.level_percentage ?? 0);
            const distanceM = (isNaN(rawCm) ? 0 : rawCm) / 100;
            const metrics = calculateTankMetrics(distanceM, usableHeightM);
            const lvl = metrics.percent;

            let vol = 0;
            if (config?.capacity_liters && config.capacity_liters > 0) {
                const cap = capacityLiters > 0 ? capacityLiters : usableHeightM * 1000;
                vol = clamp((lvl / 100) * cap, 0, cap);
            } else if (config?.tank_shape === 'cylindrical') {
                const r = config?.radius_m ?? 0;
                vol = Math.PI * r * r * metrics.waterHeightM * 1000;
            } else {
                const l = config?.length_m ?? 0;
                const b = config?.breadth_m ?? 0;
                vol = l * b * metrics.waterHeightM * 1000;
            }

            levelArr.push({ time: timeStr, level: Math.round(lvl * 10) / 10 });
            volArr.push({ time: timeStr, volume: Math.round(vol * 10) / 10 });
        }

        return { levelData: levelArr, volumeData: volArr };
    }, [historyFeeds, usableHeightM, capacityLiters, config]);

    // ── Consumption trend ─────────────────────────────────────────────────────
    const { dailyConsumptionL, weeklyConsumptionL, trend } = useMemo(() => {
        const feeds = historyFeeds ?? [];
        if (feeds.length < 2) return { dailyConsumptionL: 0, weeklyConsumptionL: 0, trend: 'stable' as const };

        const recent = feeds.slice(-10);
        const older  = feeds.slice(-20, -10);

        const getLvl = (f: TelemetryFeed) => {
            const rawCm = Number(f.field1 ?? f.level_percentage ?? 0);
            const distanceM = (isNaN(rawCm) ? 0 : rawCm) / 100;
            return calculateTankMetrics(distanceM, usableHeightM).percent;
        };

        const recentAvg = recent.reduce((s, f) => s + getLvl(f), 0) / recent.length;
        const olderAvg  = older.length ? older.reduce((s, f) => s + getLvl(f), 0) / older.length : recentAvg;

        const tr: 'up' | 'down' | 'stable' = recentAvg > olderAvg + 2 ? 'up' : recentAvg < olderAvg - 2 ? 'down' : 'stable';
        const cap = capacityLiters > 0 ? capacityLiters : usableHeightM * 1000;
        const daily = Math.round(Math.abs(recentAvg - olderAvg) / 100 * cap * 2);

        return { dailyConsumptionL: daily, weeklyConsumptionL: daily * 7, trend: tr };
    }, [historyFeeds, usableHeightM, capacityLiters]);

    return {
        percentage,
        volumeLiters,
        capacityLiters,
        volumeStr: formatVolume(volumeLiters),
        capacityStr: formatVolume(capacityLiters),
        temperatureCelsius,
        levelData,
        volumeData,
        dailyConsumptionL,
        weeklyConsumptionL,
        trend,
    };
}
