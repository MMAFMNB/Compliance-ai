# k6 Load Tests for Compliance AI Backend

## Prerequisites

Install k6 on your machine:

```bash
# Windows (winget)
winget install grafana.k6

# Windows (Chocolatey)
choco install k6

# macOS (Homebrew)
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Or download directly from https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Test Scripts

| Script | Purpose | VUs | Duration |
|--------|---------|-----|----------|
| `health.js` | Smoke test on GET / | 10 | 30s |
| `api-endpoints.js` | Multi-endpoint test with auth | 0-10 | ~2m |
| `stress.js` | Stress test under heavy load | 0-50 | ~3.5m |

## Running Tests

### Against local backend (default)

```bash
# Smoke test
k6 run health.js

# API endpoints test
k6 run api-endpoints.js

# Stress test
k6 run stress.js
```

### Against production

```bash
k6 run -e BASE_URL=https://web-production-4cf15.up.railway.app health.js
```

### With a real JWT token (required for authenticated endpoints)

For endpoints that require authentication (`/api/alerts`, `/api/search`, `/api/calendar/deadlines`), you need a valid Supabase JWT token. Without one, those endpoints will return 401 responses.

```bash
# Set via environment variable
k6 run -e K6_AUTH_TOKEN=your-real-jwt-token api-endpoints.js

# Combine with production URL
k6 run \
  -e BASE_URL=https://web-production-4cf15.up.railway.app \
  -e K6_AUTH_TOKEN=your-real-jwt-token \
  api-endpoints.js
```

To get a JWT token, sign in to the app and copy the access token from your browser's developer tools (Application > Local Storage > `sb-*-auth-token` > `access_token`).

## Reading Results

After each run, k6 prints a summary. Key metrics to watch:

- **http_req_duration** -- Response time distribution (avg, p90, p95, p99)
- **http_req_failed** -- Percentage of requests that returned errors
- **http_reqs** -- Total requests and requests/second throughput
- **checks** -- Pass/fail counts for the assertions defined in each script
- **vus** -- Number of concurrent virtual users at any point

### Thresholds

Tests define pass/fail thresholds. If a threshold is breached, k6 exits with a non-zero code:

| Script | Threshold |
|--------|-----------|
| `health.js` | p95 < 1500ms, error rate < 1% |
| `api-endpoints.js` | p95 < 2000ms, error rate < 5% |
| `stress.js` | p95 < 5000ms, error rate < 10% |

### Custom Metrics (stress.js)

The stress test tracks per-endpoint response times as custom trends:

- **health_duration** -- Response time for GET /
- **alerts_duration** -- Response time for GET /api/alerts

These help identify which endpoint degrades first under load.

## Tips

- Start with `health.js` to verify connectivity before running heavier tests
- Do not run stress tests against production without coordination
- Pipe results to a JSON file for later analysis: `k6 run --out json=results.json health.js`
- Use `--summary-trend-stats` to customize which percentiles are shown
