# MCP Gateway v3.0 Lab Exercises

Hands-on exercises to practice MCP Gateway skills.

## Exercise 1: Basic Server Setup (15 minutes)

### Objective

Configure and start a simple MCP server using the gateway.

### Instructions

**Step 1:** Create working directory

```bash
mkdir mcp-lab && cd mcp-lab
```

**Step 2:** Create `registry.json`

```json
{
  "version": "3.0",
  "servers": {
    "filesystem": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true,
      "lifecycle": "on-demand"
    }
  }
}
```

**Step 3:** Start gateway

```bash
docker run -i --rm \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  ghcr.io/ismail-kattakath/mcp-gateway:latest &
```

**Step 4:** List tools

```bash
curl http://localhost:3000/api/tools
```

**Step 5:** Call a tool

```bash
curl -X POST http://localhost:3000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "filesystem/list_directory",
    "arguments": {"path": "/tmp"}
  }'
```

### Verification

- [ ] Gateway started successfully
- [ ] Tools listed (filesystem/read_file, filesystem/write_file, etc.)
- [ ] Tool call returned results

### Bonus Challenge

Add a second server (e.g., git-mcp) to the registry and call one of its tools.

---

## Exercise 2: Authentication Configuration (20 minutes)

### Objective

Set up API key authentication and test access control.

### Instructions

**Step 1:** Get API key

```bash
PRINT_API_KEY=true docker run --rm \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Step 2:** Save API key

```bash
export API_KEY="your-key-here"
```

**Step 3:** Test authenticated request

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/servers
```

**Step 4:** Test unauthenticated request (should fail)

```bash
curl http://localhost:3000/api/servers
```

**Step 5:** Rotate API key

```bash
docker exec mcp-gateway \
  sh -c 'ROTATE_API_KEY=true node dist/index.js'
```

### Verification

- [ ] API key retrieved
- [ ] Authenticated request succeeded
- [ ] Unauthenticated request returned 401
- [ ] Key rotation successful

### Bonus Challenge

Set up IP allowlist to restrict access to 127.0.0.1 only.

---

## Exercise 3: Role-Based Access Control (25 minutes)

### Objective

Create users, assign roles, and test permission enforcement.

### Instructions

**Step 1:** Install CLI

```bash
cd cli
npm install && npm run build && npm link
```

**Step 2:** Create users

```bash
mcp users create alice --email alice@example.com --role admin
mcp users create bob --email bob@example.com --role user
```

**Step 3:** Create custom role

```bash
mcp roles create developer \
  --permissions server:read,server:write,tool:call \
  --description "Development team role"
```

**Step 4:** Assign role to user

```bash
mcp users add-role bob developer
```

**Step 5:** Grant specific permissions

```bash
mcp permissions grant bob \
  --server filesystem \
  --tools read_file,list_directory
```

**Step 6:** Test permissions

```bash
# Login as bob (get JWT token)
TOKEN=$(mcp auth login --username bob --password <password>)

# Try to call allowed tool
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:3000/api/tools/call \
  -d '{"tool": "filesystem/read_file", "arguments": {"path": "/tmp/test.txt"}}'

# Try to call denied tool (should fail)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:3000/api/tools/call \
  -d '{"tool": "filesystem/write_file", "arguments": {"path": "/tmp/test.txt", "content": "test"}}'
```

### Verification

- [ ] Users created
- [ ] Custom role created
- [ ] Role assigned to user
- [ ] Permissions enforced (allowed tool works, denied tool fails)

### Bonus Challenge

Create a multi-level hierarchy: admin → operator → developer → readonly.

---

## Exercise 4: Production Deployment (30 minutes)

### Objective

Deploy MCP Gateway to Kubernetes with high availability.

### Prerequisites

- Kubernetes cluster (minikube, kind, or cloud)
- kubectl configured
- helm installed

### Instructions

**Step 1:** Create namespace

```bash
kubectl create namespace mcp-gateway
```

**Step 2:** Create ConfigMap

```bash
kubectl create configmap registry-config \
  --from-file=registry.json \
  -n mcp-gateway
```

**Step 3:** Install with Helm

```bash
helm repo add mcp-gateway https://ismail-kattakath.github.io/mcp-gateway
helm repo update

helm install mcp-gateway mcp-gateway/mcp-gateway \
  --namespace mcp-gateway \
  --set replicaCount=3 \
  --set autoscaling.enabled=true \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=gateway.local
```

**Step 4:** Wait for deployment

```bash
kubectl wait --for=condition=available deployment/mcp-gateway \
  -n mcp-gateway --timeout=120s
```

**Step 5:** Test health endpoint

```bash
kubectl port-forward -n mcp-gateway svc/mcp-gateway 3000:3000 &
curl http://localhost:3000/health
```

**Step 6:** Test autoscaling

```bash
# Generate load
kubectl run -n mcp-gateway -it --rm load-generator \
  --image=busybox --restart=Never -- \
  /bin/sh -c "while sleep 0.01; do wget -q -O- http://mcp-gateway:3000/health; done"

# Watch pods scale
kubectl get hpa -n mcp-gateway --watch
```

### Verification

- [ ] Deployment created with 3 replicas
- [ ] Health check passes
- [ ] HPA configured
- [ ] Pods scale up under load

### Bonus Challenge

Set up Ingress with TLS using cert-manager and Let's Encrypt.

---

## Exercise 5: Troubleshooting Common Issues (20 minutes)

### Objective

Diagnose and fix common problems.

### Scenario 1: Server Won't Start

**Given:**

```json
{
  "broken-server": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "nonexistent-package"],
    "lifecycle": "persistent"
  }
}
```

**Task:**

1. Add to registry
2. Check server status
3. View logs
4. Identify issue
5. Fix configuration

### Scenario 2: Authentication Error

**Given:**

- Gateway running with auth enabled
- User attempts request without Bearer token

**Task:**

1. Reproduce error
2. Get API key
3. Use key in request
4. Verify success

### Scenario 3: Tool Call Timeout

**Given:**

- On-demand server with default 30s timeout
- Tool call takes 45s to complete

**Task:**

1. Identify timeout in logs
2. Increase server timeout to 60s
3. Restart server
4. Retry tool call

### Verification

- [ ] All three scenarios diagnosed correctly
- [ ] All three scenarios fixed
- [ ] Solutions documented

### Bonus Challenge

Create a troubleshooting checklist for common issues.

---

## Final Assessment

### Capstone Project: Complete Setup (45 minutes)

**Objective:** Deploy a production-ready MCP Gateway with multiple servers, authentication, and monitoring.

**Requirements:**

1. **Servers:** Configure at least 3 different server sources
   - [ ] Package (npm)
   - [ ] Git repository
   - [ ] Container

2. **Authentication:** Set up OAuth with GitHub
   - [ ] Create GitHub OAuth app
   - [ ] Configure gateway
   - [ ] Test login flow

3. **RBAC:** Create 3 roles with different permissions
   - [ ] Admin role
   - [ ] Developer role
   - [ ] Readonly role

4. **Deployment:** Deploy to Kubernetes
   - [ ] 3+ replicas
   - [ ] HPA enabled
   - [ ] Ingress configured

5. **Monitoring:** Set up Prometheus + Grafana
   - [ ] Metrics collection
   - [ ] Dashboard imported
   - [ ] Alert rules configured

6. **Documentation:** Create README for your deployment
   - [ ] Architecture diagram
   - [ ] Setup instructions
   - [ ] Troubleshooting guide

### Submission

- Repository with all configuration files
- Screenshots of working deployment
- README documentation

### Grading Rubric

- Configuration (30%): All servers configured correctly
- Security (25%): Auth + RBAC properly set up
- Deployment (25%): K8s deployment successful
- Monitoring (10%): Metrics and dashboards working
- Documentation (10%): Clear and complete

---

## Resources

**Documentation:**

- [Getting Started](../GETTING_STARTED.md)
- [User Guide](../USER_GUIDE.md)
- [Tutorials](../tutorials/)

**Community:**

- GitHub: github.com/ismail-kattakath/mcp-gateway
- Discussions: Ask questions
- Issues: Report problems

**Need Help?**

- Check FAQ: `docs/FAQ.md`
- Review troubleshooting guide
- Ask in GitHub Discussions
