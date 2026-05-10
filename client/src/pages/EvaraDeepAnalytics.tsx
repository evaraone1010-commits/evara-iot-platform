import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { DeepConfig } from '../hooks/useDeviceConfig';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, Info, Settings, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface TelemetryPayload {
    timestamp: string;
    data: Record<string, string | number>;
}

const EvaraDeepAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    if (!hardwareId) return <Navigate to="/nodes" replace />;

    const [timeRange, setTimeRange] = useState<'1H' | '24H' | '7D' | '30D'>('24H');
    const [fieldDepth, setFieldDepth] = useState('field1');
    const [boreDepthInput, setBoreDepthInput] = useState('200');
    const [pumpDepthInput, setPumpDepthInput] = useState('180');
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [showParams, setShowParams] = useState(false);

    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isFetching: analyticsFetching,
        refetch,
    } = useDeviceAnalytics(hardwareId);

    useEffect(() => {
        if (hardwareId) refetch();
    }, [hardwareId, refetch]);

    const deviceConfig = ('config' in (unifiedData?.config ?? {}) ? (unifiedData!.config as any).config : undefined) as DeepConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest) ? unifiedData.latest : undefined) as TelemetryPayload | undefined;
    const deviceInfo = ('data' in (unifiedData?.info ?? {}) ? (unifiedData!.info as any).data : undefined) as NodeInfoData | undefined;
    const historyFeeds = (unifiedData?.history as any)?.feeds || [];

    const snapshotTs = telemetryData?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const historyLastTs = historyFeeds.length > 0 ? (historyFeeds[historyFeeds.length - 1].timestamp || historyFeeds[historyFeeds.length - 1].created_at) : null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen ?? historyLastTs;
    const onlineStatus = computeOnlineStatus(bestTimestamp);
    const isOffline = onlineStatus === 'Offline';

    const { tsIstLabel, tsDurationLabel } = useMemo(() => {
        if (!bestTimestamp) return { tsIstLabel: '', tsDurationLabel: isOffline ? 'Device offline - Last seen unknown' : '' };
        
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
        if (lastSeenDate.getTime() === 0) return { tsIstLabel: '', tsDurationLabel: isOffline ? 'Device offline - Last seen unknown' : '' };

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

    useEffect(() => {
        if (!deviceConfig) return;
        if (deviceConfig.depth_field) setFieldDepth(deviceConfig.depth_field);
        if (deviceConfig.total_bore_depth) setBoreDepthInput(String(deviceConfig.total_bore_depth));
        if (deviceConfig.static_water_level) setPumpDepthInput(String(deviceConfig.static_water_level));
    }, [deviceConfig]);

    const totalBoreDepth = useMemo(() => {
        const val = parseFloat(boreDepthInput);
        return isNaN(val) || val <= 0 ? 200 : val;
    }, [boreDepthInput]);

    const depthHistory = useMemo(() => {
        return historyFeeds.map((feed: any) => {
            const d = new Date(feed.created_at);
            const label = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            const raw = parseFloat(feed[fieldDepth] as string) || 40;
            const measured = Math.min(120 + (raw % 40), totalBoreDepth - 5);
            return { label, measured, waterCol: totalBoreDepth - measured };
        });
    }, [historyFeeds, fieldDepth, totalBoreDepth]);

    const measuredDepth = useMemo(() => {
        if (telemetryData?.data) {
            const raw = parseFloat(String(telemetryData.data[fieldDepth] ?? ''));
            if (!isNaN(raw)) return Math.min(120 + (raw % 40), totalBoreDepth - 5);
        }
        return depthHistory.length > 0 ? depthHistory[depthHistory.length - 1].measured : totalBoreDepth * 0.7;
    }, [telemetryData, fieldDepth, totalBoreDepth, depthHistory]);

    const waterColumn = Math.max(0, totalBoreDepth - measuredDepth);
    const storagePercent = Math.round((waterColumn / totalBoreDepth) * 100);
    const waterFillPct = Math.min((waterColumn / totalBoreDepth) * 100, 100);
    const pumpDepthNum = parseFloat(pumpDepthInput) || 180;

    const handleSave = useCallback(async () => {
        try {
            await api.put(`/admin/nodes/${hardwareId}`, {
                depth_field: fieldDepth,
                total_bore_depth: parseFloat(boreDepthInput),
                static_water_level: parseFloat(pumpDepthInput),
            });
            await queryClient.invalidateQueries({ queryKey: ['device-config', hardwareId] });
            setShowParams(false);
        } catch (e) { console.error('Save failed', e); }
    }, [hardwareId, fieldDepth, boreDepthInput, pumpDepthInput, queryClient]);

    const handleDelete = async () => {
        setIsDeleting(true);
        try { await api.delete(`/admin/nodes/${hardwareId}`); navigate('/nodes'); }
        catch (err) { setIsDeleting(false); setShowDeleteConfirm(false); }
    };

    if (analyticsLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

    const deviceName = deviceInfo?.name ?? 'Borewell';

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: 'var(--text-primary)' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1440px] mx-auto flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] bg-transparent border-none cursor-pointer p-0">Home</button>
                                <span className="material-icons" style={{ fontSize: '16px' }}>chevron_right</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] bg-transparent border-none cursor-pointer p-0">All Nodes</button>
                                <span className="material-icons" style={{ fontSize: '16px' }}>chevron_right</span>
                                <span className="font-bold">{deviceName}</span>
                            </nav>
                            <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '6px' }}>{deviceName} Analytics</h2>
                            {isOffline && tsDurationLabel && (
                                <p className="text-sm font-bold text-red-500 m-0 animate-in fade-in slide-in-from-top-1 duration-500">{tsDurationLabel}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pb-1">
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm border-none text-white ${isOffline ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full bg-white ${!isOffline && 'animate-pulse'}`} />
                                {isOffline ? 'Offline' : 'Live'}
                            </div>
                            <button onClick={() => refetch()} disabled={analyticsFetching} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm ${analyticsFetching ? 'bg-gray-100 text-gray-400' : 'bg-[#0077ff] text-white'}`}>
                                <RefreshCw size={12} className={clsx('stroke-[2.5px]', analyticsFetching && 'animate-spin')} />
                                {analyticsFetching ? 'Refreshing...' : 'Refresh'}
                            </button>
                            <button onClick={() => setShowNodeInfo(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE] text-white rounded-full text-[11px] font-bold uppercase shadow-sm"><Info size={12} /> Info</button>
                            <button onClick={() => setShowParams(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB340] text-amber-900 rounded-full text-[11px] font-bold uppercase shadow-sm"><Settings size={12} /> Parameters</button>
                            {user?.role === 'superadmin' && <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30] text-white rounded-full text-[11px] font-bold uppercase shadow-sm"><Trash2 size={12} /> Delete</button>}
                        </div>
                    </div>

                    <div className="grid gap-[1rem] w-full lg:grid-cols-3">
                        <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col items-center gap-4 relative">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live Cross-Section</p>
                            <div className="relative w-full max-w-[180px] h-[380px] rounded-2xl overflow-hidden border border-[var(--card-border)] bg-slate-100">
                                <div className="absolute inset-0 flex flex-col">
                                    <div className="h-[15%] bg-amber-900/40" /><div className="h-[25%] bg-amber-800/30" /><div className="h-[60%] bg-slate-700/20" />
                                </div>
                                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-10 bg-white/80 border-x border-black/5 shadow-inner flex flex-col justify-end">
                                    <div className="w-full transition-all duration-1000 bg-blue-500/60 border-t-2 border-blue-400" style={{ height: `${waterFillPct}%` }} />
                                    <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ bottom: `${(pumpDepthNum / totalBoreDepth) * 100}%` }}>
                                        <div className="w-0.5 h-10 bg-slate-600" />
                                        <div className="w-4 h-10 bg-slate-400 rounded-sm border shadow-sm" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col gap-4 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Intelligence</p>
                            {[{ l: 'Water Column', v: `${waterColumn.toFixed(1)} m`, c: '#3b82f6' }, { l: 'Storage', v: `${storagePercent}%`, c: '#0077ff' }, { l: 'Measured', v: `${measuredDepth.toFixed(0)} m`, c: '#64748b' }].map(m => (
                                <div key={m.l} className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{m.l}</p>
                                    <p className="text-3xl font-black" style={{ color: m.c }}>{m.v}</p>
                                </div>
                            ))}
                        </div>

                        <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col gap-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Current Values</p>
                            <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Last Update</p>
                                <p className="text-sm font-bold">{tsIstLabel || 'Never'}</p>
                            </div>
                            <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Status</p>
                                <p className={clsx("text-sm font-bold", isOffline ? "text-red-500" : "text-green-500")}>{isOffline ? 'Device Offline' : 'Live Monitoring'}</p>
                            </div>
                            <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Measured Depth</p>
                                <p className="text-sm font-bold">{measuredDepth.toFixed(2)} meters</p>
                            </div>
                        </div>
                    </div>

                    <div className="apple-glass-card rounded-[2.5rem] p-8 bg-[var(--card-bg)] border border-[var(--card-border)]">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-bold">Historical Trend</h3>
                            <div className="flex gap-1 p-1 bg-black/5 rounded-full">
                                {['1H', '24H', '7D', '30D'].map(r => <button key={r} onClick={() => setTimeRange(r as any)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${timeRange === r ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>{r}</button>)}
                            </div>
                        </div>
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={depthHistory.slice(-50)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="m" />
                                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }} />
                                    <Area type="monotone" dataKey="waterCol" stroke="#3A7AFE" strokeWidth={2} fill="#3A7AFE20" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </main>

            {/* Params Modal */}
            {showParams && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20 bg-black/30 backdrop-blur-sm" onClick={() => setShowParams(false)}>
                    <div className="rounded-2xl p-6 flex flex-col w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--card-border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[17px] font-bold">Deep Configuration</h3>
                            <button onClick={() => setShowParams(false)} className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center font-bold">&times;</button>
                        </div>
                        <div className="flex flex-col gap-4 mb-6">
                            <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                <label className="text-[10px] font-bold uppercase text-slate-400">Depth Field Mapping</label>
                                <select value={fieldDepth} onChange={e => setFieldDepth(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-black/5 border-none text-sm font-bold">
                                    {['field1', 'field2', 'field3', 'field4'].map(f => <option key={f} value={f}>Field {f.slice(-1)}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Total Depth (m)</label>
                                    <input type="number" value={boreDepthInput} onChange={e => setBoreDepthInput(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-black/5 border-none text-sm font-bold" />
                                </div>
                                <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Pump Level (m)</label>
                                    <input type="number" value={pumpDepthInput} onChange={e => setPumpDepthInput(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-black/5 border-none text-sm font-bold" />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {user?.role === 'superadmin' && <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-blue-500 text-white font-bold">Save Config</button>}
                            <button onClick={() => setShowParams(false)} className="flex-1 py-3 rounded-2xl border font-bold">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Node Info Modal */}
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
                                <p className="text-sm font-bold">EvaraDeep</p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/5">
                                <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
                                <p className="text-sm font-bold">{deviceInfo?.location_name || 'N/A'}</p>
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

            {/* Delete Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={32} /></div>
                        <h3 className="text-xl font-bold mb-2">Delete Node?</h3>
                        <p className="text-sm text-gray-500 mb-8">This will permanently remove <strong>{deviceName}</strong> and all its telemetry data. This action cannot be undone.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleDelete} className="py-3 rounded-2xl bg-red-600 text-white font-bold">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="py-3 rounded-2xl font-bold text-gray-500">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EvaraDeepAnalytics;
