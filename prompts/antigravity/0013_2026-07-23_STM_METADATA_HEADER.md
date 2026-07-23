# STM-0002 — Standard Metadata Header

## Statement Type

Methodology Statement

---

# Title

Standard Metadata Header for Knowledge Assets

---

# Status

Approved

---

# Purpose

This Statement establishes the mandatory metadata header that shall be included in every official Knowledge Asset (KA) produced under the KODE methodology.

The objective is to provide a consistent identification mechanism that strengthens traceability, governance, version control, automation and long-term maintainability across the entire methodology.

---

# Statement

Every official Knowledge Asset shall include a standardized metadata header placed at the beginning of the document.

The metadata header constitutes part of the Knowledge Asset itself and shall be considered authoritative information.

Metadata shall be maintained throughout the lifecycle of the document and updated whenever the asset evolves.

The absence of mandatory metadata shall be considered a Knowledge Debt item.

---

# Mandatory Metadata

Every Knowledge Asset shall include, at minimum, the following fields.

```yaml
Document ID:
Document Title:
Document Type:
Version:
Status:
Owner:
Steward:
Governed By:
Depends On:
Related Assets:
Classification:
Created:
Last Updated:
Review Cycle:
```

---

# Field Definitions

**Document ID**

Unique identifier of the Knowledge Asset.

---

**Document Title**

Official document name.

---

**Document Type**

Type of Knowledge Asset according to the KAC.

---

**Version**

Current document version.

---

**Status**

Lifecycle status.

Examples:

- Draft
- Review
- Approved
- Published
- Deprecated
- Archived

---

**Owner**

Human accountable for the document.

---

**Steward**

Role or organization responsible for maintaining the document.

---

**Governed By**

Higher-level Knowledge Asset governing this document.

Normally the Constitution.

---

**Depends On**

Knowledge Assets that must exist for this document to remain valid.

---

**Related Assets**

Cross-referenced Knowledge Assets.

---

**Classification**

Examples:

- Public
- Internal
- Confidential

---

**Created**

Original creation date.

---

**Last Updated**

Most recent approved modification.

---

**Review Cycle**

Recommended review frequency.

Examples:

- Every Sprint
- Quarterly
- Semiannual
- Annual

---

# Governance

The metadata header is governed by the Constitution and shall be interpreted together with the Knowledge Asset Catalog (KAC) and the Knowledge Governance Guide (KGG).

Future versions may extend this header provided backward compatibility is preserved.

---

# Applicability

This Statement applies to every official Knowledge Asset, including but not limited to:

- Constitution
- KMR
- KAC
- KGG
- Statements (STM)
- Integration Mandates (KIM)
- ADR
- KIA
- KD
- Standards
- Templates
- Runbooks
- Repository Standards
- Prompt Standards

---

# Rationale

Knowledge cannot be governed consistently if its identity is inconsistent.

Standardized metadata provides the foundation for:

- governance;
- traceability;
- automation;
- dependency analysis;
- version management;
- knowledge discovery;
- future AI-assisted reasoning.

---

# Effective Date

This Statement becomes effective immediately upon approval.

Knowledge Assets created after this Statement shall comply with the mandatory metadata header.

Existing Knowledge Assets should be progressively migrated as part of normal maintenance activities.

---

# Final Statement

A Knowledge Asset is not fully governed until it can be uniquely identified, versioned, related, maintained and traced through its metadata.

Standardized metadata is therefore recognized as a foundational element of the KODE methodology.
