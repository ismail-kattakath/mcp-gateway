# Mermaid Diagram Enhancement Plan

Analysis of documentation with recommendations for Mermaid diagram additions.

## Overview

This document identifies opportunities to replace ASCII diagrams with Mermaid diagrams throughout the MCP Gateway documentation for better visual clarity and maintainability.

## Priority 1: High-Impact Diagrams (Immediate)

### GETTING_STARTED.md

**1. Architecture Overview (Line ~60)**

```ascii
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Claude Code │   │ Claude      │   │   Cursor    │
│             │   │  Desktop    │   │             │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
```

**Replace with:**

```mermaid
graph TD
    A[Claude Code] --> G[MCP Gateway]
    B[Claude Desktop] --> G
    C[Cursor] --> G
    G --> S1[obs-mcp]
    G --> S2[filesystem]
    G --> S3[git-mcp]

    style G fill:#4a90e2,stroke:#2e5c8a,color:#fff
    style S1 fill:#50c878,stroke:#2d7a4a,color:#fff
    style S2 fill:#50c878,stroke:#2d7a4a,color:#fff
    style S3 fill:#50c878,stroke:#2d7a4a,color:#fff
```

**2. OAuth Flow (Line ~580)**

```
User → IDP (Okta/Auth0) → SAML Assertion → MCP Gateway → Access Granted
```

**Replace with:**

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Gateway as MCP Gateway
    participant GitHub

    User->>Browser: Click "Login with GitHub"
    Browser->>Gateway: GET /auth/github
    Gateway->>Browser: Redirect to GitHub
    Browser->>GitHub: Authorization request
    GitHub->>User: Login prompt
    User->>GitHub: Enter credentials
    GitHub->>Browser: Redirect with code
    Browser->>Gateway: GET /auth/callback?code=...
    Gateway->>GitHub: Exchange code for token
    GitHub->>Gateway: Access token
    Gateway->>Gateway: Create/login user
    Gateway->>Browser: JWT access token
    Browser->>User: Logged in
```

### USER_GUIDE.md

**3. Server Lifecycle State Machine (Line ~450)**

```
stopped → starting → running → idle → stopping → stopped
```

**Replace with:**

```mermaid
stateDiagram-v2
    [*] --> Stopped
    Stopped --> Starting: start()
    Starting --> Running: ready
    Starting --> Failed: error
    Running --> Idle: idle timeout
    Idle --> Stopping: stop()
    Running --> Stopping: stop()
    Stopping --> Stopped: terminated
    Failed --> Starting: retry
    Failed --> Stopped: max retries

    note right of Running
        Auto-restart on crash
        if autoRestart=true
    end note
```

**4. Authentication Flow Comparison (Line ~250)**

```mermaid
graph LR
    subgraph API Key
        A1[Client] -->|Bearer token| A2[Gateway]
        A2 --> A3[Validate in keychain]
        A3 --> A4[Grant access]
    end

    subgraph OAuth
        O1[Client] -->|Redirect| O2[IDP]
        O2 -->|Authorize| O3[Gateway]
        O3 -->|JWT| O1
    end

    subgraph mTLS
        M1[Client] -->|TLS cert| M2[Gateway]
        M2 --> M3[Validate CA]
        M3 --> M4[Grant access]
    end
```

**5. RBAC Permission Hierarchy (Line ~620)**

```mermaid
graph TD
    A[User: alice] --> R1[Role: admin]
    A --> R2[Role: developer]

    R1 --> P1[Permission: *:*]
    R2 --> P2[Permission: server:read]
    R2 --> P3[Permission: server:write]
    R2 --> P4[Permission: tool:call]

    P2 --> S1[Server: filesystem]
    P2 --> S2[Server: git]
    P4 --> T1[Tool: filesystem/read_file]
    P4 --> T2[Tool: git/commit]

    style A fill:#ff9900,stroke:#cc7700,color:#fff
    style R1 fill:#4a90e2,stroke:#2e5c8a,color:#fff
    style R2 fill:#4a90e2,stroke:#2e5c8a,color:#fff
```

**6. Multi-Tenancy Architecture (Line ~800)**

```mermaid
graph TB
    subgraph Clients
        C1[Tenant A Users]
        C2[Tenant B Users]
        C3[Tenant C Users]
    end

    subgraph Gateway
        G[MCP Gateway<br/>Multi-Tenant Mode]
    end

    subgraph Storage
        DB1[(Tenant A DB)]
        DB2[(Tenant B DB)]
        DB3[(Tenant C DB)]
    end

    C1 -->|tenant=acme| G
    C2 -->|tenant=widgets| G
    C3 -->|tenant=global| G

    G -->|isolated| DB1
    G -->|isolated| DB2
    G -->|isolated| DB3

    style G fill:#4a90e2,stroke:#2e5c8a,color:#fff
```

### ARCHITECTURE.md

**7. Component Architecture (Line ~30)**

Replace the large ASCII diagram with:

```mermaid
graph TB
    subgraph Transport Layer
        T1[stdio]
        T2[SSE]
        T3[HTTP]
    end

    subgraph Middleware
        M1[CORS]
        M2[Auth]
        M3[RBAC]
        M4[Rate Limit]
        M5[Audit]
    end

    subgraph Protocol
        P1[tools/list]
        P2[tools/call]
        P3[resources/list]
    end

    subgraph Router
        R[Parse & Route<br/>server/tool]
    end

    subgraph Manager
        SM[Server Manager]
    end

    subgraph Backends
        B1[pkg]
        B2[git]
        B3[container]
        B4[remote]
        B5[local]
    end

    T1 --> M1
    T2 --> M1
    T3 --> M1
    M1 --> M2
    M2 --> M3
    M3 --> M4
    M4 --> M5
    M5 --> P1
    M5 --> P2
    M5 --> P3
    P1 --> R
    P2 --> R
    P3 --> R
    R --> SM
    SM --> B1
    SM --> B2
    SM --> B3
    SM --> B4
    SM --> B5
```

**8. Request Flow Sequence (Line ~600)**

```mermaid
sequenceDiagram
    participant Client
    participant Transport
    participant Middleware
    participant Protocol
    participant Router
    participant Manager
    participant Backend
    participant MCP Server

    Client->>Transport: tools/call filesystem/read_file
    Transport->>Middleware: Parse JSON-RPC
    Middleware->>Middleware: Auth check
    Middleware->>Middleware: RBAC check
    Middleware->>Protocol: Handle tools/call
    Protocol->>Router: Parse "filesystem/read_file"
    Router->>Manager: Get server "filesystem"
    Manager->>Manager: Check if running
    alt Server not running
        Manager->>Backend: Start server
        Backend->>MCP Server: Spawn process
        MCP Server->>Backend: Ready
    end
    Manager->>Backend: Forward tool call
    Backend->>MCP Server: read_file
    MCP Server->>Backend: File contents
    Backend->>Manager: Result
    Manager->>Router: Result
    Router->>Protocol: Result
    Protocol->>Middleware: JSON-RPC response
    Middleware->>Transport: Response
    Transport->>Client: File contents
```

**9. Database Schema ER Diagram (Line ~750)**

```mermaid
erDiagram
    USERS ||--o{ USER_ROLES : has
    USERS ||--o{ API_KEYS : owns
    USERS }o--|| TENANTS : belongs_to
    ROLES ||--o{ USER_ROLES : assigned_to
    USERS ||--o{ AUDIT_LOGS : generates
    TENANTS ||--o{ SECRETS : stores

    USERS {
        text id PK
        text email UK
        text username UK
        text password_hash
        int created_at
        bool enabled
        text tenant_id FK
    }

    ROLES {
        text id PK
        text name UK
        text permissions
        int created_at
    }

    USER_ROLES {
        text user_id FK
        text role_id FK
        int granted_at
    }

    API_KEYS {
        text id PK
        text key_hash UK
        text user_id FK
        int expires_at
        bool revoked
    }

    TENANTS {
        text id PK
        text name UK
        text contact_email
        text quotas
        bool enabled
    }

    AUDIT_LOGS {
        text id PK
        int timestamp
        text user_id FK
        text action
        text resource
        int status
        text hash
    }

    SECRETS {
        text id PK
        text key UK
        text value_encrypted
        text tenant_id FK
    }
```

**10. Deployment Patterns (Line ~1100)**

```mermaid
graph TB
    subgraph Pattern 1: Standalone
        C1[Client] --> G1[Gateway]
        G1 --> S1[Servers]
    end

    subgraph Pattern 2: Load Balanced
        C2[Clients] --> LB[Load Balancer]
        LB --> G2A[Gateway 1]
        LB --> G2B[Gateway 2]
        LB --> G2C[Gateway 3]
        G2A --> DB[(Shared DB)]
        G2B --> DB
        G2C --> DB
    end

    subgraph Pattern 3: Multi-Tenant
        T1[Tenant A] --> G3[Gateway]
        T2[Tenant B] --> G3
        G3 --> DB1[(DB A)]
        G3 --> DB2[(DB B)]
    end

    subgraph Pattern 4: Edge
        CP[Control Plane] --> E1[Edge US-E]
        CP --> E2[Edge US-W]
        CP --> E3[Edge EU]
        CL1[Clients US-E] --> E1
        CL2[Clients US-W] --> E2
        CL3[Clients EU] --> E3
    end
```

## Priority 2: Tutorial Diagrams (Important)

### oauth-github.md

**11. OAuth Flow (Line ~20)**

```mermaid
sequenceDiagram
    participant Browser
    participant Gateway as MCP Gateway
    participant GitHub

    Browser->>Gateway: GET /auth/github
    Gateway->>Browser: 302 Redirect
    Browser->>GitHub: Authorization request
    Note over GitHub: User logs in
    GitHub->>Browser: Redirect with code
    Browser->>Gateway: GET /auth/callback?code=abc
    Gateway->>GitHub: POST /access_token
    GitHub->>Gateway: Access token
    Gateway->>GitHub: GET /user
    GitHub->>Gateway: User profile
    Gateway->>Gateway: Create/login user
    Gateway->>Browser: Set JWT cookie
    Browser->>Browser: Redirect to dashboard
```

### saml-sso.md

**12. SAML Flow (Line ~15)**

```mermaid
sequenceDiagram
    participant User
    participant Gateway as MCP Gateway (SP)
    participant IDP as Okta (IDP)

    User->>Gateway: Access /auth/saml
    Gateway->>Gateway: Generate SAML request
    Gateway->>User: Redirect to IDP
    User->>IDP: SAML request
    IDP->>User: Login page
    User->>IDP: Credentials
    IDP->>IDP: Authenticate
    IDP->>Gateway: POST SAML assertion
    Gateway->>Gateway: Validate signature
    Gateway->>Gateway: Extract attributes
    Gateway->>Gateway: Create/login user
    Gateway->>User: JWT access token
```

### kubernetes-deployment.md

**13. K8s Architecture (Line ~25)**

```mermaid
graph TB
    subgraph Internet
        I[Users]
    end

    subgraph Kubernetes Cluster
        LB[Load Balancer]
        ING[Ingress Controller]

        subgraph Pods
            P1[Gateway Pod 1]
            P2[Gateway Pod 2]
            P3[Gateway Pod 3]
        end

        HPA[HorizontalPodAutoscaler]
        PDB[PodDisruptionBudget]

        subgraph Storage
            PG[(PostgreSQL)]
            PV[PersistentVolume]
        end

        subgraph Monitoring
            PROM[Prometheus]
            GRAF[Grafana]
        end
    end

    I --> LB
    LB --> ING
    ING --> P1
    ING --> P2
    ING --> P3

    HPA -.->|scales| P1
    PDB -.->|protects| P1

    P1 --> PG
    P2 --> PG
    P3 --> PG

    PG --> PV

    P1 -->|metrics| PROM
    PROM --> GRAF
```

### multi-tenancy.md

**14. Tenant Isolation (Line ~30)**

```mermaid
graph TB
    subgraph Tenants
        T1[Acme Corp]
        T2[Widgets Inc]
        T3[Global Services]
    end

    subgraph Gateway Layer
        G[MCP Gateway<br/>Tenant Router]
    end

    subgraph Network Isolation
        VLAN1[VLAN 100]
        VLAN2[VLAN 101]
        VLAN3[VLAN 102]
    end

    subgraph Storage Layer
        DB1[(acme_db)]
        DB2[(widgets_db)]
        DB3[(global_db)]
    end

    subgraph Filesystem
        FS1[/data/acme]
        FS2[/data/widgets]
        FS3[/data/global]
    end

    T1 -->|192.168.1.x| G
    T2 -->|10.0.0.x| G
    T3 -->|172.16.0.x| G

    G --> VLAN1
    G --> VLAN2
    G --> VLAN3

    VLAN1 --> DB1
    VLAN2 --> DB2
    VLAN3 --> DB3

    DB1 --> FS1
    DB2 --> FS2
    DB3 --> FS3

    style G fill:#4a90e2,stroke:#2e5c8a,color:#fff
    style DB1 fill:#ff6b6b,stroke:#cc5555,color:#fff
    style DB2 fill:#51cf66,stroke:#40a84f,color:#fff
    style DB3 fill:#ffd93d,stroke:#ccad31,color:#fff
```

### monitoring-setup.md

**15. Monitoring Stack (Line ~20)**

```mermaid
graph LR
    subgraph MCP Gateway
        G[Gateway<br/>:3000]
        M[/metrics<br/>endpoint]
    end

    subgraph Prometheus
        P[Prometheus<br/>:9090]
        A[Alertmanager<br/>:9093]
    end

    subgraph Grafana
        GR[Grafana<br/>:3000]
        D[Dashboards]
    end

    subgraph Tracing
        J[Jaeger<br/>:16686]
    end

    subgraph Logging
        E[Elasticsearch]
        K[Kibana]
    end

    subgraph Alerting
        SL[Slack]
        PD[PagerDuty]
    end

    G --> M
    M -->|scrape| P
    P --> A
    A --> SL
    A --> PD
    P --> GR
    GR --> D

    G -->|traces| J
    G -->|logs| E
    E --> K

    style G fill:#4a90e2,stroke:#2e5c8a,color:#fff
    style P fill:#e85d42,stroke:#b74a35,color:#fff
    style GR fill:#f48c42,stroke:#c37035,color:#fff
```

## Priority 3: Training Material Diagrams (Nice to Have)

### MCP_Gateway_v3.0_Training.md

**16. Slide 6: Core Concepts (Line ~90)**

```mermaid
mindmap
  root((MCP Gateway))
    Servers
      Sources
        pkg
        git
        container
        remote
        local
      Lifecycle
        persistent
        on-demand
    Tools
      Namespacing
      Tool Calls
    Transport
      stdio
      SSE
      HTTP
    Registry
      Configuration
      Hot Reload
```

**17. Slide 16: HA Setup (Line ~270)**

```mermaid
graph TB
    subgraph Load Balancer
        LB[nginx / Traefik]
    end

    subgraph Gateway Instances
        G1[Gateway 1]
        G2[Gateway 2]
        G3[Gateway 3]
    end

    subgraph Database
        PG[(PostgreSQL<br/>Primary)]
        R1[(Replica 1)]
        R2[(Replica 2)]
    end

    subgraph Backup
        B[Daily Backups<br/>30-day retention]
    end

    LB --> G1
    LB --> G2
    LB --> G3

    G1 --> PG
    G2 --> PG
    G3 --> PG

    PG --> R1
    PG --> R2
    PG --> B

    style LB fill:#4a90e2,stroke:#2e5c8a,color:#fff
    style PG fill:#336791,stroke:#1e3a5f,color:#fff
```

## Implementation Recommendations

### Phase 1: Critical Diagrams (Week 1)

- GETTING_STARTED.md: Architecture, OAuth flow
- USER_GUIDE.md: State machine, RBAC hierarchy
- ARCHITECTURE.md: Component architecture, request flow, ER diagram

### Phase 2: Tutorial Diagrams (Week 2)

- All 6 tutorials: Add sequence diagrams for flows
- Multi-tenancy: Isolation architecture

### Phase 3: Training Enhancements (Week 3)

- Training slides: Add mindmap and HA diagram
- Lab exercises: Add verification flow diagrams

## Benefits of Mermaid Diagrams

1. **Maintainability**: Plain text diagrams tracked in git
2. **Clarity**: Better visual representation than ASCII
3. **Rendering**: GitHub/GitLab natively render Mermaid
4. **Consistency**: Unified styling across all diagrams
5. **Accessibility**: Screen readers can parse Mermaid text
6. **Search**: Diagram content is searchable

## Migration Strategy

1. **Keep ASCII temporarily**: Don't remove until Mermaid verified
2. **Add comment**: Mark ASCII diagrams with `<!-- Legacy ASCII -->`
3. **Test rendering**: Verify on GitHub before removing ASCII
4. **Document colors**: Use consistent color scheme (defined above)
5. **Responsive**: Ensure diagrams work on mobile

## Next Steps

1. Review this plan with team
2. Prioritize diagrams by impact
3. Implement Phase 1 (critical diagrams)
4. Gather feedback
5. Roll out Phases 2 and 3
