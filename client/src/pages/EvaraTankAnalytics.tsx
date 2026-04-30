import { useState, useEffect, useMemo, useCallback } from 'react';

import { useParams, Navigate, useNavigate } from 'react-router-dom';

import {

    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer


} from 'recharts';

import { useAuth } from '../context/AuthContext';

import { useQueryClient } from '@tanstack/react-query';

import {
    TrendingUp, TrendingDown, Timer, Droplets,
    Wifi, Info, Bell, Settings
} from 'lucide-react';

import api from '../services/api';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import { useDeviceAnalytics, type NodeInfoData } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { useAnalyticsLogger } from '../utils/analyticsLogger';

import type { TankConfig } from '../hooks/useDeviceConfig';

import {

    computeCapacityLitres,
    computeTankMetrics,
    formatVolume,
} from '../utils/tankCalculations';

import type { TankShape, TankDimensions } from '../utils/tankCalculations';

import { useWaterAnalytics } from '../hooks/useWaterAnalytics';
import { dataMergingService } from '../services/DataMergingService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelemetryPayload {

    timestamp: string;

    data?: Record<string, unknown>;

    level_percentage?: number;

    total_liters?: number;

    created_at?: string;

    level?: number;

    percentage?: number;

    volume?: number;

    currentVolume?: number;
    _source?: string;
    is_corrected?: boolean;
    original_value?: number;
    confidence?: number;
    pattern?: any;
    // ENHANCED: Add conditional processing fields
    data_label?: 'RAW' | 'CORRECTED' | 'PREDICTED';
    prediction_mode?: boolean;
    consecutive_anomalies?: number;
}



interface LocalTankConfig {

    thingspeakChannelId: string;

    thingspeakReadKey: string;

    tankShape: TankShape;

    heightM: number;

    lengthM: number;

    breadthM: number;

    radiusM: number;
    deadBandM: number;
    capacityOverrideLitres: number | null;

    fieldDepth: string;

    fieldTemperature: string;

}



const DEFAULT_LOCAL_CFG: LocalTankConfig = {

    thingspeakChannelId: '',

    thingspeakReadKey: '',

    tankShape: 'rectangular',

    heightM: 0,

    lengthM: 0,

    breadthM: 0,

    radiusM: 0,
    deadBandM: 0,
    capacityOverrideLitres: null,

    fieldDepth: 'field2',

    fieldTemperature: 'field1',

};



function serverConfigToLocal(cfg: TankConfig): LocalTankConfig {
    const conf = cfg.configuration || {};
    return {
        thingspeakChannelId: cfg.thingspeak_channel_id ?? conf.thingspeak_channel_id ?? '',
        thingspeakReadKey: '',   // never returned by the server for security
        tankShape: (cfg.tank_shape as TankShape) ?? conf.tank_shape ?? 'rectangular',
        heightM: cfg.height_m ?? conf.height_m ?? cfg.depth ?? conf.depth ?? cfg.tankHeight ?? conf.tank_height ?? 0,
        lengthM: cfg.length_m ?? conf.length_m ?? cfg.tankLength ?? conf.tank_length ?? 0,
        breadthM: cfg.breadth_m ?? conf.breadth_m ?? cfg.tankBreadth ?? conf.tank_breadth ?? 0,
        radiusM: cfg.radius_m ?? conf.radius_m ?? cfg.tankRadius ?? conf.tank_radius ?? 0,
        deadBandM: cfg.dead_band_m ?? conf.dead_band_m ?? cfg.deadBand ?? conf.dead_band ?? 0,
        capacityOverrideLitres: cfg.capacity_liters ?? conf.capacity_liters ?? cfg.capacity ?? conf.capacity ?? cfg.tank_size ?? conf.tank_size ?? null,
        fieldDepth: cfg.water_level_field ?? conf.water_level_field ?? cfg.fieldKey ?? conf.fieldKey ?? 'field2',
        fieldTemperature: cfg.temperature_field ?? conf.temperature_field ?? 'field2',
    };
}



function localToApiBody(lc: LocalTankConfig) {

    return {

        thingspeak_channel_id: lc.thingspeakChannelId || undefined,

        thingspeak_read_key: lc.thingspeakReadKey || undefined,

        tank_shape: lc.tankShape,

        height_m: lc.heightM,

        length_m: lc.lengthM,

        breadth_m: lc.breadthM,

        radius_m: lc.radiusM,
        dead_band_m: lc.deadBandM,
        capacity_liters: lc.capacityOverrideLitres,

        water_level_field: lc.fieldDepth,

        temperature_field: lc.fieldTemperature,

    };

}



// ─── Main component ───────────────────────────────────────────────────────────

const EvaraTankAnalytics = () => {

    const { hardwareId } = useParams<{ hardwareId: string }>();

    const { user } = useAuth();

    // ── Chart Filter State ──────────────────────────────────────────────────
    const [tankChartRange, setTankChartRange] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');
    const [rangeStart, setRangeStart] = useState<string>('');
    const [rangeEnd, setRangeEnd] = useState<string>('');

    const queryClient = useQueryClient();

    const navigate = useNavigate();

    // Real-time sync functionality
    /* const realtimeSync = useRealtimeSync({ 
        deviceId: hardwareId,
        autoConnect: true 
    }); */

    // ── Config panel form state ───────────────────────────────────────────────

    const [localCfg, setLocalCfg] = useState<LocalTankConfig>(DEFAULT_LOCAL_CFG);

    const [cfgDirty, setCfgDirty] = useState(false);

    const [saving, setSaving] = useState(false);

    const [saveError, setSaveError] = useState<string | null>(null);

    const [showParams, setShowParams] = useState(false);

    const [showNodeInfo, setShowNodeInfo] = useState(false);

    const [activeInfoPopup, setActiveInfoPopup] = useState<'fillRate' | 'consumption' | 'alerts' | 'deviceHealth' | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleDelete = async () => {
        if (!hardwareId) return;
        setIsDeleting(true);
        try {
            await api.delete(`/admin/nodes/${hardwareId}`);
            navigate('/nodes');
        } catch (err) {
            console.error("Failed to delete node:", err);
            alert("Failed to delete node. Please try again.");
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };





    // ── Unified Analytics Data ────────────────────────────────────────────────

    // ── Unified Analytics Data ────────────────────────────────────────────────

    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isFetching: analyticsFetching,
        isStale,
        deviceOffline,
        lastDataTimestamp,
        refetch,
    } = useDeviceAnalytics(hardwareId, {
        filter: {
            range: tankChartRange === 'RANGE' ? undefined : tankChartRange,
            startDate: tankChartRange === 'RANGE' ? rangeStart : undefined,
            endDate: tankChartRange === 'RANGE' ? rangeEnd : undefined
        }
    });

    useAnalyticsLogger();

    // ── Auto-fetch data when device is selected ────────────────────────────────
    useEffect(() => {
        if (hardwareId) {
            refetch(); // immediate fetch when navigating to a device
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hardwareId]); // intentionally omit refetch — stable callback, no loop risk


    const deviceConfig = ('config' in (unifiedData?.config ?? {})
        ? (unifiedData!.config as { config: TankConfig }).config
        : undefined) as TankConfig | undefined;

    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;

    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as NodeInfoData | undefined;

    console.log('deviceInfo:', deviceInfo);

    const customerConfig = (deviceInfo as any)?.customer_config || {};
    const isSuperAdmin = user?.role === 'superadmin';

    const showTankLevelParam = isSuperAdmin || customerConfig.showTankLevel !== false;
    const showEstimationsParam = isSuperAdmin || customerConfig.showEstimations !== false;
    const showFillRateParam = isSuperAdmin || customerConfig.showFillRate !== false;
    const showConsumptionParam = isSuperAdmin || customerConfig.showConsumption !== false;
    const showAlertsParam = isSuperAdmin || customerConfig.showAlerts !== false;
    const showDeviceHealthParam = isSuperAdmin || customerConfig.showDeviceHealth !== false;
    const showVolumeParam = isSuperAdmin || customerConfig.showVolume !== false;



    const { telemetry: realtimeData } = useRealtimeTelemetry(deviceInfo?.id || hardwareId || "");

    const [liveFeeds, setLiveFeeds] = useState<TelemetryPayload[]>([]);

    const [showTankLevel, setShowTankLevel] = useState(true);

    const [showVolume, setShowVolume] = useState(true);

    // ── Unified Analytics Data ────────────────────────────────────────────────

    // (Moved useDeviceAnalytics hook call above hooks)



    // Sync initial history to live feeds

    useEffect(() => {

        const history = (unifiedData?.history as { feeds?: TelemetryPayload[] })?.feeds || [];

        if (history.length > 0) {

            setLiveFeeds(history);

        }

    }, [unifiedData?.history]);



    // Handle incoming real-time data

    useEffect(() => {

        if (realtimeData) {

            setLiveFeeds(prev => {

                const last = prev[prev.length - 1];

                // Avoid duplicates if the same timestamp comes in

                if (last && last.timestamp === realtimeData.timestamp) return prev;



                const ts = realtimeData.timestamp || realtimeData.created_at;
                if (!ts) return prev;

                const newPoint = {
                    ...realtimeData,
                    // ── AUTHORITATIVE DATA ──
                    // Use backend-calculated smoothed values directly. 
                    // No more local getTankLevel calculation to avoid divergence.
                    timestamp: ts,
                    level_percentage: realtimeData.level_percentage ?? realtimeData.level ?? 0,
                    total_liters: realtimeData.total_liters ?? realtimeData.volume ?? 0,
                };



                // Keep extended buffer to ensure 1W and 1M views have enough data points
                const updated = [...prev, newPoint];
                return updated.slice(-10000); // Increased to 10k to cover a full week of high-frequency data
            });
        }
    }, [realtimeData]);



    // Use realtimeData if available, fallback to fetched latest

    const activeTelemetry = realtimeData || telemetryData;



    const telemetryLoading = analyticsLoading;

    const historyLoading = analyticsLoading;



    // Online status

    const snapshotTs = activeTelemetry?.timestamp ?? null;

    const deviceLastSeen = deviceInfo?.last_seen ?? null;

    const bestTimestamp = snapshotTs ?? deviceLastSeen;

    const onlineStatus = computeOnlineStatus(bestTimestamp);



    useEffect(() => {

        if (deviceConfig) {

            setLocalCfg(serverConfigToLocal(deviceConfig));

            setCfgDirty(false);

        }

    }, [deviceConfig]);



    const isOffline = onlineStatus === 'Offline';



    // ── Stale-data age ────────────────────────────────────────────────────────
    useStaleDataAge(activeTelemetry?.timestamp ?? null);



    // ── Derive current metrics ────────────────────────────────────────────────

    const metrics = useMemo(() => {
        const backendPct = activeTelemetry?.level_percentage ?? 0;
        const capacityLitres = computeCapacityLitres({ 
            tankShape: localCfg.tankShape, 
            heightM: localCfg.heightM, 
            lengthM: localCfg.lengthM, 
            breadthM: localCfg.breadthM, 
            radiusM: localCfg.radiusM, 
            deadBandM: localCfg.deadBandM, 
            capacityOverrideLitres: localCfg.capacityOverrideLitres 
        });

        return {
            percentage: Math.max(0, Math.min(100, backendPct)),
            volumeLitres: (backendPct / 100) * capacityLitres,
            capacityLitres: capacityLitres,
            isDataValid: backendPct != null,
            isCorrected: activeTelemetry?.is_corrected || false,
            originalValue: activeTelemetry?.original_value || backendPct,
            confidence: activeTelemetry?.confidence || 1,
            pattern: activeTelemetry?.pattern || null,
            data_label: activeTelemetry?.data_label || null,
            prediction_mode: activeTelemetry?.prediction_mode || false,
        };
    }, [activeTelemetry, localCfg]);



    // ── Water Analytics ────────────────────────────────────────────────────────

    const rawSensorField = activeTelemetry?.data?.[localCfg.fieldDepth] as string | number | undefined;

    const sensorDistanceM = rawSensorField != null ? parseFloat(String(rawSensorField)) / 100 : null;



    // ── Unified Data Merging ──────────────────────────────────────────
    const mergedDataResult = useMemo(() => {
        const history = unifiedData?.history?.feeds || [];
        const deviceType = deviceInfo?.asset_type || 'EvaraTank';

        return dataMergingService.mergeDataSources(
            history,
            liveFeeds,
            telemetryData,
            deviceType,
            deviceConfig
        );
    }, [unifiedData?.history?.feeds, liveFeeds, telemetryData, deviceInfo?.asset_type, deviceConfig]);

    const chartData = useMemo(() => {
        // DATA INTEGRITY: Base the chart on the merged result which combines 
        // 10,000+ points of history with new live feeds.
        return dataMergingService.getChartData(mergedDataResult.mergedData, 10000, metrics.capacityLitres);
    }, [mergedDataResult.mergedData, metrics.capacityLitres]);

    const filteredChartData = useMemo(() => {
        if (!chartData || chartData.length === 0) return [];

        if (tankChartRange === '24H') {
            const now = Date.now();
            // Show last 4 hours at per-minute resolution (240 points max)
            // X-axis will only render 8 tick labels (every 30 min = 8 ticks)
            const windowMs = 4 * 60 * 60_000;
            const endMs = now;
            const startMs = endMs - windowMs;

            // 1. Sort all available data ascending
            const sorted = [...chartData]
                .map((d: any) => ({
                    ...d,
                    _ms: new Date(d.timestamp || d.created_at || 0).getTime(),
                }))
                .filter((d: any) => !isNaN(d._ms))
                .sort((a: any, b: any) => a._ms - b._ms);

            if (sorted.length === 0) return [];

            // 2. Build one data point per minute for the 4-hour window
            //    This gives exactly 240 points — chart renders all of them,
            //    but XAxis only shows 8 ticks (every 30 min = 30 slots apart)
            const MINUTE_MS = 60_000;
            const result: any[] = [];

            for (let t = startMs; t <= endMs; t += MINUTE_MS) {
                // Binary-search closest data point at or before t
                let lo = 0, hi = sorted.length - 1, idx = 0;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (sorted[mid]._ms <= t) { idx = mid; lo = mid + 1; }
                    else hi = mid - 1;
                }

                const p1 = sorted[idx];
                const p2 = sorted[idx + 1];

                let level: number | null = null;
                let volume: number | null = null;

                if (!p2 || p1._ms > t) {
                    // No data yet for this minute — leave null (chart renders a gap)
                    level = null;
                    volume = null;
                } else if (!p2 || p2._ms === p1._ms) {
                    level = p1.level ?? 0;
                    volume = p1.volume ?? 0;
                } else {
                    // Linear interpolation between the two nearest real points
                    const ratio = (t - p1._ms) / (p2._ms - p1._ms);
                    level  = (p1.level  ?? 0) + ((p2.level  ?? 0) - (p1.level  ?? 0))  * ratio;
                    volume = (p1.volume ?? 0) + ((p2.volume ?? 0) - (p1.volume ?? 0)) * ratio;
                }

                // ✅ STALE FIX: if device is offline AND this minute is after the last
                //    real data timestamp, insert null instead of repeating the last value.
                //    This creates a visible flat-line cutoff rather than false continuity.
                const isAfterLastData = deviceOffline && lastDataTimestamp
                    && t > new Date(lastDataTimestamp).getTime() + 5 * 60_000;

                result.push({
                    _ms: t,
                    // time string — only used for the 8 XAxis ticks
                    time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: new Date(t).toISOString(),
                    level:  isAfterLastData ? null : level,
                    volume: isAfterLastData ? null : volume,
                });
            }

            return result;
        }

        if (tankChartRange === '1W') {
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const today = new Date();
            return Array.from({ length: 7 }, (_, i) => {
                const target = new Date(today);
                target.setDate(target.getDate() - (6 - i));
                const dayData = chartData.filter((d: any) => {
                    const ts = new Date(d.timestamp || d.created_at);
                    return ts.getDate() === target.getDate() && ts.getMonth() === target.getMonth();
                });
                const avg = (key: string) => dayData.length > 0
                    ? dayData.reduce((s: number, d: any) => s + (d[key] || 0), 0) / dayData.length
                    : 0;
                return {
                    time: days[target.getDay()],
                    timestamp: target.toISOString(),
                    level: avg('level'),
                    volume: avg('volume'),
                };
            });
        }

        if (tankChartRange === '1M') {
            const today = new Date();
            return Array.from({ length: 4 }, (_, i) => {
                const target = new Date(today);
                target.setDate(target.getDate() - ((3 - i) * 7));
                const weekData = chartData.filter((d: any) => {
                    const ts = new Date(d.timestamp || d.created_at);
                    const diffDays = (target.getTime() - ts.getTime()) / (86_400_000);
                    return diffDays >= 0 && diffDays < 7;
                });
                const avg = (key: string) => weekData.length > 0
                    ? weekData.reduce((s: number, d: any) => s + (d[key] || 0), 0) / weekData.length
                    : 0;
                return {
                    time: 'Week ' + (i + 1),
                    timestamp: target.toISOString(),
                    level: avg('level'),
                    volume: avg('volume'),
                };
            });
        }

        if (tankChartRange === 'RANGE') {
            if (!rangeStart || !rangeEnd) return chartData.slice(-7);
            const start = new Date(rangeStart);
            const end   = new Date(rangeEnd);
            end.setHours(23, 59, 59, 999);
            const rangeFeeds = chartData.filter((d: any) => {
                const ts = new Date(d.timestamp || d.created_at);
                return ts >= start && ts <= end;
            });
            const diffHours = (end.getTime() - start.getTime()) / 3_600_000;
            if (diffHours > 24 && rangeFeeds.length > 500) {
                const map = new Map<string, { level: number; volume: number; count: number }>();
                rangeFeeds.forEach((d: any) => {
                    const ts = new Date(d.timestamp || d.created_at);
                    const key = ts.toISOString().slice(0, 13) + ':00'; // group by hour
                    const prev = map.get(key) || { level: 0, volume: 0, count: 0 };
                    map.set(key, { level: prev.level + (d.level || 0), volume: prev.volume + (d.volume || 0), count: prev.count + 1 });
                });
                return Array.from(map.entries()).map(([key, val]) => ({
                    time: new Date(key).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
                    timestamp: key,
                    level:  val.level  / val.count,
                    volume: val.volume / val.count,
                }));
            }
            return rangeFeeds;
        }

        return chartData;
    }, [chartData, tankChartRange, rangeStart, rangeEnd, deviceOffline, lastDataTimestamp]);

    const chartTimeTicks = useMemo(() => {
        if (tankChartRange !== '24H') return undefined;
        const ticks: string[] = [];
        const now = Date.now();
        const windowMs = 4 * 60 * 60_000;
        const startMs  = now - windowMs;
        // One tick every 30 minutes = 8 ticks + start = 9 labels max
        const TICK_INTERVAL = 30 * 60_000;
        // Snap start to nearest 30-min boundary for clean labels
        const snapped = Math.ceil(startMs / TICK_INTERVAL) * TICK_INTERVAL;
        for (let t = snapped; t <= now; t += TICK_INTERVAL) {
            ticks.push(new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return ticks;
    }, [tankChartRange]);

    const waterAnalytics = useWaterAnalytics(
        localCfg.heightM,
        metrics.capacityLitres,
        sensorDistanceM,
        metrics.volumeLitres,
        metrics.percentage,
        activeTelemetry?.timestamp || "",
        liveFeeds, // CRITICAL: Use same processed data as graph
        localCfg.lengthM,
        localCfg.breadthM,
        localCfg.deadBandM,
        (activeTelemetry as any)?.is_corrected || false,
        (activeTelemetry as any)?.original_value,
        (activeTelemetry as any)?.confidence,
        !isOffline,  // isDeviceOnline — used for Device Health
        unifiedData?.tankBehavior  // ← CHANGE 1: Add tankBehavior from API
    );



    // Analytics logging

    const { logData } = useAnalyticsLogger();



    // Log analytics data when it updates (but not too frequently)

    useEffect(() => {

        if (hardwareId && waterAnalytics.fillRateLpm !== 0) {

            logData(hardwareId, waterAnalytics, metrics.capacityLitres);

        }
    }, [waterAnalytics.fillRateLpm, waterAnalytics.refillsToday, hardwareId, metrics.capacityLitres, logData]);

    const chartDataForDisplay = filteredChartData;

    // Tank card uses ORIGINAL smoothed chartData (not interpolated), so it always shows the true latest point
    const smoothedLatestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;

    const latestPoint = chartDataForDisplay.length > 0 ? chartDataForDisplay[chartDataForDisplay.length - 1] : null;

    // Helper to format seconds to human-readable string
    const formatDuration = (seconds: number | null) => {
        if (seconds === null || isNaN(seconds)) return null;
        if (seconds > 86400 * 7) return "> 7 days";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    // Human friendly "time ago" string for offline notices
    const formatTimeAgo = (iso?: string | null) => {
        if (!iso) return 'unknown';
        const ts = new Date(iso).getTime();
        if (isNaN(ts)) return 'unknown';
        const diff = Date.now() - ts;
        const sec = Math.floor(diff / 1000);
        if (sec < 60) return `${sec} sec${sec === 1 ? '' : 's'} ago`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    };

    // Use the LAST chart data point for tank card display — ensures exact parity with graph
    const pct = smoothedLatestPoint?.level ?? metrics.percentage ?? 0;
    const deviceName = deviceInfo?.name || (deviceInfo as { label?: string })?.label || 'Tank';
    const zoneName = deviceInfo?.zone_name;

    // Real-time sync status



    // ── Computed capacity preview ─────────────────────────────────────────────

    const previewCapacity = useMemo(

        () => computeCapacityLitres({ tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, deadBandM: localCfg.deadBandM, capacityOverrideLitres: localCfg.capacityOverrideLitres }),

        [localCfg],

    );



    // ── Config save ───────────────────────────────────────────────────────────

    // ── Config save ───────────────────────────────────────────────────────────

    const handleSave = useCallback(async () => {

        setSaving(true);

        setSaveError(null);

        try {

            await api.put(`/admin/nodes/${hardwareId}`, localToApiBody(localCfg));

            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });

            setCfgDirty(false);

        } catch (err: unknown) {

            const message = err instanceof Error ? err.message : 'Failed to save configuration';

            setSaveError(message);

        } finally {

            setSaving(false);

        }

    }, [hardwareId, localCfg, queryClient]);



    function patch(updates: Partial<LocalTankConfig>) {

        setLocalCfg((prev) => ({ ...prev, ...updates }));

        setCfgDirty(true);

    }



    // ── Volume unit for chart axis ─────────────────────

    const { volDivisor } = useMemo(() => {

        const maxVol = Math.max(...chartDataForDisplay.map((d: any) => d.volume), 1);

        return maxVol >= 1000 ? { volDivisor: 1000 } : { volDivisor: 1 };

    }, [chartDataForDisplay]);



    // Guard: if no hardwareId id in route, redirect to /nodes

    if (!hardwareId) return <Navigate to="/nodes" replace />;



    if (analyticsLoading) {

        return (

            <div className="min-h-screen flex items-center justify-center bg-transparent">

                <div className="flex flex-col items-center gap-4">

                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'rgba(10,132,255,0.2)', borderTopColor: '#0A84FF' }} />

                    <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Loading analytics...</p>

                </div>

            </div>

        );

    }





    // Main component return
    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{
            color: 'var(--text-primary)'
        }}>

            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>

                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">



                    {/* Breadcrumb + Page Heading row */}

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">

                        <div className="flex flex-col gap-2">

                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>

                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">

                                    Home

                                </button>

                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>

                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-normal" style={{ color: "var(--text-muted)" }}>

                                    All Nodes

                                </button>

                                <span className="material-icons" style={{ fontSize: '16px', color: "var(--text-muted)" }}>chevron_right</span>

                                <span className="font-bold" style={{ color: "var(--text-primary)", fontWeight: '700' }}>{deviceName}</span>

                            </nav>

                            <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px', color: "var(--text-primary)" }}>

                                {deviceName} Analytics
                            </h2>

                            {zoneName && (
                                <p className="text-xs text-slate-400 m-0 mt-1">
                                    {zoneName}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pb-1">
                            {/* Status Button (Pill Style) */}
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm border-none transition-all duration-300 text-white ${isOffline ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                {isOffline ? 'Offline' : 'Online'}
                            </div>

                            {/* Node Info Button */}
                            <button
                                onClick={() => refetch()}
                                disabled={analyticsFetching}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 border-none ${analyticsFetching ? 'bg-gray-100 dark:bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-[#0077ff] hover:bg-[#0062d6] text-white'}`}
                            >
                                <span className={`material-icons ${analyticsFetching ? 'animate-spin' : ''}`} style={{ fontSize: '14px' }}>
                                    {analyticsFetching ? 'sync' : 'refresh'}
                                </span>
                                {analyticsFetching ? 'Refreshing...' : 'Refresh Data'}
                            </button>

                            <button
                                onClick={() => setShowNodeInfo(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE] hover:bg-[#9d44ce] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Info size={12} className="stroke-[2.5px]" />
                                Node Info
                            </button>

                            {/* Parameters Button */}
                            <button
                                onClick={() => setShowParams(true)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB340] hover:bg-[#f5a623] text-amber-900 border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                            >
                                <Settings size={12} className="stroke-[2.5px]" />
                                Parameters
                            </button>

                            {/* Delete Button */}
                            {user?.role === 'superadmin' && (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] hover:bg-[#e0352b] text-white border-none rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    <span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span>
                                    Delete Node
                                </button>
                            )}

                        </div>

                    </div>

                    {/* Parameters Popup Modal */}
                    {showParams && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowParams(false)}>
                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-md"
                                style={{
                                    background: 'var(--bg-secondary)', border: '1px solid var(--card-border)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold m-0" style={{ color: "var(--text-primary)" }}>Tank Configuration</h3>
                                    <button onClick={() => setShowParams(false)}
                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                                        style={{
                                            width: 24,
                                            height: 24,
                                            background: "var(--bg-secondary)",
                                            color: "var(--text-secondary)",
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                        &times;
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Length</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="number" step="0.1" value={localCfg.lengthM}
                                                onChange={e => patch({ lengthM: parseFloat(e.target.value) || 0 })}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: "var(--text-primary)", WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>m</span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Breadth</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="number" step="0.1" value={localCfg.breadthM}
                                                onChange={e => patch({ breadthM: parseFloat(e.target.value) || 0 })}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: "var(--text-primary)", WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>m</span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Height</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="number" step="0.1" value={localCfg.heightM}
                                                onChange={e => patch({ heightM: parseFloat(e.target.value) || 0 })}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: "var(--text-primary)", WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>m</span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Dead Band</p>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <input type="number" step="0.1" value={localCfg.deadBandM}
                                                onChange={e => patch({ deadBandM: parseFloat(e.target.value) || 0 })}
                                                className="w-full font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                style={{ color: "var(--text-primary)", WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>m</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl p-4 mb-5" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Estimated Capacity</p>
                                    <p className="text-2xl font-black mt-1" style={{ color: "var(--text-primary)" }}>{formatVolume(previewCapacity)}</p>
                                </div>

                                {saveError && (
                                    <p className="text-[11px] font-bold text-center mt-0 mb-3" style={{ color: '#FF3B30' }}>{saveError}</p>
                                )}

                                <div className="flex gap-3">
                                    {user?.role === "superadmin" && (
                                        <button onClick={async () => { await handleSave(); if (!saveError) setShowParams(false); }} disabled={!cfgDirty || saving}
                                            className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            style={{
                                                background: '#3A7AFE',
                                                opacity: (cfgDirty && !saving) ? 1 : 0.5,
                                                pointerEvents: (cfgDirty && !saving) ? 'auto' : 'none',
                                                fontSize: '14px',
                                            }}>
                                            {saving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    )}
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            background: "var(--bg-secondary)",
                                            color: "var(--text-primary)",
                                            fontSize: '14px'
                                        }}
                                        onClick={() => setShowParams(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}



                    {/* Node Info Modal */}

                    {showNodeInfo && (

                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}

                            onClick={() => setShowNodeInfo(false)}>

                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-2xl"

                                style={{

                                    background: 'var(--bg-secondary)', border: '1px solid var(--card-border)',

                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'

                                }}

                                onClick={e => e.stopPropagation()}>



                                <div className="flex justify-between items-center mb-6">

                                    <h3 className="text-[17px] font-bold m-0" style={{ color: "var(--text-primary)" }}>Node Information</h3>

                                    <button onClick={() => setShowNodeInfo(false)}

                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"

                                        style={{

                                            width: 24,

                                            height: 24,

                                            background: "var(--bg-secondary)",

                                            color: "var(--text-secondary)",

                                            fontSize: '18px',

                                            fontWeight: 'bold',

                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'

                                        }}>

                                        &times;

                                    </button>

                                </div>



                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Device Name</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{deviceName}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Hardware ID</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{hardwareId}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Device Type</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>Water Tank Monitor</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Location</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>Not specified</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Subscription</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>PRO</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Assigned To</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{deviceInfo?.customer_name || 'Unassigned'}</p>
                                    </div>
                                </div>



                                <div className="mt-6 flex gap-3">

                                    <button

                                        className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"

                                        style={{

                                            background: '#3A7AFE',

                                            fontSize: '14px'

                                        }}

                                        onClick={() => {

                                            const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: Water Tank Monitor\nLocation: Not specified\nSubscription: PRO\nAssigned To: ${deviceInfo?.customer_name || 'Unassigned'}`;

                                            navigator.clipboard.writeText(info);

                                            alert('Node information copied to clipboard!');

                                        }}

                                    >

                                        Copy Info

                                    </button>

                                    <button

                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"

                                        style={{

                                            background: "var(--bg-secondary)",

                                            color: "var(--text-primary)",

                                            fontSize: '14px'

                                        }}

                                        onClick={() => setShowNodeInfo(false)}

                                    >

                                        Close

                                    </button>

                                </div>

                            </div>

                        </div>

                    )}



                    {/* Metric Card Info Popups */}

                    {activeInfoPopup && (

                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}

                            onClick={() => setActiveInfoPopup(null)}>

                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-md"

                                style={{

                                    background: 'var(--bg-secondary)', border: '1px solid var(--card-border)',

                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)',

                                    maxHeight: '90vh',

                                    overflowY: 'auto'

                                }}

                                onClick={e => e.stopPropagation()}>



                                <div className="flex justify-between items-center mb-6">

                                    <div className="flex items-center gap-2">

                                        {activeInfoPopup === 'fillRate' && <div className="p-1.5 rounded-lg" style={{ background: 'rgba(52,199,89,0.15)' }}><TrendingUp size={18} color="#34C759" /></div>}

                                        {activeInfoPopup === 'consumption' && <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255,59,48,0.15)' }}><TrendingDown size={18} color="#FF3B30" /></div>}

                                        {activeInfoPopup === 'alerts' && <div className="p-1.5 rounded-lg" style={{ background: 'rgba(175,82,222,0.15)' }}><Bell size={18} color="#AF52DE" /></div>}

                                        {activeInfoPopup === 'deviceHealth' && <div className="p-1.5 rounded-lg" style={{ background: 'rgba(10,132,255,0.15)' }}><Wifi size={18} color="#0A84FF" /></div>}

                                        <h3 className="text-[17px] font-bold m-0" style={{ color: "var(--text-primary)" }}>

                                            {activeInfoPopup === 'fillRate' && 'Fill Rate Details'}

                                            {activeInfoPopup === 'consumption' && 'Consumption Details'}

                                            {activeInfoPopup === 'alerts' && 'Alert Details'}

                                            {activeInfoPopup === 'deviceHealth' && 'Device Health'}

                                        </h3>

                                    </div>

                                    <button onClick={() => setActiveInfoPopup(null)}

                                        className="flex items-center justify-center rounded-full border-none cursor-pointer p-0 transition-transform hover:scale-110"

                                        style={{ width: 24, height: 24, background: "var(--bg-secondary)", color: "var(--text-secondary)", fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>

                                        &times;

                                    </button>

                                </div>



                                <div className="grid grid-cols-1 gap-4">

                                    {activeInfoPopup === 'fillRate' && (

                                        <>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Refills Today</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>{waterAnalytics.refillsToday}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Last Refill Time</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>

                                                    {waterAnalytics.lastRefillTime ? new Date(waterAnalytics.lastRefillTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}

                                                </p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Avg. Refill Time</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>

                                                    {waterAnalytics.avgRefillTimeMinutes !== null ? `${Math.round(waterAnalytics.avgRefillTimeMinutes)} min` : '--'}

                                                </p>

                                            </div>

                                        </>

                                    )}



                                    {activeInfoPopup === 'consumption' && (

                                        <>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Today's Consumption</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>{waterAnalytics.todaysConsumptionLiters > 0 ? `${waterAnalytics.todaysConsumptionLiters.toFixed(0)} L` : '--'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Peak Consumption Time</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>{waterAnalytics.peakConsumptionTime ? new Date(waterAnalytics.peakConsumptionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Peak Drain Rate</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>{waterAnalytics.peakConsumptionRateLpm ? `${waterAnalytics.peakConsumptionRateLpm.toFixed(0)} L/min` : '--'}</p>

                                            </div>

                                        </>

                                    )}



                                    {activeInfoPopup === 'alerts' && (

                                        <>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Low Level (&lt;20%)</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: waterAnalytics.alerts.lowLevel ? '#FF3B30' : '#34C759' }}>{waterAnalytics.alerts.lowLevel ? '⚠ Active' : '✓ OK'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Overflow (&gt;95%)</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: waterAnalytics.alerts.overflow ? '#FF9500' : '#34C759' }}>{waterAnalytics.alerts.overflow ? '⚠ Active' : '✓ OK'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>High Drain Rate</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: waterAnalytics.alerts.highDrain ? '#FF3B30' : '#34C759' }}>{waterAnalytics.alerts.highDrain ? `⚠ ${Math.abs(waterAnalytics.drainRateLpm).toFixed(0)} L/min` : '✓ OK'}</p>

                                            </div>

                                        </>

                                    )}



                                    {activeInfoPopup === 'deviceHealth' && (

                                        <>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Connection Status</p>

                                                <div className="flex items-center gap-1.5 mt-1">

                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOffline ? '#FF3B30' : '#34C759' }} />

                                                    <p className="text-sm font-bold m-0" style={{ color: isOffline ? '#FF3B30' : '#34C759' }}>{isOffline ? 'Offline' : 'Online'}</p>

                                                </div>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Sensor OK (&lt;5 min)</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: waterAnalytics.deviceHealth.sensorOk ? '#34C759' : '#FF3B30' }}>{waterAnalytics.deviceHealth.sensorOk ? '✓ Yes' : '✗ No'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Data Valid</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: waterAnalytics.deviceHealth.dataValid ? '#34C759' : '#FF3B30' }}>{waterAnalytics.deviceHealth.dataValid ? '✓ Yes' : '✗ No'}</p>

                                            </div>

                                            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                                                <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>Last Comm. Time</p>

                                                <p className="text-sm font-bold mt-1 m-0" style={{ color: "var(--text-primary)" }}>

                                                    {bestTimestamp ? new Date(bestTimestamp).toLocaleString() : '--'}

                                                </p>

                                            </div>

                                        </>

                                    )}

                                </div>



                                <div className="mt-6 flex gap-3">

                                    <button

                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"

                                        style={{

                                            background: "var(--bg-secondary)",

                                            color: "var(--text-primary)",

                                            fontSize: '14px'

                                        }}

                                        onClick={() => setActiveInfoPopup(null)}

                                    >

                                        Close

                                    </button>

                                </div>

                            </div>

                        </div>

                    )}



                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch w-full">

                        {/* COLUMN 1: TANK & ESTIMATIONS */}
                        <div className="flex flex-col gap-4 w-full">

                            {/* TANK VISUALIZER */}
                            {(showTankLevelParam || showVolumeParam) && (
                                <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden h-full">

                                    <div className="flex justify-between items-center mb-2 z-10 w-full">
                                        <div>
                                            <h3 className="text-xl font-semibold m-0 leading-tight">{deviceName}</h3>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                                                style={{ color: '#0A84FF', background: 'rgba(10,132,255,0.1)' }}>
                                                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>sync</span> Live
                                            </span>
                                        </div>
                                    </div>

                                    {showTankLevelParam && (
                                        <div className="flex items-center justify-center py-0 z-10 mt-4 mb-2">

                                            <div className="relative" style={{ width: 180, height: 250 }}>

                                                <div className="absolute inset-0 rounded-[45px] overflow-hidden z-10 tank-glass"
                                                    style={{ border: '2.5px solid var(--glass-accent)', boxShadow: '0 16px 36px rgba(0,80,200,0.15), inset 0 1px 0 rgba(255,255,255,0.5)', background: 'rgba(230,240,255,0.18)' }}>

                                                    {/* Glass shine left */}
                                                    <div className="absolute top-0 bottom-0 left-2" style={{ width: 14, background: 'linear-gradient(90deg,rgba(255,255,255,0.55),transparent)', filter: 'blur(2px)', zIndex: 30, borderRadius: '45px 0 0 45px' }} />

                                                    {/* Glass shine right */}
                                                    <div className="absolute top-0 bottom-0 right-1" style={{ width: 7, background: 'linear-gradient(270deg,rgba(255,255,255,0.35),transparent)', filter: 'blur(1px)', zIndex: 30 }} />

                                                    {/* Water fill */}
                                                    <div className="absolute bottom-0 left-0 right-0 overflow-hidden z-20"

                                                        style={{ height: (telemetryLoading && !metrics.isDataValid) ? '50%' : `${pct}%`, transition: 'height 1.5s cubic-bezier(0.34,1.56,0.64,1)', background: 'linear-gradient(180deg, #5AC8FA 0%, #0A84FF 35%, #0055D4 70%, #003DAA 100%)' }}>

                                                        {/* Shimmer overlay */}
                                                        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)', mixBlendMode: 'overlay' }} />

                                                        {/* Level text inside water if high enough */}

                                                        {pct > 15 && (

                                                            <div className="absolute top-5 left-0 right-0 text-center pointer-events-none z-30"

                                                                style={{

                                                                    color: '#ffffff',

                                                                    fontSize: '38px',

                                                                    fontWeight: 800,

                                                                    lineHeight: 1,

                                                                    textShadow: '0 2px 8px rgba(0,0,0,0.4)',

                                                                    letterSpacing: '-0.5px'

                                                                }}>

                                                                {Math.round(pct)}%

                                                                {/* Enhanced Conditional Processing Indicator */}
                                                                {(metrics as any).isCorrected && (
                                                                    <div className="absolute -top-1 -right-1 flex flex-col items-center">
                                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-pulse ${(metrics as any).data_label === 'PREDICTED'
                                                                            ? 'bg-red-500'
                                                                            : (metrics as any).data_label === 'CORRECTED'
                                                                                ? 'bg-orange-500'
                                                                                : 'bg-blue-500'
                                                                            }`}
                                                                            title={`Conditional Processing: ${(metrics as any).data_label} - ${(metrics as any).correction_reason || 'Intelligent correction'}`}>
                                                                            <span className="text-white text-[10px] font-black">
                                                                                {(metrics as any).data_label === 'PREDICTED' ? 'P' :
                                                                                    (metrics as any).data_label === 'CORRECTED' ? 'C' : '!'}
                                                                            </span>
                                                                        </div>
                                                                        <span className={`text-[10px] font-bold mt-1 uppercase tracking-tighter ${(metrics as any).data_label === 'PREDICTED'
                                                                            ? 'text-red-400'
                                                                            : (metrics as any).data_label === 'CORRECTED'
                                                                                ? 'text-orange-400'
                                                                                : 'text-blue-400'
                                                                            }`} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                                            {(metrics as any).data_label || 'CORR'}
                                                                        </span>
                                                                        {(metrics as any).prediction_mode && (
                                                                            <span className="text-[8px] text-red-300 font-bold">PRED MODE</span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                            </div>

                                                        )}

                                                        {/* Animated wave surface */}
                                                        <div className="absolute top-0 w-[200%] left-0 wave-animation" style={{ opacity: 0.55, height: '20px' }}>

                                                            <svg viewBox="0 0 800 40" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>

                                                                <path d="M 0,20 Q 100,5 200,20 T 400,20 T 600,20 T 800,20 L 800,40 L 0,40 Z" fill="rgba(255,255,255,0.45)" />

                                                            </svg>

                                                        </div>

                                                    </div>



                                                    {/* Level tick marks — right side */}
                                                    <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-between py-4 z-30" style={{ opacity: 0.7, width: 30 }}>

                                                        {(['100', '75', '50', '25', '0'] as string[]).map((lbl, i) => (

                                                            <div key={i} className="flex items-center justify-end gap-1">

                                                                <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'monospace', color: pct >= Number(lbl) ? '#e2f0ff' : '#64748b' }}>{lbl}</span>

                                                                <div style={{ width: 8, height: 1.5, background: pct >= Number(lbl) ? 'rgba(255,255,255,0.7)' : '#94a3b8', borderRadius: 2 }} />

                                                            </div>

                                                        ))}

                                                    </div>

                                                </div>

                                            </div>

                                        </div>
                                    )}



                                    <div className="flex flex-col mt-4 pt-0 gap-2 z-10 w-full">
                                        {showVolumeParam && (
                                            <div className="grid grid-cols-2 gap-2 w-full">
                                                <div className="text-left rounded-xl p-3 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider m-0 mb-1" style={{ color: "var(--text-primary)" }}>Total Cap</p>
                                                    <p className="text-lg font-black m-0 tracking-tight" style={{ color: "var(--text-primary)" }}>{Math.round(metrics.capacityLitres).toLocaleString()} L</p>
                                                </div>
                                                <div className="text-left rounded-xl p-3 flex flex-col justify-center" style={{ background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.1)' }}>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider m-0 mb-1" style={{ color: '#007AFF' }}>Current Volume</p>
                                                    <p className="text-lg font-black m-0 tracking-tight" style={{ color: '#004BA0' }}>{Math.round(smoothedLatestPoint?.volume ?? metrics.volumeLitres).toLocaleString()} L</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="text-center w-full mt-0.5">
                                            {latestPoint?.predictions && (latestPoint.predictions.timeToEmpty || latestPoint.predictions.timeToFull) ? (
                                                <div className="flex flex-col gap-1 items-center">
                                                    <div className={`px-4 py-2 rounded-full text-[11px] font-bold flex items-center gap-2 shadow-sm border ${latestPoint.predictions.timeToEmpty
                                                        ? 'bg-red-50/80 text-red-600 border-red-100'
                                                        : 'bg-green-50/80 text-green-600 border-green-100'
                                                        }`}>
                                                        <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                                                            {latestPoint.predictions.timeToEmpty ? 'hourglass_bottom' : 'hourglass_top'}
                                                        </span>
                                                        {latestPoint.predictions.timeToEmpty ? (
                                                            <span>ESTIMATED EMPTY IN <b>{formatDuration(latestPoint.predictions.timeToEmpty)}</b></span>
                                                        ) : (
                                                            <span>ESTIMATED FULL IN <b>{formatDuration(latestPoint.predictions.timeToFull)}</b></span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Estimation Cards - Moved here below Tank Card */}
                            {showEstimationsParam && (
                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="apple-glass-card p-4 rounded-2xl flex flex-col justify-between" style={{ background: 'rgba(255, 149, 0, 0.1)', border: '1px solid rgba(255, 149, 0, 0.2)', minHeight: '120px', boxShadow: '0 8px 32px rgba(255, 149, 0, 0.05)' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255, 149, 0, 0.15)' }}>
                                                <Timer size={18} color="#FF9500" />
                                            </div>
                                            <Info size={14} color="#1C1C1E" className="cursor-help opacity-60 hover:opacity-100" />
                                        </div>
                                        <div className="flex flex-col mt-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Est. Time Until Empty</span>
                                            <span className="text-lg font-black tracking-tight mt-0.5" style={{ color: "var(--text-primary)" }}>
                                                {waterAnalytics.estimatedEmptyTimeMinutes ?
                                                    `${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes % 60)}m`
                                                    : '--'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="apple-glass-card p-4 rounded-2xl flex flex-col justify-between" style={{ background: 'rgba(10, 132, 255, 0.1)', border: '1px solid rgba(10, 132, 255, 0.2)', minHeight: '120px', boxShadow: '0 8px 32px rgba(10, 132, 255, 0.05)' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(10, 132, 255, 0.15)' }}>
                                                <Droplets size={18} color="#0A84FF" />
                                            </div>
                                            <Info size={14} color="#1C1C1E" className="cursor-help opacity-60 hover:opacity-100" />
                                        </div>
                                        <div className="flex flex-col mt-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Est. Time Until Full</span>
                                            <span className="text-lg font-black tracking-tight mt-0.5" style={{ color: "var(--text-primary)" }}>
                                                {waterAnalytics.estimatedFullTimeMinutes ?
                                                    (waterAnalytics.estimatedFullTimeMinutes > 60 ?
                                                        `${Math.floor(waterAnalytics.estimatedFullTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedFullTimeMinutes % 60)}m`
                                                        : `${Math.floor(waterAnalytics.estimatedFullTimeMinutes)} min`)
                                                    : '--'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* COLUMN 2 - GRAPHS & INSIGHTS */}

                        <div className="lg:col-span-2 flex flex-col gap-4 w-full h-full">

                            {/* Water State Badges moved into individual cards below */}

                            {/* RATE CARDS */}

                            <div className="grid gap-4 w-full" style={{
                                gridTemplateColumns: `repeat(${[showFillRateParam, showConsumptionParam, showAlertsParam, showDeviceHealthParam].filter(Boolean).length}, 1fr)`
                            }}>

                                {showFillRateParam && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] max-h-[45vh]" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
                                        <div className="flex justify-between items-center w-full">
                                            <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(52,199,89,0.15)' }}>
                                                <TrendingUp size={18} color="#34C759" />
                                            </div>
                                            {user?.role === 'superadmin' && customerConfig.showFillRate === false && (
                                                <span className="text-[10px] font-bold bg-gray-200 text-black px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                            )}
                                            
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setActiveInfoPopup('fillRate')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                    <Info size={14} color="#1C1C1E" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-1 gap-0.5">
                                            <p className="text-[12px] font-black uppercase tracking-wider m-0" style={{ color: "var(--text-primary)" }}>Fill Rate</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.fillRateLpm > 500 ? '#FF3B30' : '#34C759' }}>
                                                {waterAnalytics.fillRateLpm > 500 ? (
                                                    <span style={{ fontSize: '13px', color: '#FF3B30' }}>Invalid reading</span>
                                                ) : waterAnalytics.fillRateLpm > 0 ? (
                                                    <>+{waterAnalytics.fillRateLpm.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>L/min</span></>
                                                ) : waterAnalytics.rateDataValid && waterAnalytics.drainRateLpm === 0 ? (
                                                    <span style={{ fontSize: '16px', color: "var(--text-primary)" }}>Stable</span>
                                                ) : '--'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {showConsumptionParam && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] max-h-[45vh]" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
                                        <div className="flex justify-between items-center w-full">
                                            <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(255,59,48,0.15)' }}>
                                                <TrendingDown size={18} color="#FF3B30" />
                                            </div>
                                            {user?.role === 'superadmin' && customerConfig.showConsumption === false && (
                                                <span className="text-[10px] font-bold bg-gray-200 text-black px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setActiveInfoPopup('consumption')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                    <Info size={14} color="#1C1C1E" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-1 gap-0.5">
                                            <p className="text-[12px] font-black uppercase tracking-wider m-0" style={{ color: "var(--text-primary)" }}>Consumption</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.drainRateLpm > 500 ? '#FF3B30' : '#FF3B30' }}>
                                                {waterAnalytics.drainRateLpm > 500 ? (
                                                    <span style={{ fontSize: '13px', color: '#FF3B30' }}>Invalid reading</span>
                                                ) : waterAnalytics.drainRateLpm > 0 ? (
                                                    <>{Math.abs(waterAnalytics.drainRateLpm).toFixed(0)} <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>L/min</span></>
                                                ) : waterAnalytics.rateDataValid && waterAnalytics.fillRateLpm === 0 ? (
                                                    <span style={{ fontSize: '16px', color: "var(--text-primary)" }}>Stable</span>
                                                ) : '--'}
                                            </p>

                                            {/* CHANGE 3: Show today's consumption total */}
                                            {waterAnalytics.todaysConsumptionLiters > 0 && (
                                              <p className="text-[10px] font-bold mt-1.5 m-0 opacity-60" style={{ color: "var(--text-primary)" }}>
                                                {waterAnalytics.todaysConsumptionLiters.toFixed(0)} L processed today
                                              </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {showAlertsParam && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] max-h-[45vh]" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
                                        <div className="flex justify-between items-center w-full">
                                            <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(175,82,222,0.15)' }}>
                                                <Bell size={18} color="#AF52DE" />
                                            </div>
                                            {user?.role === 'superadmin' && customerConfig.showAlerts === false && (
                                                <span className="text-[10px] font-bold bg-gray-200 text-black px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                            )}
                                            <button onClick={() => setActiveInfoPopup('alerts')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#1C1C1E" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-1 gap-0.5">
                                            <p className="text-[12px] font-black uppercase tracking-wider m-0" style={{ color: "var(--text-primary)" }}>Alerts</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.alerts.activeCount > 0 ? '#FF3B30' : '#1C1C1E' }}>
                                                {waterAnalytics.alerts.activeCount} <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Active</span>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {showDeviceHealthParam && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between w-full min-h-[160px] max-h-[45vh]" style={{ background: "var(--card-bg)", border: '1px solid var(--card-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
                                        <div className="flex justify-between items-center w-full">
                                            <div className="flex items-center justify-center rounded-xl w-8 h-8" style={{ background: 'rgba(10,132,255,0.15)' }}>
                                                <Wifi size={18} color="#0A84FF" />
                                            </div>
                                            {user?.role === 'superadmin' && customerConfig.showDeviceHealth === false && (
                                                <span className="text-[10px] font-bold bg-gray-200 text-black px-2 py-0.5 rounded-full uppercase">Hidden from Customer</span>
                                            )}
                                            <button onClick={() => setActiveInfoPopup('deviceHealth')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#1C1C1E" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-1 gap-0.5">
                                            <p className="text-[12px] font-black uppercase tracking-wider m-0" style={{ color: "var(--text-primary)" }}>Device Health</p>
                                            <p className={`leading-[1.1] font-black m-0 tracking-tight ${waterAnalytics.deviceHealth.status === 'Healthy' ? 'text-[26px]' : 'text-[18px]'
                                                }`} style={{ color: waterAnalytics.deviceHealth.status === 'Healthy' ? '#34C759' : waterAnalytics.deviceHealth.status === 'Warning' ? '#FF9500' : '#FF3B30' }}>
                                                {waterAnalytics.deviceHealth.status}
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>



{/* ── OFFLINE / STALE DATA BANNER ─────────────────────────────────────────── */}
{deviceOffline && lastDataTimestamp && (
    <div
        className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-2"
        style={{
            background: 'rgba(255,59,48,0.08)',
            border: '1px solid rgba(255,59,48,0.25)',
        }}
    >
        <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: '#FF3B30' }}
        />
        <div className="flex flex-col gap-0.5">
            <p className="text-[12px] font-bold m-0" style={{ color: '#FF3B30' }}>
                Device offline — no new data received
            </p>
            <p className="text-[11px] font-normal m-0" style={{ color: 'var(--text-muted)' }}>
                Last seen <span className="font-bold">{formatTimeAgo(lastDataTimestamp)}</span>. Chart shows data up to that point.
            </p>
        </div>
    </div>
)}

{/* ── COMBINED HISTORY CHART ───────────────────────────────────────────────── */}
<div
    className="apple-glass-card flex flex-col items-stretch justify-between relative overflow-hidden flex-grow"
    style={{
        background: "var(--card-bg)",
        backdropFilter: "var(--card-blur)",
        WebkitBackdropFilter: "var(--card-blur)",
        borderRadius: '2.5rem',
        border: '1px solid var(--card-border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        padding: '24px',
        minHeight: '350px',
    }}
>
    {/* Header row */}
    <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-bold text-[var(--text-primary)] tracking-tight m-0 leading-tight">
                TANK LEVEL AND VOLUME
            </h2>
            {/* Live pulse indicator */}
            {!deviceOffline && (
                <div className="flex items-center gap-1.5">
                    <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: '#34C759' }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#34C759' }}>
                        Live · updates every 60s
                    </span>
                </div>
            )}
            {deviceOffline && (
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FF3B30' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#FF3B30' }}>
                        Offline · showing last known data
                    </span>
                </div>
            )}
        </div>

        <div className="flex flex-col items-end gap-2.5">
            {/* Time range pills */}
            <div className="flex p-1 rounded-full border relative overflow-hidden shrink-0 shadow-inner"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--card-border)' }}>
                {(['24H','1W','1M','RANGE'] as const).map((r) => {
                    const active = tankChartRange === r;
                    return (
                        <button
                            key={r}
                            onClick={() => setTankChartRange(r)}
                            className={`relative z-10 px-4 py-1.5 text-[10px] font-extrabold tracking-widest uppercase rounded-full cursor-pointer transition-all duration-300 ${
                                active ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                            style={{
                                border: 'none',
                                background: active ? '#004F94' : 'transparent',
                                boxShadow: active ? '0 4px 12px rgba(0,79,148,0.25)' : 'none',
                            }}
                        >
                            {r}
                        </button>
                    );
                })}
            </div>

            {tankChartRange === 'RANGE' && (
                <div className="flex items-center gap-2">
                    <input type="date" value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="border rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 outline-none"
                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--card-border)' }} />
                    <span className="text-[10px] text-[var(--text-muted)] font-bold">TO</span>
                    <input type="date" value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="border rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 outline-none"
                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--card-border)' }} />
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-5 mr-1">
                <button
                    onClick={() => setShowTankLevel(!showTankLevel)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0"
                    style={{ opacity: showTankLevel ? 1 : 0.3 }}
                >
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ background: '#0A84FF' }} />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">Tank Level (%)</span>
                </button>
                <button
                    onClick={() => setShowVolume(!showVolume)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0"
                    style={{ opacity: showVolume ? 1 : 0.3 }}
                >
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ background: '#FF9500' }} />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">Volume</span>
                </button>
            </div>
        </div>
    </div>

    {/* Chart body */}
    {historyLoading ? (
        <div className="flex-grow flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            Loading history…
        </div>
    ) : chartDataForDisplay.length === 0 ? (
        <div className="flex-grow flex items-center justify-center italic" style={{ color: 'var(--text-muted)' }}>
            No history data available for this period.
        </div>
    ) : (
        <div className="flex-grow flex flex-col relative justify-end" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartDataForDisplay}
                    margin={{ top: 10, right: 36, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#0A84FF" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#FF9500" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#FF9500" stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--chart-grid-color)"
                        strokeOpacity={0.5}
                    />

                    {/*
                      ✅ KEY CHANGE: ticks = only the 8 pre-computed time labels
                         interval="preserveStartEnd" — never skip a tick label
                         All 240 points are still IN the data array and visible
                         on hover, but the axis only labels 8 of them.
                    */}
                    <XAxis
                        dataKey="time"
                        ticks={chartTimeTicks}
                        interval={tankChartRange === '24H' ? 0 : 'preserveStartEnd'}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }}
                        minTickGap={30}
                    />

                    {/* Level % — left axis */}
                    <YAxis
                        yAxisId="left"
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#0A84FF' }}
                        label={{
                            value: 'Level (%)',
                            angle: -90,
                            position: 'insideLeft',
                            style: { textAnchor: 'middle', fontSize: 10, fill: '#0A84FF', fontWeight: 600 },
                        }}
                    />

                    {/* Volume — right axis */}
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#FF9500' }}
                        tickFormatter={(v) => volDivisor === 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}
                        label={{
                            value: `Volume (${volDivisor === 1000 ? 'KL' : 'L'})`,
                            angle: 90,
                            position: 'insideRight',
                            style: { textAnchor: 'middle', fontSize: 10, fill: '#FF9500', fontWeight: 600 },
                        }}
                    />

                    <Tooltip
                        cursor={{ stroke: '#0A84FF', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.45 }}
                        isAnimationActive={false}
                        content={(props: any) => {
                            const { active, payload } = props;
                            if (!active || !payload?.length) return null;
                            const raw = payload[0]?.payload;
                            const ts = raw?.timestamp;
                            let dateStr = '--', timeStr = raw?.time || '--';
                            if (ts) {
                                try {
                                    const d = new Date(ts);
                                    if (!isNaN(d.getTime())) {
                                        dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                        timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                                    }
                                } catch (_) {}
                            }
                            return (
                                <div style={{
                                    borderRadius: 12,
                                    border: '1px solid var(--card-border)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                    background: 'var(--bg-secondary)',
                                    padding: '10px 14px',
                                    minWidth: 170,
                                }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>
                                        {dateStr} &nbsp; {timeStr}
                                    </p>
                                    {payload.map((entry: any, i: number) => (
                                        entry.value != null && (
                                            <p key={i} style={{ margin: '3px 0 0', fontSize: 12, color: entry.color, fontWeight: 600 }}>
                                                {entry.name === 'Tank Level (%)'
                                                    ? `Level: ${entry.value.toFixed(1)}%`
                                                    : `Volume: ${entry.value.toFixed(0)} L`}
                                            </p>
                                        )
                                    ))}
                                </div>
                            );
                        }}
                    />

                    {showTankLevel && (
                        <Area
                            yAxisId="left"
                            type="monotone"
                            name="Tank Level (%)"
                            dataKey="level"
                            stroke="#0A84FF"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorLevel)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#0A84FF' }}
                            connectNulls={false}
                        />
                    )}
                    {showVolume && (
                        <Area
                            yAxisId="right"
                            type="monotone"
                            name="Volume"
                            dataKey="volume"
                            stroke="#FF9500"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorVolume)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#FF9500' }}
                            connectNulls={false}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )}
</div>

                        </div>


                    </div>

                    {/* Subtle Loading Indicators — Matches Home Map */}
                    {(analyticsLoading || analyticsFetching) && (
                        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Syncing Live Data...
                            </span>
                        </div>
                    )}
                </div>
            </main>

            {/* Delete Confirmation Popup */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                    onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                    <div className="rounded-3xl p-8 flex flex-col w-full max-w-sm text-center"
                        style={{
                            background: "var(--bg-secondary)", border: '1px solid var(--card-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                        onClick={e => e.stopPropagation()}>

                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                        </div>

                        <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Delete this Node?</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-8">
                            This will permanently remove <strong>{deviceName}</strong> and all its historical telemetry data. This action cannot be undone.
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${isDeleting ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 active:scale-95'}`}
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete Node'}
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] hover:bg-gray-800 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



export default EvaraTankAnalytics;
