import type { WaterAnalytics } from '../hooks/useWaterAnalytics';

export interface AnalyticsLogEntry {
  timestamp: string;
  deviceId: string;
  tankCapacity: number;
  currentVolume: number;
  currentLevel: number;
  fillRate: number;
  drainRate: number;
  refillsToday: number;
  lastRefillTime: string | null;
  avgRefillTimeMinutes: number | null;
  estimatedEmptyTimeMinutes: number | null;
  estimatedFullTimeMinutes: number | null;
  refillEvents: Array<{
    start: string;
    end: string;
    duration: number;
    startVolume: number;
    endVolume: number;
    fillRate: number;
  }>;
}

class AnalyticsDataLogger {
  private logs: AnalyticsLogEntry[] = [];
  private maxLogs = 10000; // Keep last 10,000 entries
  private storageKey = 'evara_analytics_logs';

  constructor() {
    this.loadFromStorage();
  }

  // Log analytics data with timestamp
  logAnalyticsData(deviceId: string, analytics: WaterAnalytics, tankCapacity: number) {
    const entry: AnalyticsLogEntry = {
      timestamp: new Date().toISOString(),
      deviceId,
      tankCapacity,
      currentVolume: analytics.availableWaterLiters,
      currentLevel: analytics.waterLevelPercent,
      fillRate: analytics.fillRateLpm,
      drainRate: analytics.drainRateLpm,
      refillsToday: analytics.refillsToday,
      lastRefillTime: analytics.lastRefillTime,
      avgRefillTimeMinutes: analytics.avgRefillTimeMinutes,
      estimatedEmptyTimeMinutes: analytics.estimatedEmptyTimeMinutes,
      estimatedFullTimeMinutes: analytics.estimatedFullTimeMinutes,
      refillEvents: [] // This would need to be passed from the hook
    };

    this.logs.push(entry);
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Save to localStorage
    this.saveToStorage();
    
    console.log('[AnalyticsLogger] Data logged:', entry);
  }

  // Get all logs
  getLogs(): AnalyticsLogEntry[] {
    return [...this.logs];
  }

  // Get logs for specific device
  getDeviceLogs(deviceId: string): AnalyticsLogEntry[] {
    return this.logs.filter(log => log.deviceId === deviceId);
  }

  // Get logs for date range
  getDateRangeLogs(startDate: Date, endDate: Date): AnalyticsLogEntry[] {
    const start = startDate.getTime();
    const end = endDate.getTime();
    
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    });
  }

  // Export logs to CSV format (Excel compatible)
  exportToCSV(deviceId?: string, dateRange?: { start: Date; end: Date }): string {
    let logsToExport = this.logs;

    // Filter by device if specified
    if (deviceId) {
      logsToExport = logsToExport.filter(log => log.deviceId === deviceId);
    }

    // Filter by date range if specified
    if (dateRange) {
      const start = dateRange.start.getTime();
      const end = dateRange.end.getTime();
      logsToExport = logsToExport.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime >= start && logTime <= end;
      });
    }

    // Create CSV header
    const headers = [
      'Timestamp',
      'Device ID',
      'Tank Capacity (L)',
      'Current Volume (L)',
      'Current Level (%)',
      'Fill Rate (L/min)',
      'Drain Rate (L/min)',
      'Refills Today',
      'Last Refill Time',
      'Avg Refill Time (min)',
      'Est. Empty Time (min)',
      'Est. Full Time (min)'
    ];

    // Create CSV rows
    const rows = logsToExport.map(log => [
      log.timestamp,
      log.deviceId,
      log.tankCapacity.toString(),
      log.currentVolume.toString(),
      log.currentLevel.toString(),
      log.fillRate.toString(),
      log.drainRate.toString(),
      log.refillsToday.toString(),
      log.lastRefillTime || '',
      log.avgRefillTimeMinutes?.toString() || '',
      log.estimatedEmptyTimeMinutes?.toString() || '',
      log.estimatedFullTimeMinutes?.toString() || ''
    ]);

    // Combine header and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  }

  // Download CSV file
  downloadCSV(deviceId?: string, dateRange?: { start: Date; end: Date }) {
    const csvContent = this.exportToCSV(deviceId, dateRange);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const deviceStr = deviceId ? `_${deviceId}` : '';
    const filename = `evara_analytics${deviceStr}_${dateStr}_${timeStr}.csv`;
    
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('[AnalyticsLogger] CSV downloaded:', filename);
  }

  // Get statistics
  getStatistics(deviceId?: string) {
    let logsToAnalyze = this.logs;
    
    if (deviceId) {
      logsToAnalyze = logsToAnalyze.filter(log => log.deviceId === deviceId);
    }

    if (logsToAnalyze.length === 0) {
      return null;
    }

    const totalRefills = logsToAnalyze.reduce((sum, log) => sum + log.refillsToday, 0);
    const avgFillRate = logsToAnalyze.reduce((sum, log) => sum + log.fillRate, 0) / logsToAnalyze.length;
    const avgDrainRate = logsToAnalyze.reduce((sum, log) => sum + log.drainRate, 0) / logsToAnalyze.length;
    const maxRefillsInDay = Math.max(...logsToAnalyze.map(log => log.refillsToday));

    return {
      totalLogs: logsToAnalyze.length,
      totalRefills,
      avgFillRate,
      avgDrainRate,
      maxRefillsInDay,
      dateRange: {
        first: logsToAnalyze[0].timestamp,
        last: logsToAnalyze[logsToAnalyze.length - 1].timestamp
      }
    };
  }

  // Clear all logs
  clearLogs() {
    this.logs = [];
    this.saveToStorage();
    console.log('[AnalyticsLogger] All logs cleared');
  }

  // Save to localStorage
  private saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (error) {
      console.error('[AnalyticsLogger] Failed to save to localStorage:', error);
    }
  }

  // Load from localStorage
  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
        console.log(`[AnalyticsLogger] Loaded ${this.logs.length} logs from storage`);
      }
    } catch (error) {
      console.error('[AnalyticsLogger] Failed to load from localStorage:', error);
    }
  }
}

// Export singleton instance
export const analyticsLogger = new AnalyticsDataLogger();

// Export hook for easy integration
export const useAnalyticsLogger = () => {
  return {
    logData: analyticsLogger.logAnalyticsData.bind(analyticsLogger),
    getLogs: analyticsLogger.getLogs.bind(analyticsLogger),
    getDeviceLogs: analyticsLogger.getDeviceLogs.bind(analyticsLogger),
    getDateRangeLogs: analyticsLogger.getDateRangeLogs.bind(analyticsLogger),
    exportToCSV: analyticsLogger.exportToCSV.bind(analyticsLogger),
    downloadCSV: analyticsLogger.downloadCSV.bind(analyticsLogger),
    getStatistics: analyticsLogger.getStatistics.bind(analyticsLogger),
    clearLogs: analyticsLogger.clearLogs.bind(analyticsLogger)
  };
};
