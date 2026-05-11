import { Activity } from 'lucide-react';

interface AuditLogEntry {
    id: string;
    action_type: string;
    timestamp: string;
    resource_type: string;
    resource_id?: string;
    metadata?: Record<string, unknown>;
}

interface AuditTimelineProps {
    logs: AuditLogEntry[];
}

export const AuditTimeline = ({ logs }: AuditTimelineProps) => {
    return (
        <div className="apple-glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Administrative Trail</h3>
                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 dark:text-slate-300">LIVE</span>
            </div>
            <div className="p-6">
                <div className="space-y-6">
                    {logs.length > 0 ? logs.map((log, idx) => (
                        <div key={log.id} className="relative flex gap-4 group">
                            {idx !== logs.length - 1 && (
                                <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] apple-glass-inner group-hover:bg-slate-100 transition-colors" />
                            )}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 shadow-sm ${log.action_type === 'PROVISION_NODE' ? 'bg-green-500 text-white' :
                                log.action_type.includes('CUSTOMER') ? 'bg-purple-500 text-white' :
                                    'bg-blue-500 text-white'
                                }`}>
                                <Activity size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate uppercase tracking-tight">
                                        {log.action_type.replace(/_/g, ' ')}
                                    </p>
                                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                    {log.resource_type}: <span className="text-slate-700 font-medium">{(log.metadata?.hardware_id as string) || (log.metadata?.name as string) || (log.metadata?.email as string) || log.resource_id}</span>
                                </p>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-4">
                            <p className="text-xs text-slate-400 italic">No events discovered.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
