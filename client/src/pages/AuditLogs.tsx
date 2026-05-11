import { useState, useEffect } from 'react';
import {
    Download, Search, Shield
} from 'lucide-react';
import { getAuditLogs, exportAuditLogs, type AuditLog } from '../services/audit';

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const data = await getAuditLogs();
            setLogs(data);
        } catch (err) {
            console.error("Failed to fetch audit logs", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.user?.email.toLowerCase().includes(search.toLowerCase()) ||
        log.resource_type.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--card-title)] flex items-center gap-2">
                        <Shield className="w-6 h-6 text-blue-500" /> Audit Logs
                    </h1>
                    <p className="text-[var(--card-text-muted)]">Track system activity and security events.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => exportAuditLogs()}
                        className="flex items-center gap-2 px-4 py-2 apple-glass-card border border-[var(--card-border)] rounded-lg text-[var(--card-text)] hover:bg-white/10 dark:hover:bg-white/5 transition-colors shadow-sm"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filters (Basic) */}
            <div className="apple-glass-card p-4 rounded-xl border border-[var(--card-border)] shadow-sm flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--card-text-muted)]" />
                    <input
                        placeholder="Search by action, user, or resource..."
                        className="w-full pl-10 pr-4 py-2 bg-transparent border border-[var(--card-border)] rounded-lg text-[var(--card-text)] placeholder:text-[var(--card-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="apple-glass-card rounded-2xl shadow-sm border border-[var(--card-border)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[var(--card-bg-hover)] border-b border-[var(--card-border)]">
                            <tr>
                                <th className="p-4 text-xs font-bold text-[var(--card-text-muted)] uppercase tracking-wider">Timestamp</th>
                                <th className="p-4 text-xs font-bold text-[var(--card-text-muted)] uppercase tracking-wider">User</th>
                                <th className="p-4 text-xs font-bold text-[var(--card-text-muted)] uppercase tracking-wider">Action</th>
                                <th className="p-4 text-xs font-bold text-[var(--card-text-muted)] uppercase tracking-wider">Resource</th>
                                <th className="p-4 text-xs font-bold text-[var(--card-text-muted)] uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--card-border)]">
                            {loading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading logs...</td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No logs found matching your criteria.</td></tr>
                            ) : (
                                filteredLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-[var(--card-bg-hover)] transition-colors group">
                                        <td className="p-4 text-sm text-[var(--card-text)] whitespace-nowrap font-mono">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-[var(--card-title)]">{log.user?.full_name || 'Unknown'}</div>
                                            <div className="text-xs text-[var(--card-text-muted)]">{log.user?.email}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-blue-500/10 text-blue-500 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-blue-500/20 whitespace-nowrap">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-[var(--card-text)]">
                                            <span className="text-xs text-[var(--card-text-muted)] uppercase mr-1.5">{log.resource_type}:</span>
                                            <span className="font-mono bg-[var(--card-bg-hover)] px-1.5 py-0.5 rounded border border-[var(--card-border)]">{log.resource_id}</span>
                                        </td>
                                        <td className="p-4 text-[11px] text-[var(--card-text-muted)] font-mono max-w-xs truncate" title={log.details ? JSON.stringify(log.details) : ''}>
                                            {log.details ? JSON.stringify(log.details) : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
