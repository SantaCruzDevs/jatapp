---
Document ID: KODE-IDX-001
Document Title: KODE Central Metadata Index
Document Type: Directory Index
Version: 1.4
Status: Published
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, KGG.md, KMR.md, STM-0002_METADATA_HEADER.md, standards/SACS-001.md, standards/PES-001.md, standards/RST-001.md, RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md
Related Assets: None
Classification: Internal
Created: 2026-07-23
Last Updated: 2026-07-23
Review Cycle: Every Sprint
---

# KODE Central Metadata Index — Índice Central de Metadatos

Este índice recopila y consolida las cabeceras de metadatos estandarizadas (STM-0002) de todos los Activos de Conocimiento del ecosistema KODE, asegurando su gobernanza, trazabilidad y preparación para herramientas de automatización futuras.

---

## 1. Índice Central de Metadatos

| Document ID | Document Title | Document Type | Version | Status | Owner | Steward | Governed By | Depends On |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PB-000** | [KODE Constitution](CONSTITUTION.md) | Project Constitution | 1.0 | Approved | J. Murichi | Santa Cruz Devs | None | None |
| **KAC-001** | [Knowledge Asset Catalog](KAC.md) | Knowledge Asset Catalog | 1.0 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md |
| **KGG-001** | [Knowledge Governance Guide](KGG.md) | Governance Guide | 1.0 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md |
| **KMR-001** | [KODE Methodology Register](KMR.md) | Methodology Register | 1.0 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md |
| **KODE-DIR-000** | [README (Constitution Directory)](README.md) | Directory Index | 1.9 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md, KMR.md, KODE_METADATA_INDEX.md, SACS-001.md, PES-001.md, RST-001.md, RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md |
| **KODE-IDX-001** | [KODE Central Metadata Index](KODE_METADATA_INDEX.md) | Directory Index | 1.4 | Published | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, STM-0002_METADATA_HEADER.md, standards/SACS-001.md, standards/PES-001.md, standards/RST-001.md, RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md |
| **SACS-001** | [Specialized Agent Collaboration Standard](standards/SACS-001.md) | Standard (STD) | 1.0 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md |
| **PES-001** | [Prompt Engineering Standard](standards/PES-001.md) | Standard (STD) | 1.0 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md, STM-0002_METADATA_HEADER.md, standards/SACS-001.md |
| **RST-001** | [Repository Standard](standards/RST-001.md) | Standard (STD) | 1.0 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md, STM-0002_METADATA_HEADER.md, standards/SACS-001.md, standards/PES-001.md |
| **RB-001** | [Commercial Demo Deployment Runbook](RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md) | Runbook (RB) | 1.0 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md, standards/RST-001.md |
| **STM-0002** | [Standard Metadata Header](statements/STM-0002_METADATA_HEADER.md) | Statement (STM) | 1.0 | Approved | J. Murichi | Santa Cruz Devs | PB-000 | None |
| **PB-DIR-000** | [README (Project Bible Directory)](../PROJECT_BIBLE/README.md) | Directory Index | 1.0 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md |
| **PB-008** | [AI Collaboration (KODE framework)](../PROJECT_BIBLE/08_AI_COLLABORATION.md) | Standard (STD) | 0.2 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md, KAC.md, KGG.md |
| **PB-REV-000** | [Reviews Register](../PROJECT_BIBLE/REVIEWS.md) | Register (REG) | 1.0 | Draft | J. Murichi | Santa Cruz Devs | PB-000 | CONSTITUTION.md |





---

## 2. Reglas de Validación del Repositorio (Validation Rules)

Para garantizar la integridad y evitar la acumulación de Deuda de Conocimiento, el repositorio aplicará las siguientes reglas automáticas y manuales de validación:
1.  **Prohibición de IDs Duplicados:** Cada Activo de Conocimiento debe poseer un `Document ID` único. La existencia de dos documentos con el mismo identificador invalidará la compilación de conocimiento.
2.  **Campos Obligatorios Requeridos:** Ningún documento será clasificado como "Aprobado" o "Publicado" si carece de alguno de los 14 campos definidos en la cabecera estándar de metadatos de STM-0002.
3.  **Prohibición de Activos Huérfanos:** Todos los documentos de nivel 2 y nivel 3 deben referenciar un activo de nivel superior que los gobierne en el campo `Governed By`.
4.  **Integridad de Enlaces y Dependencias:** Cualquier archivo referenciado en el campo `Depends On` o `Related Assets` debe existir físicamente en el repositorio. Las referencias rotas deben ser reportadas de inmediato como Deuda de Conocimiento.
5.  **Prohibición de IA como Autoridad:** En el campo `Owner` solo se permiten nombres de ingenieros humanos responsables que rindan cuentas. Los agentes de IA se listarán en `Related Assets` u hojas de trazabilidad de prompts correspondientes.

---

## 3. Cumplimiento Futuro (Future Compliance)
*   Cualquier nuevo Activo de Conocimiento (KA) creado por ingenieros humanos o sugerido por agentes de IA debe incluir obligatoriamente el bloque YAML al inicio.
*   Los documentos integrados que no posean la cabecera estándar serán catalogados por el *Librarian* en un registro de Deuda de Conocimiento (`KD`) y tendrán estado transicional de `Draft` hasta que su metadato sea normalizado.

---

### Navegación
*   **Anterior:** [KMR](KMR.md)
*   **Volver al índice:** [Volver al índice](README.md)
