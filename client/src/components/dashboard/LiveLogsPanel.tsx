import React from 'react';
import { ScrollText } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface LogEntry {
    id: string;
    device_id: string;
    event_type: string;
    timestamp: string;
    severity: 'critical' | 'warning' | 'info';
    isNew?: boolean;
}

interface LiveLogsPanelProps {
    logs: LogEntry[];
    className?: string;
}

export const LiveLogsPanel = ({
    logs,
    className
}: LiveLogsPanelProps) => {
    const [displayLogs, setDisplayLogs] = useState<LogEntry[]>(logs);

    useEffect(() => {
        // Mark new logs for animation
        const updatedLogs = logs.map((log, idx) => {
            const isExisting = displayLogs.find(l => l.id === log.id);
            return { ...log, isNew: !isExisting && idx === 0 };
        });
        setDisplayLogs(updatedLogs);

        // Remove the isNew flag after animation
        const timer = setTimeout(() => {
            setDisplayLogs(prev => prev.map(l => ({ ...l, isNew: false })));
        }, 3000);

        return () => clearTimeout(timer);
    }, [logs]);

    return (
        <div className={clsx("apple-glass-card p-[24px] rounded-[50px] h-full flex flex-col min-h-[300px]", className)}>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-[600] text-gray-400 uppercase tracking-wider">Live System Logs</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                </div>
                <ScrollText size={16} className="text-gray-400" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {displayLogs.length > 0 ? displayLogs.map((log) => (
                    <div
                        key={log.id}
                        className={clsx(
                            "group flex items-center justify-between p-3 rounded-2xl transition-all duration-500 border border-transparent",
                            log.isNew ? "bg-blue-50/40 border-blue-200/50 scale-[1.02]" : "hover:bg-white/30 hover:border-white/20 hover:shadow-sm"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <span className="font-mono text-[11px] font-bold text-gray-700 w-24 truncate">{log.device_id}</span>
                            <div className="flex flex-col">
                                <span className="text-[12px] font-medium text-gray-800">{log.event_type}</span>
                                <span className="text-[10px] text-gray-400 font-mono italic">{log.timestamp}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className={clsx(
                                "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-tight",
                                log.severity === 'critical' ? "bg-red-50 text-red-500" :
                                    log.severity === 'warning' ? "bg-amber-50 text-amber-600" :
                                        "bg-blue-50 text-blue-500"
                            )}>
                                {log.severity}
                            </span>
                            {log.isNew && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                        </div>
                    </div>
                )) : (
                    <div className="h-full flex flex-center justify-center items-center opacity-40">
                        <span className="text-[13px] italic">Awaiting system events...</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(LiveLogsPanel);
