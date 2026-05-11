import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import logger from '../../utils/logger-structured';

interface DataPoint {
  timestamp: string;
  value: number;
  quality?: string;
}

interface OptimizedRealtimeChartProps {
  deviceId: string;
  metric: 'level' | 'flow' | 'pressure' | 'temperature';
  height?: number;
  timeRange?: number; // minutes
  refreshInterval?: number; // seconds
  color?: string;
  unit?: string;
  showGrid?: boolean;
  animate?: boolean;
}

// Optimized chart configuration
const CHART_CONFIG = {
  colors: {
    level: '#3b82f6',
    flow: '#10b981',
    pressure: '#f59e0b',
    temperature: '#ef4444'
  },
  units: {
    level: '%',
    flow: 'L/min',
    pressure: 'bar',
    temperature: '°C'
  }
};

export const OptimizedRealtimeChart: React.FC<OptimizedRealtimeChartProps> = ({
  deviceId,
  metric,
  height = 300,
  timeRange = 60, // 1 hour default
  refreshInterval = 30, // 30 seconds default
  color = CHART_CONFIG.colors[metric],
  unit = CHART_CONFIG.units[metric],
  showGrid = true,
  animate = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const dataRef = useRef<DataPoint[]>([]);

  // Fetch data with React Query for caching
  const { data: telemetryData, isLoading, error } = useQuery({
    queryKey: ['telemetry', deviceId, metric, timeRange],
    queryFn: async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - timeRange * 60 * 1000);
      
      const response = await api.get(`/analytics/telemetry/${deviceId}`, {
        params: {
          metric,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          limit: 200 // Limit points for performance
        }
      });
      
      return response.data;
    },
    refetchInterval: refreshInterval * 1000,
    staleTime: (refreshInterval - 5) * 1000, // Cache for slightly less than refresh interval
    gcTime: 5 * 60 * 1000, // 5 minutes cache (new React Query v5 uses gcTime instead of cacheTime)
  });

  // Process data for chart
  const processedData = useMemo(() => {
    if (!telemetryData || !Array.isArray(telemetryData)) return [];
    
    return telemetryData.map((point: any) => ({
      timestamp: point.timestamp,
      value: point.value,
      quality: point.quality || 'good'
    }));
  }, [telemetryData]);

  // Update data ref
  useEffect(() => {
    dataRef.current = processedData;
  }, [processedData]);

  // Optimized canvas drawing
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const data = dataRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) return;

    // Calculate scales
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const minValue = data.length > 0 ? Math.min(...data.map(d => d.value)) : 0;
    const maxValue = data.length > 0 ? Math.max(...data.map(d => d.value)) : 100;
    const valueRange = maxValue - minValue || 1;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 1;
      
      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }
      
      // Vertical grid lines
      for (let i = 0; i <= 6; i++) {
        const x = padding + (chartWidth / 6) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
      }
    }

    // Draw axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 2;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw data line
    if (data.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      data.forEach((point, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw gradient fill
      const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '10');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      data.forEach((point, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(width - padding, height - padding);
      ctx.lineTo(padding, height - padding);
      ctx.closePath();
      ctx.fill();

      // Draw points for recent data
      const recentPoints = data.slice(-10);
      recentPoints.forEach((point, index) => {
        const x = padding + ((data.indexOf(point) + index) / (data.length - 1)) * chartWidth;
        const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight;

        ctx.fillStyle = point.quality === 'good' ? color : '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw labels
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '12px sans-serif';

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const value = minValue + (valueRange / 5) * (5 - i);
      const y = padding + (chartHeight / 5) * i;
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(1) + unit, padding - 10, y + 4);
    }

    // X-axis labels (time)
    const timeLabels = 4;
    for (let i = 0; i <= timeLabels; i++) {
      const dataIndex = Math.floor((i / timeLabels) * (data.length - 1));
      if (data[dataIndex]) {
        const time = new Date(data[dataIndex].timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        const x = padding + (i / timeLabels) * chartWidth;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, height - padding + 20);
      }
    }

    // Draw current value
    if (data.length > 0) {
      const lastPoint = data[data.length - 1];
      const currentValue = lastPoint.value.toFixed(1);
      
      ctx.fillStyle = color;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(currentValue + unit, width - padding - 100, padding + 20);
      
      // Quality indicator
      ctx.fillStyle = lastPoint.quality === 'good' ? '#10b981' : '#ef4444';
      ctx.font = '12px sans-serif';
      ctx.fillText(lastPoint.quality || 'good', width - padding - 100, padding + 40);
    }

  }, [color, unit, showGrid]);

  // Animation loop
  const startAnimation = useCallback(() => {
    drawChart();
    if (animate) {
      animationRef.current = requestAnimationFrame(startAnimation);
    }
  }, [drawChart, animate]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  // Start animation when data changes
  useEffect(() => {
    if (animate && processedData.length > 0) {
      startAnimation();
    }
  }, [animate, processedData, startAnimation]);

  // Performance monitoring
  useEffect(() => {
    if (error) {
      logger.error('Chart data fetch failed', error instanceof Error ? error : new Error(String(error)), {
        deviceId,
        metric
      });
    }

    if (processedData.length > 0) {
      logger.performance('chart_render', Date.now(), {
        deviceId,
        metric,
        dataPoints: processedData.length
      });
    }
  }, [error, processedData, deviceId, metric]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Failed to load chart data
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ height: `${height}px` }}
      />
      
      {/* Overlay for real-time indicator */}
      <div className="absolute top-2 right-2 flex items-center space-x-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs text-gray-500">Live</span>
      </div>
    </div>
  );
};

export default OptimizedRealtimeChart;
