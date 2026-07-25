---
Document ID: DEM-MAP-001
Document Title: JATapp Commercial Demo Roadmap
Document Type: Roadmap (MAP)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, KGG.md, AUDITS/AUDIT_JATAPP_DEMO_V2.md
Related Assets: None
Classification: Internal
Created: 2026-07-24
Last Updated: 2026-07-24
Review Cycle: Project Phase Transition
---

# DEM-MAP-001 — Hoja de Ruta de la Demo Comercial (Commercial Demo Roadmap)

---

## 1. Propósito e Impacto
Este documento establece la hoja de ruta y estrategia de priorización para el desarrollo del **Prototipo Comercial de JATapp**. El objetivo estratégico es optimizar la percepción del producto y maximizar la confianza del cliente en presentaciones de ventas de menos de 10 minutos. Este prototipo actuará como validador funcional y comercial antes de iniciar el desarrollo en producción.

---

## 2. Clasificación de Características (Feature Classification)

Para balancear velocidad de desarrollo e impacto comercial, se clasifican los requerimientos bajo cuatro prioridades estrictas:

### A. Demo Crítica (Demo Critical)
*Debe implementarse de forma completamente funcional en el prototipo.*
*   **Selector de Rol Comercial:** Interfaz de acceso directo rápido para alternar entre Administrador, Operador y Chofer.
*   **Kanban Operativo Dinámico:** Tablero en vivo con 5 columnas lógicas y temporizadores reactivos escalables.
*   **Línea de Tiempo del Servicio (Timeline):** Registro visual de hitos y trazabilidad horaria del viaje express.
*   **Simulador de Modificación de Tarifas:** Capacidad del operador central para aplicar incrementos monetarios por desvíos con justificación del cliente.
*   **Generador de Ticket Digital Corporativo:** Estructura e impresión en PDF del recibo para el cliente.

### B. Demo Importante (Demo Important)
*Puede implementarse mediante simulación o flujos interactivos controlados.*
*   **Mapa Logístico Interactivo:** Pines visuales que representen conductores activos en zonas metropolitanas (simulado mediante rutas preestablecidas).
*   **Controlador de Historia Guiada (Demo Controller):** Cheat-sheet inferior para avanzar por pasos en el caso de negocio predefinido.
*   **Notificaciones Toast Flotantes:** Despliegue de eventos relevantes a nivel de sistema.

### C. Opcional (Optional)
*   **Simulaciones Avanzadas (Hora Pico & Emergencias):** Disparadores aleatorios de solicitudes urgentes o masivas.
*   **Ayuda Interactiva Contextual:** Modal "¿Qué es esto?" para auto-explicación de la propuesta de valor comercial.

### D. Solo para Producción (Production Only)
*Postpuesto completamente durante esta fase.*
*   **Integración de GPS en tiempo real para choferes.**
*   **Pasarela de Pago y Facturación de Impuestos Oficial.**
*   **Configuración Avanzada de Usuarios y Permisos de Cuentas (ACL/RBAC).**
*   **Integración con bases de datos heredadas externas.**

---

## 3. Guía de Presentación del Caso de Negocio (Demo Script)

La demostración en vivo con clientes corporativos debe seguir este guión secuencial de 6 pasos de alto impacto:

```
[Inicio: Selector de Rol] ➔ [Paso 1: Solicitud Express] ➔ [Paso 2: Alerta Kanban] ➔ [Paso 3: Asignación] ➔ [Paso 4: Desvío y Ajuste] ➔ [Paso 5: Cierre y Ticket] ➔ [Final: Cierre Comercial]
```

1.  **Paso 1: Ingreso de Solicitud (Operador Central) — [1 min]**
    *   *Acción:* El presentador simula el ingreso de un envío urgente para **Farmacorp**.
    *   *Mensaje comercial:* "JATapp procesa solicitudes corporativas al instante."
2.  **Paso 2: Alerta por Temporizador (Kanban) — [1.5 min]**
    *   *Acción:* Se observa la tarjeta en la columna 'Pendientes'. El temporizador cambia de verde a amarillo/naranja.
    *   *Mensaje comercial:* "El sistema prioriza visualmente para evitar penalizaciones por retraso."
3.  **Paso 3: Asignación de Motoquero — [1.5 min]**
    *   *Acción:* El operador abre la tarjeta y asigna a un conductor libre (ej. **Carlos Méndez** con moto Vespa).
    *   *Mensaje comercial:* "Despacho rápido basado en cercanía y disponibilidad en zona."
4.  **Paso 4: Tránsito y Ajuste de Ruta — [2 min]**
    *   *Acción:* El chofer inicia el viaje. Se simula una llamada del cliente pidiendo desvío. El operador reajusta la dirección y añade un recargo de tarifa de **$50**.
    *   *Mensaje comercial:* "Trazabilidad completa: cada cambio de tarifa se justifica y registra en vivo."
5.  **Paso 5: Entrega y Ticket Digital — [2 min]**
    *   *Acción:* El conductor arriba al destino. El sistema marca el viaje como 'Completado' y abre el Ticket Digital Premium con la línea de tiempo auditada.
    *   *Mensaje comercial:* "Cero papel: factura y ticket de entrega en formato digital inmediato."
6.  **Paso 6: Vista Ejecutiva y Cierre Comercial — [2 min]**
    *   *Acción:* Se cambia de rol a **Administrador**. Se analizan los KPIs de facturación actualizados en el Dashboard y se muestra la pantalla de modelos de licenciamiento.
    *   *Mensaje comercial:* "Inteligencia operativa total para el crecimiento de MotoJAT."

---

## 4. Datos de Demostración Recomendados (Sample Data)
Para proyectar realismo local en Santa Cruz de la Sierra, se utilizarán las siguientes entidades corporativas y geográficas:
*   **Empresas Cliente:** Farmacorp S.A., Banco Ganadero, Hospital Foianini, Laboratorio Chávez, Universidad Privada (UPSA).
*   **Conductores Mock:** Carlos Méndez (Vespa SCZ-228, Zona Centro), Jorge Ribera (Honda SCZ-994, Zona Equipetrol), Pedro Gómez (Yamaha SCZ-441, Zona Norte).
*   **Puntos de Origen/Destino:** Av. Las Américas 450, Equipetrol Calle 8 Norte, Av. San Martín y 4to Anillo, Parque Industrial PI-22.

---

## 5. Análisis de Riesgos de la Demostración
*   **Riesgo de Red (Presentaciones Cloud):** Si el servidor de Vercel/Supabase presenta latencia.
    *   *Mitigación:* Mantener la persistencia fallback en `localStorage` activa para permitir ejecuciones de la demo 100% locales offline.
*   **Riesgo de Complejidad de UI:** Que el cliente se confunda al cambiar de rol en la misma pestaña.
    *   *Mitigación:* Diseñar el selector de rol inicial y la barra ejecutiva superior para que dejen siempre en claro qué rol está operando en esa ventana.

---

### Navegación
*   **Volver al índice:** [Volver al índice](../PROJECT_CONSTITUTION/README.md)
