# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Estructura inicial de directorios (`apps/`, `packages/`, `docs/`, `mock-data/`, `scripts/`, `prompts/`).
- Documentación inicial de estructura bajo `docs/` (`PROJECT_BIBLE`, `BUSINESS`, `ARCHITECTURE`, `DATABASE`, `API`, `ADR`, `SPRINTS`, `UX`, `CHANGELOG`).
- Carpetas para almacenamiento de prompts bajo `prompts/` (`chatgpt`, `claude`, `gemini`, `antigravity`).
- Archivos base: `README.md`, `CHANGELOG.md`, `.gitignore`.
- Registro del prompt inicial `0001_2026-07-22_BOOTSTRAP_PROJECT.md`.
- Adopción e integración oficial de la metodología **KODE** (Knowledge-Oriented Development Ecosystem) en [CONSTITUTION.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/CONSTITUTION.md) (STM-0001).
- Reestructuración documental separando el Nivel de Gobierno ([PROJECT_CONSTITUTION](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/)) del Nivel de Producto ([PROJECT_BIBLE](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_BIBLE/)).
- Creación de la carpeta [prompts/results/](file:///D:/Antigravity%20Projects/workspace/JATapp/prompts/results/) y el registro de las revisiones de Claude y el CTO (PRM-0004 y PRM-0006).
- Creación de [REVIEWS.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_BIBLE/REVIEWS.md) y de la carpeta cronológica [docs/PROJECT_BIBLE/reviews/](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_BIBLE/reviews/).
- Creación e integración del **Catálogo de Activos de Conocimiento (KAC)** en [KAC.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/KAC.md) (KIM-0002).
- Creación e integración de la **Guía de Gobernanza del Conocimiento (KGG)** en [KGG.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/KGG.md) (KIM-0003).
- Creación e integración del **Registro de la Metodología KODE (KMR)** en [KMR.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/KMR.md) (KIM-0004).
- Creación e integración del Statement **[STM-0002](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/statements/STM-0002_METADATA_HEADER.md)** para la cabecera estándar de metadatos.
- Migración progresiva de todos los activos KODE Core (`CONSTITUTION.md`, `KAC.md`, `KGG.md`, `KMR.md` y `README.md`) para cumplir con la cabecera estándar de metadatos.
- Creación e integración del **Índice Central de Metadatos (KODE_METADATA_INDEX.md)** (KIM-0005) consolidando todas las cabeceras del repositorio KODE Core y estableciendo las reglas de validación de metadatos.
- Creación e integración del estándar **[SACS-001](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/standards/SACS-001.md)** para la colaboración estructurada con agentes de IA y sistemas automatizados especializados.
- Creación e integración del estándar **[RST-001](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/PROJECT_CONSTITUTION/standards/RST-001.md)** que regula los principios, organización y validación de los repositorios gobernados por KODE.
- Diseño e implementación de la primera versión del **Prototipo de Demostración Comercial (JAT-DEMO-001)** en [apps/jat-demo/](file:///D:/Antigravity%20Projects/workspace/JATapp/apps/jat-demo/) conteniendo el dashboard ejecutivo, tablero Kanban de operaciones, simuladores de desvíos y tarifas, y generación automatizada de Tickets Digitales.
- Preparación del entorno de infraestructura y despliegue del prototipo a Vercel con el archivo **[vercel.json](file:///D:/Antigravity%20Projects/workspace/JATapp/vercel.json)** y la creación del manual operativo **[RB-001](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md)** para la delegación de DNS a Cloudflare bajo el subdominio `jatappdemo.santacruzdevs.com` (JAT-INFRA-001).
- Diseño y desarrollo del prototipo de experiencia de colaboración multiventana en tiempo real **(JAT-DEMO-002)** sincronizando estados vía Storage API y habilitando flujos simulados de conductores.
- Diseño de la experiencia de confianza del producto **(JAT-DEMO-003)** incorporando la cabecera ejecutiva con estado de sincronización en vivo, notificaciones persistentes, panel de salud del sistema, casos de hora pico y emergencias, y ayuda interactiva explicativa.
- Creación de la Licencia MIT, reestructuración y publicación del primer **Release Candidate 1 (JAT-RELEASE-001)** para validación y despliegue final en Vercel.
- Creación e integración del Runbook de Seguridad para Repositorios Públicos **[RB-002](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/RUNBOOKS/RB-002_PUBLIC_REPOSITORY_SECURITY_CHECKLIST.md)** para la auditoría de strings de conexión y secretos.
- Auditoría técnica y funcional completa del prototipo **(JAT-0001)** y creación de los entregables de evaluación de arquitectura, base de datos Postgres, calidad del código, rendimiento, UX y el roadmap/backlog de migración a JATapp Demo v2 en la carpeta **[docs/AUDITS/](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/AUDITS/)**.
- Diseño y publicación de la Hoja de Ruta Comercial **(JAT-DEMO-0001)** en **[docs/DEMO/COMMERCIAL_DEMO_ROADMAP.md](file:///D:/Antigravity%20Projects/workspace/JATapp/docs/DEMO/COMMERCIAL_DEMO_ROADMAP.md)** clasificando prioridades operativas, definiendo el guión del caso de negocio de 10 minutos y analizando riesgos comerciales.
- Ajustes de localización para Bolivia: cambio de divisa de `$` a `Bs.` y ajuste de los rangos de precios para tarifas entre `20 Bs` y `60 Bs` según distancia (tanto en el estado por defecto como en escenarios simulados de hora pico y emergencias).
- Traducción al español de las etiquetas de estado en la UI (ej. `ASSIGNED` a `Asignado`).
- Integración funcional del botón "Iniciar Viaje" en el flujo del Kanban de operaciones, registrando el hito correspondiente con tiempos de retraso simulados en la línea de tiempo.
- Rediseño del botón "Nueva Solicitud" para abrir un formulario modal interactivo (`modal-new-ride`) que permite al operador central configurar el cliente, solicitante, origen, destino, prioridad y editar/personalizar la tarifa (Bs.) del viaje antes de crearlo.
- Añadida capacidad para modificar la tarifa en estado "Pendiente" desde el modal de asignación de chofer (`modal-assign`) justo antes de delegar el servicio, con registro automático de la modificación en la línea de tiempo.
















