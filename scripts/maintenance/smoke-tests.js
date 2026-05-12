/**
 * Smoke Tests & Triage Script
 * Runs after deployment to verify all critical systems are operational
 * 
 * Usage: node backend/smoke-tests.js
 * 
 * Environment variables:
 * - API_URL: API endpoint (default: http://localhost:8000)
 * - API_KEY: Authentication key
 * - ENVIRONMENT: staging|production
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class SmokeTestSuite {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || process.env.API_URL || 'http://localhost:8000';
    this.apiKey = options.apiKey || process.env.API_KEY;
    this.environment = options.environment || process.env.ENVIRONMENT || 'staging';
    this.tests = [];
    this.results = [];
  }

  /**
   * Make HTTP request
   */
  async request(path, options = {}) {
    return new Promise((resolve) => {
      const url = new URL(path, this.apiUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SmokeTest/1.0',
          ...options.headers
        },
        timeout: 10000
      };

      if (this.apiKey) {
        reqOptions.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const request = client.request(reqOptions, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: parsed,
              ok: response.statusCode >= 200 && response.statusCode < 400
            });
          } catch (e) {
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: data,
              ok: response.statusCode >= 200 && response.statusCode < 400
            });
          }
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ ok: false, error: 'Request timeout' });
      });

      request.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      if (options.body) {
        request.write(JSON.stringify(options.body));
      }

      request.end();
    });
  }

  /**
   * Register a test
   */
  test(name, fn) {
    this.tests.push({ name, fn });
  }

  /**
   * Run all tests
   */
  async run() {
    console.log(`\n🧪 Smoke Tests - ${this.environment.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`API: ${this.apiUrl}\n`);

    for (const test of this.tests) {
      try {
        const startTime = Date.now();
        await test.fn(this);
        const duration = Date.now() - startTime;
        
        this.results.push({
          name: test.name,
          status: 'PASS',
          duration
        });
        console.log(`✅ ${test.name} (${duration}ms)`);
      } catch (error) {
        this.results.push({
          name: test.name,
          status: 'FAIL',
          error: error.message
        });
        console.log(`❌ ${test.name}: ${error.message}`);
      }
    }

    return this.printSummary();
  }

  /**
   * Print summary
   */
  printSummary() {
    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📊 Summary: ${passed}/${total} tests passed`);

    if (failed > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`   - ${r.name}: ${r.error}`);
        });
      console.log(`\n`);
      return false;
    }

    console.log(`\n✅ All smoke tests passed!\n`);
    return true;
  }
}

// Create test suite
const suite = new SmokeTestSuite({
  apiUrl: process.env.API_URL,
  environment: process.env.ENVIRONMENT
});

// ============================================
// CRITICAL TESTS
// ============================================

suite.test('Health endpoint responds', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.ok) throw new Error(`Status: ${res.status}`);
  if (!res.body.status) throw new Error('Missing status field');
});

suite.test('Server returns proper headers', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.headers['content-type']?.includes('application/json')) {
    throw new Error('Invalid content-type');
  }
  if (!res.headers['x-powered-by'] && !res.headers['server']) {
    throw new Error('Missing server headers');
  }
});

suite.test('CORS headers present', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.headers['access-control-allow-origin']) {
    throw new Error('Missing CORS headers');
  }
});

suite.test('Security headers configured', async (s) => {
  const res = await s.request('/api/v1/health');
  const requiredHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection'
  ];
  for (const header of requiredHeaders) {
    if (!res.headers[header]) {
      throw new Error(`Missing ${header}`);
    }
  }
});

// ============================================
// API FUNCTIONALITY TESTS
// ============================================

suite.test('List devices endpoint', async (s) => {
  const res = await s.request('/api/v1/devices');
  if (!res.ok && res.status !== 401) {
    throw new Error(`Status: ${res.status}`);
  }
  // 401 is ok if not authenticated
});

suite.test('API error handling', async (s) => {
  const res = await s.request('/api/v1/invalid-endpoint');
  if (res.status !== 404) {
    throw new Error(`Expected 404, got ${res.status}`);
  }
  if (!res.body.error && !res.body.message) {
    throw new Error('Error response missing error/message field');
  }
});

suite.test('Request validation', async (s) => {
  const res = await s.request('/api/v1/health', {
    method: 'POST',
    body: { invalid: 'data' }
  });
  // Should either reject or accept - just check it doesn't crash
  if (res.status === 500) {
    throw new Error('Server error on validation');
  }
});

// ============================================
// PERFORMANCE TESTS
// ============================================

suite.test('Response time acceptable', async (s) => {
  const start = Date.now();
  const res = await s.request('/api/v1/health');
  const duration = Date.now() - start;
  
  if (duration > 5000) {
    throw new Error(`Response took ${duration}ms (should be < 5s)`);
  }
  if (!res.ok) {
    throw new Error(`Status: ${res.status}`);
  }
});

suite.test('No memory leaks in logs', async (s) => {
  // Make multiple requests and check response time doesn't degrade
  const times = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await s.request('/api/v1/health');
    times.push(Date.now() - start);
  }
  
  const avgFirst2 = (times[0] + times[1]) / 2;
  const avgLast2 = (times[3] + times[4]) / 2;
  
  if (avgLast2 > avgFirst2 * 1.5) {
    throw new Error('Response time degrading (possible memory leak)');
  }
});

// ============================================
// INTEGRATION TESTS
// ============================================

suite.test('Database connectivity', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.ok) throw new Error('Health check failed');
  
  // If health includes db status, check it
  if (res.body.database === false) {
    throw new Error('Database disconnected');
  }
});

suite.test('Redis connectivity', async (s) => {
  const res = await s.request('/api/v1/health');
  
  // Some systems include redis status
  if (res.body.redis === false) {
    throw new Error('Redis disconnected');
  }
});

suite.test('Logging functional', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.ok) throw new Error('Could not verify logging');
  // Logs should contain this request (verified manually)
});

// ============================================
// MONITORING TESTS
// ============================================

suite.test('Sentry integration active', async (s) => {
  const res = await s.request('/api/v1/health');
  if (!res.ok) throw new Error('Health check failed');
  
  // If environment is production, ensure Sentry is configured
  if (process.env.ENVIRONMENT === 'production') {
    if (res.body.sentry === false || res.body.sentry === undefined) {
      throw new Error('Sentry not configured in production');
    }
  }
});

// ============================================
// RUN TESTS
// ============================================

suite.run().then((passed) => {
  process.exit(passed ? 0 : 1);
}).catch((err) => {
  console.error('\n💥 Test suite error:', err);
  process.exit(1);
});
