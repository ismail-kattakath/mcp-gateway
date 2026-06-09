# Metrics & Monitoring Guide

MCP Gateway v3.0 includes comprehensive Prometheus metrics and enhanced health checks for production observability.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Metrics Endpoint](#metrics-endpoint)
3. [Available Metrics](#available-metrics)
4. [Health Check Endpoints](#health-check-endpoints)
5. [Grafana Dashboards](#grafana-dashboards)
6. [Alerting Rules](#alerting-rules)
7. [Prometheus Configuration](#prometheus-configuration)
8. [Best Practices](#best-practices)

---

## Quick Start

### 1. Enable Metrics Collection

Metrics are automatically collected when the gateway starts. No configuration required.

### 2. Scrape Metrics with Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "mcp-gateway"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics"
    scrape_interval: 15s
```

### 3. Import Grafana Dashboards

```bash
# Import pre-built dashboards
grafana-cli dashboard import docs/grafana/dashboard-overview.json
grafana-cli dashboard import docs/grafana/dashboard-mcp.json
grafana-cli dashboard import docs/grafana/dashboard-infrastructure.json
```

---

## Metrics Endpoint

**Endpoint**: `GET /metrics`

**Format**: Prometheus exposition format (text/plain)

**Authentication**: Same as other endpoints (Bearer token if auth enabled)

**Example**:

```bash
curl http://localhost:3000/metrics
```

**Response** (excerpt):

```
# HELP mcp_tool_calls_total Total number of MCP tool calls by server, tool, and status
# TYPE mcp_tool_calls_total counter
mcp_tool_calls_total{server="obs",tool="get-observations",status="success"} 42

# HELP mcp_http_request_duration_seconds HTTP request duration in seconds
# TYPE mcp_http_request_duration_seconds histogram
mcp_http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.01"} 15
mcp_http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.05"} 18
```

---

## Available Metrics

### Default Metrics (Node.js Process)

| Metric                                         | Type      | Description                 |
| ---------------------------------------------- | --------- | --------------------------- |
| `mcp_gateway_process_cpu_user_seconds_total`   | Counter   | User CPU time spent         |
| `mcp_gateway_process_cpu_system_seconds_total` | Counter   | System CPU time spent       |
| `mcp_gateway_process_resident_memory_bytes`    | Gauge     | Resident Set Size (RSS)     |
| `mcp_gateway_nodejs_heap_size_total_bytes`     | Gauge     | Heap memory total           |
| `mcp_gateway_nodejs_heap_size_used_bytes`      | Gauge     | Heap memory used            |
| `mcp_gateway_nodejs_eventloop_lag_seconds`     | Gauge     | Event loop lag              |
| `mcp_gateway_nodejs_gc_duration_seconds`       | Histogram | Garbage collection duration |

### MCP-Specific Metrics

#### Tool Call Metrics

| Metric                           | Type      | Labels                     | Description                              |
| -------------------------------- | --------- | -------------------------- | ---------------------------------------- |
| `mcp_tool_calls_total`           | Counter   | `server`, `tool`, `status` | Total tool calls (status: success/error) |
| `mcp_tool_call_duration_seconds` | Histogram | `server`, `tool`           | Tool call duration (buckets: 10ms-10s)   |

**Example queries**:

```promql
# Tool call rate by server
rate(mcp_tool_calls_total[5m])

# p95 tool call latency
histogram_quantile(0.95, sum(rate(mcp_tool_call_duration_seconds_bucket[5m])) by (server, le))

# Tool call error rate
sum(rate(mcp_tool_calls_total{status="error"}[5m])) / sum(rate(mcp_tool_calls_total[5m]))
```

#### Server Status Metrics

| Metric                      | Type    | Labels                          | Description                                                            |
| --------------------------- | ------- | ------------------------------- | ---------------------------------------------------------------------- |
| `mcp_server_status`         | Gauge   | `server`, `source`, `lifecycle` | Server status (0=stopped, 1=running, 2=failed, 3=starting, 4=stopping) |
| `mcp_server_restarts_total` | Counter | `server`, `source`              | Number of server restarts                                              |
| `mcp_server_uptime_seconds` | Gauge   | `server`                        | Server uptime                                                          |

**Example queries**:

```promql
# Running servers
count(mcp_server_status == 1)

# Failed servers
mcp_server_status{lifecycle="persistent"} == 2

# Restart rate
rate(mcp_server_restarts_total[10m])
```

#### Connection Metrics

| Metric                   | Type    | Labels      | Description                                   |
| ------------------------ | ------- | ----------- | --------------------------------------------- |
| `mcp_active_connections` | Gauge   | -           | Number of active SSE connections              |
| `mcp_connections_total`  | Counter | `transport` | Total connections (transport: sse/stdio/http) |

#### Registry Metrics

| Metric                       | Type    | Labels    | Description                                   |
| ---------------------------- | ------- | --------- | --------------------------------------------- |
| `mcp_registry_reload_total`  | Counter | `reason`  | Registry reloads (reason: file_change/manual) |
| `mcp_registry_servers_count` | Gauge   | `enabled` | Servers in registry (enabled: true/false)     |

#### Error Metrics

| Metric             | Type    | Labels           | Description                                                           |
| ------------------ | ------- | ---------------- | --------------------------------------------------------------------- |
| `mcp_errors_total` | Counter | `type`, `server` | Errors by type (tool_call, server_start, server_stop, registry, auth) |

### HTTP Metrics

| Metric                              | Type      | Labels                           | Description           |
| ----------------------------------- | --------- | -------------------------------- | --------------------- |
| `mcp_http_requests_total`           | Counter   | `method`, `route`, `status_code` | Total HTTP requests   |
| `mcp_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request duration |
| `mcp_http_request_size_bytes`       | Histogram | `method`, `route`                | HTTP request size     |
| `mcp_http_response_size_bytes`      | Histogram | `method`, `route`                | HTTP response size    |
| `mcp_http_active_requests`          | Gauge     | -                                | Active HTTP requests  |

**Example queries**:

```promql
# Request rate by endpoint
rate(mcp_http_requests_total[5m])

# p95 request latency
histogram_quantile(0.95, sum(rate(mcp_http_request_duration_seconds_bucket[5m])) by (le))

# Error rate
sum(rate(mcp_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(mcp_http_requests_total[5m]))
```

---

## Health Check Endpoints

### `/health` - Simple Health Check

**Use case**: Load balancers, simple uptime monitoring

**Response**: Always `200 OK` if process is alive

```bash
curl http://localhost:3000/health
```

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2026-06-09T12:00:00.000Z",
  "uptime": 3600.5
}
```

---

### `/healthz` - Kubernetes Liveness Probe

**Use case**: Kubernetes liveness checks (should process be restarted?)

**Response**: `200 OK` if functional, `503 Service Unavailable` if critical failure

**Failure conditions**:

- Application is shutting down
- Recent critical errors (within 5 minutes)
- Memory usage >95%

```bash
curl http://localhost:3000/healthz
```

**Success response**:

```json
{
  "status": "ok",
  "timestamp": "2026-06-09T12:00:00.000Z",
  "uptime": 3600.5
}
```

**Failure response**:

```json
{
  "status": "error",
  "message": "Application is shutting down",
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```

---

### `/readyz` - Kubernetes Readiness Probe

**Use case**: Kubernetes readiness checks (can process accept traffic?)

**Response**: `200 OK` if ready, `503 Service Unavailable` if not ready

**Checks**:

- ✅ Process is not shutting down
- ✅ At least one persistent server is running (if any configured)
- ✅ Registry is loaded and accessible

```bash
curl http://localhost:3000/readyz
```

**Success response**:

```json
{
  "status": "ok",
  "timestamp": "2026-06-09T12:00:00.000Z",
  "uptime": 3600.5,
  "checks": {
    "process": {
      "status": "ok"
    },
    "servers": {
      "status": "ok",
      "message": "2/2 persistent servers running",
      "details": {
        "total": 2,
        "running": 2,
        "runningList": ["obs", "filesystem"]
      }
    },
    "registry": {
      "status": "ok",
      "message": "Registry loaded with 5 servers",
      "details": {
        "version": "2.0",
        "serverCount": 5
      }
    }
  }
}
```

---

### `/health/detailed` - Detailed Health Status

**Use case**: Monitoring dashboards, debugging

**Response**: Always `200 OK`, includes detailed health information

```bash
curl http://localhost:3000/health/detailed
```

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2026-06-09T12:00:00.000Z",
  "uptime": 3600.5,
  "checks": {
    "process": {
      "status": "ok",
      "details": {
        "uptime": 3600.5,
        "pid": 12345,
        "nodeVersion": "v18.20.0",
        "memory": {
          "rss": 134217728,
          "heapTotal": 67108864,
          "heapUsed": 50331648,
          "heapUsedPercent": "75.00",
          "external": 2097152
        },
        "cpu": {
          "user": 5000000,
          "system": 1000000
        }
      }
    },
    "servers": {
      "status": "ok",
      "message": "2/2 enabled servers running",
      "details": {
        "total": 5,
        "enabled": 2,
        "running": 2,
        "failed": 0,
        "statuses": [...]
      }
    },
    "registry": {
      "status": "ok",
      "message": "Registry loaded",
      "details": {
        "version": "2.0",
        "serverCount": 5
      }
    }
  }
}
```

---

## Grafana Dashboards

MCP Gateway includes 3 pre-built Grafana dashboards:

### 1. Overview Dashboard (`dashboard-overview.json`)

**Metrics**:

- HTTP request rate (by endpoint)
- Error rate (5xx responses)
- Request duration percentiles (p50, p95, p99)
- Active SSE connections

**Use case**: General gateway health monitoring

---

### 2. MCP Metrics Dashboard (`dashboard-mcp.json`)

**Metrics**:

- Tool call rate by server
- Server status (color-coded: running/stopped/failed)
- Tool call duration (p95) by server
- Tool call error rate

**Use case**: MCP-specific monitoring, troubleshooting tool issues

---

### 3. Infrastructure Dashboard (`dashboard-infrastructure.json`)

**Metrics**:

- Memory usage (RSS, heap total, heap used)
- CPU usage (user, system)
- Event loop lag
- Active HTTP requests

**Use case**: Resource monitoring, capacity planning

---

### Importing Dashboards

**Option 1: Grafana UI**

1. Open Grafana → Dashboards → Import
2. Upload `docs/grafana/dashboard-*.json`
3. Select Prometheus datasource
4. Click Import

**Option 2: Provisioning** (recommended for production)

```yaml
# grafana/provisioning/dashboards/mcp-gateway.yaml
apiVersion: 1

providers:
  - name: "MCP Gateway"
    orgId: 1
    folder: "MCP Gateway"
    type: file
    options:
      path: /etc/grafana/dashboards/mcp-gateway
```

```bash
# Copy dashboards
cp docs/grafana/*.json /etc/grafana/dashboards/mcp-gateway/
```

---

## Alerting Rules

Pre-configured Prometheus alerting rules are available in `docs/prometheus/alerting-rules.yaml`.

### Included Alerts

| Alert                      | Severity | Threshold | Description                  |
| -------------------------- | -------- | --------- | ---------------------------- |
| `HighErrorRate`            | Critical | >5%       | High HTTP 5xx error rate     |
| `ModerateErrorRate`        | Warning  | >1%       | Moderate HTTP error rate     |
| `HighP95Latency`           | Warning  | >1s       | High request latency         |
| `VeryHighP95Latency`       | Critical | >5s       | Very high request latency    |
| `MCPServerDown`            | Critical | 2min      | Persistent server stopped    |
| `MCPServerFailed`          | Critical | 1min      | Server in failed state       |
| `HighServerRestartRate`    | Warning  | >0.1/min  | Server restarting frequently |
| `HighToolCallErrorRate`    | Warning  | >10%      | High tool call error rate    |
| `ToolCallTimeout`          | Warning  | >30s      | Tool calls timing out        |
| `HighMemoryUsage`          | Warning  | >90%      | High heap usage              |
| `CriticalMemoryUsage`      | Critical | >95%      | Critical heap usage          |
| `HighEventLoopLag`         | Warning  | >0.1s     | High event loop lag          |
| `NoActiveConnections`      | Warning  | 10min     | No active connections        |
| `TooManyActiveConnections` | Warning  | >100      | Too many connections         |
| `NoEnabledServers`         | Critical | -         | No servers configured        |
| `FrequentRegistryReloads`  | Warning  | >0.5/min  | Frequent registry changes    |

### Configuring Alerts

```yaml
# prometheus.yml
rule_files:
  - "alerting-rules.yaml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - "localhost:9093"
```

---

## Prometheus Configuration

### Complete Example

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerting-rules.yaml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - "localhost:9093"

scrape_configs:
  - job_name: "mcp-gateway"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics"
    scrape_interval: 15s
    scrape_timeout: 10s
    # If auth is enabled:
    # bearer_token: 'your-api-key-here'
```

### Docker Compose Example

```yaml
version: "3.8"

services:
  mcp-gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    ports:
      - "3000:3000"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alerting-rules.yaml:/etc/prometheus/alerting-rules.yaml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.console.libraries=/usr/share/prometheus/console_libraries"
      - "--web.console.templates=/usr/share/prometheus/consoles"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana-data:/var/lib/grafana
      - ./docs/grafana:/etc/grafana/dashboards/mcp-gateway:ro
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/etc/grafana/dashboards/mcp-gateway/dashboard-overview.json

volumes:
  prometheus-data:
  grafana-data:
```

---

## Best Practices

### 1. Metrics Collection

✅ **Do**:

- Set `scrape_interval` to 15-30s (balance between granularity and load)
- Use histograms for latency (not summaries)
- Keep metric cardinality low (<100 unique label combinations)

❌ **Don't**:

- Don't scrape metrics more frequently than 10s
- Don't create high-cardinality labels (user IDs, timestamps, UUIDs)
- Don't use summaries (quantiles are pre-calculated, can't be aggregated)

---

### 2. Alerting

✅ **Do**:

- Use `for` clause to avoid flapping alerts (e.g., `for: 5m`)
- Set appropriate thresholds based on baseline metrics
- Include contextual information in alert annotations
- Test alerts in staging before production

❌ **Don't**:

- Don't alert on every small anomaly (alert fatigue)
- Don't use alerting for logs/debugging (use detailed health endpoint)

---

### 3. Dashboard Design

✅ **Do**:

- Use percentiles (p50, p95, p99) for latency, not averages
- Show rate of change (use `rate()` or `irate()`)
- Include time range selectors
- Use color-coding for status (green=good, yellow=warning, red=critical)

❌ **Don't**:

- Don't show absolute counter values (always use rate)
- Don't clutter dashboards with too many metrics

---

### 4. Production Monitoring

**Essential dashboards**:

1. Overview dashboard (always visible)
2. MCP metrics dashboard (for troubleshooting)
3. Infrastructure dashboard (for capacity planning)

**Essential alerts**:

- `HighErrorRate` (critical)
- `MCPServerDown` (critical)
- `MCPServerFailed` (critical)
- `HighMemoryUsage` (warning)

**Health check configuration**:

```yaml
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

# Kubernetes readiness probe
readinessProbe:
  httpGet:
    path: /readyz
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
```

---

## Troubleshooting

### Metrics Not Appearing

**Problem**: Prometheus is scraping but no metrics appear

**Solutions**:

1. Check authentication:

   ```bash
   # If auth enabled, use Bearer token
   curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/metrics
   ```

2. Check metrics endpoint directly:

   ```bash
   curl http://localhost:3000/metrics
   ```

3. Check Prometheus targets:
   - Open http://localhost:9090/targets
   - Verify target is "UP" and not "DOWN"

---

### High Cardinality Warning

**Problem**: Too many unique label combinations

**Cause**: Dynamic labels (user IDs, session IDs, etc.)

**Solution**: Metrics are pre-configured with bounded cardinality. Routes are normalized:

- `/api/servers/my-server` → `/api/servers/:serverName`
- UUIDs → `:uuid`
- Numeric IDs → `:id`

If you modify metrics, ensure labels have <10 unique values.

---

### Memory Usage Increasing

**Problem**: Prometheus or Grafana consuming too much memory

**Solutions**:

1. Reduce retention period:

   ```yaml
   # prometheus.yml
   storage:
     tsdb:
       retention.time: 15d # Default: 15 days, reduce if needed
   ```

2. Reduce scrape frequency:

   ```yaml
   scrape_interval: 30s # Increase from 15s
   ```

3. Use recording rules for expensive queries:
   ```yaml
   # prometheus.yml
   groups:
     - name: mcp_recordings
       interval: 30s
       rules:
         - record: mcp:request_rate:5m
           expr: sum(rate(mcp_http_requests_total[5m]))
   ```

---

## Additional Resources

- [Prometheus Querying Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [MCP Gateway GitHub Discussions](https://github.com/ismail-kattakath/mcp-gateway/discussions)

---

**Need help?** Open an issue or discussion on GitHub.
