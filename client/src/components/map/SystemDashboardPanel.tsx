/**
 * SystemDashboardPanel — the "System Dashboard" overlay on the Home map.
 * Extracted from Home.tsx to reduce component size.
 */
import clsx from 'clsx';
import { LayoutDashboard } from 'lucide-react';
import { isOffline } from '../../utils/mapIcons';
import type { MapDevice } from '../../hooks/useMapDevices';

interface Pipeline {
    id: string;
    name: string;
    positions: [number, number][];
    color: string;
}

interface Props {
    visible: boolean;
    devices: MapDevice[];
    pipelines: Pipeline[];
    devicesLoading: boolean;
}

export const SystemDashboardPanel = ({ visible, devices, pipelines, devicesLoading }: Props) => {
    const offlineCount = devices.filter(d => isOffline(d.status)).length;

    return (
        <div className={clsx(
            "absolute top-[260px] lg:top-[290px] right-4 z-[400] apple-glass-card/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 w-80 transition-all duration-300 origin-top-right overflow-hidden",
            visible ? "opacity-100 scale-100 max-h-[700px]" : "opacity-0 scale-95 max-h-0 pointer-events-none"
        )}>
            <div className="p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <LayoutDashboard size={16} className="text-[var(--color-evara-green)]" /> System Dashboard
                </h3>

                {/* Total Capacity */}
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 mb-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Capacity</div>
                    <div className="text-2xl font-extrabold text-blue-700">-- <span className="text-sm font-bold text-slate-400">Litres</span></div>
                    <div className="text-[10px] text-green-600 font-semibold mt-0.5">Realtime data fetching...</div>
                </div>

                {/* Health Metrics */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-green-50 rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-slate-500">Uptime</div>
                        <div className="text-lg font-extrabold text-green-600">99.8%</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-slate-500">Active Alerts</div>
                        <div className="text-lg font-extrabold text-orange-600">{offlineCount}</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-slate-500">Pipelines</div>
                        <div className="text-lg font-extrabold text-purple-600">{pipelines.length}</div>
                    </div>
                    <div className="bg-cyan-50 rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-slate-500">System Status</div>
                        <div className="text-lg font-extrabold text-cyan-600">{devicesLoading ? 'Loading' : 'Active'}</div>
                    </div>
                </div>

                {/* Pipeline Network */}
                <div className="apple-glass-inner rounded-xl p-3 mb-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Pipeline Network</div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-600">Water Supply Lines</span>
                        <span className="text-xs font-bold text-cyan-600">{pipelines.filter(p => !p.name.includes('PIPE')).length} active</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-600">Borewell Lines</span>
                        <span className="text-xs font-bold text-indigo-600">{pipelines.filter(p => p.name.includes('PIPE')).length} active</span>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="apple-glass-inner rounded-xl p-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Recent Activity</div>
                    <div className="space-y-2">
                        <div className="text-xs text-slate-400 italic">No recent activity detected.</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemDashboardPanel;
