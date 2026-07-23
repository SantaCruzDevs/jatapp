---
Document ID: KAC-001
Document Title: Knowledge Asset Catalog (KAC)
Document Type: Knowledge Asset Catalog (KAC)
Version: 1.0
Status: Draft
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md
Related Assets: KGG.md, KMR.md
Classification: Internal
Created: 2026-07-22
Last Updated: 2026-07-22
Review Cycle: Annual
---

# KODE — Catálogo de Activos de Conocimiento (Knowledge Asset Catalog — KAC)


---

## 1. Propósito del Catálogo de Activos de Conocimiento (KAC)
El propósito de este catálogo es actuar como la referencia autoritativa del ecosistema **KODE** para identificar, definir y gobernar cada uno de los **Activos de Conocimiento (Knowledge Assets — KA)** del proyecto. Establece un vocabulario común, define los flujos de ciclo de vida de los activos y formaliza la arquitectura del conocimiento.

## 2. Relación con la Constitución
El KAC está subordinado directamente a la **Constitución de KODE**. Todo activo listado en este catálogo debe alinearse estrictamente con los principios constitucionales de gobernanza (STM-0001), priorizando la soberanía decisional humana y la trazabilidad del conocimiento.

## 3. Definición de un Activo de Conocimiento (KA)
Un **Activo de Conocimiento (KA)** es cualquier entidad de información, documentación, regla o código formalmente registrada y gobernada dentro del ecosistema de desarrollo que aporta valor estratégico, metodológico o técnico al proyecto y cuya evolución está sujeta a políticas de control de versiones y trazabilidad de KODE.

## 4. Clasificación de Activos de Conocimiento
Los activos se clasifican en tres categorías jerárquicas:
1.  **Gobernanza y Metodología (Nivel 1):** Activos de dirección suprema (Constitución, KAC, Statements).
2.  **Definición de Producto y Diseño (Nivel 2):** Activos que describen el producto e interacción (Project Bible, Architecture, ADR, Standards, Templates, KIA).
3.  **Implementación y Operación (Nivel 3):** Activos técnicos de construcción y despliegue (Código Fuente, Estructura del Repositorio, Runbooks, Documentación de Sprints, Changelog).

---

## 5. Catálogo Oficial de Activos de Conocimiento

### Gobernanza y Metodología (Nivel 1)
*   **Project Constitution (Constitución del Proyecto):**
    *   *Propósito:* Documento supremo de gobierno que formaliza la estrategia, lema y reglas constitutivas del proyecto.
    *   *Owner:* Methodology Owner (Jesús Daniel Murichi Barrientos).
    *   *Obligatorio:* Sí.
*   **KAC (Knowledge Asset Catalog):**
    *   *Propósito:* Catálogo oficial de todos los activos de conocimiento gobernados.
    *   *Owner:* Methodology Owner.
    *   *Obligatorio:* Sí.
*   **Statement (Declaración — STM):**
    *   *Propósito:* Declaración oficial que promulga conocimiento o directivas aprobadas por el Methodology Owner.
    *   *Owner:* Methodology Owner.
    *   *Obligatorio:* Sí.
*   **Prompt (Instrucción de IA — PRM):**
    *   *Propósito:* Instrucción estructurada para ejecutar directivas y alimentar/interactuar con agentes de IA.
    *   *Owner:* Implementation Engineer & Project Librarian.
    *   *Obligatorio:* Sí.

### Definición de Producto y Diseño (Nivel 2)
*   **Project Bible (Biblia del Proyecto):**
    *   *Propósito:* Compendio funcional que describe las reglas de negocio, actores, y el glosario unificado del producto.
    *   *Owner:* Product Owner / Project Director.
    *   *Obligatorio:* Sí.
*   **Architecture Documents (Documentos de Arquitectura):**
    *   *Propósito:* Describir el diseño técnico y arquitectónico del sistema.
    *   *Owner:* Lead Solution Architect / Enterprise Architecture Reviewer.
    *   *Obligatorio:* Sí.
*   **ADR (Architecture Decision Record):**
    *   *Propósito:* Registrar formalmente decisiones técnicas de arquitectura justificando su motivo y contexto.
    *   *Owner:* Lead Solution Architect.
    *   *Obligatorio:* Sí.
*   **KIA (Knowledge Impact Analysis):**
    *   *Propósito:* Analizar el impacto de cambios metodológicos o de arquitectura en el conocimiento preexistente.
    *   *Owner:* Lead Solution Architect / CTO Reviewer.
    *   *Obligatorio:* No (Opcional ante cambios mayores).
*   **Standards (Estándares):**
    *   *Propósito:* Directrices de calidad de código, formato y convenciones de desarrollo.
    *   *Owner:* Implementation Engineer.
    *   *Obligatorio:* Sí.
*   **Templates (Plantillas):**
    *   *Propósito:* Estructuras base reutilizables para documentos y artefactos.
    *   *Owner:* Project Librarian.
    *   *Obligatorio:* Sí.

### Implementación y Operación (Nivel 3)
*   **Source Code (Código Fuente):**
    *   *Propósito:* Código de software ejecutable y configuraciones lógicas de la aplicación.
    *   *Owner:* Engineering Team / Implementation Engineer.
    *   *Obligatorio:* Sí.
*   **Repository Structure (Estructura del Repositorio):**
    *   *Propósito:* Organización oficial de carpetas y archivos en el control de versiones.
    *   *Owner:* Project Librarian.
    *   *Obligatorio:* Sí.
*   **Runbooks (Manuales Operativos):**
    *   *Propósito:* Guías paso a paso para el despliegue, mantenimiento y solución de problemas técnicos.
    *   *Owner:* CTO Reviewer.
    *   *Obligatorio:* No (Recomendado para despliegue).
*   **Changelog (Registro de Cambios):**
    *   *Propósito:* Registro cronológico de modificaciones en el software o documentación.
    *   *Owner:* Project Librarian.
    *   *Obligatorio:* Sí.
*   **Sprint Documentation (Documentación de Sprints):**
    *   *Propósito:* Planificación, metas y retrospectivas de cada iteración de desarrollo.
    *   *Owner:* Product Owner / Project Director.
    *   *Obligatorio:* Sí.
*   **Knowledge Debt (Deuda de Conocimiento — KD):**
    *   *Propósito:* Registro y tracking de inconsistencias o brechas identificadas en la documentación oficial respecto al código real.
    *   *Owner:* Project Librarian.
    *   *Obligatorio:* Sí.

---

## 6. Convenciones de Identificadores (Naming Conventions)
Todos los activos y sus artefactos relacionados usarán códigos estandarizados:
*   **Constitución & Metodología:** `PB-XXX` (ej. `PB-000`)
*   **Declaraciones:** `STM-NNNN` (ej. `STM-0001`)
*   **Instrucciones de Prompts:** `PRM-NNNN` (ej. `PRM-0005`)
*   **Decisiones Arquitectónicas:** `ADR-NNNN`
*   **Análisis de Impacto:** `KIA-NNNN`
*   **Deuda de Conocimiento:** `KD-NNNN`

## 7. Modelo de Propiedad (Ownership Model)
Cada Activo de Conocimiento tiene un rol asignado como "Propietario" (*Owner*). El propietario es el máximo garante humano de la integridad de dicho activo. Ningún agente de IA puede poseer la propiedad de un activo.

## 8. Responsabilidades de Gobernanza
*   **Aprobación:** Solo los roles asignados por la Constitución (Methodology Owner, Product Owner, Project Director) tienen autoridad de aprobación.
*   **Mantenimiento y Registro:** El *Project Librarian* es responsable de registrar, catalogar y salvaguardar los activos en el repositorio, manteniendo los índices y la trazabilidad libres de duplicados.

## 9. Ciclo de Vida de los Activos de Conocimiento
El ciclo de vida de un KA consta de 5 fases:
```
[Borrador / Draft] ➔ [En Revisión] ➔ [Aprobado / Activo] ➔ [Depreciado] ➔ [Archivado]
```
Todo cambio de fase debe ser trazado en el Changelog.

## 10. Política de Versionado
*   **Cambios Menores (0.x):** Modificaciones editoriales, formato o corrección de enlaces sin alterar decisiones ni reglas de negocio.
*   **Cambios Mayores (X.0):** Adopción de nuevos mandatos o modificaciones de reglas fundamentales. Requiere aprobación explícita de su Owner correspondiente.

## 11. Requerimientos de Trazabilidad
Toda modificación a un KA de Nivel 1 o Nivel 2 debe permitir auditar:
1.  El prompt (`PRM-XXXX`) o declaración (`STM-XXXX`) que originó la modificación.
2.  La IA o autor humano que redactó los cambios.
3.  El sprint en el cual fue integrado.

## 12. Reglas de Referencias Cruzadas (Cross-References)
*   Los documentos relacionados deben contener enlaces relativos de navegación ascendentes (al README índice) e inter-documentales.
*   Ningún documento de Nivel 3 o Nivel 2 debe contradecir la Constitución de Nivel 1. En caso de discrepancia, la Constitución prevalece automáticamente.

## 13. Proceso de Depreciación (Deprecation Process)
Cuando un activo es superado por uno nuevo, el *Project Librarian* marcará el documento con una advertencia visible indicando el motivo y enlazando al activo sucesor. Permanecerá en estado *Depreciado* durante el sprint actual.

## 14. Proceso de Archivado
Al finalizar el sprint de depreciación, el archivo se moverá a una carpeta histórica `.archive/` en su respectivo nivel para evitar cluttering en el repositorio activo, removiendo sus enlaces de navegación principales.

## 15. Extensibilidad Futura
Nuevos tipos de Activos de Conocimiento pueden proponerse a través de un prompt de revisión (`PRM`). Se clasificarán temporalmente como *Propuestas* en este catálogo hasta recibir la aprobación formal del *Methodology Owner*.

---

### Navegación
*   **Anterior:** [CONSTITUTION](CONSTITUTION.md)
*   **Volver al índice:** [Volver al índice](README.md)
