import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { getDeviceAnalyticsRoute } from '../../utils/deviceRouting';
import { useRealtimeTelemetry } from '../../hooks/useRealtimeTelemetry';

type NodeType = 'tank' | 'flow' | 'deep';

interface NodeData {
    id: string;
    firestore_id: string;
    name: string;
    type: NodeType;
    status: 'Online' | 'Offline';
    isStale: boolean;
    lastSeen?: string;
    metrics: Record<string, any>;
    location?: string;
    device?: string;
}

// ─── Sub-component for individual Node Cards ──────────────────────────────
const NodeExplorerItem = ({ node }: { node: NodeData }) => {
    const navigate = useNavigate();
    const { telemetry: snap } = useRealtimeTelemetry(node.firestore_id);
    const isTank = node.type === 'tank';
    
    // Percentage calculation for tanks - synchronized from backend
    // Priority: 1) Backend telemetry_snapshot 2) Real-time telemetry 3) Node data 4) Calculate from fields
    let pct = 0;
    
    // First, try to get from node's telemetry_snapshot (comes from backend sync)
    if (node.telemetry_snapshot?.level_percentage !== undefined) {
        pct = node.telemetry_snapshot.level_percentage;
    }
    // Then try real-time telemetry
    else if (snap?.level_percentage !== undefined) {
        pct = snap.level_percentage;
    }
    // Then try stored metrics
    else if (node.metrics?.Level !== undefined) {
        pct = node.metrics.Level;
    }
    // Finally, calculate from sensor fields if needed
    else if (snap && isTank) {
        const distance = parseFloat(snap.field1 || snap.field2 || snap.water_level_raw_sensor_reading);
        const depth = 1.2; // Default fallback
        if (!isNaN(distance)) {
            const validDistance = Math.min(distance / 100, depth);
            pct = Math.min(100, ((depth - validDistance) / depth) * 100);
        }
    }

    const barColor = pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444";
    const glowColor = pct > 60 ? "rgba(34,197,94,0.3)" : pct > 30 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

    const handleClick = () => {
        navigate(getDeviceAnalyticsRoute({
            id: node.firestore_id,
            hardwareId: node.id,
            analytics_template: node.type === 'tank' ? 'EvaraTank' : node.type === 'flow' ? 'EvaraFlow' : 'EvaraDeep',
        }));
    };

    return (
        <div 
            onClick={handleClick}
            className="apple-glass-inner p-3.5 rounded-[32px] hover:scale-[1.02] transition-all duration-300 border border-white/40 shadow-sm flex flex-col h-auto min-h-[110px] cursor-pointer group hover:shadow-xl hover:bg-white/50"
        >
            <div className="flex justify-between items-start mb-1.5">
                <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-widest">
                    {node.type === 'tank' ? 'EvaraTank' : node.type === 'flow' ? 'EvaraFlow' : 'EvaraDeep'}
                </span>
                <div className="flex items-center gap-1.5">
                    <span className={clsx(
                        "w-2 h-2 rounded-full",
                        node.status === "Online" 
                            ? "bg-[#16A34A] shadow-[0_0_8px_rgba(22,163,74,0.4)]" 
                            : "bg-[#DC2626] shadow-[0_0_8px_rgba(220,38,38,0.4)]"
                    )} />
                    <span className="text-[10px] font-[800] text-gray-500 uppercase tracking-tight">
                        {node.status === "Online" ? "Live" : "Offline"}
                    </span>
                </div>
            </div>
            
            <h4 className="text-[15px] font-extrabold text-gray-800 truncate leading-tight group-hover:text-blue-600 transition-colors">
                {node.name}
            </h4>

            {isTank ? (
                <div className="mt-1.5 text-left">
                    <div className="flex justify-between items-end mb-0">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Water Level</span>
                        <span className="text-[12px] font-black text-gray-800">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="liquid-glass-progress-container !h-2">
                        <div
                            className="liquid-glass-progress-fill"
                            style={{
                                width: `${Math.min(100, Math.max(5, pct))}%`,
                                background: barColor,
                                "--glow-color": glowColor,
                            } as any}
                        >
                            <div className="liquid-glass-progress-waves" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 mt-1.5">
                    {Object.entries(node.metrics).slice(0, 2).map(([key, val]) => (
                        <div key={key} className="flex flex-col">
                            <span className="text-[8px] uppercase font-black text-gray-400 tracking-wider mb-0">{key}</span>
                            <span className="text-[14px] font-bold text-gray-800">{val}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-3 flex items-center gap-1 text-[9px] font-[800] text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300">
                <span>Explore Intelligence</span>
                <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    );
};

// ─── Main Explorer Component ──────────────────────────────────────────────
export const NodeDataExplorer = ({ nodes, className }: { nodes: NodeData[], className?: string }) => {
    const [activeType, setActiveType] = useState<NodeType>('tank');
    const [activeLocation, setActiveLocation] = useState<string>('all');

    const uniqueLocations = Array.from(new Set(nodes.map(n => n.location).filter(Boolean))) as string[];

    const filteredNodes = nodes.filter(n => {
        if (n.type !== activeType) return false;
        if (activeLocation !== 'all' && n.location !== activeLocation) return false;
        return true;
    });

    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] flex flex-col", className)}>
            {/* Filters removed as per user request */}

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-5 pb-4">
                    {filteredNodes.length > 0 ? filteredNodes.map((node) => (
                        <NodeExplorerItem key={node.id} node={node} />
                    )) : (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20 italic text-gray-500">
                            <Search size={40} className="mb-3" />
                            <span className="font-black uppercase tracking-widest text-[14px]">No Nodes Found</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NodeDataExplorer;
