# JAT-INFRA-001 — Commercial Demo Deployment

## Role

Senior DevOps Engineer, Platform Architect & Release Manager

---

# Context

JATapp Commercial Demo has reached the first interactive prototype.

The prototype will be publicly presented to the client.

The demonstration shall be accessible through:

https://jatappdemo.santacruzdevs.com

The deployment must follow the official SantaCruzDevs infrastructure architecture.

---

# SantaCruzDevs Account Architecture

## Founder Account

Owner:

murichi@gmail.com

This account owns:

- GitHub Personal
- GitHub Organization (SantaCruzDevs)
- Vercel Account
- Vercel Team (SantaCruzDevs)
- ChatGPT
- Gemini
- Claude
- Antigravity
- Porkbun Domain
- Development Tooling

This account represents the Founder.

---

## Company Account

Owner:

santacruzdevs.team@gmail.com

This account owns:

- Cloudflare
- Supabase

This account represents the Company Infrastructure.

Infrastructure changes shall respect this ownership model.

---

# Deployment Target

Deploy the demo using:

Cloudflare

↓

DNS

↓

Vercel

↓

Next.js Demo

↓

Subdomain

https://jatappdemo.santacruzdevs.com

---

# Objective

Prepare the repository so the Commercial Demo can be deployed with minimal manual configuration.

The deployment must be reproducible.

The deployment must be production-quality even though the application is a commercial prototype.

---

# Requirements

Configure the project considering:

Production Build

Environment Variables

Public Assets

Static Resources

SPA Routing

Responsive Behavior

Cache Strategy

Deployment Optimization

---

# Repository Requirements

Review the repository and prepare:

.gitignore

README

Environment example

Deployment instructions

Folder organization

Build configuration

Assets

Public files

---

# Vercel Requirements

Prepare the project for deployment using Vercel.

Avoid hardcoded URLs.

Avoid localhost references.

Support Production Environment.

Support Preview Deployments.

Support Local Development.

---

# Cloudflare Requirements

Assume Cloudflare manages:

DNS

SSL

HTTPS

Caching

Security

Do not introduce unnecessary configuration that conflicts with Cloudflare.

---

# Domain

Deployment target:

https://jatappdemo.santacruzdevs.com

All application URLs should be relative whenever possible.

Avoid absolute URLs.

---

# Demo Requirements

The deployed application shall:

Load quickly.

Be responsive.

Work without backend dependencies.

Use mock data.

Support presentation mode.

Avoid runtime errors.

Avoid empty states during presentation.

---

# Deliverables

Prepare:

Deployment-ready project

Deployment documentation

Environment configuration

Build validation

Deployment checklist

README update

CHANGELOG update

---

# Success Criteria

A single deployment to Vercel should publish the demo successfully.

The demo should be immediately accessible from:

https://jatappdemo.santacruzdevs.com

The deployment should require minimal manual intervention.

The repository should remain aligned with KODE standards.

---

# Final Instruction

Treat this deployment as the first public release of JATapp.

The objective is to provide a stable, professional and visually polished demonstration environment suitable for presentation to prospective clients.
