import React from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, Clock } from 'lucide-react';

interface StaleDataBadgeProps {
    isStale: boolean;
    lastSeen?: string;
}

export const StaleDataBadge: React.FC<StaleDataBadgeProps> = ({ isStale, lastSeen }) => {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isStale
                ? 'bg-rose-50 border-rose-100 text-rose-500 shadow-sm'
                : 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm'
            }`}>
            <div className="relative flex items-center justify-center">
                {!isStale && (
                    <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute w-3 h-3 bg-emerald-400 rounded-full"
                    />
                )}
                <div className={`w-2 h-2 rounded-full ${isStale ? 'bg-rose-400' : 'bg-emerald-500'}`} />
            </div>

            <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider">
                {isStale ? (
                    <>
                        <WifiOff size={12} />
                        <span>Offline</span>
                    </>
                ) : (
                    <>
                        <Wifi size={12} />
                        <span>Live</span>
                    </>
                )}
            </div>

            {lastSeen && isStale && (
                <div className="flex items-center gap-1 pl-2 border-l border-rose-200 text-[10px] font-medium opacity-80">
                    <Clock size={10} />
                    <span>{new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            )}
        </div>
    );
};
