import React from 'react';
import { motion } from 'framer-motion';

interface PlanBadgeProps {
    planName: string;
}

export const PlanBadge: React.FC<PlanBadgeProps> = ({ planName }) => {
    const colors: Record<string, string> = {
        'base': 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
        'plus': 'bg-blue-50 text-blue-600 border-blue-100',
        'pro': 'bg-indigo-50 text-indigo-600 border-indigo-100',
        'enterprise': 'bg-purple-50 text-purple-600 border-purple-100'
    };

    const colorClass = colors[planName.toLowerCase()] || colors.base;

    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
            {planName}
        </span>
    );
};

interface UsageMeterProps {
    current: number;
    max: number;
    label: string;
}

export const UsageMeter: React.FC<UsageMeterProps> = ({ current, max, label }) => {
    const percentage = Math.min((current / max) * 100, 100);
    const isNearLimit = percentage > 80;
    const isExceeded = current >= max;

    return (
        <div className="w-full space-y-1.5">
            <div className="flex justify-between items-end">
                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-tight">{label}</span>
                <span className={`text-[13px] font-black ${isNearLimit ? 'text-rose-500' : 'text-slate-700'}`}>
                    {current} / {max}
                </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className={`h-full rounded-full ${isExceeded ? 'bg-gradient-to-r from-rose-500 to-red-600' :
                            isNearLimit ? 'bg-gradient-to-r from-orange-400 to-rose-500' :
                                'bg-gradient-to-r from-indigo-500 to-blue-600'
                        }`}
                />
            </div>
            {isExceeded && (
                <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1">
                    ⚠️ Plan limit reached. Upgrade required to add more devices.
                </p>
            )}
        </div>
    );
};
