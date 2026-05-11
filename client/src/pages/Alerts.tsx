import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  adminService,
  type AlertRule,
  type AlertHistory,
} from "../services/admin";
import { useNodes } from "../hooks/useNodes";

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertHistory[]>([]);
  const { nodes } = useNodes();

  // New Rule Form State
  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AlertRule>>({
    condition: ">",
    enabled: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rulesData, alertsData] = await Promise.all([
        adminService.getAlertRules(),
        adminService.getActiveAlerts(),
      ]);
      setRules(rulesData);
      setActiveAlerts(alertsData);
    } catch (err: any) {
      console.error("Failed to fetch alerts data", err);
    } finally {
      /* empty */
    }
  };

  const handleCreateRule = async () => {
    if (
      !newRule.name ||
      !newRule.node_id ||
      !newRule.metric ||
      !newRule.threshold
    ) {
      alert("Please fill all fields");
      return;
    }
    try {
      await adminService.createAlertRule(newRule as Omit<AlertRule, "id">);
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      console.error("Failed to create rule", err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await adminService.deleteAlertRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      console.error("Failed to delete rule", err);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Active Alerts Section */}
      <div className="apple-glass-card rounded-2xl shadow-sm border border-red-500/20 overflow-hidden">
        <div className="p-6 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <h2 className="text-lg font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Active Alerts
          </h2>
          <span className="bg-red-500/20 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
            {activeAlerts.length}
          </span>
        </div>
        <div className="divide-y divide-red-500/10">
          {activeAlerts.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
              No active alerts (Safe Condition)
            </div>
          ) : (
            activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <div>
                  <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {alert.rule.name}
                  </h4>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Value:{" "}
                    <span className="font-mono font-bold text-red-600">
                      {alert.value_at_time}
                    </span>{" "}
                    (Threshold: {alert.rule.condition} {alert.rule.threshold})
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-red-500 uppercase tracking-wide">
                    Critical
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(alert.triggered_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rules Management Section */}
        <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Alert Rules</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Rule
          </button>
        </div>

        {showForm && (
          <div className="apple-glass-card p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm mb-6 animate-in slide-in-from-top-4">
            <h3 className="text-sm font-bold uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
              Define Notification Logic
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <input
                placeholder="Rule Name (e.g. Tank 1 Low Level)"
                className="p-2 border rounded-lg bg-transparent border-slate-200 dark:border-white/20 text-[var(--text-primary)]"
                onChange={(e) =>
                  setNewRule({ ...newRule, name: e.target.value })
                }
              />
              <select
                className="p-2 border rounded-lg bg-transparent border-slate-200 dark:border-white/20 text-[var(--text-primary)]"
                onChange={(e) =>
                  setNewRule({ ...newRule, node_id: e.target.value })
                }
              >
                <option value="">Select Node...</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label || n.id}
                  </option>
                ))}
              </select>
              <input
                placeholder="Metric key (e.g. level, temp)"
                className="p-2 border rounded-lg bg-transparent border-slate-200 dark:border-white/20 text-[var(--text-primary)]"
                onChange={(e) =>
                  setNewRule({ ...newRule, metric: e.target.value })
                }
              />
              <div className="flex gap-2">
                <select
                  className="p-2 border rounded-lg bg-transparent border-slate-200 dark:border-white/20 text-[var(--text-primary)]"
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      condition: e.target.value as ">" | "<" | "==",
                    })
                  }
                >
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="==">=</option>
                </select>
                <input
                  type="number"
                  placeholder="Threshold"
                  className="p-2 border rounded-lg w-full bg-transparent border-slate-200 dark:border-white/20 text-[var(--text-primary)]"
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      threshold: Number(e.target.value),
                    })
                  }
                />
              </div>
              <button
                onClick={handleCreateRule}
                className="bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                Save Rule
              </button>
            </div>
          </div>
        )}

        <div className="apple-glass-card rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-left">
            <thead className="apple-glass-inner border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="p-4 text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                  Rule Name
                </th>
                <th className="p-4 text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                  Conditions
                </th>
                <th className="p-4 text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                  Target Node
                </th>
                <th className="p-4 text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                  Status
                </th>
                <th className="p-4 text-xs font-bold uppercase text-right" style={{ color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="hover:bg-white/30 transition-colors"
                >
                  <td className="p-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {rule.name}
                  </td>
                  <td className="p-4 font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
                    {rule.metric}{" "}
                    <span className="text-blue-600 font-bold">
                      {rule.condition}
                    </span>{" "}
                    {rule.threshold}
                  </td>
                  <td className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>{rule.node_id}</td>
                  <td className="p-4">
                    {rule.enabled ? (
                      <span className="text-xs font-bold text-green-600 bg-green-500/10 px-2 py-1 rounded-full flex w-fit items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-gray-400 bg-gray-500/10 px-2 py-1 rounded-full flex w-fit items-center gap-1">
                        <XCircle className="w-3 h-3" /> Disabled
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center italic"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No rules defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
