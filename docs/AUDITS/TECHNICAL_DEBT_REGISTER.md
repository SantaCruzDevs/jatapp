---
Document ID: AUD-DEBT-001
Document Title: Technical Debt Register
Document Type: Audit Report (AUD)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md
Related Assets: None
Classification: Internal
Created: 2026-07-24
Last Updated: 2026-07-24
Review Cycle: Project Phase Transition
---

# AUD-DEBT-001 — Registro de Deuda Técnica (Technical Debt Register)

---

## 1. Inventario de Deuda Técnica Priorizada
A continuación se enumeran y clasifican las deudas de arquitectura, código e infraestructura acumuladas en el prototipo actual.

### DEBT-001 — Estado Lógico Acoplado a Vista (Vanilla JS)
*   **Categoría:** Arquitectura y Código
*   **Severidad:** Crítica
*   **Impacto:** Alto. Impide escalar el frontend, duplicar la lógica de componentes e imposibilita pruebas unitarias automáticas.
*   **Recomendación:** Migrar a componentes estructurados de React (Next.js) con gestión de estado global reactiva.
*   **Esfuerzo Estimado:** Alto (40 horas de desarrollo).
*   **Prioridad:** Alta (Crítica).

### DEBT-002 — Almacenamiento Volátil en LocalStorage
*   **Categoría:** Persistencia e Infraestructura
*   **Severidad:** Alta
*   **Impacto:** Alto. Falla el flujo colaborativo real de multi-dispositivos, perdiendo la persistencia histórica de auditoría y facturas.
*   **Recomendación:** Integrar Supabase Database (PostgreSQL) y activar cliente nativo para I/O.
*   **Esfuerzo Estimado:** Medio (16 horas de desarrollo).
*   **Prioridad:** Alta.

### DEBT-003 — Estilos Ad-hoc y CDNs Externos
*   **Categoría:** UX y Rendimiento
*   **Severidad:** Media
*   **Impacto:** Medio. Frecuentes bloqueos de carga iniciales y variaciones visuales menores en pantallas medianas.
*   **Recomendación:** Adoptar Tailwind CSS e importar paquetes locales de FontAwesome para el build nativo de activos de la SPA.
*   **Esfuerzo Estimado:** Medio (24 horas de maquetación).
*   **Prioridad:** Media.

### DEBT-004 — Inexistencia de Tipado Estricto
*   **Categoría:** Código
*   **Severidad:** Alta
*   **Impacto:** Alto. Posibilidad latente de caídas de interfaz ante datos nulos de conductores o desvíos en viajes.
*   **Recomendación:** Implementar TypeScript obligatoriamente en toda la aplicación de producción.
*   **Esfuerzo Estimado:** Medio (16 horas de refactorización).
*   **Prioridad:** Alta.

---

### Navegación
*   **Volver al índice:** [Volver al índice](AUDIT_JATAPP_DEMO_V2.md)
*   **Siguiente Documento:** [Backlog de Refactorización](REFACTORING_BACKLOG.md)
