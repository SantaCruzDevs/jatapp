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
- Integración de campo de búsqueda por "Número de Móvil" en el modal de asignación para filtrado en tiempo real de conductores y asignación instantánea al presionar Enter.
- Añadida generación dinámica de conductores al vuelo: si el operador busca y asigna un número de móvil no registrado en la lista mock de la demo (ej. Móvil 5), el sistema genera automáticamente un conductor con nombre "Juan Perez" manejando una moto "Navi ZZZ-456" y lo asigna al servicio para asegurar que la demo funcione con cualquier valor.
- Ampliada la lista preestablecida de conductores a 15 motoqueros fijos con numeración de móvil del 1 al 15 para pruebas de asignación directas y consistentes.
- Ajustado y acortado el texto del campo de tarifa a "Ajustar Tarifa (Bs.)" para optimizar el orden visual en el modal de asignación de choferes.
- Corregido desbordamiento vertical de modales en CSS: se estableció una altura máxima (`max-height: 90vh`) con contenedor flex y barra de desplazamiento vertical interna en `.modal-body` para mantener las entradas superiores de tarifa y búsqueda de móvil visibles en pantalla en todo momento sin importar la cantidad de choferes disponibles.
- Corrección de cálculo de tarifa en ticket digital: se eliminó la sobreescritura de tarifa fija en el paso 6 de la simulación guiada para que se sumen correctamente los montos base y los recargos por desvío de ruta (ej: totalizando Bs. 39 en lugar de Bs. 35).
- Actualizado el nombre de cabecera en el ticket digital de "MOTOJAT LOGISTICS S.R.L." a "MotoJat" a solicitud del cliente.
- Rediseño de identidad corporativa en la Demo JATapp: se ajustaron las variables CSS de color para alinearse con los colores oficiales de **Motoservi JAT** (Azul Real `#1e3583` y Amarillo Brillante `#fdde12`) e integrado el logo estilizado oficial con el eslogan "Justo a Tiempo" en la pantalla de bienvenida y barra lateral de la plataforma.
- Implementación de la sección financiera interactiva en el módulo de Reportes:
    - **Planilla de Clientes (Consumo Mensual):** Permite filtrar por empresa y muestra la planilla con el detalle de fecha, solicitante, ruta, forma de pago y tarifa de cada ticket consumido, junto con el total facturado acumulado para cobros.
    - **Liquidación de Motoqueros:** Muestra la planilla de servicios completados de cada móvil, calcula el reparto de ganancias del 80% (motoquero) y 20% (MotoJat), y cruza los métodos de pago (Efectivo en mano vs QR/Ticket digital) para determinar el balance neto de liquidación (Monto a Transferir o Rendir).
- Restringida la pestaña de **Reportes & Analytics** de forma exclusiva para el rol **Administrador (Dueña)**: el enlace de acceso del menú lateral se oculta dinámicamente si se ingresa con el rol de Operador Central o Motoquero para proteger la información comercial sensible.
- Enforzado la matriz de permisos de navegación por roles en el sidebar:
    - **Motoquero:** Solo ve el **Centro de Operaciones** y el nuevo panel de **Mi Balance & Historial** (ocultando Dashboard, Facturación, Reportes, Cierre y Configuración).
    - **Operador Central:** Solo ve el **Centro de Operaciones**, **Facturación Digital**, y **Configuración** (ocultando Dashboard Ejecutivo, Reportes, Cierre Comercial y Balance de conductor).
    - **Administrador:** Mantiene acceso completo a todas las secciones ejecutivas y de control.
- Implementación de la sección **Mi Balance & Historial** para el perfil de Motoquero:
    - Muestra estadísticas personales en tiempo real de viajes completados, recaudación bruta y ganancia neta (80%).
    - Cuenta con filtros por periodo (Hoy, Esta Semana, Este Mes) para ver el historial y balance de cobros.
    - Calcula el saldo a cobrar o rendir a la central cruzando el efectivo cobrado directamente contra las ganancias digitales acumuladas por QR/Ticket.
- Corrección de deformación y escalado de imagen en pie de firma (Avatar del Sidebar):
    - Se agregaron las clases CSS `.sidebar-footer`, `.user-avatar`, `.user-info`, `.user-name` y `.user-role` en `styles.css` con anchos fijos de 42px, recorte circular por flex-shrink y recortes automáticos de nombres largos con elipsis para evitar que imágenes de alta resolución deformen el menú.
    - Se restableció el parámetro de redimensionamiento nativo en la URL de Unsplash (`w=200` y `fit=crop`) en todos los disparadores de rol de `app.js`.
- Ajuste de contraste y suavizado del color amarillo corporativo:
    - Se cambió el color amarillo neón chillón (`#fdde12`) por un amarillo ámbar cálido y corporativo (`#f5c300` en variables CSS y `#eab308` para textos) para evitar distorsiones visuales y mejorar la legibilidad.
    - Se corrigieron los botones primarios para utilizar texto oscuro (`color: #090c15`) en lugar de blanco sobre fondo amarillo, logrando conformidad con estándares de legibilidad WCAG.
    - Se suavizaron las sombras y resplandores neón a un brillo sutil (`rgba(245, 195, 0, 0.12)`).
- Implementación de control interactivo Drag & Drop (Arrastrar y Soltar) en el tablero Kanban:
    - Se dotó a las tarjetas de servicio de atributos nativos de arrastre (`draggable="true"`), atenuando visualmente la tarjeta en estado `dragging`.
    - Se crearon zonas de drop en cada columna (`container-pending`, `container-assigned`, etc.) con un borde dashed dinámico al pasar la tarjeta encima (`drag-over`).
    - Lógica de transiciones integrada:
        - Si se arrastra a **Asignado** o **En Camino** (sin chofer previo), se despliega automáticamente el modal de asignación de motoqueros para resolver la entrega.
        - Si se arrastra a **Completado**, se abre de forma reactiva el modal de observaciones y selección de método de pago para resguardar la consistencia financiera.
        - Se conserva el funcionamiento de los botones tradicionales para ofrecer control redundante.





























