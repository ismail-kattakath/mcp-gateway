# Security Policy — MCP Gateway Bug Bounty Program

We take security seriously. We invite external security researchers to help make MCP Gateway more secure through our bug bounty program.

## Reporting a Vulnerability

- **Email**: security@mcp-gateway.example.com
- **GitHub**: [Report a security advisory](https://github.com/ismail-kattakath/mcp-gateway/security/advisories/new)
- **PGP**: [Download public key](https://github.com/ismail-kattakath/mcp-gateway/blob/main/docs/pgp-key.asc)

Encrypted reports are encouraged for sensitive findings.

### Response SLAs

| Severity | Acknowledgment | Triage | Fix |
|----------|---------------|--------|-----|
| Critical | < 24 hours | < 48 hours | < 7 days |
| High     | < 48 hours | < 3 days  | < 14 days |
| Medium   | < 3 days  | < 7 days  | < 30 days |
| Low      | < 5 days  | < 14 days | Next release |

## Scope

### In Scope

- ✅ MCP Gateway server ([github.com/ismail-kattakath/mcp-gateway](https://github.com/ismail-kattakath/mcp-gateway))
- ✅ Official Docker images (`ghcr.io/ismail-kattakath/mcp-gateway`)
- ✅ Web UI (if deployed publicly)
- ✅ REST API endpoints
- ✅ Authentication / authorization mechanisms
- ✅ SSE transport security
- ✅ Database security (SQLite)

### Out of Scope

- ❌ Third-party MCP servers (not maintained by us)
- ❌ Social engineering attacks
- ❌ Physical attacks
- ❌ DoS attacks (rate limiting excluded)
- ❌ Vulnerabilities in dependencies (report to upstream maintainers first)
- ❌ Issues requiring root/admin access

## Bounty Rewards

| Severity | Range (USD) | Examples |
|----------|-------------|----------|
| **Critical** | $500 – $2,000 | RCE, SQL injection with data exfiltration, authentication bypass, privilege escalation (user → admin), arbitrary file read/write, secrets leakage (API keys, tokens) |
| **High** | $200 – $500 | XSS with impact, CSRF leading to account takeover, IDOR, JWT token vulnerabilities, path traversal, command injection (limited impact) |
| **Medium** | $100 – $200 | Information disclosure (non-sensitive), CSRF (low impact), open redirect, clickjacking, missing security headers, weak cryptography |
| **Low** | $50 – $100 | Security misconfigurations, verbose error messages, missing rate limiting (specific endpoints), insecure cookies (non-critical) |
| **Informational** | Acknowledgment only | Best practice violations, documentation issues, low-impact vulnerabilities |

Bounty amounts are determined at our discretion based on severity, impact, and report quality.

## Rules of Engagement

### Allowed

- Use your own MCP Gateway instance (local or self-hosted)
- Automated scanning at reasonable rates
- Proof-of-concept exploits (non-destructive)
- Test accounts (create your own)

### Prohibited

- Accessing other users' data
- Destructive actions (`DELETE`, `DROP`, etc.)
- Spam or excessive traffic
- Social engineering
- Physical attacks
- Violating privacy laws

## Safe Harbor

We will not pursue legal action against researchers who:
- Follow these rules of engagement
- Report vulnerabilities responsibly and in good faith
- Make a good faith effort to avoid harm, privacy violations, and data destruction

We consider vulnerability research conducted in compliance with this policy to be:
- Authorized under applicable anti-hacking laws
- Exempt from DMCA restrictions
- Exempt from our Terms of Service restrictions where they conflict

## Triage Process

1. **Report received** — via email or GitHub Security Advisory
2. **Acknowledgment** — within SLA timeframe
3. **Validation** — reproduce vulnerability, assess impact
4. **Severity scoring** — CVSS assessment, bounty tier assignment
5. **Remediation** — develop fix, test
6. **Payout** — after fix is deployed
7. **Disclosure** — 90 days or after fix, whichever is sooner
8. **Public advisory** — GitHub Security Advisory published
9. **Credit** — Hall of Fame, CVE acknowledgment

## Payment

Payments are processed via:
- PayPal
- Cryptocurrency (ETH/USDC on Base, Polygon, Arbitrum, Optimism, or Solana)

Payment is made after the fix is deployed and verified. Tax forms may be required for amounts over $600 (US researchers).

## Hall of Fame

We gratefully acknowledge the researchers who help secure MCP Gateway. See [docs/HALL-OF-FAME.md](docs/HALL-OF-FAME.md) for our security researcher Hall of Fame.

## Program History

- **Launch**: June 2026 — Program launched with GitHub Security Advisories
- **Future**: HackerOne integration planned for late 2026 / early 2027

---

*This bug bounty program is inspired by the [OWASP Vulnerability Disclosure Cheat Sheet](https://owasp.org/www-community/Vulnerability_Disclosure_Cheat_Sheet) and [ISO 29147](https://www.iso.org/standard/72311.html).*
