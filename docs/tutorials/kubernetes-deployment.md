# Tutorial: Deploying to Kubernetes

Deploy MCP Gateway to Kubernetes with high availability and autoscaling.

## Overview

**What you'll learn:**

- Deploy gateway to Kubernetes using manifests or Helm
- Configure high availability (HA)
- Set up horizontal autoscaling
- Configure ingress and TLS
- Implement monitoring and logging

**Prerequisites:**

- Kubernetes cluster (1.24+)
- kubectl configured
- Helm 3+ (for Helm deployment)
- Container registry access

**Time:** 45 minutes

## Architecture

```
Internet → Load Balancer → Ingress → Gateway Pods (3+) → MCP Servers
                                     ↓
                                  PostgreSQL
```

## Step 1: Prepare Cluster

### 1.1 Create Namespace

```bash
kubectl create namespace mcp-gateway
kubectl config set-context --current --namespace=mcp-gateway
```

### 1.2 Create Registry Secret (if using private registry)

```bash
kubectl create secret docker-registry registry-creds \
  --docker-server=ghcr.io \
  --docker-username=your-username \
  --docker-password=your-token \
  -n mcp-gateway
```

### 1.3 Create ConfigMap for Registry

```bash
kubectl create configmap registry-config \
  --from-file=registry.json=/path/to/registry.json \
  -n mcp-gateway
```

## Step 2: Deploy with Kubernetes Manifests

### 2.1 Apply Manifests

```bash
# Clone repository
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Apply all manifests
kubectl apply -f deploy/kubernetes/
```

This creates:

- Namespace
- ServiceAccount
- Role + RoleBinding (RBAC)
- Secret (API keys, database credentials)
- ConfigMap (registry.json, auth-config.json)
- PersistentVolumeClaim (for database)
- Deployment (3 replicas)
- Service (ClusterIP)
- Ingress (with TLS)
- HorizontalPodAutoscaler
- PodDisruptionBudget
- NetworkPolicy

### 2.2 Verify Deployment

```bash
# Check pods
kubectl get pods -n mcp-gateway

# Check deployment
kubectl get deployment mcp-gateway -n mcp-gateway

# Check service
kubectl get svc mcp-gateway -n mcp-gateway

# Check ingress
kubectl get ingress mcp-gateway -n mcp-gateway
```

### 2.3 Get External IP

```bash
kubectl get ingress mcp-gateway -n mcp-gateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

## Step 3: Deploy with Helm Chart

### 3.1 Add Helm Repository

```bash
helm repo add mcp-gateway https://ismail-kattakath.github.io/mcp-gateway
helm repo update
```

### 3.2 Create Values File

Create `values-production.yaml`:

```yaml
replicaCount: 3

image:
  repository: ghcr.io/ismail-kattakath/mcp-gateway
  tag: "3.0.0"
  pullPolicy: IfNotPresent

registry:
  existingConfigMap: ""
  content: |
    {
      "version": "3.0",
      "servers": {
        "filesystem": {
          "source": "pkg",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
          "lifecycle": "persistent"
        }
      }
    }

auth:
  enabled: true
  existingSecret: ""
  apiKey: "" # Will be auto-generated if not provided

database:
  type: "postgres"
  postgres:
    host: "postgres.mcp-gateway.svc.cluster.local"
    port: 5432
    database: "mcp_gateway"
    username: "mcp_user"
    existingSecret: "postgres-credentials"

ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: gateway.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: gateway-tls
      hosts:
        - gateway.example.com

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"

podDisruptionBudget:
  enabled: true
  minAvailable: 2

serviceMonitor:
  enabled: true
  interval: 30s

persistence:
  enabled: true
  size: 10Gi
  storageClass: "standard"
```

### 3.3 Install Chart

```bash
helm install mcp-gateway mcp-gateway/mcp-gateway \
  --namespace mcp-gateway \
  --create-namespace \
  --values values-production.yaml
```

### 3.4 Verify Installation

```bash
helm status mcp-gateway -n mcp-gateway
helm list -n mcp-gateway
kubectl get all -n mcp-gateway
```

## Step 4: Configure Database

### 4.1 Deploy PostgreSQL

```bash
helm install postgres bitnami/postgresql \
  --namespace mcp-gateway \
  --set auth.username=mcp_user \
  --set auth.password=secure-password \
  --set auth.database=mcp_gateway \
  --set primary.persistence.size=20Gi
```

### 4.2 Run Migrations

```bash
kubectl exec -it deployment/mcp-gateway -n mcp-gateway -- \
  npm run migrate up
```

### 4.3 Verify Database

```bash
kubectl exec -it postgres-0 -n mcp-gateway -- \
  psql -U mcp_user -d mcp_gateway -c "\dt"
```

## Step 5: Configure Ingress and TLS

### 5.1 Install Cert-Manager (for Let's Encrypt)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

### 5.2 Create ClusterIssuer

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

Apply:

```bash
kubectl apply -f clusterissuer.yaml
```

### 5.3 Update Ingress with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mcp-gateway
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - gateway.example.com
      secretName: gateway-tls
  rules:
    - host: gateway.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mcp-gateway
                port:
                  number: 3000
```

## Step 6: Configure Monitoring

### 6.1 Install Prometheus Operator

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### 6.2 Create ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mcp-gateway
  namespace: mcp-gateway
spec:
  selector:
    matchLabels:
      app: mcp-gateway
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### 6.3 Import Grafana Dashboard

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```

Navigate to http://localhost:3000, import dashboard from `deploy/monitoring/grafana-dashboard.json`.

## Step 7: Test Deployment

### 7.1 Health Check

```bash
curl https://gateway.example.com/health
```

### 7.2 Test API

```bash
export API_KEY=$(kubectl get secret mcp-gateway-api-key -n mcp-gateway -o jsonpath='{.data.api-key}' | base64 -d)

curl -H "Authorization: Bearer $API_KEY" \
  https://gateway.example.com/api/servers
```

### 7.3 Test Autoscaling

```bash
# Generate load
kubectl run -it --rm load-generator --image=busybox --restart=Never -- \
  /bin/sh -c "while sleep 0.01; do wget -q -O- https://gateway.example.com/health; done"

# Watch pods scale
kubectl get hpa mcp-gateway -n mcp-gateway --watch
kubectl get pods -n mcp-gateway --watch
```

## Troubleshooting

**Issue: Pods not starting**

```bash
kubectl describe pod <pod-name> -n mcp-gateway
kubectl logs <pod-name> -n mcp-gateway
```

**Issue: Ingress not working**

```bash
kubectl describe ingress mcp-gateway -n mcp-gateway
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

**Issue: Database connection failed**

```bash
kubectl exec -it deployment/mcp-gateway -n mcp-gateway -- \
  nc -zv postgres 5432
```

## Production Best Practices

1. **Use PostgreSQL** - Not SQLite for multi-replica
2. **Set Resource Limits** - Prevent OOM kills
3. **Enable PodDisruptionBudget** - Maintain availability during updates
4. **Use NetworkPolicy** - Restrict network access
5. **Implement Backups** - Daily database backups
6. **Monitor Everything** - Prometheus + Grafana
7. **Enable Audit Logging** - Track all actions
8. **Rotate Secrets** - Every 90 days

## Next Steps

- [Multi-Tenancy Setup](multi-tenancy.md)
- [Monitoring Setup](monitoring-setup.md)
- [Production Deployment Guide](../PRODUCTION_DEPLOYMENT.md)
