---
Document ID: AUD-DB-001
Document Title: Database Assessment Report
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

# AUD-DB-001 — Evaluación de Base de Datos y Persistencia (Postgres & Supabase)

---

## 1. Estado Actual de los Datos
El prototipo `v1` carece de una base de datos física persistente. El estado se gestiona mediante un objeto JS estructurado en memoria volátil y persistido de manera básica mediante el API de `localStorage` del navegador.

### Debilidades del Enfoque Actual
*   **Volatilidad de Datos:** Los datos se pierden si el usuario borra la caché del navegador.
*   **Incompatibilidad con Escalabilidad Multi-Dispositivo:** La sincronización solo ocurre en la misma máquina física (mismo dominio/puerto y navegador).
*   **Desnormalización:** Las tablas de viajes contienen colecciones anidadas de hitos (línea de tiempo) y ajustes como arrays JSON crudos.

---

## 2. Propuesta de Esquema de Datos Relacional para v2
Para la versión de producción en Supabase (Postgres), se propone normalizar los activos de información en la siguiente estructura relacional:

### Tabla: `organizations`
*   `id` (uuid, PK)
*   `name` (text, obligatorio)
*   `created_at` (timestamp)

### Tabla: `users`
*   `id` (uuid, PK, vinculada a `auth.users`)
*   `organization_id` (uuid, FK)
*   `role` (enum: 'admin', 'operator', 'driver')
*   `full_name` (text)

### Tabla: `rides`
*   `id` (uuid, PK)
*   `client_organization_id` (uuid, FK)
*   `driver_id` (uuid, FK, opcional)
*   `pickup_address` (text)
*   `destination_address` (text)
*   `status` (enum: 'pending', 'assigned', 'ontheway', 'inprogress', 'completed')
*   `fare_amount` (numeric)
*   `created_at` (timestamp)

### Tabla: `ride_timeline_steps`
*   `id` (uuid, PK)
*   `ride_id` (uuid, FK)
*   `step_label` (text)
*   `step_description` (text)
*   `created_at` (timestamp)

---

## 3. Preparación de Realtime & RLS (Supabase)
1.  **Habilitar Realtime:** Marcar la tabla `rides` y `ride_timeline_steps` para publicaciones de canal de replicación lógica (Supabase Realtime) para actualizar el Kanban operativo automáticamente.
2.  **Estrategia de Soft Delete:** Incluir un campo `deleted_at` en todas las tablas transaccionales para evitar la eliminación física y asegurar la auditoría.

---

### Navegación
*   **Volver al índice:** [Volver al índice](AUDIT_JATAPP_DEMO_V2.md)
*   **Siguiente Documento:** [Evaluación de Calidad del Código](CODE_QUALITY_ASSESSMENT.md)
