import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export interface DeepConfig {
    depth_field: string;
    total_bore_depth: number;
    static_water_level: number;
    [key: string]: any;
}

export type TankShape = 'rectangular' | 'sump' | 'cylindrical';

export interface TankConfig {
    thingspeak_channel_id?: string;
    tank_shape?: TankShape;
    height_m?: number;
    length_m?: number;
    breadth_m?: number;
    radius_m?: number;
    dead_band_m?: number;
    capacity_liters?: number | null;
    water_level_field?: string;
    temperature_field?: string;
    [key: string]: any;
}

export interface FlowConfig {
    thingspeak_channel_id?: string;
    max_flow_rate?: number;
    meter_reading_field?: string;
    flow_rate_field?: string;
    [key: string]: any;
}

export const useDeviceConfig = (deviceId: string) => {
    return useQuery({
        queryKey: ['device-config', deviceId],
        queryFn: async () => {
            if (!deviceId) return null;
            const { data } = await api.get(`/telemetry/devices/${deviceId}/config`);
            return data;
        },
        enabled: !!deviceId,
    });
};
