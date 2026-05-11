import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin';
import { useTenancy } from '../../context/TenancyContext';
import { Globe, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlanBadge } from './UsageMeter';

const DistributorSelector = () => {
    const { selectedDistributorId, setSelectedDistributorId } = useTenancy();
    const [isOpen, setIsOpen] = React.useState(false);

    const { data: distributors = [] } = useQuery({
        queryKey: ['admin_distributors'],
        queryFn: () => adminService.getDistributors()
    });

    const activeDistributor = distributors.find((d: any) => d.id === selectedDistributorId);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-full apple-glass-inner border border-white/40 text-[13px] font-bold text-slate-700 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/10 transition-all shadow-sm"
            >
                <Globe size={16} className="text-indigo-500" />
                <span className="max-w-[120px] truncate">
                    {activeDistributor?.name || 'All Distributors'}
                </span>
                {activeDistributor?.plan && (
                    <PlanBadge planName={activeDistributor.plan.name} />
                )}
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-[100]"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full mt-2 left-0 w-[280px] bg-white/90 backdrop-blur-xl rounded-[24px] border border-white/60 shadow-2xl p-2 z-[101] overflow-hidden"
                        >
                            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                                <button
                                    onClick={() => {
                                        setSelectedDistributorId(null);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 rounded-2xl text-[13px] font-bold transition-all mb-1 ${!selectedDistributorId ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'}`}
                                >
                                    🌍 All Distributors (Global)
                                </button>
                                {distributors.map((d: any) => (
                                    <button
                                        key={d.id}
                                        onClick={() => {
                                            setSelectedDistributorId(d.id);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold transition-all mb-1 ${selectedDistributorId === d.id ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'}`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span>🏢</span>
                                            <span className="truncate">{d.name}</span>
                                        </div>
                                        {d.plan && <PlanBadge planName={d.plan.name} />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DistributorSelector;
