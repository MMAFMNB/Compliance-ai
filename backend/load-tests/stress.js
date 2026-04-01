import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || 'test-token';

const healthDuration = new Trend('health_duration', true);
const alertsDuration = new Trend('alerts_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up to 20 VUs
    { duration: '1m', target: 50 },   // ramp up to 50 VUs (stress)
    { duration: '1m', target: 50 },   // hold at 50 VUs
    { duration: '30s', target: 20 },  // scale down to 20
    { duration: '30s', target: 0 },   // ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
    health_duration: ['p(95)<3000'],
    alerts_duration: ['p(95)<5000'],
  },
};

const authHeaders = {
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
};

export default function () {
  group('Health Check (stress)', () => {
    const res = http.get(`${BASE_URL}/`);
    healthDuration.add(res.timings.duration);
    check(res, {
      'GET / status is 200': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  group('Alerts (stress)', () => {
    const res = http.get(`${BASE_URL}/api/alerts`, authHeaders);
    alertsDuration.add(res.timings.duration);
    check(res, {
      'GET /api/alerts status is 200 or 401': (r) =>
        r.status === 200 || r.status === 401,
    });
  });

  sleep(0.5);
}
