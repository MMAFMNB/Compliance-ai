import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || 'test-token';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // ramp up to 10 VUs
    { duration: '1m', target: 10 },  // hold at 10 VUs
    { duration: '30s', target: 0 },  // ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

const authHeaders = {
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
};

export default function () {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/`);
    check(res, {
      'GET / status is 200': (r) => r.status === 200,
      'GET / response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(0.5);

  group('Calendar Deadlines', () => {
    const res = http.get(
      `${BASE_URL}/api/calendar/deadlines`,
      authHeaders
    );
    check(res, {
      'GET /api/calendar/deadlines status is 200 or 401': (r) =>
        r.status === 200 || r.status === 401,
      'GET /api/calendar/deadlines response time < 2000ms': (r) =>
        r.timings.duration < 2000,
    });
  });

  sleep(1);
}
