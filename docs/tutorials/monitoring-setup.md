# Tutorial: Monitoring with Prometheus + Grafana

Set up comprehensive monitoring for MCP Gateway.

## Overview

**What you'll learn:**

- Install Prometheus and Grafana
- Configure metrics collection
- Create Grafana dashboards
- Set up alerting rules
- Implement distributed tracing

**Prerequisites:**

- MCP Gateway v3.0+
- Kubernetes cluster or Docker Compose
- Basic Prometheus knowledge

**Time:** 35 minutes

## Architecture

```
MCP Gateway → Prometheus (metrics) → Grafana (visualization)
           → Jaeger (tracing)      → Alertmanager (alerts)
```

## Step 1: Install Prometheus

### Option A: Kubernetes (kube-prometheus-stack)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### Option B: Docker Compose

```yaml
version: "3.8"
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"

volumes:
  prometheus-data:
```

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "mcp-gateway"
    static_configs:
      - targets: ["gateway:3000"]
    metrics_path: "/metrics"
```

Start services:

```bash
docker-compose up -d
```

## Step 2: Configure MCP Gateway Metrics

### 2.1 Enable Metrics Endpoint

Metrics are enabled by default. Verify:

```bash
curl http://localhost:3000/metrics
```

### 2.2 Key Metrics Exposed

**Request Metrics:**

```
mcp_gateway_requests_total{method,path,status}
mcp_gateway_request_duration_seconds{method,path}
mcp_gateway_request_size_bytes{method,path}
mcp_gateway_response_size_bytes{method,path}
```

**Tool Call Metrics:**

```
mcp_gateway_tool_calls_total{server,tool,status}
mcp_gateway_tool_call_duration_seconds{server,tool}
mcp_gateway_tool_call_errors_total{server,tool,error_type}
```

**Server Metrics:**

```
mcp_gateway_server_state{server,state}
mcp_gateway_server_uptime_seconds{server}
mcp_gateway_server_restarts_total{server}
```

**Process Metrics:**

```
process_cpu_seconds_total
process_resident_memory_bytes
process_heap_bytes
nodejs_eventloop_lag_seconds
```

## Step 3: Install and Configure Grafana

### 3.1 Install Grafana

**Kubernetes:**

```bash
# Already included in kube-prometheus-stack
kubectl get svc -n monitoring prometheus-grafana
```

**Docker Compose:**

```yaml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  volumes:
    - grafana-data:/var/lib/grafana
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 3.2 Access Grafana

**Kubernetes:**

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3001:80
```

**Docker Compose:**
Navigate to http://localhost:3001

Default credentials: admin / admin

### 3.3 Add Prometheus Data Source

1. Configuration → Data Sources → Add data source
2. Select "Prometheus"
3. URL: `http://prometheus:9090` (Docker) or `http://prometheus-kube-prometheus-prometheus:9090` (K8s)
4. Click "Save & Test"

### 3.4 Import Dashboard

1. Create → Import
2. Upload `deploy/monitoring/grafana-dashboard.json`
3. Select Prometheus data source
4. Click "Import"

## Step 4: Create Custom Dashboards

### 4.1 Request Rate Panel

```
rate(mcp_gateway_requests_total[5m])
```

### 4.2 Error Rate Panel

```
sum(rate(mcp_gateway_requests_total{status=~"5.."}[5m])) /
sum(rate(mcp_gateway_requests_total[5m])) * 100
```

### 4.3 Latency Percentiles

```
histogram_quantile(0.50,
  rate(mcp_gateway_request_duration_seconds_bucket[5m]))

histogram_quantile(0.95,
  rate(mcp_gateway_request_duration_seconds_bucket[5m]))

histogram_quantile(0.99,
  rate(mcp_gateway_request_duration_seconds_bucket[5m]))
```

### 4.4 Server Health

```
mcp_gateway_server_state{state="running"}
```

## Step 5: Configure Alerting

### 5.1 Create Alert Rules

Create `prometheus-rules.yml`:

```yaml
groups:
  - name: mcp-gateway
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(mcp_gateway_requests_total{status=~"5.."}[5m])) /
          sum(rate(mcp_gateway_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: ServerDown
        expr: mcp_gateway_server_state{state="running"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Server {{ $labels.server }} is down"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes > 1073741824
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage (>1GB)"

      - alert: SlowToolCalls
        expr: |
          histogram_quantile(0.95,
            rate(mcp_gateway_tool_call_duration_seconds_bucket[5m])
          ) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile tool call latency >5s"
```

### 5.2 Configure Alertmanager

Create `alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ["alertname", "severity"]
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: "slack"

receivers:
  - name: "slack"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#mcp-alerts"
        title: "MCP Gateway Alert"
        text: "{{ range .Alerts }}{{ .Annotations.description }}{{ end }}"
```

## Step 6: Distributed Tracing (Jaeger)

### 6.1 Install Jaeger

**Kubernetes:**

```bash
kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-operator/main/deploy/jaeger-operator.yaml

kubectl apply -f - <<EOF
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: jaeger
  namespace: mcp-gateway
EOF
```

**Docker Compose:**

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"
    - "14268:14268"
  environment:
    - COLLECTOR_ZIPKIN_HTTP_PORT=9411
```

### 6.2 Configure Gateway for Tracing

Edit `config.json`:

```json
{
  "tracing": {
    "enabled": true,
    "provider": "jaeger",
    "endpoint": "http://jaeger:14268/api/traces",
    "serviceName": "mcp-gateway",
    "samplingRate": 0.1
  }
}
```

### 6.3 View Traces

Navigate to http://localhost:16686 and search for traces.

## Step 7: Log Aggregation (ELK Stack)

### 7.1 Install Elasticsearch + Kibana

```yaml
elasticsearch:
  image: elasticsearch:8.11.0
  ports:
    - "9200:9200"
  environment:
    - discovery.type=single-node

kibana:
  image: kibana:8.11.0
  ports:
    - "5601:5601"
  environment:
    - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
```

### 7.2 Configure Log Shipping

```json
{
  "logging": {
    "outputs": [
      {
        "type": "elasticsearch",
        "host": "elasticsearch:9200",
        "index": "mcp-gateway-logs"
      }
    ]
  }
}
```

## Troubleshooting

**Issue: Metrics not appearing**

Check Prometheus targets:

```bash
curl http://localhost:9090/api/v1/targets
```

**Issue: High cardinality metrics**

Limit label values or increase Prometheus memory.

**Issue: Missing traces**

Increase sampling rate temporarily:

```json
{ "tracing": { "samplingRate": 1.0 } }
```

## Best Practices

1. **Set up alerts** - Don't just collect metrics
2. **Use dashboards** - Create role-specific views
3. **Monitor SLIs** - Track latency, availability, throughput
4. **Set SLOs** - Define acceptable performance
5. **Correlate logs and traces** - Use trace IDs in logs

## Next Steps

- [Production Deployment Guide](../PRODUCTION_DEPLOYMENT.md)
- [Performance Tuning](../PERFORMANCE_TUNING.md)
- [Security Hardening](../SECURITY_HARDENING.md)
