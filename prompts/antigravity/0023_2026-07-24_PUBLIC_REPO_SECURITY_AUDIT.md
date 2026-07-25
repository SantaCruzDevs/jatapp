# Prompt 0023 — Public Repository Security Audit

## Objective

Create a standardized security audit process that MUST be executed before any SantaCruzDevs repository changes from Private to Public.

This audit becomes part of the KODE methodology and will be mandatory for every project.

---

## Deliverables

Create the following document:

docs/RUNBOOKS/RB-002_PUBLIC_REPOSITORY_SECURITY_CHECKLIST.md

---

## Requirements

The runbook shall include, at minimum, the following sections.

### 1. Purpose

Explain that the objective is preventing accidental publication of:

- credentials
- secrets
- customer data
- certificates
- private infrastructure information

---

### 2. Repository Verification

Commands

```powershell
git status
git ls-files
dir -Force
```

Checklist

- Working tree clean
- Expected files only
- No unexpected folders
- No temporary files

---

### 3. Environment Variables Audit

Verify that only example environment files are versioned.

Allowed

```
.env.example
```

Forbidden

```
.env
.env.local
.env.production.local
.env.development.local
.env.test.local
```

---

### 4. Git Ignore Validation

Verify that .gitignore contains at least:

```
.env
.env.*
node_modules/
.next/
dist/
build/
```

---

### 5. Secrets Detection

Include PowerShell commands.

```powershell
git grep -i "apikey"
git grep -i "token"
git grep -i "secret"
git grep -i "password"
git grep -i "private_key"
git grep -i "service_role"
git grep -i "client_secret"
git grep -i "authorization"
git grep -i "bearer"
```

Document how to interpret the results.

Documentation references are acceptable.

Real credentials are NOT.

---

### 6. Sensitive Files Audit

Search for:

```
.pem
.key
.pfx
.crt
.sqlite
.db
.bak
.zip
.rar
```

Include PowerShell examples.

---

### 7. Cloud Secrets

Verify that the repository does NOT contain:

- Supabase keys
- Azure keys
- AWS credentials
- Cloudflare Tokens
- GitHub PAT
- Google API Keys
- OpenAI API Keys

---

### 8. Personal Information Audit

Verify there are no:

- customer databases
- exported reports
- employee information
- financial records
- production logs
- backup files

---

### 9. Approval Checklist

Create a final checklist.

Example

□ Git Ignore verified

□ No credentials

□ No secrets

□ No certificates

□ No customer data

□ No backups

□ Repository reviewed

□ Approved for Public Release

---

### 10. Future Automation

Design the runbook so that it can later be automated by a PowerShell script.

Future target

```
scripts/security/public_repo_check.ps1
```

The runbook should describe the expected output.

Example

```
======================================
SantaCruzDevs Public Repository Audit
======================================

PASS Environment Variables

PASS Secrets Scan

PASS Certificates

PASS Git Ignore

PASS Sensitive Files

PASS Personal Data

--------------------------------------

RESULT

SAFE FOR PUBLIC RELEASE
```

---

## Documentation Standards

Follow all KODE documentation standards.

Include:

- Metadata header
- Revision history
- References
- Future improvements
- Review section

---

## Constraints

Do NOT modify application code.

Do NOT modify deployment configuration.

Only create documentation.

---

## Expected Outcome

SantaCruzDevs shall have an official security review process executed before publishing any Git repository.

This document becomes part of the KODE methodology and applies to every present and future project.
