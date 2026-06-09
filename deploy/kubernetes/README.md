# Kubernetes Deployment

This directory contains production-ready Kubernetes manifests for MCP Gateway.

## Quick Start

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Configure secrets (IMPORTANT: Update with your values)
kubectl create secret generic mcp-gateway-secrets \
  --from-literal=API_KEY="$(openssl rand -base64 32)" \
  --from-literal=DATABASE_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --namespace=mcp-gateway

# Deploy RBAC resources
kubectl apply -f serviceaccount.yaml

# Deploy configuration
kubectl apply -f configmap.yaml

# Deploy storage
kubectl apply -f pvc.yaml

# Deploy application
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Configure ingress (update domain in ingress.yaml first)
kubectl apply -f ingress.yaml

# Configure autoscaling and availability
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml

# Apply network policies (optional but recommended)
kubectl apply -f networkpolicy.yaml
```

## Verify Deployment

```bash
# Check pods
kubectl get pods -n mcp-gateway

# Check service
kubectl get svc -n mcp-gateway

# Check ingress
kubectl get ingress -n mcp-gateway

# View logs
kubectl logs -n mcp-gateway -l app=mcp-gateway -f

# Port forward for local testing
kubectl port-forward -n mcp-gateway svc/mcp-gateway 3000:3000
curl http://localhost:3000/health
```

## Manifests Overview

- **namespace.yaml** - Creates `mcp-gateway` namespace
- **serviceaccount.yaml** - RBAC resources (ServiceAccount, Role, RoleBinding)
- **configmap.yaml** - Environment configuration
- **secret.yaml** - Secrets template (DO NOT use in production as-is)
- **pvc.yaml** - PersistentVolumeClaim for SQLite database
- **deployment.yaml** - Main application deployment with 3 replicas
- **service.yaml** - ClusterIP service for internal access
- **ingress.yaml** - Ingress for external access with TLS
- **hpa.yaml** - HorizontalPodAutoscaler for auto-scaling
- **pdb.yaml** - PodDisruptionBudget for high availability
- **networkpolicy.yaml** - Network policies for security

## Configuration

### Secrets Management

**NEVER** commit secrets to Git. Use one of these approaches:

**1. Sealed Secrets (Recommended)**

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/controller.yaml

# Create and seal secret
kubectl create secret generic mcp-gateway-secrets \
  --from-literal=API_KEY="$(openssl rand -base64 32)" \
  --namespace=mcp-gateway \
  --dry-run=client -o yaml | \
kubeseal -o yaml > sealed-secret.yaml

kubectl apply -f sealed-secret.yaml
```

**2. External Secrets Operator**

See `docs/PRODUCTION_DEPLOYMENT.md` for detailed setup with AWS/Azure/GCP secret managers.

### Resource Limits

Default resource allocation per pod:
- **Requests**: 200m CPU, 256Mi memory
- **Limits**: 1000m CPU, 512Mi memory

Adjust in `deployment.yaml` based on your workload.

### Persistent Storage

Default PVC size: 10Gi

For production:
```yaml
spec:
  resources:
    requests:
      storage: 50Gi  # Increase for production
  storageClassName: fast-ssd  # Use high-performance storage
```

### Ingress Configuration

Update `ingress.yaml` with your domain:

```yaml
spec:
  tls:
    - hosts:
        - gateway.your-domain.com  # Replace
      secretName: mcp-gateway-tls
  rules:
    - host: gateway.your-domain.com  # Replace
```

## Scaling

### Horizontal Scaling

```bash
# Manual scaling
kubectl scale deployment mcp-gateway --replicas=5 -n mcp-gateway

# Auto-scaling is configured via HPA (min: 3, max: 10)
kubectl get hpa -n mcp-gateway
```

### Vertical Scaling

Edit `deployment.yaml` and increase resource limits:

```yaml
resources:
  limits:
    cpu: 2000m      # Increase
    memory: 1024Mi  # Increase
```

Apply changes:
```bash
kubectl apply -f deployment.yaml
```

## Monitoring

### Health Checks

- **Liveness Probe**: Checks if container is alive (restarts if failing)
- **Readiness Probe**: Checks if container is ready to serve traffic

Both probes use `/health` endpoint.

### Metrics

Expose Prometheus metrics:

```bash
# Install ServiceMonitor (requires Prometheus Operator)
kubectl apply -f ../monitoring/servicemonitor.yaml
```

Access metrics:
```bash
kubectl port-forward -n mcp-gateway svc/mcp-gateway 3000:3000
curl http://localhost:3000/metrics
```

## High Availability

### Pod Disruption Budget

PDB ensures minimum 2 replicas are always available during:
- Node maintenance
- Cluster upgrades
- Voluntary evictions

```bash
kubectl get pdb -n mcp-gateway
```

### Anti-Affinity

Pods prefer to run on different nodes (configured in `deployment.yaml`):

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          topologyKey: kubernetes.io/hostname
```

## Security

### Network Policies

Restrict network traffic:
- **Ingress**: Allow from ingress controller and Prometheus only
- **Egress**: Allow DNS, HTTPS, and pod-to-pod communication

```bash
kubectl apply -f networkpolicy.yaml
```

### Pod Security Context

Pods run as non-root user (UID 1000) with:
- Read-only root filesystem
- Dropped all capabilities
- Seccomp profile

### RBAC

Minimal permissions:
- Read ConfigMaps and Secrets
- List and get Pods

## Troubleshooting

### Pods Not Starting

```bash
# Check events
kubectl describe pod mcp-gateway-xxx -n mcp-gateway

# Check logs
kubectl logs mcp-gateway-xxx -n mcp-gateway

# Common issues:
# 1. Missing secret: Check kubectl get secret mcp-gateway-secrets -n mcp-gateway
# 2. PVC not bound: Check kubectl get pvc -n mcp-gateway
# 3. Image pull error: Check imagePullSecrets
```

### Service Unreachable

```bash
# Check service
kubectl get svc mcp-gateway -n mcp-gateway

# Check endpoints
kubectl get endpoints mcp-gateway -n mcp-gateway

# Test from inside cluster
kubectl run test-pod --image=curlimages/curl -i --rm --restart=Never -- \
  curl http://mcp-gateway.mcp-gateway.svc.cluster.local:3000/health
```

### Ingress Not Working

```bash
# Check ingress
kubectl describe ingress mcp-gateway -n mcp-gateway

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# Check certificate (if using cert-manager)
kubectl get certificate -n mcp-gateway
kubectl describe certificate mcp-gateway-tls -n mcp-gateway
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f .

# Or delete namespace (deletes everything)
kubectl delete namespace mcp-gateway
```

## See Also

- [Helm Chart](../helm/mcp-gateway/) - Parameterized deployment
- [Production Deployment Guide](../../docs/PRODUCTION_DEPLOYMENT.md) - Comprehensive guide
- [Docker Compose](../docker-compose/) - Alternative deployment method
