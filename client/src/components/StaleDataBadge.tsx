import React from 'react';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import type { StalenessLevel } from '../hooks/useStaleDataAge';

interface StaleDataBadgeProps {
    timestamp: string | null | undefined;
    className?: string;
}

const COLOR_MAP: Record<StalenessLevel, string> = {
    fresh:   'bg-emerald-100 text-emerald-700 border border-emerald-200',
    warn:    'bg-yellow-100  text-yellow-700  border border-yellow-200',
    stale:   'bg-red-100     text-red-600     border border-red-200',
    unknown: 'bg-slate-100   text-slate-400   border border-slate-200',
};

const DOT_MAP: Record<StalenessLevel, string> = {
    fresh:   'bg-emerald-500',
    warn:    'bg-yellow-500',
    stale:   'bg-red-500',
    unknown: 'bg-slate-400',
};

/**
 * Phase 15 — Stale Data Age Badge
 * Displays a small colour-coded pill showing how old the last reading is.
 * Automatically re-evaluates every 30 s without any props change.
 */
const StaleDataBadge: React.FC<StaleDataBadgeProps> = ({ timestamp, className = '' }) => {
    const { label, level } = useStaleDataAge(timestamp);

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${COLOR_MAP[level]} ${className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[level]}`} />
            {label}
        </span>
    );
};

export default StaleDataBadge;
