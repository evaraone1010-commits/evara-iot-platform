import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import {
    TrendingUp, TrendingDown, Timer, Droplets,
    Info, Bell, Settings, Wifi
} from 'lucide-react';
import api from '../services/api';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import { useDeviceAnalytics, type NodeInfoData } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import { useAnalyticsLogger } from '../utils/analyticsLogger';
import type { TankConfig } from '../hooks/useDeviceConfig';
import {
    computeCapacityLitres,
    formatVolume,
} from '../utils/tankCalculations';
import type { TankShape } from '../utils/tankCalculations';
import { useWaterAnalytics } from '../hooks/useWaterAnalytics';
import { dataMergingService } from '../services/DataMergingService';

// --------- Types --------------------------------------------------------------------
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
    is_corrected?: boolean;
    original_value?: number;
    confidence?: number;
    pattern?: any;
    data_label?: 'RAW' | 'CORRECTED' | 'PREDICTED';
    prediction_mode?: boolean;
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
        thingspeakReadKey: '',
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

// --------- Main component -----------------------------------------------------------
const EvaraTankAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [tankChartRange, setTankChartRange] = useState<'24H' | '1W' | '1M' | 'RANGE'>('24H');

    const [localCfg, setLocalCfg] = useState<LocalTankConfig>(DEFAULT_LOCAL_CFG);
    const [cfgDirty, setCfgDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isFetching: analyticsFetching,
        deviceOffline,
        lastDataTimestamp,
        refetch,
    } = useDeviceAnalytics(hardwareId, {
        filter: {
            range: tankChartRange === 'RANGE' ? undefined : tankChartRange
        }
    });

    useAnalyticsLogger();

    useEffect(() => {
        if (hardwareId) refetch();
    }, [hardwareId, refetch]);

    const deviceConfig = ('config' in (unifiedData?.config ?? {})
        ? (unifiedData!.config as { config: TankConfig }).config
        : undefined) as TankConfig | undefined;

    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;

    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as NodeInfoData | undefined;

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

    useEffect(() => {
        const history = (unifiedData?.history as { feeds?: TelemetryPayload[] })?.feeds || [];
        if (history.length > 0) setLiveFeeds(history);
    }, [unifiedData?.history]);

    useEffect(() => {
        if (realtimeData) {
            setLiveFeeds(prev => {
                const last = prev[prev.length - 1];
                if (last && last.timestamp === realtimeData.timestamp) return prev;
                const ts = realtimeData.timestamp || realtimeData.created_at;
                if (!ts) return prev;
                const newPoint = {
                    ...realtimeData,
                    timestamp: ts,
                    level_percentage: realtimeData.level_percentage ?? realtimeData.level ?? 0,
                    total_liters: realtimeData.total_liters ?? realtimeData.volume ?? 0,
                };
                return [...prev, newPoint].slice(-10000);
            });
        }
    }, [realtimeData]);

    const historyFeeds = unifiedData?.history?.feeds || [];
    const historyLastTs = historyFeeds.length > 0 ? (historyFeeds[historyFeeds.length - 1].timestamp || historyFeeds[historyFeeds.length - 1].created_at) : null;
    const activeTelemetry = realtimeData || telemetryData;
    const bestTimestamp = activeTelemetry?.timestamp ?? deviceInfo?.last_seen ?? historyLastTs;
    const onlineStatus = computeOnlineStatus(bestTimestamp);
    const isOffline = onlineStatus === 'Offline';

    useEffect(() => {
        if (deviceConfig) {
            setLocalCfg(serverConfigToLocal(deviceConfig));
            setCfgDirty(false);
        }
    }, [deviceConfig]);

    const { tsIstLabel, tsDurationLabel } = useMemo(() => {
        if (!bestTimestamp) {
            return { tsIstLabel: '', tsDurationLabel: isOffline ? 'Device offline - Never seen online' : '' };
        }

        // Helper to resolve timestamp (handles Firestore objects)
        const resolveDate = (ts: any): Date => {
            if (!ts) return new Date(0);
            if (typeof ts === 'object') {
                if ('_seconds' in ts) return new Date(ts._seconds * 1000);
                if ('seconds' in ts) return new Date(ts.seconds * 1000);
            }
            const d = new Date(ts);
            return isNaN(d.getTime()) ? new Date(0) : d;
        };

        const lastSeenDate = resolveDate(bestTimestamp);
        if (lastSeenDate.getTime() === 0) {
             return { tsIstLabel: '', tsDurationLabel: isOffline ? 'Device offline - Never seen online' : '' };
        }

        const istLabel = new Intl.DateTimeFormat('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: 'Asia/Kolkata'
        }).format(lastSeenDate).replace(',', '') + ' IST';

        const diffMs = Date.now() - lastSeenDate.getTime();
        const diffMin = diffMs / 60000;
        const hoursAgo = Math.floor(diffMin / 60);

        let durationLabel = '';
        if (hoursAgo >= 24) {
            durationLabel = `Device is offline more than 24 hrs - Last seen ${istLabel}`;
        } else if (hoursAgo > 0) {
            durationLabel = `Device is offline - Last seen ${hoursAgo} ${hoursAgo === 1 ? 'hour' : 'hours'} ago`;
        } else if (diffMin > 0) {
            durationLabel = `Device is offline - Last seen ${Math.floor(diffMin)} ${Math.floor(diffMin) === 1 ? 'minute' : 'minutes'} ago`;
        } else {
            durationLabel = `Device is offline - Never seen online`;
        }
        return { tsIstLabel: istLabel, tsDurationLabel: durationLabel };
    }, [bestTimestamp, isOffline]);

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
            capacityLitres,
            isDataValid: backendPct != null,
            isCorrected: activeTelemetry?.is_corrected || false,
            originalValue: activeTelemetry?.original_value || backendPct,
            confidence: activeTelemetry?.confidence || 1,
            pattern: activeTelemetry?.pattern || null,
            data_label: activeTelemetry?.data_label || null,
            prediction_mode: activeTelemetry?.prediction_mode || false,
        };
    }, [activeTelemetry, localCfg]);

    const sensorDistanceM = activeTelemetry?.data?.[localCfg.fieldDepth] != null 
        ? parseFloat(String(activeTelemetry.data[localCfg.fieldDepth])) / 100 
        : null;

    const mergedDataResult = useMemo(() => {
        const history = unifiedData?.history?.feeds || [];
        return dataMergingService.mergeDataSources(history, liveFeeds, telemetryData, deviceInfo?.asset_type || 'EvaraTank', deviceConfig);
    }, [unifiedData?.history?.feeds, liveFeeds, telemetryData, deviceInfo?.asset_type, deviceConfig]);

    const chartData = useMemo(() => dataMergingService.getChartData(mergedDataResult.mergedData, 10000, metrics.capacityLitres), [mergedDataResult.mergedData, metrics.capacityLitres]);

    const filteredChartData = useMemo(() => {
        if (!chartData || chartData.length === 0) return [];
        
        const now = Date.now();
        
        if (tankChartRange === '24H') {
            const startMs = now - 4 * 60 * 60_000;
            const sorted = [...chartData].map((d: any) => ({ 
                ...d, 
                _ms: new Date(d.timestamp || d.created_at || 0).getTime() 
            })).filter((d: any) => !isNaN(d._ms)).sort((a: any, b: any) => a._ms - b._ms);
            
            const result = [];
            for (let t = startMs; t <= now; t += 60_000) {
                let idx = 0;
                while (idx < sorted.length - 1 && sorted[idx + 1]._ms <= t) idx++;
                const p1 = sorted[idx];
                const p2 = sorted[idx + 1];
                let level = null, volume = null;
                if (p1 && p1._ms <= t) {
                    if (!p2 || p2._ms === p1._ms) { level = p1.level; volume = p1.volume; }
                    else {
                        const ratio = (t - p1._ms) / (p2._ms - p1._ms);
                        level = (p1.level ?? 0) + ((p2.level ?? 0) - (p1.level ?? 0)) * ratio;
                        volume = (p1.volume ?? 0) + ((p2.volume ?? 0) - (p1.volume ?? 0)) * ratio;
                    }
                }
                const isAfterLastData = deviceOffline && lastDataTimestamp && t > new Date(lastDataTimestamp).getTime() + 5 * 60_000;
                result.push({ 
                    _ms: t, 
                    time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
                    timestamp: new Date(t).toISOString(), 
                    level: isAfterLastData ? null : level, 
                    volume: isAfterLastData ? null : volume 
                });
            }
            return result;
        }

        // For 1W and 1M, ensure _ms is present and format the time label for tooltips
        return chartData.map(p => {
            const ms = new Date(p.timestamp).getTime();
            const date = new Date(ms);
            let timeLabel = p.time;
            
            if (tankChartRange === '1W') {
                timeLabel = date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            } else if (tankChartRange === '1M') {
                timeLabel = date.toLocaleDateString([], { day: '2-digit', month: 'short' });
            }
            
            return { ...p, _ms: ms, time: timeLabel };
        });
    }, [chartData, tankChartRange, deviceOffline, lastDataTimestamp]);

    const chartTimeTicks = useMemo(() => {
        if (!filteredChartData || filteredChartData.length === 0) return undefined;
        
        const ticks = [];
        const startMs = filteredChartData[0]._ms;
        const endMs = filteredChartData[filteredChartData.length - 1]._ms;

        if (tankChartRange === '24H') {
            const interval = 30 * 60_000;
            for (let t = Math.ceil(startMs / interval) * interval; t <= endMs; t += interval) {
                ticks.push(t);
            }
            return ticks;
        }

        if (tankChartRange === '1W') {
            const dayMs = 24 * 60 * 60 * 1000;
            // One tick per day relative to start
            for (let t = startMs; t <= endMs; t += dayMs) {
                ticks.push(t);
            }
            return ticks;
        }

        if (tankChartRange === '1M') {
            const weekMs = 7 * 24 * 60 * 60 * 1000;
            // One tick per week relative to start
            for (let t = startMs; t <= endMs; t += weekMs) {
                ticks.push(t);
            }
            return ticks;
        }
        
        return undefined;
    }, [tankChartRange, filteredChartData]);

    const waterAnalytics = useWaterAnalytics(localCfg.heightM, metrics.capacityLitres, sensorDistanceM, metrics.volumeLitres, metrics.percentage, activeTelemetry?.timestamp || "", liveFeeds, localCfg.lengthM, localCfg.breadthM, localCfg.deadBandM, metrics.isCorrected, metrics.originalValue, metrics.confidence, !isOffline, unifiedData?.tankBehavior);

    const handleDelete = async () => {
        if (!hardwareId) return;
        setIsDeleting(true);
        try { await api.delete(`/admin/nodes/${hardwareId}`); navigate('/nodes'); }
        catch (err) { alert("Failed to delete node."); setIsDeleting(false); setShowDeleteConfirm(false); }
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await api.put(`/admin/nodes/${hardwareId}`, localToApiBody(localCfg));
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            setCfgDirty(false); setShowParams(false);
        } catch (err: any) { console.error('Save failed:', err); }
        finally { setSaving(false); }
    }, [hardwareId, localCfg, queryClient]);

    const patch = (updates: Partial<LocalTankConfig>) => { setLocalCfg(prev => ({ ...prev, ...updates })); setCfgDirty(true); };

    if (!hardwareId) return <Navigate to="/nodes" replace />;
    if (analyticsLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

    const smoothedLatestPoint = chartData[chartData.length - 1];
    const pct = smoothedLatestPoint?.level ?? metrics.percentage ?? 0;
    const deviceName = deviceInfo?.name || 'Tank';

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: 'var(--text-primary)' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] bg-transparent border-none cursor-pointer p-0">Home</button>
                                <span className="material-icons" style={{ fontSize: '16px' }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] bg-transparent border-none cursor-pointer p-0">All Nodes</button>
                                <span className="material-icons" style={{ fontSize: '16px' }}>chevron_right</span>
                                <span className="font-bold">{deviceName}</span>
                            </nav>
                            <h2 style={{ fontSize: "22px", fontWeight: "700", marginTop: "6px" }}>{deviceName} Analytics</h2>
                            {isOffline && tsDurationLabel && (
                                <p className="text-sm font-bold text-red-500 m-0 animate-in fade-in slide-in-from-top-1 duration-500">{tsDurationLabel}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pb-1">
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all duration-300 text-white ${isOffline ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full bg-white ${!isOffline && 'animate-pulse'}`} />
                                {isOffline ? 'Offline' : 'Live'}
                            </div>
                            <button onClick={() => refetch()} disabled={analyticsFetching} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm ${analyticsFetching ? 'bg-gray-100 text-gray-400' : 'bg-[#0077ff] text-white'}`}>
                                <span className={`material-icons ${analyticsFetching && 'animate-spin'}`} style={{ fontSize: '14px' }}>{analyticsFetching ? 'sync' : 'refresh'}</span>
                                {analyticsFetching ? 'Refreshing...' : 'Refresh'}
                            </button>
                            <button onClick={() => setShowNodeInfo(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE] text-white rounded-full text-[11px] font-bold uppercase shadow-sm"><Info size={12} /> Info</button>
                            <button onClick={() => setShowParams(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB340] text-amber-900 rounded-full text-[11px] font-bold uppercase shadow-sm"><Settings size={12} /> Parameters</button>
                            {user?.role === 'superadmin' && <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] text-white rounded-full text-[11px] font-bold uppercase shadow-sm"><span className="material-icons" style={{ fontSize: '14px' }}>delete_forever</span> Delete</button>}
                        </div>
                    </div>

                    {showParams && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20 bg-black/30 backdrop-blur-sm" onClick={() => setShowParams(false)}>
                            <div className="rounded-2xl p-6 flex flex-col w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--card-border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold">Tank Configuration</h3>
                                    <button onClick={() => setShowParams(false)} className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center font-bold">&times;</button>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    {['lengthM', 'breadthM', 'heightM', 'deadBandM'].map((f: any) => (
                                        <div key={f} className="rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                                            <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{f.replace('M', '')}</p>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                <input type="number" step="0.1" value={(localCfg as any)[f]} onChange={e => patch({ [f]: parseFloat(e.target.value) || 0 })} className="w-full font-bold text-sm bg-transparent border-none outline-none" />
                                                <span className="text-sm font-bold">m</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-xl p-4 mb-5 border border-[var(--card-border)] bg-[var(--card-bg)]">
                                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Estimated Capacity</p>
                                    <p className="text-2xl font-black">{formatVolume(computeCapacityLitres({ ...localCfg, tankShape: localCfg.tankShape }))}</p>
                                </div>
                                <div className="flex gap-3">
                                    {user?.role === "superadmin" && <button onClick={handleSave} disabled={!cfgDirty || saving} className="flex-1 py-3 rounded-2xl bg-[#3A7AFE] text-white font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>}
                                    <button onClick={() => setShowParams(false)} className="flex-1 py-3 rounded-2xl border font-semibold">Close</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch w-full">
                        <div className="flex flex-col gap-4 w-full">
                            {(showTankLevelParam || showVolumeParam) && (
                                <div className="apple-glass-card rounded-[2.5rem] p-5 flex flex-col relative overflow-hidden h-full">
                                    <div className="flex justify-between items-center mb-2 z-10 w-full">
                                        <h3 className="text-xl font-semibold m-0">{deviceName}</h3>
                                    </div>
                                    <div className="flex items-center justify-center py-4 z-10">
                                        <div className="relative" style={{ width: 160, height: 220 }}>
                                            <div className="absolute inset-0 rounded-[40px] border-[2.5px] border-white/20 overflow-hidden bg-blue-50/10 shadow-inner">
                                                <div className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-in-out bg-gradient-to-t from-blue-700 via-blue-500 to-blue-400" style={{ height: `${pct}%` }}>
                                                    <div className="absolute top-0 w-[200%] h-4 bg-white/20 animate-wave opacity-50" />
                                                    {pct > 15 && <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-white font-black text-3xl drop-shadow-md">{Math.round(pct)}%</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-auto">
                                        <div className="p-3 rounded-xl bg-black/5 border border-black/5">
                                            <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Total</p>
                                            <p className="text-lg font-black">{Math.round(metrics.capacityLitres).toLocaleString()} L</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                            <p className="text-[10px] font-bold uppercase text-blue-500">Current</p>
                                            <p className="text-lg font-black text-blue-700">{Math.round(smoothedLatestPoint?.volume ?? metrics.volumeLitres).toLocaleString()} L</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {showEstimationsParam && (
                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="apple-glass-card p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10">
                                        <Timer size={16} className="text-orange-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Time to Empty</p>
                                        <p className="text-lg font-black text-orange-600">{waterAnalytics.estimatedEmptyTimeMinutes ? `${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes/60)}h ${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes%60)}m` : '--'}</p>
                                    </div>
                                    <div className="apple-glass-card p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                                        <Droplets size={16} className="text-blue-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Time to Full</p>
                                        <p className="text-lg font-black text-blue-600">{waterAnalytics.estimatedFullTimeMinutes ? `${Math.floor(waterAnalytics.estimatedFullTimeMinutes/60)}h ${Math.floor(waterAnalytics.estimatedFullTimeMinutes%60)}m` : '--'}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-2 flex flex-col gap-4">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {showFillRateParam && (
                                    <div className="apple-glass-card p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                        <TrendingUp size={16} className="text-green-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Fill Rate</p>
                                        <p className="text-2xl font-black text-green-600">+{waterAnalytics.fillRateLpm.toFixed(0)} <small className="text-xs">L/m</small></p>
                                    </div>
                                )}
                                {showConsumptionParam && (
                                    <div className="apple-glass-card p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                        <TrendingDown size={16} className="text-red-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Drain Rate</p>
                                        <p className="text-2xl font-black text-red-600">-{Math.abs(waterAnalytics.drainRateLpm).toFixed(0)} <small className="text-xs">L/m</small></p>
                                    </div>
                                )}
                                {showAlertsParam && (
                                    <div className="apple-glass-card p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                        <Bell size={16} className="text-purple-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Alerts</p>
                                        <p className="text-2xl font-black text-purple-600">{waterAnalytics.alerts.activeCount}</p>
                                    </div>
                                )}
                                {showDeviceHealthParam && (
                                    <div className="apple-glass-card p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                        <Wifi size={16} className="text-blue-500 mb-2" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Health</p>
                                        <p className="text-2xl font-black text-blue-600">{waterAnalytics.deviceHealth.status}</p>
                                    </div>
                                )}
                            </div>

                            <div className="apple-glass-card rounded-[2.5rem] p-6 flex-grow bg-[var(--card-bg)] border border-[var(--card-border)]">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-lg font-bold">Tank Level & Volume</h2>
                                    <div className="flex gap-2 p-1 bg-black/5 rounded-full">
                                        {['24H', '1W', '1M'].map(r => (
                                            <button key={r} onClick={() => setTankChartRange(r as any)} className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${tankChartRange === r ? 'bg-white text-black shadow-sm' : 'text-gray-500'}`}>{r}</button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ height: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={filteredChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                            <XAxis 
                                                dataKey="_ms" 
                                                type="number"
                                                domain={['dataMin', 'dataMax']}
                                                ticks={chartTimeTicks}
                                                tickFormatter={(ms) => {
                                                    const d = new Date(ms);
                                                    if (tankChartRange === '24H') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                    if (tankChartRange === '1W') return d.toLocaleDateString([], { weekday: 'short' });
                                                    if (tankChartRange === '1M') {
                                                        const firstMs = filteredChartData[0]?._ms || 0;
                                                        const weekNum = Math.floor((ms - firstMs) / (7 * 24 * 60 * 60 * 1000)) + 1;
                                                        return `Week ${weekNum}`;
                                                    }
                                                    return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
                                                }}
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 10 }} 
                                            />
                                            <YAxis yAxisId="left" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
                                            <Tooltip content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                return (
                                                    <div className="bg-white p-3 rounded-xl shadow-xl border text-xs font-bold">
                                                        <p className="mb-1 text-gray-400">{payload[0].payload.time}</p>
                                                        {payload.map((e: any) => <p key={e.name} style={{ color: e.color }}>{e.name}: {e.value.toFixed(1)}{e.name.includes('%') ? '%' : ' L'}</p>)}
                                                    </div>
                                                );
                                            }} />
                                            <Area yAxisId="left" type="monotone" name="Level %" dataKey="level" stroke="#0A84FF" fill="#0A84FF20" strokeWidth={2} dot={false} connectNulls={false} />
                                            <Area yAxisId="right" type="monotone" name="Volume" dataKey="volume" stroke="#FF9500" fill="#FF950020" strokeWidth={2} dot={false} connectNulls={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {showNodeInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20 bg-black/30 backdrop-blur-sm" onClick={() => setShowNodeInfo(false)}>
                    <div className="rounded-2xl p-6 flex flex-col w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--card-border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[17px] font-bold">Node Information</h3>
                            <button onClick={() => setShowNodeInfo(false)} className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center font-bold">&times;</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-xl bg-black/5">
                                <p className="text-[10px] font-bold uppercase text-slate-400">ID</p>
                                <p className="text-sm font-bold truncate">{hardwareId}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/5">
                                <p className="text-[10px] font-bold uppercase text-slate-400">Type</p>
                                <p className="text-sm font-bold">EvaraTank</p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/5">
                                <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
                                <p className="text-sm font-bold">{deviceInfo?.location_name || deviceInfo?.zone_name || 'N/A'}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/5">
                                <p className="text-[10px] font-bold uppercase text-slate-400">Last Seen</p>
                                <p className="text-xs font-bold">{tsIstLabel || 'Unknown'}</p>
                            </div>
                        </div>
                        <button onClick={() => setShowNodeInfo(false)} className="w-full py-3 rounded-2xl bg-slate-100 font-bold">Close</button>
                    </div>
                </div>
            )}

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-[var(--bg-secondary)] p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span></div>
                        <h3 className="text-xl font-bold mb-2">Delete Node?</h3>
                        <p className="text-sm text-gray-500 mb-8">This action cannot be undone.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleDelete} className="py-3 rounded-2xl bg-red-600 text-white font-bold">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="py-3 rounded-2xl font-bold">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EvaraTankAnalytics;
