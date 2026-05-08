import { useState } from 'react';
import { deviceService } from '../../services/DeviceService';

interface ReportsDownloaderProps {
  nodes?: any[];
  isLoading?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const HEADER_LABELS: Record<string, string> = {
  water_level: 'Water Level',
  flow_rate: 'Flow Rate',
  total_reading: 'Total Reading',
  tds_value: 'TDS Value',
  temperature: 'Temperature',
  battery: 'Battery',
  signal: 'Signal'
};

function buildCSV(
  nodes: any[], 
  selectedDevice: string, 
  startDate: string, 
  endDate: string, 
  telemetryData?: any[], 
  fieldMapping?: any
): string {
  // 1. If a specific device is selected, we expect a telemetry report
  if (selectedDevice !== 'all') {
    const mapping = fieldMapping || {};
    const internalKeys = Object.values(mapping).filter(v => typeof v === 'string') as string[];
    
    // Create headers: timestamp + human readable sensor names
    const headers = ['timestamp', ...internalKeys.map(k => HEADER_LABELS[k] || k)];
    
    if (!telemetryData || telemetryData.length === 0) {
      // Return just headers if no data, or a message row
      return [headers, ['No data found for this period']].map(r => r.join(',')).join('\n');
    }

    const rows = telemetryData.map((record: any) => {
      const timestamp = record.timestamp instanceof Date 
        ? record.timestamp.toISOString() 
        : new Date(record.timestamp).toISOString();
        
      const row = [timestamp];
      
      internalKeys.forEach(key => {
        // The backend now provides unified keys (water_level, etc.)
        const val = record[key] ?? '';
        row.push(val);
      });
      
      return row;
    });

    return [headers, ...rows].map((r) => r.join(',')).join('\n');
  }

  // 2. Summary Report (All Devices)
  const headers = ['device_id', 'device_label', 'start_date', 'end_date', 'exported_at'];
  const deviceList =
    selectedDevice === 'all'
      ? (nodes || [])
      : (nodes || []).filter((n) => (n.id || n.hardwareId) === selectedDevice);

  const rows = deviceList.map((n) => [
    n.id || n.hardwareId || '',
    n.label || n.displayName || n.name || '',
    startDate || 'N/A',
    endDate || 'N/A',
    new Date().toISOString(),
  ]);

  return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

// ── Input Styles (shared) ─────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  borderRadius: '10px',
  fontSize: '13px',
  border: '1px solid var(--card-border)',
  backgroundColor: 'var(--card-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  appearance: 'none' as const,
};

// ── Label ─────────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-[10px] font-[700] uppercase tracking-wider mb-1"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </span>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function ReportsSkeleton() {
  return (
    <div
      className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col"
      style={{ minHeight: '260px' }}
    >
      <span
        className="text-[14px] font-[800] uppercase tracking-tight mb-6 block text-[var(--dashboard-heading)]"
      >
        Export Reports
      </span>
      <div className="space-y-4 animate-pulse flex-1">
        <div
          className="h-10 rounded-lg"
          style={{ backgroundColor: 'var(--text-muted)', opacity: 0.18 }}
        />
        <div className="grid grid-cols-2 gap-3">
          <div
            className="h-10 rounded-lg"
            style={{ backgroundColor: 'var(--text-muted)', opacity: 0.18 }}
          />
          <div
            className="h-10 rounded-lg"
            style={{ backgroundColor: 'var(--text-muted)', opacity: 0.18 }}
          />
        </div>
        <div
          className="h-10 rounded-lg mt-auto"
          style={{ backgroundColor: 'var(--text-muted)', opacity: 0.18 }}
        />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportsDownloader({ nodes, isLoading }: ReportsDownloaderProps) {
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <ReportsSkeleton />;

  const handleDownload = async () => {
    setError(null);

    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be before end date.');
      return;
    }

    setDownloading(true);
    try {
      let csv = '';
      
      // If a specific device and dates are selected, fetch real data
      if (selectedDevice !== 'all' && startDate && endDate) {
        // Normalize dates: start of day for startDate, end of day for endDate
        const start = `${startDate}T00:00:00.000Z`;
        const end = `${endDate}T23:59:59.999Z`;

        console.log(`[Reports] Fetching telemetry for ${selectedDevice} from ${start} to ${end}`);
        const response = await deviceService.getNodeGraphHybrid(selectedDevice, { startDate: start, endDate: end });
        
        if (response && response.data) {
          csv = buildCSV(nodes || [], selectedDevice, startDate, endDate, response.data, response.field_mapping);
        } else {
          throw new Error('No data found for the selected range.');
        }
      } else {
        // Fallback to summary report
        csv = buildCSV(nodes || [], selectedDevice, startDate, endDate);
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fileName = `evara_report_${selectedDevice}_${startDate || 'all'}_to_${endDate || 'all'}_${Date.now()}.csv`;
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="apple-glass-card rounded-[20px] p-5 h-full flex flex-col">
      <span
        className="text-[14px] font-[800] uppercase tracking-tight mb-5 block text-[var(--dashboard-heading)]"
      >
        Export Reports
      </span>

      <div className="flex flex-col flex-1 gap-4">
        {/* Device dropdown */}
        <div>
          <FieldLabel>Select Device</FieldLabel>
          <div className="relative">
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Devices</option>
              {(nodes || []).map((node) => (
                <option
                  key={node.id || node.hardwareId}
                  value={node.id || node.hardwareId}
                >
                  {node.label || node.displayName || node.hardwareId || 'Unnamed'}
                </option>
              ))}
            </select>
            {/* Custom chevron */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Start Date</FieldLabel>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>End Date</FieldLabel>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
              min={startDate || undefined}
            />
          </div>
        </div>

        {/* Validation error */}
        {error && (
          <p
            className="text-[11px] font-[600]"
            style={{ color: 'var(--offline-text)' }}
          >
            {error}
          </p>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="mt-auto w-full h-10 rounded-xl text-[13px] font-[700] flex items-center justify-center gap-2 transition-opacity"
          style={{
            backgroundColor: 'var(--color-evara-blue)',
            color: '#ffffff',
            opacity: downloading ? 0.6 : 1,
            cursor: downloading ? 'not-allowed' : 'pointer',
          }}
        >
          {downloading ? (
            <>
              <svg
                className="animate-spin"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Generating…
            </>
          ) : (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download CSV
            </>
          )}
        </button>
      </div>
    </div>
  );
}
