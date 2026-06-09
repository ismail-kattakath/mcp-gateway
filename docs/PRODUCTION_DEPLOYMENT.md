# Production Deployment Guide

This comprehensive guide covers production deployment of MCP Gateway across multiple environments: Kubernetes (GKE, EKS, AKS), Docker Swarm, Docker Compose, and standalone servers.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Kubernetes Deployment](#kubernetes-deployment)
  - [Manual Deployment](#manual-kubernetes-deployment)
  - [Helm Installation](#helm-installation)
  - [GKE Setup](#google-kubernetes-engine-gke)
  - [EKS Setup](#amazon-elastic-kubernetes-service-eks)
  - [AKS Setup](#azure-kubernetes-service-aks)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Docker Swarm Deployment](#docker-swarm-deployment)
- [Standalone Deployment](#standalone-deployment)
- [Database Migration](#database-migration)
- [Scaling Best Practices](#scaling-best-practices)
- [Monitoring and Observability](#monitoring-and-observability)
- [Backup and Restore](#backup-and-restore)
- [Disaster Recovery](#disaster-recovery)
- [Security Hardening](#security-hardening)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### General Requirements

- **Domain name** with DNS management access
- **TLS certificates** (Let's Encrypt recommended for automatic renewal)
- **Container registry access** (GitHub Container Registry is used by default)
- **Secrets management** solution (HashiCorp Vault, cloud provider secret managers, or sealed-secrets)

### For Kubernetes

- Kubernetes 1.24+ cluster
- `kubectl` CLI tool installed and configured
- Helm 3.8+ (for Helm deployment)
- At least 3 worker nodes with 2 CPU cores and 4GB RAM each
- Persistent storage provisioner (default StorageClass or custom)
- Optional: cert-manager for automatic TLS certificates
- Optional: Prometheus Operator for monitoring

### For Docker

- Docker Engine 20.10+ with Compose V2
- At least 2GB RAM available
- 20GB disk space for logs and data
- Root or sudo access

---

## Kubernetes Deployment

### Manual Kubernetes Deployment

#### Step 1: Create Namespace

```bash
kubectl apply -f deploy/kubernetes/namespace.yaml
```

#### Step 2: Configure Secrets

**IMPORTANT:** Never commit actual secrets to version control. Use one of these approaches:

**Option A: Sealed Secrets (Recommended)**

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/controller.yaml

# Generate API key
API_KEY=$(openssl rand -base64 32)
DB_KEY=$(openssl rand -base64 32)

# Create sealed secret
kubectl create secret generic mcp-gateway-secrets \
  --from-literal=API_KEY="$API_KEY" \
  --from-literal=DATABASE_ENCRYPTION_KEY="$DB_KEY" \
  --namespace=mcp-gateway \
  --dry-run=client -o yaml | \
kubeseal -o yaml > sealed-secret.yaml

kubectl apply -f sealed-secret.yaml
```

**Option B: External Secrets Operator**

```bash
# Install external-secrets operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Create SecretStore (example for AWS Secrets Manager)
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: mcp-gateway
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: mcp-gateway
EOF

# Create ExternalSecret
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: mcp-gateway-secrets
  namespace: mcp-gateway
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: mcp-gateway-secrets
  data:
  - secretKey: API_KEY
    remoteRef:
      key: mcp-gateway/api-key
  - secretKey: DATABASE_ENCRYPTION_KEY
    remoteRef:
      key: mcp-gateway/db-encryption-key
EOF
```

**Option C: Manual Secret Creation (Development Only)**

```bash
# Generate keys
API_KEY=$(openssl rand -base64 32)
DB_KEY=$(openssl rand -base64 32)

# Create secret
kubectl create secret generic mcp-gateway-secrets \
  --from-literal=API_KEY="$API_KEY" \
  --from-literal=DATABASE_ENCRYPTION_KEY="$DB_KEY" \
  --namespace=mcp-gateway
```

#### Step 3: Configure ConfigMap

Edit `deploy/kubernetes/configmap.yaml` with your settings, then apply:

```bash
kubectl apply -f deploy/kubernetes/configmap.yaml
```

#### Step 4: Create Persistent Volume Claim

```bash
kubectl apply -f deploy/kubernetes/pvc.yaml
```

**For production with SQLite**, consider using a StorageClass with high IOPS:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mcp-gateway-data
  namespace: mcp-gateway
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd  # Use your high-performance StorageClass
  resources:
    requests:
      storage: 20Gi
```

#### Step 5: Deploy RBAC Resources

```bash
kubectl apply -f deploy/kubernetes/serviceaccount.yaml
```

#### Step 6: Deploy Application

```bash
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
```

#### Step 7: Configure Ingress

Edit `deploy/kubernetes/ingress.yaml` and replace `gateway.example.com` with your domain:

```bash
# Update domain
sed -i 's/gateway.example.com/your-domain.com/g' deploy/kubernetes/ingress.yaml

# Apply ingress
kubectl apply -f deploy/kubernetes/ingress.yaml
```

#### Step 8: Configure Autoscaling and Availability

```bash
kubectl apply -f deploy/kubernetes/hpa.yaml
kubectl apply -f deploy/kubernetes/pdb.yaml
```

#### Step 9: Apply Network Policies (Optional)

```bash
kubectl apply -f deploy/kubernetes/networkpolicy.yaml
```

#### Step 10: Verify Deployment

```bash
# Check pod status
kubectl get pods -n mcp-gateway

# Check service
kubectl get svc -n mcp-gateway

# Check ingress
kubectl get ingress -n mcp-gateway

# View logs
kubectl logs -n mcp-gateway -l app=mcp-gateway -f

# Test health endpoint
kubectl port-forward -n mcp-gateway svc/mcp-gateway 3000:3000
curl http://localhost:3000/health
```

Expected output:
```json
{"status":"ok","version":"2.1.0","uptime":123}
```

---

### Helm Installation

Helm simplifies deployment with parameterized templates.

#### Step 1: Add Custom Values

Create `values-production.yaml`:

```yaml
replicaCount: 5

image:
  tag: "2.1.0"  # Pin to specific version

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: gateway.your-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mcp-gateway-tls
      hosts:
        - gateway.your-domain.com

resources:
  limits:
    cpu: 2000m
    memory: 1024Mi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 20

persistence:
  enabled: true
  size: 50Gi
  storageClass: fast-ssd

database:
  type: sqlite  # Or postgresql for high concurrency
  encryption:
    enabled: true

secrets:
  apiKey: "YOUR_SECURE_API_KEY"
  databaseEncryptionKey: "YOUR_SECURE_ENCRYPTION_KEY"

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
  prometheusRule:
    enabled: true

networkPolicy:
  enabled: true
```

#### Step 2: Install with Helm

```bash
# Create namespace
kubectl create namespace mcp-gateway

# Install chart
helm install mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway \
  --values values-production.yaml

# Or upgrade existing installation
helm upgrade mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway \
  --values values-production.yaml
```

#### Step 3: Verify Installation

```bash
# Check release status
helm status mcp-gateway -n mcp-gateway

# List all resources
helm get all mcp-gateway -n mcp-gateway

# View release notes
helm get notes mcp-gateway -n mcp-gateway
```

#### Step 4: Validate Chart

Before installation, validate the chart:

```bash
# Lint chart
helm lint ./deploy/helm/mcp-gateway

# Dry-run installation
helm install mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway \
  --values values-production.yaml \
  --dry-run --debug
```

---

### Google Kubernetes Engine (GKE)

#### Prerequisites

- Google Cloud SDK (`gcloud`) installed
- GKE cluster created
- IAM permissions for cluster administration

#### Step 1: Configure kubectl

```bash
gcloud container clusters get-credentials YOUR_CLUSTER_NAME \
  --zone=us-central1-a \
  --project=YOUR_PROJECT_ID
```

#### Step 2: Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

#### Step 3: Configure ClusterIssuer for Let's Encrypt

```bash
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

#### Step 4: Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.0/deploy/static/provider/cloud/deploy.yaml
```

#### Step 5: Deploy MCP Gateway

Follow [Helm Installation](#helm-installation) steps above with GKE-specific values:

```yaml
# values-gke.yaml
ingress:
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"

persistence:
  storageClass: standard-rwo  # GKE default for regional SSD

nodeSelector:
  cloud.google.com/gke-nodepool: default-pool
```

#### Step 6: Configure Cloud DNS

```bash
# Get external IP from LoadBalancer
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Create DNS A record
gcloud dns record-sets transaction start --zone=YOUR_ZONE
gcloud dns record-sets transaction add EXTERNAL_IP \
  --name=gateway.your-domain.com. \
  --ttl=300 \
  --type=A \
  --zone=YOUR_ZONE
gcloud dns record-sets transaction execute --zone=YOUR_ZONE
```

---

### Amazon Elastic Kubernetes Service (EKS)

#### Prerequisites

- AWS CLI v2 installed
- `eksctl` installed
- EKS cluster created

#### Step 1: Configure kubectl

```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name your-cluster-name
```

#### Step 2: Install AWS Load Balancer Controller

```bash
# Create IAM policy
curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam-policy.json

# Install controller
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=your-cluster-name \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

#### Step 3: Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

#### Step 4: Configure Secrets with AWS Secrets Manager

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets-system --create-namespace

# Create IAM policy for secrets access
cat <<EOF > secrets-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:*:*:secret:mcp-gateway/*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name MCPGatewaySecretsPolicy \
  --policy-document file://secrets-policy.json

# Store secrets
aws secretsmanager create-secret \
  --name mcp-gateway/api-key \
  --secret-string "$(openssl rand -base64 32)"

aws secretsmanager create-secret \
  --name mcp-gateway/db-encryption-key \
  --secret-string "$(openssl rand -base64 32)"
```

#### Step 5: Deploy with EBS Storage

```yaml
# values-eks.yaml
persistence:
  storageClass: gp3  # EKS gp3 for better performance

ingress:
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789:certificate/xxx
```

```bash
helm install mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway --create-namespace \
  --values values-eks.yaml
```

---

### Azure Kubernetes Service (AKS)

#### Prerequisites

- Azure CLI installed
- AKS cluster created

#### Step 1: Configure kubectl

```bash
az aks get-credentials \
  --resource-group your-resource-group \
  --name your-cluster-name
```

#### Step 2: Install NGINX Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

#### Step 3: Configure Secrets with Azure Key Vault

```bash
# Install CSI driver
helm repo add csi-secrets-store-provider-azure https://azure.github.io/secrets-store-csi-driver-provider-azure/charts
helm install csi csi-secrets-store-provider-azure/csi-secrets-store-provider-azure \
  --namespace kube-system

# Create Key Vault and secrets
az keyvault create \
  --name mcp-gateway-kv \
  --resource-group your-resource-group \
  --location eastus

az keyvault secret set \
  --vault-name mcp-gateway-kv \
  --name api-key \
  --value "$(openssl rand -base64 32)"

az keyvault secret set \
  --vault-name mcp-gateway-kv \
  --name db-encryption-key \
  --value "$(openssl rand -base64 32)"
```

#### Step 4: Deploy with Azure Disk Storage

```yaml
# values-aks.yaml
persistence:
  storageClass: managed-premium  # Azure Premium SSD

ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
```

```bash
helm install mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway --create-namespace \
  --values values-aks.yaml
```

---

## Docker Compose Deployment

Docker Compose provides a simple multi-container deployment with monitoring stack.

### Step 1: Prerequisites

```bash
# Install Docker Compose V2
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verify version
docker compose version
```

### Step 2: Setup Secrets

```bash
cd deploy/docker-compose

# Create secrets directory
mkdir -p secrets

# Generate API key
openssl rand -base64 32 > secrets/api_key.txt

# Generate database encryption key
openssl rand -base64 32 > secrets/db_encryption_key.txt

# Set Grafana password
echo "your-secure-password" > secrets/grafana_password.txt

# Secure permissions
chmod 600 secrets/*.txt
```

### Step 3: Configure Environment

```bash
cp .env.example .env

# Edit .env and update:
# - GATEWAY_DOMAIN with your actual domain
# - Other configuration as needed
nano .env
```

### Step 4: Configure Caddyfile

Update `Caddyfile` with your domain:

```bash
sed -i 's/gateway.example.com/your-domain.com/g' Caddyfile
```

### Step 5: Launch Stack

```bash
# Start all services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Check status
docker compose -f docker-compose.prod.yml ps
```

### Step 6: Verify Deployment

```bash
# Check health
curl https://your-domain.com/health

# Test API (replace API_KEY)
curl -H "Authorization: Bearer $(cat secrets/api_key.txt)" \
  https://your-domain.com/api/servers

# Access Grafana
open http://localhost:3001
```

### Step 7: Configure Monitoring

1. Access Grafana at `http://localhost:3001`
2. Login with admin credentials from `secrets/grafana_password.txt`
3. Navigate to **Dashboards** → **Import**
4. Upload `../monitoring/grafana-dashboard.json`
5. Select Prometheus datasource

---

## Docker Swarm Deployment

Docker Swarm provides native clustering for Docker containers.

### Step 1: Initialize Swarm

On manager node:
```bash
docker swarm init --advertise-addr <MANAGER-IP>
```

On worker nodes:
```bash
docker swarm join --token <WORKER-TOKEN> <MANAGER-IP>:2377
```

### Step 2: Create Overlay Network

```bash
docker network create --driver overlay --attachable gateway-network
```

### Step 3: Deploy Secrets

```bash
# Create secrets
openssl rand -base64 32 | docker secret create mcp_api_key -
openssl rand -base64 32 | docker secret create mcp_db_key -
echo "grafana-password" | docker secret create grafana_password -
```

### Step 4: Deploy Stack

Create `docker-stack.yml`:

```yaml
version: '3.8'

services:
  gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    deploy:
      replicas: 5
      placement:
        constraints:
          - node.role == worker
        max_replicas_per_node: 2
      update_config:
        parallelism: 2
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        max_attempts: 3
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      DATABASE_PATH: /data/gateway.db
    secrets:
      - source: mcp_api_key
        target: /run/secrets/api_key
      - source: mcp_db_key
        target: /run/secrets/db_encryption_key
    volumes:
      - gateway-data:/data
    networks:
      - gateway-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  caddy:
    image: caddy:2-alpine
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.role == worker
    ports:
      - "80:80"
      - "443:443"
    configs:
      - source: caddy_config
        target: /etc/caddy/Caddyfile
    networks:
      - gateway-network

volumes:
  gateway-data:
    driver: local

secrets:
  mcp_api_key:
    external: true
  mcp_db_key:
    external: true
  grafana_password:
    external: true

configs:
  caddy_config:
    file: ./Caddyfile

networks:
  gateway-network:
    external: true
```

Deploy:
```bash
docker stack deploy -c docker-stack.yml mcp-gateway
```

### Step 5: Verify Deployment

```bash
# List services
docker service ls

# Check logs
docker service logs -f mcp-gateway_gateway

# Scale service
docker service scale mcp-gateway_gateway=10
```

---

## Standalone Deployment

For single-server deployments without containers.

### Step 1: Install Node.js

```bash
# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should be v18.x or higher
```

### Step 2: Clone and Build

```bash
# Clone repository
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Install dependencies
cd server && npm ci --production

# Build TypeScript
npm run build
```

### Step 3: Configure Systemd Service

Create `/etc/systemd/system/mcp-gateway.service`:

```ini
[Unit]
Description=MCP Gateway Server
After=network.target

[Service]
Type=simple
User=mcpgateway
Group=mcpgateway
WorkingDirectory=/opt/mcp-gateway/server
Environment="NODE_ENV=production"
Environment="LOG_LEVEL=info"
Environment="GATEWAY_PORT=3000"
Environment="DATABASE_PATH=/var/lib/mcp-gateway/gateway.db"
Environment="API_KEY=YOUR_SECURE_API_KEY"
Environment="DATABASE_ENCRYPTION_KEY=YOUR_SECURE_ENCRYPTION_KEY"
ExecStart=/usr/bin/node /opt/mcp-gateway/server/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-gateway

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/mcp-gateway
ReadWritePaths=/var/log/mcp-gateway

[Install]
WantedBy=multi-user.target
```

### Step 4: Create User and Directories

```bash
# Create user
sudo useradd -r -s /bin/false mcpgateway

# Create directories
sudo mkdir -p /opt/mcp-gateway /var/lib/mcp-gateway /var/log/mcp-gateway

# Copy files
sudo cp -r server /opt/mcp-gateway/

# Set permissions
sudo chown -R mcpgateway:mcpgateway /opt/mcp-gateway
sudo chown -R mcpgateway:mcpgateway /var/lib/mcp-gateway
sudo chown -R mcpgateway:mcpgateway /var/log/mcp-gateway
```

### Step 5: Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable mcp-gateway

# Start service
sudo systemctl start mcp-gateway

# Check status
sudo systemctl status mcp-gateway

# View logs
sudo journalctl -u mcp-gateway -f
```

### Step 6: Configure NGINX Reverse Proxy

Install NGINX:
```bash
sudo apt-get install nginx
```

Create `/etc/nginx/sites-available/mcp-gateway`:

```nginx
upstream mcp_gateway {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name gateway.your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gateway.your-domain.com;

    # TLS configuration
    ssl_certificate /etc/letsencrypt/live/gateway.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://mcp_gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=gateway_limit:10m rate=100r/m;
    limit_req zone=gateway_limit burst=20 nodelay;

    # Access logs
    access_log /var/log/nginx/mcp-gateway.access.log;
    error_log /var/log/nginx/mcp-gateway.error.log;
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/mcp-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: Configure Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d gateway.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Database Migration

### SQLite to PostgreSQL

When SQLite becomes a bottleneck (high concurrency, lock contention), migrate to PostgreSQL.

#### Step 1: Install PostgreSQL

**Kubernetes:**
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install postgresql bitnami/postgresql \
  --namespace mcp-gateway \
  --set auth.username=mcpgateway \
  --set auth.password=secure-password \
  --set auth.database=mcpgateway
```

**Docker Compose:**
Add to `docker-compose.prod.yml`:
```yaml
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: mcpgateway
      POSTGRES_PASSWORD: secure-password
      POSTGRES_DB: mcpgateway
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - gateway-network

volumes:
  postgres-data:
```

#### Step 2: Export Data from SQLite

```bash
# Backup SQLite database
sqlite3 /data/gateway.db .dump > gateway-backup.sql
```

#### Step 3: Convert Schema

SQLite uses slightly different SQL syntax. Convert:

```bash
# Remove SQLite-specific commands
sed -i '/^PRAGMA/d' gateway-backup.sql
sed -i 's/AUTOINCREMENT/SERIAL/g' gateway-backup.sql

# Fix data types
sed -i 's/INTEGER PRIMARY KEY/SERIAL PRIMARY KEY/g' gateway-backup.sql
```

#### Step 4: Import to PostgreSQL

```bash
psql -h localhost -U mcpgateway -d mcpgateway < gateway-backup.sql
```

#### Step 5: Update Configuration

**Kubernetes ConfigMap:**
```yaml
data:
  DATABASE_TYPE: "postgresql"
  DATABASE_HOST: "postgresql.mcp-gateway.svc.cluster.local"
  DATABASE_PORT: "5432"
  DATABASE_NAME: "mcpgateway"
  DATABASE_USER: "mcpgateway"
```

**Docker Compose:**
```yaml
environment:
  DATABASE_TYPE: postgresql
  DATABASE_HOST: postgres
  DATABASE_PORT: 5432
  DATABASE_NAME: mcpgateway
  DATABASE_USER: mcpgateway
  DATABASE_PASSWORD_FILE: /run/secrets/postgres_password
```

#### Step 6: Redeploy Gateway

```bash
# Kubernetes
kubectl rollout restart deployment/mcp-gateway -n mcp-gateway

# Docker Compose
docker compose -f docker-compose.prod.yml up -d gateway
```

---

## Scaling Best Practices

### Horizontal Scaling

**When to scale horizontally:**
- High request rate (>1000 req/s)
- CPU usage consistently above 70%
- Need for high availability

**Kubernetes:**
```bash
# Manual scaling
kubectl scale deployment mcp-gateway --replicas=10 -n mcp-gateway

# Auto-scaling (HPA already configured)
kubectl get hpa -n mcp-gateway
```

**Docker Swarm:**
```bash
docker service scale mcp-gateway_gateway=10
```

**Limitations with SQLite:**
- SQLite has limited concurrent write performance
- With >5 replicas, consider migrating to PostgreSQL
- Use read replicas if possible

### Vertical Scaling

**When to scale vertically:**
- Memory pressure (>90% usage)
- Individual requests require more resources
- Database operations are slow

**Kubernetes:**
Edit `values.yaml`:
```yaml
resources:
  limits:
    cpu: 4000m      # Increase from 1000m
    memory: 2048Mi  # Increase from 512Mi
  requests:
    cpu: 1000m      # Increase from 200m
    memory: 1024Mi  # Increase from 256Mi
```

Apply:
```bash
helm upgrade mcp-gateway ./deploy/helm/mcp-gateway \
  --namespace mcp-gateway \
  --values values-production.yaml
```

### Load Balancing Strategies

**Round Robin (Default):**
- Distributes requests evenly
- Best for stateless applications

**Least Connections:**
- Sends requests to server with fewest connections
- Better for long-running requests

**IP Hash / Session Affinity:**
- Routes same client to same backend
- Use for stateful operations

**Kubernetes:**
```yaml
service:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800  # 3 hours
```

### Performance Tuning

**Node.js Tuning:**
```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=2048"

# Enable HTTP/2
HTTP2_ENABLED=true
```

**Database Connection Pooling:**
```javascript
// For PostgreSQL
{
  "database": {
    "pool": {
      "min": 5,
      "max": 20,
      "acquireTimeoutMillis": 30000,
      "idleTimeoutMillis": 30000
    }
  }
}
```

---

## Monitoring and Observability

### Prometheus Metrics

MCP Gateway exposes metrics at `/metrics` endpoint:

**Key metrics:**
- `http_requests_total` - Total HTTP requests by status code
- `http_request_duration_seconds` - Request latency histogram
- `mcp_tool_calls_total` - MCP tool invocations by server/tool
- `mcp_server_status` - Server status (1=running, 0=stopped)
- `sqlite_lock_wait_seconds_total` - Database lock contention
- `nodejs_heap_size_used_bytes` - Node.js memory usage
- `process_cpu_usage_seconds_total` - CPU usage

### Grafana Dashboards

Import pre-built dashboard:
1. Access Grafana
2. Navigate to **Dashboards** → **Import**
3. Upload `deploy/monitoring/grafana-dashboard.json`
4. Select Prometheus datasource

**Dashboard includes:**
- Request rate and error rate
- Response time percentiles (p50, p95, p99)
- Memory and CPU usage
- Active connections
- MCP tool calls by server
- Database lock wait time
- Server status table

### Log Aggregation

**ELK Stack (Elasticsearch, Logstash, Kibana):**

Add to Docker Compose:
```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
    environment:
      - discovery.type=single-node
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.10.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.10.0
    ports:
      - "5601:5601"
```

**Loki (Lightweight alternative):**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set grafana.enabled=false
```

### Distributed Tracing

Enable Jaeger tracing:

```yaml
config:
  tracing:
    enabled: true
    jaegerEndpoint: "http://jaeger-collector:14268/api/traces"
```

Deploy Jaeger:
```bash
kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.50.0/jaeger-operator.yaml

# Create Jaeger instance
cat <<EOF | kubectl apply -f -
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: jaeger
  namespace: mcp-gateway
spec:
  strategy: production
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: http://elasticsearch:9200
EOF
```

### Alerting

Configure Alertmanager for notifications:

```yaml
# alertmanager.yml
global:
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

route:
  receiver: 'slack-notifications'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

Deploy:
```bash
kubectl create configmap alertmanager-config \
  --from-file=alertmanager.yml \
  -n monitoring

helm install alertmanager prometheus-community/alertmanager \
  --namespace monitoring \
  --set configmapReload.enabled=true
```

---

## Backup and Restore

### Database Backup

**SQLite Backup (Automated Script):**

Create `/opt/mcp-gateway/backup.sh`:
```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/mcp-gateway"
DATE=$(date +%Y%m%d-%H%M%S)
DB_PATH="/var/lib/mcp-gateway/gateway.db"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/gateway-$DATE.db'"

# Compress backup
gzip "$BACKUP_DIR/gateway-$DATE.db"

# Delete old backups
find "$BACKUP_DIR" -name "gateway-*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: gateway-$DATE.db.gz"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /opt/mcp-gateway/backup.sh >> /var/log/mcp-gateway-backup.log 2>&1
```

**Kubernetes CronJob:**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: mcp-gateway
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: alpine:latest
            command:
            - /bin/sh
            - -c
            - |
              apk add --no-cache sqlite
              sqlite3 /data/gateway.db ".backup /backups/gateway-$(date +%Y%m%d-%H%M%S).db"
              gzip /backups/gateway-*.db
              find /backups -name "gateway-*.db.gz" -mtime +30 -delete
            volumeMounts:
            - name: data
              mountPath: /data
            - name: backups
              mountPath: /backups
          volumes:
          - name: data
            persistentVolumeClaim:
              claimName: mcp-gateway-data
          - name: backups
            persistentVolumeClaim:
              claimName: mcp-gateway-backups
          restartPolicy: OnFailure
```

### Restore from Backup

**SQLite:**
```bash
# Stop gateway
systemctl stop mcp-gateway  # or kubectl scale deployment mcp-gateway --replicas=0

# Decompress backup
gunzip /var/backups/mcp-gateway/gateway-20260609-020000.db.gz

# Restore database
cp /var/backups/mcp-gateway/gateway-20260609-020000.db /var/lib/mcp-gateway/gateway.db

# Set permissions
chown mcpgateway:mcpgateway /var/lib/mcp-gateway/gateway.db

# Start gateway
systemctl start mcp-gateway  # or kubectl scale deployment mcp-gateway --replicas=3
```

**PostgreSQL:**
```bash
# Backup
pg_dump -h localhost -U mcpgateway mcpgateway > backup.sql

# Restore
psql -h localhost -U mcpgateway -d mcpgateway < backup.sql
```

### Off-site Backups

**AWS S3:**
```bash
# Install AWS CLI
apt-get install awscli

# Sync backups to S3
aws s3 sync /var/backups/mcp-gateway s3://your-bucket/mcp-gateway-backups \
  --exclude "*" \
  --include "gateway-*.db.gz" \
  --storage-class GLACIER
```

**Google Cloud Storage:**
```bash
# Install gsutil
apt-get install google-cloud-sdk

# Sync backups
gsutil -m rsync -r /var/backups/mcp-gateway gs://your-bucket/mcp-gateway-backups
```

---

## Disaster Recovery

### Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

**Recommended targets:**
- **RTO**: 15 minutes (time to restore service)
- **RPO**: 1 hour (maximum acceptable data loss)

### Multi-Region Deployment

**Architecture:**
- Primary region: Active deployment
- Secondary region: Standby deployment (or active-active)
- Database replication: Primary → Secondary
- Global load balancer with health checks

**GCP Multi-Region (Active-Standby):**

```bash
# Primary region (us-central1)
gcloud container clusters create mcp-gateway-primary \
  --region=us-central1 \
  --num-nodes=3

# Secondary region (europe-west1)
gcloud container clusters create mcp-gateway-secondary \
  --region=europe-west1 \
  --num-nodes=3

# Setup database replication
# (PostgreSQL streaming replication or Cloud SQL replica)

# Global load balancer
gcloud compute backend-services create mcp-gateway-backend \
  --global \
  --health-checks=mcp-gateway-health

gcloud compute backend-services add-backend mcp-gateway-backend \
  --instance-group=mcp-gateway-primary-ig \
  --instance-group-region=us-central1 \
  --global

gcloud compute backend-services add-backend mcp-gateway-backend \
  --instance-group=mcp-gateway-secondary-ig \
  --instance-group-region=europe-west1 \
  --global \
  --failover
```

### Failover Procedures

**Manual Failover:**

1. Verify secondary region is healthy:
```bash
kubectl --context=secondary get pods -n mcp-gateway
```

2. Update DNS to point to secondary region:
```bash
# Update A record to secondary load balancer IP
```

3. Promote secondary database to primary (PostgreSQL):
```bash
kubectl exec -it postgresql-secondary-0 -- \
  psql -U mcpgateway -c "SELECT pg_promote();"
```

4. Scale up secondary deployment:
```bash
kubectl --context=secondary scale deployment mcp-gateway --replicas=5 -n mcp-gateway
```

**Automated Failover (with external health checks):**

Use external monitoring (Datadog, New Relic) to trigger failover:
```yaml
# Example: AWS Route 53 health check failover
Type: A
RoutingPolicy: Failover
Primary: 
  Value: <primary-lb-ip>
  HealthCheckId: <health-check-id>
Secondary:
  Value: <secondary-lb-ip>
  FailoverType: SECONDARY
```

### Disaster Recovery Testing

**Quarterly DR drill:**

1. Schedule maintenance window
2. Simulate primary region failure:
```bash
# Scale down primary
kubectl --context=primary scale deployment mcp-gateway --replicas=0 -n mcp-gateway
```

3. Execute failover procedures
4. Verify secondary region serves traffic
5. Measure RTO (time to full recovery)
6. Failback to primary
7. Document lessons learned

---

## Security Hardening

### TLS Configuration

**Enforce TLS 1.2+:**

```nginx
# NGINX
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
```

**Certificate Rotation:**

```bash
# Auto-renewal with cert-manager (Kubernetes)
# Certbot auto-renewal (standalone)
systemctl status certbot.timer
```

### Network Segmentation

**Kubernetes Network Policies:**

Already configured in `deploy/kubernetes/networkpolicy.yaml`:
- Allow ingress from ingress controller only
- Allow egress for DNS and HTTPS
- Deny all other traffic

**Firewall Rules:**

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp  # Block direct access to gateway port
sudo ufw enable

# iptables
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

### Secrets Management

**Never commit secrets to Git:**

Use one of:
- **Sealed Secrets** (Kubernetes)
- **External Secrets Operator** with Vault/AWS/Azure
- **Docker Secrets** (Swarm)
- **Environment variables from secret files**

**Rotate secrets quarterly:**

```bash
# Generate new API key
NEW_KEY=$(openssl rand -base64 32)

# Update secret
kubectl create secret generic mcp-gateway-secrets \
  --from-literal=API_KEY="$NEW_KEY" \
  --namespace=mcp-gateway \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up new secret
kubectl rollout restart deployment mcp-gateway -n mcp-gateway
```

### Audit Logging

Enable audit logging for all API requests:

```yaml
config:
  auditLogging:
    enabled: true
    retention: 90  # days
```

Review logs regularly:
```bash
kubectl logs -n mcp-gateway -l app=mcp-gateway | grep "AUDIT"
```

---

## Troubleshooting

### Common Issues

#### 1. Pods CrashLooping

**Symptoms:**
```bash
kubectl get pods -n mcp-gateway
# STATUS: CrashLoopBackOff
```

**Diagnosis:**
```bash
kubectl logs -n mcp-gateway mcp-gateway-xxx
kubectl describe pod -n mcp-gateway mcp-gateway-xxx
```

**Common causes:**
- Missing secrets: Check `kubectl get secret mcp-gateway-secrets -n mcp-gateway`
- Database connection failed: Check PVC mount
- Port already in use: Check port conflicts

**Fix:**
```bash
# Recreate secret
kubectl delete secret mcp-gateway-secrets -n mcp-gateway
# Follow secret creation steps

# Check PVC
kubectl get pvc -n mcp-gateway
kubectl describe pvc mcp-gateway-data -n mcp-gateway
```

#### 2. High Memory Usage

**Symptoms:**
- OOMKilled pods
- Slow response times

**Diagnosis:**
```bash
kubectl top pods -n mcp-gateway
```

**Fix:**
1. Increase memory limits:
```yaml
resources:
  limits:
    memory: 1024Mi  # Increase from 512Mi
```

2. Or reduce replicas and scale vertically

#### 3. Database Lock Contention

**Symptoms:**
- Slow queries
- High `sqlite_lock_wait_seconds_total` metric

**Diagnosis:**
```bash
# Check metrics
curl http://localhost:3000/metrics | grep sqlite_lock_wait
```

**Fix:**
1. Reduce replica count (SQLite has limited concurrent writes)
2. Migrate to PostgreSQL for better concurrency

#### 4. Certificate Issues

**Symptoms:**
- Browser shows "Certificate Invalid"
- cert-manager not issuing certificates

**Diagnosis:**
```bash
kubectl get certificate -n mcp-gateway
kubectl describe certificate mcp-gateway-tls -n mcp-gateway
kubectl logs -n cert-manager -l app=cert-manager
```

**Fix:**
```bash
# Delete and recreate certificate
kubectl delete certificate mcp-gateway-tls -n mcp-gateway
kubectl apply -f deploy/kubernetes/ingress.yaml

# Check ClusterIssuer
kubectl get clusterissuer letsencrypt-prod -o yaml
```

#### 5. Gateway Unreachable

**Symptoms:**
- 502 Bad Gateway
- Connection timeout

**Diagnosis:**
```bash
# Check service
kubectl get svc -n mcp-gateway
kubectl describe svc mcp-gateway -n mcp-gateway

# Check ingress
kubectl get ingress -n mcp-gateway
kubectl describe ingress mcp-gateway -n mcp-gateway

# Test from inside cluster
kubectl run test-pod --image=curlimages/curl -i --rm --restart=Never -- \
  curl http://mcp-gateway.mcp-gateway.svc.cluster.local:3000/health
```

**Fix:**
1. Verify pods are running: `kubectl get pods -n mcp-gateway`
2. Check service selector: `kubectl get svc mcp-gateway -n mcp-gateway -o yaml`
3. Verify ingress controller: `kubectl get pods -n ingress-nginx`

### Debug Mode

Enable debug logging:

**Kubernetes:**
```bash
kubectl set env deployment/mcp-gateway LOG_LEVEL=debug -n mcp-gateway
```

**Docker Compose:**
```yaml
environment:
  LOG_LEVEL: debug
```

**Standalone:**
```bash
systemctl edit mcp-gateway
# Add: Environment="LOG_LEVEL=debug"
systemctl restart mcp-gateway
```

### Performance Profiling

**Node.js CPU Profiling:**
```bash
# Install clinic
npm install -g clinic

# Run profiler
clinic doctor -- node dist/index.js

# View report
clinic doctor --open
```

**Kubernetes:**
```bash
# Install Node.js inspector
kubectl exec -it mcp-gateway-xxx -n mcp-gateway -- npm install -g node-inspector

# Forward port for Chrome DevTools
kubectl port-forward mcp-gateway-xxx 9229:9229 -n mcp-gateway

# Open chrome://inspect in Chrome browser
```

---

## Support and Resources

- **Documentation**: https://github.com/ismail-kattakath/mcp-gateway/tree/main/docs
- **GitHub Issues**: https://github.com/ismail-kattakath/mcp-gateway/issues
- **Discussions**: https://github.com/ismail-kattakath/mcp-gateway/discussions
- **Security**: security@example.com

---

**Last Updated**: 2026-06-09  
**Version**: 2.1.0
