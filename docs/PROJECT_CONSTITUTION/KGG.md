---
Document ID: KGG-001
Document Title: Knowledge Governance Guide (KGG)
Document Type: Knowledge Governance Guide (KGG)
Version: 1.0
Status: Draft
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md
Related Assets: KMR.md
Classification: Internal
Created: 2026-07-22
Last Updated: 2026-07-22
Review Cycle: Annual
---

# KODE — Guía de Gobernanza del Conocimiento (Knowledge Governance Guide — KGG)


---

## 1. Propósito de la Gobernanza del Conocimiento
El propósito de la Gobernanza del Conocimiento en **KODE** es garantizar que la base de conocimientos organizacionales, de diseño y técnicos del proyecto permanezca consistente, precisa y estructurada a lo largo de su ciclo de vida. Esto reduce el desorden documental y evita la acumulación de deuda de conocimiento (KD).

## 2. Principios de Gobernanza
Operacionalizan los principios constitucionales de KODE:
*   **Centralidad Humana:** Solo los seres humanos aprueban cambios. La IA es una extensión capacitadora, no una autoridad decisoria.
*   **Trazabilidad Mandatoria:** Cada cambio debe tener un origen documentado (Statement, ADR, o PRM).
*   **Integridad Continua:** Prevención activa de duplicación de información y contradicciones lógicas.

## 3. Roles de Gobernanza
*   **Methodology Owner (Jesús Daniel Murichi Barrientos):** Máxima autoridad de gobierno. Posee el derecho de aprobación para la Constitución y KAC.
*   **Product Owner / Project Director:** Autoridad decisoria funcional de producto. Aprueba la Biblia del Proyecto y prioriza la documentación del sprint.
*   **Enterprise Architecture Reviewer:** Evalúa el impacto de diseño estratégico en el conocimiento arquitectónico.
*   **Chief Technology Officer (CTO) Reviewer:** Evalúa la viabilidad técnica y metodológica del conocimiento tecnológico.
*   **Implementation Engineer & Project Librarian (Antigravity):** Responsable técnico del repositorio, mantiene índices, enlaces, registros de cambio y audita la trazabilidad.
*   **Contributors:** Generan propuestas de conocimiento técnico u operativo.
*   **Specialized AI Agents:** Asistentes técnicos que analizan, proponen, redactan borradores o implementan, sin derecho de aprobación.

## 4. Ciclo de Vida del Activo de Conocimiento (KA)
Un KA progresa cronológicamente por los siguientes estados:
1.  **Draft (Borrador):** Creado por un *Contributor* o *AI Agent*.
2.  **Review (En Revisión):** Evaluado por los revisores técnicos (CTO o Architecture Reviewer).
3.  **Approved (Aprobado):** Validado formalmente por su Owner respectivo.
4.  **Published (Publicado):** El *Librarian* lo integra activamente en las rutas oficiales y actualiza índices.
5.  **Maintained (Mantenido):** Estado operacional regular.
6.  **Deprecated (Depreciado):** Marcado como superado o en desuso.
7.  **Archived (Archivado):** Movido a la estructura histórica (`.archive/`).

## 5. Modelo de Aprobación
El workflow sigue esta cadena estricta:
```
[Proponer / Borrador] ➔ [Revisar / Validar] ➔ [Aprobar / Firmar] ➔ [Publicar / Librarian]
```
*   *Quién aprueba:* El Owner del activo (Nivel 1: Methodology Owner; Nivel 2: Product Owner/Architect; Nivel 3: Lead Engineer/Librarian).
*   *Quién revisa:* Enterprise Architecture Reviewer o CTO Reviewer.
*   *Quién implementa y valida:* Contributors / Implementation Engineer.

## 6. Gobernanza del Cambio
*   Los cambios a nivel metodológico se inician mediante un **Statement (STM)**.
*   Los cambios técnicos se inician mediante un **ADR** o un **Análisis de Impacto de Conocimiento (KIA)**.
*   Todo cambio se ejecuta a través de un **Prompt (PRM)** y requiere actualización en el `Changelog.md`.
*   El versionado de gobernanza sigue las reglas de versionado del KAC (Cambios mayores x.0 / menores 0.x).

## 7. Reglas de Trazabilidad
*   Cada decisión y modificación debe apuntar al ID del prompt de entrada (`PRM-XXXX`) y a su respectiva aprobación (`STM-XXXX` o `ADR-XXXX`).
*   Cada archivo físico de conocimiento debe declarar explícitamente en su cabecera su Propietario (*Owner*), Versión y Estado actual.

## 8. Integridad del Conocimiento
*   **Single Source of Truth (SSOT):** Cada dato o regla de negocio tiene un único lugar canónico de almacenamiento.
*   **Resolución de Conflictos:** En caso de discrepancia, prevalece la jerarquía: Constitución ➔ KAC ➔ KGG ➔ Project Bible ➔ Arquitectura ➔ Código.
*   **Prevención de Duplicados:** El *Project Librarian* rechazará fusiones de documentos redundantes.

## 9. Gobernanza de la Deuda de Conocimiento (Knowledge Debt — KD)
La deuda de conocimiento (brechas entre la realidad operativa y la documentación) se gestiona de la siguiente manera:
*   **Detección:** Auto-evaluación del repositorio o auditoría de IA.
*   **Clasificación y Priorización:** Crítica (impide desarrollo), Mayor (causa retraso), Menor (editorial).
*   **Resolución:** Creación de un ítem de deuda (`KD-XXXX`) y asignación en el sprint actual para actualización documental.

## 10. Gobernanza de la Colaboración con IA
*   **Permitido a las IAs:** Analizar consistencia, recomendar soluciones, estructurar plantillas, registrar cambios y generar código fuente.
*   **Prohibido a las IAs:** Autopromulgar decisiones de gobierno, cambiar políticas organizacionales sin confirmación, o auto-aprobar fusiones (*merges*) de gobernanza.

## 11. Mejora Continua
La metodología KODE se evalúa al cierre de cada sprint. Las lecciones aprendidas se discuten y pueden dar origen a un nuevo *borrador de gobernanza* para refinar la metodología en la siguiente iteración.

## 12. Métricas de Gobernanza
Se medirán mensualmente los siguientes indicadores de salud:
*   **Completitud de Conocimiento:** Porcentaje de activos definidos en el KAC que están en estado `Published`.
*   **Cobertura de Trazabilidad:** Proporción de cambios con referencia directa a un `PRM`/`STM`.
*   **Densidad de Deuda de Conocimiento:** Cantidad de ítems `KD` activos por sprint.

## 13. Excepciones de Gobernanza
*   Desviaciones temporales de la metodología (urgencias en producción, parches críticos) deben ser autorizadas explícitamente por escrito por el *Project Director*.
*   Las excepciones tienen una vigencia máxima de un sprint. Tras expirar, el *Project Librarian* abrirá un reporte `KD` para su resolución obligatoria.

## 14. Evolución Futura
El KGG evoluciona secuencialmente. Cualquier cambio mayor a las reglas operativas aquí contenidas requerirá el consentimiento del *Methodology Owner*, asegurando compatibilidad retrospectiva con los proyectos ya inicializados.

---

### Navegación
*   **Anterior:** [KAC](KAC.md)
*   **Volver al índice:** [Volver al índice](README.md)
