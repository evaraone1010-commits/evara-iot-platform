import React from 'react';
import clsx from 'clsx';

interface KPIAuthoritativeCardProps {
    total: number;
    online: number;
    offline: number;
    className?: string;
}

export const KPIAuthoritativeCard = ({
    total,
    online,
    offline,
    className
}: KPIAuthoritativeCardProps) => {
    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] flex flex-col justify-between h-full", className)}>
            <div className="flex justify-between items-start">
                <span className="text-[12px] font-[800] text-[var(--text-muted)] uppercase tracking-[0.1em]">Total Devices</span>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="icon-stroke-adaptive">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
            </div>
            <h2 className="text-[36px] font-[800] text-[var(--text-primary)] leading-none tracking-tight">{total.toLocaleString()}</h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A] shadow-[0_0_8px_rgba(22,163,74,0.4)]" />
                    <span className="text-[10px] font-[800] text-[var(--text-muted)]">{online} Online</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#E5484D] shadow-[0_0_8px_rgba(229,72,77,0.4)]" />
                    <span className="text-[10px] font-[800] text-[var(--text-muted)]">{offline} Offline</span>
                </div>
            </div>
        </div>
    );
};

export default React.memo(KPIAuthoritativeCard);
