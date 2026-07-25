---
Document ID: AUD-ARC-001
Document Title: Architecture Assessment Report
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

# AUD-ARC-001 — Evaluación de Arquitectura (JATapp Demo v1 ➔ v2)

---

## 1. Organización del Proyecto Actual
El prototipo actual (`JAT-DEMO-003`) se aloja en un único directorio lógico: `apps/jat-demo/`, conteniendo archivos planos de marcado (HTML5), estilos (CSS) y lógica (Vanilla JavaScript). 

### Fortalezas de la Estructura Actual
*   **Aislamiento y Autonomía:** Al estar autocontenido en un subdirectorio, no genera dependencias cruzadas con el resto del repositorio.
*   **Cero Costo de Build:** Facilidad de previsualización estática inmediata.

### Debilidades de la Estructura Actual
*   **Monolito Frontend Plano:** La falta de jerarquía modular y de bundlers impide el uso de importación de módulos ES6 sin un servidor local.
*   **Límites de Contexto Inexistentes:** El archivo `app.js` maneja simultáneamente flujos de interfaz de administrador, operador y driver, acumulando responsabilidades sin separación de intereses (*Separation of Concerns*).

---

## 2. Propuesta de Arquitectura Next.js para v2
Para dotar a JATapp de escalabilidad y prepararla para la fase comercial final, se propone extraer los límites de contexto y estructurarlos en sub-aplicaciones bajo un esquema de monorepositorio estructurado:

```
apps/
  ├── jat-admin/       # Módulo ejecutivo, KPIs de facturación, alta de usuarios (Admin)
  ├── jat-central/     # Panel Kanban de operaciones, despacho express (Operador Central)
  ├── jat-driver/      # SPA optimizada para móviles de choferes (Motoquero)
packages/
  ├── shared-ui/       # Componentes de diseño unificados, botones premium, inputs
  ├── supabase-client/ # Cliente Postgres y gestores de suscripciones Realtime
```

---

## 3. Recomendaciones Arquitectónicas
1.  **Migrar a Next.js (App Router):** Implementar layouts persistentes para los menús y vistas, facilitando la modularización sin duplicar HTML.
2.  **Usar Tailwind CSS:** Para estructurar un sistema de diseño responsivo consistente, evitando las clases de CSS ad-hoc.
3.  **Encapsular Supabase en Capa de Servicio:** Crear una capa lógica intermedia de servicios (`services/rides.ts`, `services/drivers.ts`) que aísle al frontend de las consultas directas de Supabase.

---

### Navegación
*   **Volver al índice:** [Volver al índice](AUDIT_JATAPP_DEMO_V2.md)
*   **Siguiente Documento:** [Evaluación de Base de Datos](DATABASE_ASSESSMENT.md)
