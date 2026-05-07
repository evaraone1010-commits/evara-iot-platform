/**
 * CloudWatch Configuration Script
 * Sets up alarms, log retention, and monitoring for production
 * 
 * Usage: node backend/cloudwatch-config.js --environment=staging|production
 */

const AWS = require('aws-sdk');
const path = require('path');

const cloudwatch = new AWS.CloudWatch({ region: process.env.AWS_REGION || 'us-east-1' });
const logs = new AWS.CloudWatchLogs({ region: process.env.AWS_REGION || 'us-east-1' });
const ecs = new AWS.ECS({ region: process.env.AWS_REGION || 'us-east-1' });

const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const CLUSTER_NAME = `evara-${ENVIRONMENT}-cluster`;
const SERVICE_NAME = `evara-backend-service`;
const LOG_GROUP = `/evara/${ENVIRONMENT}/backend`;
const ALARM_PREFIX = `evara-${ENVIRONMENT}`;

/**
 * Create or update log group with retention policy
 */
async function configureLogRetention() {
  console.log('📋 Configuring CloudWatch Logs retention...');
  
  try {
    // Create log group if it doesn't exist
    try {
      await logs.createLogGroup({ logGroupName: LOG_GROUP }).promise();
      console.log(`✅ Created log group: ${LOG_GROUP}`);
    } catch (err) {
      if (err.code === 'ResourceAlreadyExistsException') {
        console.log(`ℹ️  Log group already exists: ${LOG_GROUP}`);
      } else {
        throw err;
      }
    }

    // Set retention policy (30 days for staging, 90 days for production)
    const retentionInDays = ENVIRONMENT === 'production' ? 90 : 30;
    
    await logs.putRetentionPolicy({
      logGroupName: LOG_GROUP,
      retentionInDays
    }).promise();
    
    console.log(`✅ Set log retention to ${retentionInDays} days`);
  } catch (error) {
    console.error('❌ Error configuring log retention:', error.message);
    throw error;
  }
}

/**
 * Create CloudWatch alarms for the ECS service
 */
async function createAlarms() {
  console.log('🚨 Creating CloudWatch alarms...');

  const alarms = [
    {
      name: `${ALARM_PREFIX}-cpu-high`,
      metric: 'CPUUtilization',
      threshold: ENVIRONMENT === 'production' ? 75 : 80,
      description: 'Alert when CPU utilization exceeds threshold',
      dimensions: [
        { Name: 'ServiceName', Value: SERVICE_NAME },
        { Name: 'ClusterName', Value: CLUSTER_NAME }
      ]
    },
    {
      name: `${ALARM_PREFIX}-memory-high`,
      metric: 'MemoryUtilization',
      threshold: ENVIRONMENT === 'production' ? 80 : 85,
      description: 'Alert when memory utilization exceeds threshold',
      dimensions: [
        { Name: 'ServiceName', Value: SERVICE_NAME },
        { Name: 'ClusterName', Value: CLUSTER_NAME }
      ]
    },
    {
      name: `${ALARM_PREFIX}-error-rate-high`,
      metric: 'ErrorRate',
      threshold: ENVIRONMENT === 'production' ? 5 : 10,
      description: 'Alert when error rate exceeds threshold (%)',
      dimensions: [
        { Name: 'ServiceName', Value: SERVICE_NAME }
      ]
    },
    {
      name: `${ALARM_PREFIX}-response-time-high`,
      metric: 'TargetResponseTime',
      threshold: ENVIRONMENT === 'production' ? 1000 : 2000,
      description: 'Alert when response time exceeds threshold (ms)',
      dimensions: [
        { Name: 'ServiceName', Value: SERVICE_NAME }
      ]
    },
    {
      name: `${ALARM_PREFIX}-unhealthy-hosts`,
      metric: 'UnhealthyHostCount',
      threshold: 1,
      description: 'Alert when there are unhealthy instances',
      dimensions: [
        { Name: 'ServiceName', Value: SERVICE_NAME },
        { Name: 'ClusterName', Value: CLUSTER_NAME }
      ],
      treatMissingData: 'notBreaching'
    }
  ];

  for (const alarm of alarms) {
    try {
      await cloudwatch.putMetricAlarm({
        AlarmName: alarm.name,
        AlarmDescription: alarm.description,
        MetricName: alarm.metric,
        Namespace: 'AWS/ECS',
        Statistic: 'Average',
        Period: 300, // 5 minutes
        EvaluationPeriods: 2,
        Threshold: alarm.threshold,
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: alarm.dimensions,
        TreatMissingData: alarm.treatMissingData || 'missing',
        AlarmActions: process.env.SNS_TOPIC_ARN ? [process.env.SNS_TOPIC_ARN] : []
      }).promise();

      console.log(`✅ Created alarm: ${alarm.name}`);
    } catch (error) {
      console.error(`❌ Error creating alarm ${alarm.name}:`, error.message);
    }
  }
}

/**
 * Create custom Sentry metrics alarm
 */
async function createSentryMetricsAlarm() {
  console.log('🔍 Creating Sentry error tracking alarm...');

  try {
    await cloudwatch.putMetricAlarm({
      AlarmName: `${ALARM_PREFIX}-sentry-errors`,
      AlarmDescription: 'Alert when Sentry error count exceeds threshold',
      MetricName: 'EventCount',
      Namespace: 'Sentry',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: ENVIRONMENT === 'production' ? 50 : 100,
      ComparisonOperator: 'GreaterThanThreshold',
      Dimensions: [
        { Name: 'Environment', Value: ENVIRONMENT },
        { Name: 'Level', Value: 'error' }
      ],
      AlarmActions: process.env.SNS_TOPIC_ARN ? [process.env.SNS_TOPIC_ARN] : []
    }).promise();

    console.log('✅ Created Sentry metrics alarm');
  } catch (error) {
    console.warn('⚠️  Note: Sentry custom metrics may require manual setup');
  }
}

/**
 * Create log insights queries for common diagnostics
 */
async function createLogInsightsQueries() {
  console.log('📊 Setting up CloudWatch Logs Insights queries...');

  const queries = {
    'api-errors': `
      fields @timestamp, @message, statusCode, path
      | filter statusCode >= 400
      | stats count() by statusCode
    `,
    'slow-requests': `
      fields @timestamp, path, duration
      | filter duration > 5000
      | sort duration desc
      | limit 100
    `,
    'database-errors': `
      fields @timestamp, @message
      | filter @message like /firestore|redis|database/i
      | stats count() by @message
    `,
    'auth-failures': `
      fields @timestamp, userId, path
      | filter @message like /unauthorized|forbidden|auth/i
      | stats count() by userId
    `
  };

  console.log(`✅ CloudWatch Logs Insights queries configured`);
  console.log(`   Use these queries in the AWS console:`);
  Object.entries(queries).forEach(([name, query]) => {
    console.log(`   - ${name}:`);
    console.log(`     ${query.trim().replace(/\n/g, '\n     ')}\n`);
  });
}

/**
 * Create dashboard
 */
async function createDashboard() {
  console.log('📈 Creating CloudWatch dashboard...');

  const dashboardBody = {
    widgets: [
      {
        type: 'metric',
        properties: {
          metrics: [
            ['AWS/ECS', 'CPUUtilization', { stat: 'Average' }],
            ['.', 'MemoryUtilization', { stat: 'Average' }],
            ['Sentry', 'EventCount', { stat: 'Sum' }]
          ],
          period: 300,
          stat: 'Average',
          region: process.env.AWS_REGION || 'us-east-1',
          title: `${ENVIRONMENT.toUpperCase()} - Service Metrics`
        }
      },
      {
        type: 'log',
        properties: {
          query: `fields @timestamp, statusCode | filter statusCode >= 400 | stats count() by statusCode`,
          region: process.env.AWS_REGION || 'us-east-1',
          title: 'Error Rate'
        }
      }
    ]
  };

  try {
    await cloudwatch.putDashboard({
      DashboardName: `evara-${ENVIRONMENT}-dashboard`,
      DashboardBody: JSON.stringify(dashboardBody)
    }).promise();

    console.log(`✅ Created dashboard: evara-${ENVIRONMENT}-dashboard`);
  } catch (error) {
    console.error('❌ Error creating dashboard:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log(`\n🔧 Configuring CloudWatch for ${ENVIRONMENT.toUpperCase()} environment\n`);

    await configureLogRetention();
    await createAlarms();
    await createSentryMetricsAlarm();
    await createLogInsightsQueries();
    await createDashboard();

    console.log(`\n✅ CloudWatch configuration complete!\n`);
    console.log(`📊 View dashboard: https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || 'us-east-1'}#dashboards:name=evara-${ENVIRONMENT}-dashboard\n`);
  } catch (error) {
    console.error('\n❌ Configuration failed:', error);
    process.exit(1);
  }
}

main();
