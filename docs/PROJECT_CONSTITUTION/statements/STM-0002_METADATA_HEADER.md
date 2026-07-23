---
Document ID: STM-0002
Document Title: Standard Metadata Header for Knowledge Assets
Document Type: Statement (STM)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: None
Related Assets: KAC.md, KGG.md, KMR.md
Classification: Internal
Created: 2026-07-23
Last Updated: 2026-07-23
Review Cycle: Annual
---

# STM-0002 — Standard Metadata Header

## Tipo de Declaración

Statement de Metodología (Methodology Statement)

---

## Título

Cabecera de Metadatos Estándar para Activos de Conocimiento (Standard Metadata Header for Knowledge Assets)

---

## Estado

Aprobado (Approved)

---

## Propósito

Esta Declaración establece la cabecera de metadatos obligatoria que debe incluirse en cada Activo de Conocimiento (Knowledge Asset — KA) oficial producido bajo la metodología KODE.

El objetivo es proporcionar un mecanismo de identificación consistente que fortalezca la trazabilidad, la gobernanza, el control de versiones, la automatización y la mantenibilidad a largo plazo en toda la metodología.

---

## Declaración

*   Cada Activo de Conocimiento oficial debe incluir una cabecera de metadatos estandarizada al inicio del documento.
*   La cabecera de metadatos constituye parte del propio Activo de Conocimiento y se considera información autoritativa.
*   Los metadatos se mantendrán a lo largo del ciclo de vida del documento y se actualizarán cada vez que evolucione el activo.
*   La ausencia de los metadatos obligatorios se considerará un ítem de Deuda de Conocimiento (Knowledge Debt).

---

## Metadatos Obligatorios

Cada Activo de Conocimiento debe incluir, como mínimo, los siguientes campos en formato YAML:

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

## Definición de Campos

*   **Document ID:** Identificador único del Activo de Conocimiento.
*   **Document Title:** Nombre oficial del documento.
*   **Document Type:** Tipo de Activo de Conocimiento según el KAC.
*   **Version:** Versión actual del documento.
*   **Status:** Estado del ciclo de vida (Draft, Review, Approved, Published, Deprecated, Archived).
*   **Owner:** Persona humana responsable y que rinde cuentas por el documento.
*   **Steward:** Rol u organización responsable de mantener el documento físico.
*   **Governed By:** Activo de conocimiento de nivel superior que gobierna este documento (normalmente la Constitución).
*   **Depends On:** Activos de conocimiento que deben existir para que este documento siga siendo válido.
*   **Related Assets:** Activos de conocimiento de referencia cruzada.
*   **Classification:** Nivel de confidencialidad (Public, Internal, Confidential).
*   **Created:** Fecha original de creación del documento.
*   **Last Updated:** Modificación aprobada más reciente.
*   **Review Cycle:** Frecuencia recomendada de revisión (Every Sprint, Quarterly, Semiannual, Annual).

---

### Navegación
*   **Volver al índice:** [Volver al índice](../README.md)
