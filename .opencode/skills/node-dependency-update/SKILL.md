---
name: node-dependency-update
description: Update Node.js dependencies with Socket security scanning and Bun lockfile management
---

# Node Dependency Update

Update dependencies with security verification using Socket and manage Bun lockfiles.

## When to Use

- "update dependencies", "update packages", "bump versions"
- "npm audit", "check for vulnerabilities"
- Regular dependency maintenance tasks

## Workflow

### 1. Check Baseline Security (Recommended)

Before updating, create a Socket scan to establish security baseline:

```bash
socket scan create . --json
```

This captures the current security state for comparison.

### 2. Identify Outdated Packages

```bash
npm outdated
```

Or check specific packages with Socket scores:

```bash
socket npm <package-name>
```

### 3. Update package.json

Manually update versions in `package.json` to latest semver-allowed versions:

| Check Command            | Current Version             |
| ------------------------ | --------------------------- |
| `npm view <pkg> version` | Latest stable               |
| `npm outdated`           | Shows Current/Wanted/Latest |

Update dependencies and devDependencies to latest versions per `npm outdated` Wanted column.

### 4. Install with Socket Security

```bash
socket npm install
```

This wraps npm with Socket security scanning - checks each package for:

- Malware, typosquatting, protestware
- Known CVEs
- Supply chain risks

Expected output: "Socket npm found no new risks"

### 5. Verify with Socket Audit

```bash
socket npm audit
```

Confirms post-install security state. Expected: "found 0 vulnerabilities"

### 6. Regenerate Bun Lockfile

If using Bun as primary runtime, regenerate fresh lockfile:

```bash
rm bun.lock && bun install --save-lockfile
```

Bun will migrate from existing `package-lock.json` automatically.

### 7. Optional: Run Socket Optimize

Apply `@socketregistry` overrides for packages with known vulnerabilities:

```bash
socket optimize
```

### 8. CI Gate (Optional)

Add as pre-commit or CI check:

```bash
socket ci
```

Fails if security policy violated.

## Key Points

- `socket npm` wraps npm with real-time security scanning
- `socket npm audit` is distinct from `npm audit` - Socket has broader detection (malware, supply chain, not just CVEs)
- For Bun projects: regenerate lockfile after npm-based install
- Socket quota: 100 units per month for API commands (wrapper commands are unlimited)

## Variations

### Quick Update (Minimal Security)

```bash
npm outdated
# update package.json manually
npm install
npm audit
```

### Full Security Update (Recommended)

```bash
socket scan create . --json      # baseline
npm outdated                     # identify updates
# update package.json
socket npm install              # install + scan
socket npm audit                # verify
socket optimize                 # apply overrides
rm bun.lock && bun install      # regenerate lockfile
socket ci                       # CI gate
```

## Commands Reference

| Command                      | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `socket npm install`         | Install with security scanning     |
| `socket npm audit`           | Verify security state              |
| `socket scan create .`       | Create security scan               |
| `socket optimize`            | Apply socketregistry overrides     |
| `socket ci`                  | CI gate - fail on policy violation |
| `socket package score <pkg>` | Get security score for package     |
