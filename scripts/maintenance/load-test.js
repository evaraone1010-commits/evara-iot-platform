/**
 * Load Testing Script for Staging Environment
 * Simulates realistic user load to identify bottlenecks
 * 
 * Usage: 
 * node backend/load-test.js --url=http://localhost:8000 --duration=300 --rps=100
 * 
 * Environment variables:
 * - TARGET_URL: API endpoint (default: http://localhost:8000)
 * - TEST_DURATION: Duration in seconds (default: 300)
 * - REQUESTS_PER_SECOND: Target RPS (default: 50)
 * - API_KEY: Authentication key
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class LoadTester {
  constructor(options = {}) {
    this.targetUrl = options.url || process.env.TARGET_URL || 'http://localhost:8000';
    this.duration = options.duration || parseInt(process.env.TEST_DURATION) || 300;
    this.rps = options.rps || parseInt(process.env.REQUESTS_PER_SECOND) || 50;
    this.apiKey = options.apiKey || process.env.API_KEY;

    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      timeoutRequests: 0,
      responseTimes: [],
      statusCodes: {},
      errors: []
    };

    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Make HTTP request
   */
  makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve) => {
      const url = new URL(path, this.targetUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const startTime = Date.now();
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoadTester/1.0'
        },
        timeout: 10000
      };

      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const request = client.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          const responseTime = Date.now() - startTime;
          resolve({
            success: response.statusCode >= 200 && response.statusCode < 400,
            statusCode: response.statusCode,
            responseTime: responseTime,
            data: data
          });
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({
          success: false,
          statusCode: 0,
          responseTime: Date.now() - startTime,
          timeout: true
        });
      });

      request.on('error', (err) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          statusCode: 0,
          responseTime: responseTime,
          error: err.message
        });
      });

      if (body) {
        request.write(JSON.stringify(body));
      }

      request.end();
    });
  }

  /**
   * Test health endpoint
   */
  async testHealthEndpoint() {
    const result = await this.makeRequest('/api/v1/health');
    return result;
  }

  /**
   * Test device listing endpoint
   */
  async testDeviceListEndpoint() {
    const result = await this.makeRequest('/api/v1/devices');
    return result;
  }

  /**
   * Test socket connection
   */
  async testWebSocketEndpoint() {
    // This is a simplified check - actual WebSocket testing would require ws library
    const result = await this.makeRequest('/');
    return result;
  }

  /**
   * Run load test scenario
   */
  async runLoadTest() {
    console.log(`\n🔥 Starting Load Test`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Target: ${this.targetUrl}`);
    console.log(`Duration: ${this.duration}s`);
    console.log(`Target RPS: ${this.rps}`);
    console.log(`${'-'.repeat(60)}\n`);

    this.startTime = Date.now();
    const endTime = this.startTime + (this.duration * 1000);
    let requestCount = 0;

    const testEndpoints = [
      { path: '/api/v1/health', weight: 10 },
      { path: '/api/v1/devices', weight: 5 },
      { path: '/', weight: 2 }
    ];

    const interval = 1000 / this.rps; // Milliseconds per request

    console.log('🚀 Ramping up load...\n');

    while (Date.now() < endTime) {
      const now = Date.now();
      const elapsed = (now - this.startTime) / 1000;

      // Ramp-up phase (first 30 seconds)
      let currentRps = this.rps;
      if (elapsed < 30) {
        currentRps = Math.floor((this.rps / 30) * elapsed);
      }

      // Ramp-down phase (last 20 seconds)
      if (elapsed > this.duration - 20) {
        const timeRemaining = this.duration - elapsed;
        currentRps = Math.floor((this.rps / 20) * timeRemaining);
      }

      // Send requests
      for (let i = 0; i < currentRps && Date.now() < endTime; i++) {
        const endpoint = testEndpoints[
          Math.floor(Math.random() * testEndpoints.length)
        ];
        
        this.sendRequest(endpoint.path);
        await this.sleep(interval);
      }

      // Print progress every 10 seconds
      if (Math.floor(elapsed) % 10 === 0 && elapsed % 1 < 0.1) {
        this.printProgress(elapsed);
      }
    }

    this.endTime = Date.now();
    await this.sleep(2000); // Wait for final responses

    return this.generateReport();
  }

  /**
   * Send request without waiting
   */
  sendRequest(path) {
    this.stats.totalRequests++;
    this.makeRequest(path).then((result) => {
      if (result.success) {
        this.stats.successRequests++;
      } else if (result.timeout) {
        this.stats.timeoutRequests++;
      } else {
        this.stats.errorRequests++;
      }

      this.stats.responseTimes.push(result.responseTime);
      this.stats.statusCodes[result.statusCode] =
        (this.stats.statusCodes[result.statusCode] || 0) + 1;

      if (!result.success) {
        this.stats.errors.push({
          statusCode: result.statusCode,
          error: result.error || 'Unknown error',
          timeout: result.timeout
        });
      }
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Print test progress
   */
  printProgress(elapsed) {
    const successRate = (
      (this.stats.successRequests / this.stats.totalRequests) *
      100
    ).toFixed(1);
    const avgResponseTime = (
      this.stats.responseTimes.reduce((a, b) => a + b, 0) /
      this.stats.responseTimes.length
    ).toFixed(0);

    console.log(
      `⏱️  ${Math.floor(elapsed)}s | ` +
      `Req: ${this.stats.totalRequests} | ` +
      `Success: ${successRate}% | ` +
      `Avg Response: ${avgResponseTime}ms`
    );
  }

  /**
   * Calculate percentiles
   */
  percentile(arr, p) {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    const duration = (this.endTime - this.startTime) / 1000;
    const throughput = this.stats.totalRequests / duration;
    const successRate = (
      (this.stats.successRequests / this.stats.totalRequests) *
      100
    ).toFixed(2);
    const errorRate = (
      (this.stats.errorRequests / this.stats.totalRequests) *
      100
    ).toFixed(2);

    const responseTimes = this.stats.responseTimes;
    const avgResponseTime = (
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    ).toFixed(2);
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    const p50 = this.percentile([...responseTimes], 50);
    const p95 = this.percentile([...responseTimes], 95);
    const p99 = this.percentile([...responseTimes], 99);

    console.log(`\n\n📊 Load Test Results`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\n📈 Overall Metrics:`);
    console.log(`  Total Requests:    ${this.stats.totalRequests}`);
    console.log(`  Test Duration:     ${duration.toFixed(1)}s`);
    console.log(`  Throughput:        ${throughput.toFixed(2)} req/s`);

    console.log(`\n✅ Success Metrics:`);
    console.log(`  Successful:        ${this.stats.successRequests} (${successRate}%)`);
    console.log(`  Errors:            ${this.stats.errorRequests} (${errorRate}%)`);
    console.log(`  Timeouts:          ${this.stats.timeoutRequests}`);

    console.log(`\n⏱️  Response Time (ms):`);
    console.log(`  Min:               ${minResponseTime}`);
    console.log(`  Max:               ${maxResponseTime}`);
    console.log(`  Average:           ${avgResponseTime}`);
    console.log(`  Median (P50):      ${p50}`);
    console.log(`  P95:               ${p95}`);
    console.log(`  P99:               ${p99}`);

    console.log(`\n📊 Status Code Distribution:`);
    Object.entries(this.stats.statusCodes)
      .sort()
      .forEach(([code, count]) => {
        const pct = ((count / this.stats.totalRequests) * 100).toFixed(1);
        console.log(`  ${code}:              ${count} (${pct}%)`);
      });

    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Top Errors:`);
      const errorTypes = {};
      this.stats.errors.forEach((err) => {
        const key = `${err.statusCode}: ${err.error}`;
        errorTypes[key] = (errorTypes[key] || 0) + 1;
      });
      Object.entries(errorTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([err, count]) => {
          console.log(`  ${err}: ${count}x`);
        });
    }

    console.log(`\n${'='.repeat(60)}`);

    // Assessment
    console.log(`\n🎯 Assessment:`);
    if (successRate >= 99) {
      console.log(`  ✅ Excellent performance`);
    } else if (successRate >= 95) {
      console.log(`  ⚠️  Good, but some errors detected`);
    } else {
      console.log(`  ❌ Poor success rate, investigate errors`);
    }

    if (parseFloat(avgResponseTime) < 200) {
      console.log(`  ✅ Response times are excellent`);
    } else if (parseFloat(avgResponseTime) < 500) {
      console.log(`  ⚠️  Response times acceptable`);
    } else {
      console.log(`  ❌ Response times too high, optimize needed`);
    }

    if (p95 < 1000) {
      console.log(`  ✅ P95 response time acceptable`);
    } else {
      console.log(`  ⚠️  P95 response time needs improvement`);
    }

    console.log(`\n`);

    return {
      totalRequests: this.stats.totalRequests,
      successRate: parseFloat(successRate),
      errorRate: parseFloat(errorRate),
      avgResponseTime: parseFloat(avgResponseTime),
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      throughput: throughput
    };
  }
}

// Run the test
const tester = new LoadTester({
  url: process.env.TARGET_URL || 'http://localhost:8000',
  duration: parseInt(process.env.TEST_DURATION) || 60,
  rps: parseInt(process.env.REQUESTS_PER_SECOND) || 50,
  apiKey: process.env.API_KEY
});

tester.runLoadTest().then((results) => {
  process.exit(results.successRate >= 99 ? 0 : 1);
});
