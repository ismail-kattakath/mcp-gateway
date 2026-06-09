# Distributed Tracing with OpenTelemetry

MCP Gateway v3.0 includes comprehensive distributed tracing with OpenTelemetry, enabling you to track requests across the entire system from client → gateway → MCP servers.

## Overview

**Distributed tracing** helps you:

- Debug performance issues (identify slow operations)
- Understand request flows (visualize the entire call chain)
- Correlate logs with traces (trace_id in all log entries)
- Monitor MCP server health (track failures and latencies)

**Key features**:

- ✅ OpenTelemetry SDK (industry standard)
- ✅ Auto-instrumentation (HTTP, Express)
- ✅ Custom spans for MCP operations
- ✅ OTLP exporter (supports Jaeger, Zipkin, etc.)
- ✅ W3C Trace Context propagation
- ✅ Sampling configuration (control trace volume)
- ✅ Log correlation (trace_id in Pino logs)

## Quick Start

### 1. Start Jaeger (Local Development)

```bash
# Start Jaeger all-in-one with Docker Compose
docker-compose -f docker-compose.tracing.yml up -d

# Verify Jaeger is running
curl http://localhost:16686/api/services
```

### 2. Configure Tracing (Optional)

Tracing is **enabled by default** with sensible defaults:

```bash
# Environment variables (optional)
export OTEL_SERVICE_NAME=mcp-gateway
export OTEL_SERVICE_VERSION=3.0.0
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_TRACES_SAMPLER=parentbased_always_on
export OTEL_TRACES_SAMPLER_ARG=1.0
```

### 3. Start Gateway

```bash
cd server
npm run dev
```

### 4. View Traces

Open Jaeger UI: **http://localhost:16686**

1. Select service: `mcp-gateway`
2. Click "Find Traces"
3. Click on any trace to see the full request flow

## Architecture

### Trace Flow

```
Client Request
  ↓
HTTP Auto-Instrumentation (OpenTelemetry)
  ↓ span: HTTP POST /mcp
Express Auto-Instrumentation
  ↓ span: POST /mcp
MCP Protocol Handler
  ↓ span: mcp.tools.list or mcp.tool.call
Router
  ↓ span: mcp.tool.call obs/get-data
Server Manager
  ↓ span: mcp.server.start obs (if on-demand)
MCP Server (obs-mcp)
  ↓ span: execute tool
← Results propagate back with timing
```

### Custom Spans

MCP Gateway creates custom spans for:

| Span Name                   | Attributes                                                                  | Description              |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| `mcp.tools.list`            | `mcp.tools.count`                                                           | List all available tools |
| `mcp.tool.call <tool>`      | `mcp.server.name`, `mcp.tool.name`, `mcp.tool.arg_count`, `mcp.result.size` | Tool call execution      |
| `mcp.server.start <server>` | `mcp.server.name`, `mcp.server.source`, `mcp.server.start_duration_ms`      | Server startup           |
| `mcp.server.stop <server>`  | `mcp.server.name`                                                           | Server shutdown          |
| `mcp.registry.reload`       | `mcp.registry.reload_reason`                                                | Registry reload          |
| `mcp.connection`            | `mcp.client.name`, `mcp.client.version`                                     | SSE connection           |

### Span Attributes

All custom spans include:

- `mcp.operation` - Operation type (e.g., `tool.call`)
- `mcp.status` - Success/error status
- `mcp.error.type` - Error type (if failed)

## Configuration

### Sampling Strategies

Control which traces are recorded (important for production):

#### 1. Always On (Development)

```bash
# Record 100% of traces
export OTEL_TRACES_SAMPLER=always_on
```

#### 2. Always Off (Disable Tracing)

```bash
# Disable all tracing
export OTEL_TRACING_ENABLED=false
```

#### 3. Ratio-Based (Production)

```bash
# Record 10% of traces randomly
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1
```

#### 4. Parent-Based (Recommended)

```bash
# Record based on parent span decision
# + 10% of root traces
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1
```

**Recommendation**:

- **Development**: `always_on` (100%)
- **Staging**: `traceidratio` with `0.5` (50%)
- **Production**: `parentbased_traceidratio` with `0.1` (10%)

### Exporter Endpoints

MCP Gateway uses **OTLP HTTP exporter** (OpenTelemetry Protocol).

| Backend             | Endpoint                                 | Notes                      |
| ------------------- | ---------------------------------------- | -------------------------- |
| Jaeger (local)      | `http://localhost:4318/v1/traces`        | Default                    |
| Jaeger (production) | `http://jaeger-collector:4318/v1/traces` | K8s service                |
| Zipkin              | `http://localhost:9411/api/v2/spans`     | Use OTLP-to-Zipkin adapter |
| Grafana Tempo       | `http://tempo:4318/v1/traces`            | OTLP compatible            |
| AWS X-Ray           | Use OTLP-to-X-Ray adapter                | See AWS distro             |
| Google Cloud Trace  | Use OTLP-to-Cloud-Trace adapter          | See GCP docs               |

**Change exporter**:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318/v1/traces
```

## Trace-Log Correlation

Every log entry includes `trace_id` and `span_id` fields when inside an active span.

**Example log**:

```json
{
  "level": "info",
  "time": 1672531200000,
  "msg": "Handling tools/call request",
  "trace_id": "8f3c5e9d7b2a1c4e6f8g0h2i4j6k8l0m",
  "span_id": "1a2b3c4d5e6f7g8h",
  "toolName": "obs/get-data",
  "hasArguments": true
}
```

**Search logs by trace ID**:

```bash
# Filter logs by trace_id
cat ~/.mcp/logs/gateway.log | grep "8f3c5e9d7b2a1c4e6f8g0h2i4j6k8l0m"
```

**View trace in Jaeger**:

1. Open Jaeger UI: http://localhost:16686
2. Search by trace ID: `8f3c5e9d7b2a1c4e6f8g0h2i4j6k8l0m`
3. See the full request timeline

## Production Deployment

### Jaeger Production Setup

**Don't use all-in-one in production!** Use separate components:

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  jaeger-collector:
    image: jaegertracing/jaeger-collector:1.51
    environment:
      - SPAN_STORAGE_TYPE=elasticsearch
      - ES_SERVER_URLS=http://elasticsearch:9200
    ports:
      - "4318:4318" # OTLP HTTP
      - "4317:4317" # OTLP gRPC

  jaeger-query:
    image: jaegertracing/jaeger-query:1.51
    environment:
      - SPAN_STORAGE_TYPE=elasticsearch
      - ES_SERVER_URLS=http://elasticsearch:9200
    ports:
      - "16686:16686" # UI

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
    volumes:
      - esdata:/usr/share/elasticsearch/data

volumes:
  esdata:
```

### Gateway Configuration

```bash
# Production environment variables
export OTEL_SERVICE_NAME=mcp-gateway
export OTEL_SERVICE_VERSION=3.0.0
export OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger-collector:4318/v1/traces
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway
spec:
  template:
    spec:
      containers:
        - name: gateway
          image: ghcr.io/ismail-kattakath/mcp-gateway:latest
          env:
            - name: OTEL_SERVICE_NAME
              value: "mcp-gateway"
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: "http://jaeger-collector.observability:4318/v1/traces"
            - name: OTEL_TRACES_SAMPLER
              value: "parentbased_traceidratio"
            - name: OTEL_TRACES_SAMPLER_ARG
              value: "0.1"
```

## Troubleshooting

### No Traces Appearing

**Check tracing is enabled**:

```bash
# Should see "Distributed tracing initialized" in logs
npm start | grep tracing
```

**Check Jaeger is reachable**:

```bash
curl http://localhost:4318/v1/traces -X POST -H "Content-Type: application/json" -d '{"resourceSpans":[]}'
# Should return 200 OK
```

**Check environment variables**:

```bash
echo $OTEL_TRACING_ENABLED  # Should NOT be "false"
echo $OTEL_EXPORTER_OTLP_ENDPOINT  # Should be correct
```

### Traces Cut Off / Incomplete

**Check sampling rate**:

```bash
# If too low, increase sampling
export OTEL_TRACES_SAMPLER_ARG=1.0
```

**Check trace timeout**:

```bash
# Ensure spans are ended (auto-handled by SDK)
# Check logs for "span.end()" errors
```

### High Memory Usage

**Reduce sampling rate**:

```bash
# Trace only 1% of requests
export OTEL_TRACES_SAMPLER_ARG=0.01
```

**Batch span processor** (already configured):

- Spans are batched before export (reduces overhead)
- Default: 512 spans per batch, 5s delay

### Trace_id Not in Logs

**Check log formatter** (should be automatic):

```typescript
// server/src/logging-v3/logger.ts includes trace context
// If missing, ensure tracing initialized before logger
```

**Dynamic require issue**:

```bash
# If using ESM, ensure require() works
# Or use static import (may cause circular dependency)
```

## Performance Impact

OpenTelemetry has minimal overhead:

| Component            | Overhead       | Notes                 |
| -------------------- | -------------- | --------------------- |
| Auto-instrumentation | < 5% CPU       | Wraps HTTP/Express    |
| Custom spans         | < 1ms per span | Manual span creation  |
| OTLP export          | Async, batched | No blocking           |
| Sampling (10%)       | < 1% CPU       | Most traces discarded |

**Recommendation**: Use 10% sampling in production for optimal balance.

## Advanced: Custom Spans

Add custom spans to your code:

```typescript
import { withSpan, addSpanAttributes } from "./tracing/tracer.js";

async function myOperation() {
  return withSpan("my.custom.operation", async (span) => {
    // Add custom attributes
    span.setAttribute("custom.key", "value");
    span.setAttribute("custom.count", 42);

    // Do work
    const result = await doWork();

    // Add result metadata
    span.setAttribute("result.size", result.length);

    return result;
  });
}
```

## Integration with Other Tools

### Grafana

Import Jaeger data source in Grafana:

1. Add data source → Jaeger
2. URL: `http://jaeger-query:16686`
3. Access: Server
4. Create trace correlation dashboard

### Prometheus

Combine traces with metrics:

- Use `trace_id` from logs to link metrics → traces
- Create Grafana dashboard with metric panels + trace links

### ELK Stack

Export traces to Elasticsearch:

- Use Jaeger with Elasticsearch storage
- Query traces from Kibana
- Correlate with logs using `trace_id`

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
