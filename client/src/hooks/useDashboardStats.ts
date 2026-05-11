import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export interface DashboardStats {
    total_nodes: number;
    online_nodes: number;
    active_alerts: number;
    system_health: string;
}

export const useDashboardStats = () => {
    return useQuery({
        queryKey: ['dashboard_stats'],
        queryFn: async () => {
            const { data } = await api.get<DashboardStats>('/dashboard/stats');
            return data;
        },
        staleTime: 2000,
        refetchInterval: 300000, // Reduced from 5s to 5m to avoid annoying partial reloads
        retry: 1
    });
};
