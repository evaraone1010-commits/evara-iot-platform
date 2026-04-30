export const TDS_OFFLINE_THRESHOLD_MS = 45 * 60 * 1000;

export const normalizeStatus = (status: unknown): 'Online' | 'Offline' | null => {
    if (typeof status !== 'string') return null;
    const value = status.trim().toLowerCase();
    if (value === 'online') return 'Online';
    if (value === 'offline') return 'Offline';
    return null;
};

export const isTdsDevice = (node: any): boolean => {
    const category = (node?.category || node?.asset_type || node?.device_type || '').toString().toLowerCase();
    return category.includes('tds');
};

export const computeTdsDeviceStatus = (lastTimestamp: any): 'Online' | 'Offline' => {
    if (!lastTimestamp) return 'Offline';

    try {
        let date: Date;
        if (typeof lastTimestamp === 'object' && lastTimestamp !== null) {
            if ('_seconds' in lastTimestamp && typeof lastTimestamp._seconds === 'number') {
                date = new Date(lastTimestamp._seconds * 1000);
            } else if ('seconds' in lastTimestamp && typeof lastTimestamp.seconds === 'number') {
                date = new Date(lastTimestamp.seconds * 1000);
            } else {
                date = new Date(String(lastTimestamp));
            }
        } else if (typeof lastTimestamp === 'number') {
            date = lastTimestamp < 10000000000 ? new Date(lastTimestamp * 1000) : new Date(lastTimestamp);
        } else {
            const tsStr = String(lastTimestamp).trim();
            if (/^\d+$/.test(tsStr)) {
                const numericVal = parseInt(tsStr, 10);
                date = numericVal < 10000000000 ? new Date(numericVal * 1000) : new Date(numericVal);
            } else {
                date = new Date(tsStr);
                if (isNaN(date.getTime()) && tsStr.includes(' ')) {
                    date = new Date(tsStr.replace(' ', 'T'));
                }
            }
        }

        if (isNaN(date.getTime())) return 'Offline';

        const ageMs = Date.now() - date.getTime();
        return ageMs < TDS_OFFLINE_THRESHOLD_MS ? 'Online' : 'Offline';
    } catch {
        return 'Offline';
    }
};
