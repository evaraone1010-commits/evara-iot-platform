const { BigQuery } = require('@google-cloud/bigquery');
const logger = require('../utils/logger');

class AnalyticsService {
  constructor() {
    this.bigquery = new BigQuery();
    this.datasetId = process.env.BIGQUERY_DATASET || 'telemetry';
    this.tableRaw = process.env.BIGQUERY_TABLE_RAW || 'raw';
    this.tableHourly = process.env.BIGQUERY_TABLE_HOURLY || 'hourly';
  }

  // Insert raw telemetry data
  async insertTelemetry(telemetryData) {
    try {
      const rows = Array.isArray(telemetryData) ? telemetryData : [telemetryData];
      
      await this.bigquery.dataset(this.datasetId).table(this.tableRaw).insert(rows);
      
      logger.telemetry(rows[0].device_id, 'inserted', {
        count: rows.length,
        table: this.tableRaw
      });
      
      return { success: true, inserted: rows.length };
    } catch (error) {
      logger.error('Failed to insert telemetry', error, {
        table: this.tableRaw,
        dataCount: telemetryData.length
      });
      throw error;
    }
  }

  // Get historical telemetry data
  async getTelemetry(deviceId, timeRange, metrics = ['level', 'flow', 'pressure']) {
    try {
      const query = `
        SELECT 
          timestamp,
          device_id,
          metric_type,
          value,
          unit,
          quality
        FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.${this.tableRaw}\`
        WHERE device_id = @deviceId
          AND metric_type IN UNNEST(@metrics)
          AND timestamp BETWEEN @startTime AND @endTime
        ORDER BY timestamp ASC
      `;

      const options = {
        query: query,
        params: {
          deviceId,
          metrics,
          startTime: timeRange.start,
          endTime: timeRange.end
        }
      };

      const [rows] = await this.bigquery.query(options);
      
      logger.api('GET', '/analytics/telemetry', 200, null, {
        deviceId,
        rowCount: rows.length,
        timeRange
      });

      return rows;
    } catch (error) {
      logger.error('Failed to get telemetry', error, { deviceId, timeRange });
      throw error;
    }
  }

  // Get aggregated hourly data for charts
  async getHourlyAggregates(deviceId, timeRange, metric = 'level') {
    try {
      const query = `
        SELECT 
          TIMESTAMP_TRUNC(timestamp, HOUR) as hour_timestamp,
          device_id,
          metric_type,
          MIN(value) as min_value,
          MAX(value) as max_value,
          AVG(value) as avg_value,
          COUNT(*) as count
        FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.${this.tableRaw}\`
        WHERE device_id = @deviceId
          AND metric_type = @metric
          AND timestamp BETWEEN @startTime AND @endTime
        GROUP BY hour_timestamp, device_id, metric_type
        ORDER BY hour_timestamp ASC
      `;

      const options = {
        query: query,
        params: {
          deviceId,
          metric,
          startTime: timeRange.start,
          endTime: timeRange.end
        }
      };

      const [rows] = await this.bigquery.query(options);
      
      return rows;
    } catch (error) {
      logger.error('Failed to get hourly aggregates', error, { deviceId, timeRange, metric });
      throw error;
    }
  }

  // Get device performance metrics
  async getDevicePerformance(deviceId, dateRange) {
    try {
      const query = `
        SELECT 
          DATE(timestamp) as date,
          device_id,
          COUNT(*) as data_points,
          MAX(timestamp) as last_data_timestamp,
          COUNTIF(quality = 'good') as good_readings,
          COUNTIF(quality = 'poor') as poor_readings,
          COUNTIF(quality = 'bad') as bad_readings
        FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.${this.tableRaw}\`
        WHERE device_id = @deviceId
          AND DATE(timestamp) BETWEEN @startDate AND @endDate
        GROUP BY date, device_id
        ORDER BY date DESC
      `;

      const options = {
        query: query,
        params: {
          deviceId,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      };

      const [rows] = await this.bigquery.query(options);
      
      return rows;
    } catch (error) {
      logger.error('Failed to get device performance', error, { deviceId, dateRange });
      throw error;
    }
  }

  // Get multi-device comparison data
  async getMultiDeviceComparison(deviceIds, timeRange, metric = 'level') {
    try {
      const query = `
        SELECT 
          device_id,
          AVG(value) as avg_value,
          MIN(value) as min_value,
          MAX(value) as max_value,
          COUNT(*) as data_points
        FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.${this.tableRaw}\`
        WHERE device_id IN UNNEST(@deviceIds)
          AND metric_type = @metric
          AND timestamp BETWEEN @startTime AND @endTime
        GROUP BY device_id
      `;

      const options = {
        query: query,
        params: {
          deviceIds,
          metric,
          startTime: timeRange.start,
          endTime: timeRange.end
        }
      };

      const [rows] = await this.bigquery.query(options);
      
      return rows;
    } catch (error) {
      logger.error('Failed to get multi-device comparison', error, { deviceIds, timeRange });
      throw error;
    }
  }

  // Create materialized view for common queries
  async createMaterializedView() {
    try {
      const viewQuery = `
        CREATE OR REPLACE VIEW \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.device_latest\`
        AS
        SELECT 
          device_id,
          metric_type,
          value,
          timestamp,
          quality,
          ROW_NUMBER() OVER (PARTITION BY device_id, metric_type ORDER BY timestamp DESC) as rn
        FROM \`${this.datasetId}.${this.tableRaw}\`
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        HAVING rn = 1
      `;

      await this.bigquery.query(viewQuery);
      
      logger.info('Created materialized view for latest device data');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to create materialized view', error);
      throw error;
    }
  }

  // Get real-time analytics (using materialized view)
  async getLatestDeviceData(deviceIds) {
    try {
      const query = `
        SELECT device_id, metric_type, value, timestamp, quality
        FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.device_latest\`
        WHERE device_id IN UNNEST(@deviceIds)
        ORDER BY device_id, metric_type
      `;

      const options = {
        query: query,
        params: { deviceIds }
      };

      const [rows] = await this.bigquery.query(options);
      
      return rows;
    } catch (error) {
      logger.error('Failed to get latest device data', error, { deviceIds });
      throw error;
    }
  }

  // Data retention management
  async cleanupOldData(retentionDays = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const query = `
        DELETE FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${this.datasetId}.${this.tableRaw}\`
        WHERE timestamp < @cutoffDate
      `;

      const options = {
        query: query,
        params: { cutoffDate }
      };

      await this.bigquery.query(options);
      
      logger.info('Cleaned up old telemetry data', {
        retentionDays,
        cutoffDate
      });
      
      return { success: true, deletedBefore: cutoffDate };
    } catch (error) {
      logger.error('Failed to cleanup old data', error, { retentionDays });
      throw error;
    }
  }
}

module.exports = AnalyticsService;
