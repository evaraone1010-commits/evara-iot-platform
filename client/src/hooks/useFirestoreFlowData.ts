import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export interface FirestoreFlowData {
    /** Total volume reading (e.g. 7958.17) */
    volume: number | null;
    /** Flow rate (L/min) */
    flowRate: number | null;
    /** Last updated timestamp from ThingSpeak */
    timestamp: string | null;
    /** Device status from backend */
    status: string | null;
    /** Raw ThingSpeak feed data */
    rawData: any | null;
    /** Whether the hook is still loading initial data */
    isLoading: boolean;
    /** Connection error */
    error: string | null;
}

/**
 * Subscribe to real-time Firestore updates for a flow meter device.
 * 
 * Architecture:
 * - Backend TelemetryWorker polls ThingSpeak every 60s
 * - Processes data via deviceStateService.processThingSpeakData()
 * - Writes to Firestore: `<device_type>/<device_id>` with fields:
 *   - total_liters, flow_rate, telemetry_snapshot, raw_data, status, lastUpdatedAt
 * - This hook subscribes to that Firestore doc via onSnapshot for real-time updates
 * 
 * This replaces the direct ThingSpeak API calls that were failing due to
 * hardcoded API keys and CORS issues.
 */
export const useFirestoreFlowData = (
    deviceId: string | undefined,
    deviceType: string | undefined
): FirestoreFlowData => {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState<FirestoreFlowData>({
        volume: null,
        flowRate: null,
        timestamp: null,
        status: null,
        rawData: null,
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        if (authLoading) {
            setData(prev => ({ ...prev, isLoading: true, error: null }));
            return;
        }

        if (!user) {
            setData({
                volume: null,
                flowRate: null,
                timestamp: null,
                status: null,
                rawData: null,
                isLoading: false,
                error: 'Authentication required',
            });
            return;
        }

        if (!deviceId || !deviceType) {
            setData(prev => ({ ...prev, isLoading: false }));
            return;
        }

        // Normalize the device_type to match Firestore collection name
        const collectionName = deviceType.toLowerCase();
        
        console.log(`[FirestoreFlow] Subscribing to ${collectionName}/${deviceId}`);

        const docRef = doc(db, collectionName, deviceId);

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    console.warn(`[FirestoreFlow] Document ${collectionName}/${deviceId} does not exist`);
                    setData({
                        volume: null,
                        flowRate: null,
                        timestamp: null,
                        status: null,
                        rawData: null,
                        isLoading: false,
                        error: 'Document not found',
                    });
                    return;
                }

                const docData = snapshot.data();
                console.log('[FirestoreFlow] Snapshot received:', docData);

                // Helper to convert Firestore Timestamp objects to ISO string
                const safeTimestamp = (ts: any): string | null => {
                    if (!ts) return null;
                    if (typeof ts === 'object') {
                        if ('_seconds' in ts) return new Date(ts._seconds * 1000).toISOString();
                        if ('seconds' in ts) return new Date(ts.seconds * 1000).toISOString();
                        if (ts instanceof Date) return ts.toISOString();
                    }
                    if (typeof ts === 'string') return ts;
                    if (typeof ts === 'number') return new Date(ts < 10000000000 ? ts * 1000 : ts).toISOString();
                    return null;
                };

                // Extract flow data from multiple possible locations in the document
                // Priority: telemetry_snapshot > top-level fields > raw_data
                const telemetrySnapshot = docData.telemetry_snapshot || {};
                const rawData = docData.raw_data || {};

                // Volume / total_liters extraction
                let volume: number | null = null;
                const parseVal = (v: any) => {
                    if (v == null) return null;
                    const parsed = parseFloat(v);
                    return isNaN(parsed) ? null : parsed;
                };

                volume = parseVal(docData.total_liters) 
                         ?? parseVal(telemetrySnapshot.total_liters) 
                         ?? parseVal(docData.volume) 
                         ?? parseVal(rawData.field1);

                // Flow rate extraction
                let flowRate = parseVal(docData.flow_rate)
                               ?? parseVal(telemetrySnapshot.flow_rate)
                               ?? parseVal(rawData.field3);

                // Timestamp extraction
                const timestamp = safeTimestamp(
                    docData.timestamp ||
                    docData.lastUpdatedAt || 
                    telemetrySnapshot.timestamp || 
                    docData.last_updated_at || 
                    docData.last_seen ||
                    rawData.created_at
                );

                // Status extraction
                const status = docData.status || telemetrySnapshot.status || null;

                console.log(`[FirestoreFlow] Parsed: volume=${volume}, flowRate=${flowRate}, timestamp=${timestamp}, status=${status}`);

                setData({
                    volume,
                    flowRate,
                    timestamp,
                    status,
                    rawData: docData,
                    isLoading: false,
                    error: null,
                });
            },
            (err) => {
                console.error('[FirestoreFlow] onSnapshot error:', err);
                setData(prev => ({
                    ...prev,
                    isLoading: false,
                    error: err.message,
                }));
            }
        );

        return () => {
            console.log(`[FirestoreFlow] Unsubscribing from ${collectionName}/${deviceId}`);
            unsubscribe();
        };
    }, [authLoading, deviceId, deviceType, user]);

    return data;
};
