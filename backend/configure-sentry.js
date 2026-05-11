/**
 * Sentry Configuration Script
 * Sets up Sentry DSN and adds it to AWS Secrets Manager
 * 
 * Usage: node backend/configure-sentry.js --environment=staging|production
 * 
 * Prerequisites:
 * - AWS CLI configured with credentials
 * - Sentry account with project created
 * - AWS Secrets Manager access
 */

const AWS = require('aws-sdk');
const path = require('path');

const secretsManager = new AWS.SecretsManager({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const SECRET_NAME = `evara/${ENVIRONMENT}/sentry-dsn`;

/**
 * Create or retrieve Sentry DSN from Secrets Manager
 */
async function manageSentryDSN() {
  console.log(`🔐 Managing Sentry DSN for ${ENVIRONMENT.toUpperCase()} environment\n`);

  try {
    // Try to get existing secret
    try {
      const response = await secretsManager.getSecretValue({
        SecretId: SECRET_NAME
      }).promise();

      console.log(`✅ Found existing Sentry DSN in Secrets Manager`);
      console.log(`   Secret Name: ${SECRET_NAME}`);
      
      const secret = JSON.parse(response.SecretString);
      console.log(`   DSN: ${secret.dsn ? secret.dsn.substring(0, 30) + '...' : 'Not set'}`);
      
      return secret.dsn;
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        console.log(`ℹ️  No existing Sentry DSN found. Creating new secret...\n`);

        // Create new secret
        const sentryDSN = process.env.SENTRY_DSN || await promptForSentryDSN();

        const response = await secretsManager.createSecret({
          Name: SECRET_NAME,
          Description: `Sentry DSN for ${ENVIRONMENT} environment`,
          SecretString: JSON.stringify({
            dsn: sentryDSN,
            environment: ENVIRONMENT,
            createdAt: new Date().toISOString(),
            release: process.env.GIT_SHA || 'unknown'
          }),
          Tags: [
            { Key: 'Application', Value: 'EvaraOne' },
            { Key: 'Environment', Value: ENVIRONMENT },
            { Key: 'Component', Value: 'ErrorTracking' }
          ]
        }).promise();

        console.log(`✅ Created Sentry DSN secret in Secrets Manager`);
        console.log(`   Name: ${response.Name}`);
        console.log(`   ARN: ${response.ARN}\n`);

        return sentryDSN;
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error('❌ Error managing Sentry DSN:', error.message);
    throw error;
  }
}

/**
 * Prompt user for Sentry DSN if not provided
 */
async function promptForSentryDSN() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log(`\n📝 Please enter your Sentry DSN`);
    console.log(`   Format: https://<key>@<org>.ingest.sentry.io/<project-id>`);
    console.log(`   Get it from: https://sentry.io/settings/projects/\n`);

    rl.question('Sentry DSN: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Configure Sentry integration in environment variables
 */
async function configureEnvironmentVariables() {
  console.log('📋 Environment variables to add:\n');

  const envVars = {
    SENTRY_DSN: 'Retrieved from AWS Secrets Manager',
    SENTRY_ENVIRONMENT: ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE: ENVIRONMENT === 'production' ? '0.1' : '1.0',
    SENTRY_PROFILES_SAMPLE_RATE: ENVIRONMENT === 'production' ? '0.01' : '0.1',
    SENTRY_ENABLED: 'true'
  };

  Object.entries(envVars).forEach(([key, value]) => {
    console.log(`   ${key}=${value}`);
  });

  console.log('\n✅ These will be set in AWS ECS Task Definition or Parameter Store\n');
}

/**
 * Create Sentry integration test
 */
function generateSentryIntegrationCode() {
  console.log('🧪 Sentry integration code:\n');

  const code = `
// In your server initialization (src/server.js or similar):

import * as Sentry from "@sentry/node";

if (process.env.SENTRY_ENABLED === 'true') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.01'),
    
    // Integrations
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],

    // Performance monitoring
    beforeSend(event) {
      // Filter out sensitive data
      if (event.request) {
        event.request.cookies = undefined;
        event.request.headers = undefined;
      }
      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      'NetworkError',
      'TimeoutError',
      'Non-Error promise rejection captured'
    ]
  });

  // Attach Sentry to Express middleware
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.errorHandler());
}
  `.trim();

  console.log(code);
  console.log('\n');
}

/**
 * Setup error reporting test
 */async function setupErrorReporting() {
  console.log('📧 Setting up error notifications:\n');

  console.log('1. Sentry alerts (automatic):');
  console.log('   - Go to https://sentry.io/settings/alerts/');
  console.log('   - Create alert for this project');
  console.log('   - Set threshold: 10 errors in 1 minute\n');

  console.log('2. Optional: Slack integration:');
  console.log('   - https://sentry.io/integrations/slack/');
  console.log('   - Select your Slack workspace');
  console.log('   - Choose #errors or #alerts channel\n');

  console.log('3. Optional: Email notifications:');
  console.log('   - https://sentry.io/settings/account/notifications/');
  console.log('   - Configure for your email\n');
}

/**
 * Generate deployment instructions
 */
function generateDeploymentInstructions() {
  console.log('📖 Deployment instructions:\n');

  console.log('1. For AWS ECS Task Definition:');
  console.log('```json');
  console.log('{');
  console.log('  "containerDefinitions": [');
  console.log('    {');
  console.log('      "name": "evara-backend",');
  console.log('      "environment": [');
  console.log('        {');
  console.log('          "name": "SENTRY_DSN",');
  console.log('          "value": "arn:aws:secretsmanager:region:account:secret:evara/' + ENVIRONMENT + '/sentry-dsn"');
  console.log('        },');
  console.log('        {');
  console.log('          "name": "SENTRY_ENVIRONMENT",');
  console.log('          "value": "' + ENVIRONMENT + '"');
  console.log('        },');
  console.log('        {');
  console.log('          "name": "SENTRY_ENABLED",');
  console.log('          "value": "true"');
  console.log('        }');
  console.log('      ],');
  console.log('      "secrets": [');
  console.log('        {');
  console.log('          "name": "SENTRY_DSN",');
  console.log('          "valueFrom": "arn:aws:secretsmanager:region:account:secret:evara/' + ENVIRONMENT + '/sentry-dsn:dsn::"');
  console.log('        }');
  console.log('      ]');
  console.log('    }');
  console.log('  ]');
  console.log('}');
  console.log('```\n');

  console.log('2. For GitHub Actions (update .github/workflows/deploy.yml):');
  console.log('```yaml');
  console.log('- name: Configure Sentry');
  console.log('  run: node backend/configure-sentry.js --environment=${{ matrix.environment }}');
  console.log('  env:');
  console.log('    SENTRY_DSN: ${{ secrets.SENTRY_DSN }}');
  console.log('```\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log(`\n🚨 Sentry Configuration Script\n${'='.repeat(50)}\n`);

    // Configure Sentry DSN
    const sentryDSN = await manageSentryDSN();

    // Show configuration
    await configureEnvironmentVariables();

    // Show integration code
    generateSentryIntegrationCode();

    // Setup error reporting
    await setupErrorReporting();

    // Generate deployment instructions
    generateDeploymentInstructions();

    console.log('✅ Sentry configuration complete!\n');
    console.log('Next steps:');
    console.log('1. Update AWS ECS task definition with SENTRY_DSN from Secrets Manager');
    console.log('2. Update GitHub Actions secrets with SENTRY_DSN');
    console.log('3. Deploy and verify errors are being tracked in Sentry\n');

  } catch (error) {
    console.error('\n❌ Configuration failed:', error);
    process.exit(1);
  }
}

main();
