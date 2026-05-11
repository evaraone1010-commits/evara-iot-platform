/**
 * Reusable stat card used across Dashboard.tsx.
 * Replaces 4 near-identical stat card JSX blocks.
 */
import type { LucideIcon } from 'lucide-react';

interface Props {
    label: string;
    value: string | number;
    icon: LucideIcon;
    iconBg: string;      // e.g. "bg-blue-50"
    iconColor: string;   // e.g. "text-blue-600"
    footer?: React.ReactNode;
}

export const DashboardStatCard = ({ label, value, icon: Icon, iconBg, iconColor, footer }: Props) => (
    <div className="apple-glass-card backdrop-blur-md p-6 rounded-2xl shadow-sm border border-white/50 flex flex-col justify-between hover:shadow-md transition-all duration-300">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                <h2 className="text-3xl font-bold text-slate-800">{value}</h2>
            </div>
            <div className={`p-3 ${iconBg} ${iconColor} rounded-xl`}>
                <Icon className="w-5 h-5" />
            </div>
        </div>
        {footer && <div className="mt-4">{footer}</div>}
    </div>
);

export default DashboardStatCard;
