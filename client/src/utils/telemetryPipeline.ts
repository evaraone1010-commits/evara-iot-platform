import { computeDeviceStatus } from '../services/DeviceService';

export const computeOnlineStatus = (lastSeen: string | null): 'Online' | 'Offline' => {
    return computeDeviceStatus(lastSeen);
};

/**
 * RAW Authoritative Level Resolver
 * Strictly prefers backend-calculated level_percentage.
 */
import { computeTankMetrics } from './tankCalculations';
import type { TankDimensions } from './tankCalculations';

export const getTankLevel = (node: any, snap: any): number => {
    // 1. Trust pure backend field first (snapshot from telemetryWorker or nodesController)
    const pct = snap?.level_percentage ?? snap?.Level ?? snap?.level ?? 
              node?.telemetry_snapshot?.level_percentage ?? 
              node?.last_telemetry?.level_percentage ?? 
              node?.last_telemetry?.Level;
    
    if (typeof pct === 'number' && !isNaN(pct)) {
        return Math.max(0, Math.min(100, pct));
    }

    // 2. RAW Fallback using unified computeTankMetrics
    const rawSource = snap?.raw_data || snap?.data || snap || node?.last_telemetry || {};
    const mapping = node?.sensor_field_mapping || {};
    const fieldKey = Object.keys(mapping).find(k => mapping[k]?.includes("water_level")) || 
                     (rawSource.field2 !== undefined ? "field2" : "field1");
    
    const distanceVal = rawSource[fieldKey];
    const sensorCm = (distanceVal !== undefined && distanceVal !== null) ? parseFloat(String(distanceVal)) : null;
    
    const dims: TankDimensions = {
        tankShape: node?.tank_shape || node?.configuration?.tank_shape || 'rectangular',
        heightM: node?.configuration?.depth || node?.height_m || node?.depth || 1.2,
        lengthM: node?.configuration?.length_m || node?.length_m || 2.0,
        breadthM: node?.configuration?.breadth_m || node?.breadth_m || 2.0,
        radiusM: node?.configuration?.radius_m || node?.radius_m || 0.6,
        deadBandM: node?.configuration?.dead_band_m || node?.dead_band_m || 0,
        capacityOverrideLitres: node?.configuration?.capacity_liters || node?.capacity || node?.capacity_liters || null
    };

    const metrics = computeTankMetrics({ sensorReadingCm: sensorCm, dims });
    return metrics.percentage;
};

/**
 * ─── RAW PASS-THROUGH ───
 * All client-side signal processing (Kalman filters, etc.) has been removed 
 * to achieve absolute parity with the raw sensor stream.
 */
export const smoothData = (feeds: any[]): any[] => {
    return feeds || []; 
};
