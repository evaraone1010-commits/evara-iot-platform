import { useState, useEffect } from 'react';

export const useStaleDataAge = (timestamp: string | null) => {
    const [label, setLabel] = useState<string | null>(null);

    useEffect(() => {
        if (!timestamp) {
            setLabel(null);
            return;
        }

        const updateLabel = () => {
            const now = new Date();
            const dataDate = new Date(timestamp);
            const diffMs = now.getTime() - dataDate.getTime();
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);

            if (diffSecs < 60) {
                setLabel('Just now');
            } else if (diffMins < 60) {
                setLabel(`${diffMins}m ago`);
            } else {
                const diffHours = Math.floor(diffMins / 60);
                setLabel(`${diffHours}h ago`);
            }
        };

        updateLabel();
        const interval = setInterval(updateLabel, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, [timestamp]);

    return { label };
};
