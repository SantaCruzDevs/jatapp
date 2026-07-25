---
Document ID: AUD-REFACT-001
Document Title: Refactoring Backlog
Document Type: Audit Report (AUD)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, AUDITS/TECHNICAL_DEBT_REGISTER.md
Related Assets: None
Classification: Internal
Created: 2026-07-24
Last Updated: 2026-07-24
Review Cycle: Project Phase Transition
---

# AUD-REFACT-001 — Backlog de Refactorización (Refactoring Backlog)

---

## 1. Tareas de Refactorización Priorizadas
A continuación se detalla la hoja de ruta de refactorización ordenada para dar paso a JATapp Demo v2.

### Grupo 1: Tareas Críticas (Estabilización y Tipos)
1.  **Migración de Configuración a Monorepositorio y TypeScript:**
    *   *Por qué:* Necesario para estructurar las dependencias de producción y asegurar compilación limpia en Vercel.
    *   *Beneficio:* Evita colisiones lógicas e inconsistencia de propiedades en los viajes.
    *   *Riesgos:* Bajo.
2.  **Modelado de Esquema Físico Postgres en Supabase:**
    *   *Por qué:* Para reemplazar el almacenamiento mock.
    *   *Beneficio:* Persistencia e integridad referencial real entre usuarios, choferes y viajes.
    *   *Riesgos:* Medio (Requiere planeación de migraciones).

### Grupo 2: Tareas de Prioridad Alta (Next.js & Supabase Client)
1.  **Creación de Componentes de Layout Base en Next.js:**
    *   *Por qué:* Permite separar el menú y barra superior ejecutiva del flujo Kanban.
    *   *Beneficio:* Reutilización óptima de código en vistas de diferentes roles.
    *   *Riesgos:* Bajo.
2.  **Implementación del Cliente Supabase Realtime:**
    *   *Por qué:* Para lograr la sincronización sin polling.
    *   *Beneficio:* Actualizaciones inmediatas en la interfaz del operador cuando un chofer acepte un viaje.
    *   *Riesgos:* Alto (Fallas en el ciclo de vida del canal de WebSocket).

### Grupo 3: Tareas de Prioridad Media (UX e Interfaz)
1.  **Refactorizar el Tablero Kanban con Drag & Drop Reactivo:**
    *   *Por qué:* Facilita las asignaciones masivas en vivo.
    *   *Beneficio:* Interfaz fluida y amigable para el operador de despacho.
    *   *Riesgos:* Medio (Curva de aprendizaje de `@hello-pangea/dnd`).

---

### Navegación
*   **Volver al índice:** [Volver al índice](AUDIT_JATAPP_DEMO_V2.md)
*   **Siguiente Documento:** [Roadmap de Mejora](IMPROVEMENT_ROADMAP.md)
