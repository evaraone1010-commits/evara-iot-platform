export type TankShape = 'rectangular' | 'sump' | 'cylindrical';

export interface TankDimensions {
    tankShape: TankShape;
    heightM: number;
    lengthM: number;
    breadthM: number;
    radiusM: number;
    deadBandM?: number;
    capacityOverrideLitres: number | null;
}

export const computeCapacityLitres = (dims: TankDimensions): number => {
    if (dims.capacityOverrideLitres && dims.capacityOverrideLitres > 0) {
        return dims.capacityOverrideLitres;
    }

    const deadBandM = dims.deadBandM ?? 0;
    const usableHeightM = Math.max(0, dims.heightM - deadBandM);

    let volumeM3 = 0;
    if (dims.tankShape === 'rectangular' || dims.tankShape === 'sump') {
        volumeM3 = dims.lengthM * dims.breadthM * usableHeightM;
    } else if (dims.tankShape === 'cylindrical') {
        volumeM3 = Math.PI * Math.pow(dims.radiusM, 2) * usableHeightM;
    }

    return volumeM3 * 1000; // 1 m3 = 1000 Litres
};

export const percentageToVolume = (percentage: number, capacityLitres: number): number => {
    return (percentage / 100) * capacityLitres;
};

export const formatVolume = (litres: number): string => {
    if (litres >= 1000) {
        return `${(litres / 1000).toFixed(1)} KL`;
    }
    return `${Math.round(litres)} L`;
};

interface MetricOptions {
    sensorReadingCm: number | null;
    dims: TankDimensions;
}

export const computeTankMetrics = ({ sensorReadingCm, dims }: MetricOptions) => {
    const capacityLitres = computeCapacityLitres(dims);
    
    // The "Source of Truth" Formula:
    // water_level_height = tank_height - raw_sensor_value
    // water_level_percentage = (water_level_height / tank_height) * 100
    // volume = water_level_height * tank_length * tank_breadth
    
    const totalHeightM = dims.heightM;
    const deadBandM = dims.deadBandM ?? 0;
    
    // usableHeight is the range where water can actually be measured/exist
    const usableHeightM = Math.max(0, totalHeightM - deadBandM);

    if (sensorReadingCm === null || sensorReadingCm < 0) {
        return {
            waterHeightCm: 0,
            percentage: 0,
            volumeLitres: 0,
            capacityLitres,
            isDataValid: false,
        };
    }

    const distanceReadingM = sensorReadingCm / 100;
    
    // If distance reading is greater than total height (e.g. noise), water level is 0
    // If distance reading is less than deadband (e.g. overflow), water level is at usableHeight
    const waterHeightM = Math.min(usableHeightM, Math.max(0, totalHeightM - distanceReadingM));
    const percentage = totalHeightM > 0 ? (waterHeightM / totalHeightM) * 100 : 0;
    
    let volumeLitres = 0;
    if (dims.capacityOverrideLitres && dims.capacityOverrideLitres > 0) {
        volumeLitres = (waterHeightM / usableHeightM) * capacityLitres;
        if (isNaN(volumeLitres) || !isFinite(volumeLitres)) volumeLitres = 0;
    } else {
        if (dims.tankShape === 'rectangular' || dims.tankShape === 'sump') {
            volumeLitres = dims.lengthM * dims.breadthM * waterHeightM * 1000;
        } else if (dims.tankShape === 'cylindrical') {
            volumeLitres = Math.PI * Math.pow(dims.radiusM, 2) * waterHeightM * 1000;
        }
    }

    return {
        waterHeightCm: waterHeightM * 100,
        percentage: Math.max(0, Math.min(100, percentage)),
        volumeLitres: Math.max(0, volumeLitres),
        capacityLitres,
        isDataValid: true,
    };
};
