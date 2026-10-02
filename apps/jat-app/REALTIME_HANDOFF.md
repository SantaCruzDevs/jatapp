# HANDOFF TÉCNICO DEFINITIVO: SISTEMA REALTIME EN JATapp v1.0

Este documento contiene la especificación técnica completa, el diagnóstico de causa raíz y la arquitectura implementada para la sincronización en tiempo real entre la Central de Operaciones (`/operations`) y el Panel del Motoquero (`/driver`) en JATapp.

---

## 1. Causa Raíz Original del Problema

El fallo de sincronización en tiempo real reportado originalmente presentaba 5 causas combinadas:

1. **Tabla `public.rides` Deshabilitada en Supabase Cloud:**
   La tabla `public.rides` no estaba incluida en la publicación `supabase_realtime` dentro de Supabase Cloud Console. Como resultado, la extensión `postgres_changes` retornaba error de servidor y no emitía ningún evento CDC por WebSockets.
2. **Conexiones WebSocket bajo Rol Anónimo (`anon`):**
   Tanto `/operations` como `/driver` ejecutaban `channel.subscribe()` de manera síncrona en el montaje del componente, antes de que Supabase Auth terminara de verificar y retornar el token JWT (`getSession()`). Esto conectaba el socket como `anon`. Supabase Realtime filtra y descarta silenciosamente los eventos CDC en tablas protegidas por RLS para clientes no autenticados.
3. **Race Condition por Perfil Nulo (`driver === null`):**
   Cuando Central asignaba una carrera mientras la vista `/driver` finalizaba su carga inicial, el perfil `driver` aún era `null`. El callback de Realtime descartaba el evento por no tener la referencia del conductor cargada.
4. **Fusión Indebida de Timestamps Locales en `loadData`:**
   En `operations/page.tsx`, la función `loadData` comparaba la hora local del sistema (`_local_updated_at = Date.now()`) contra la marca de tiempo del servidor PostgreSQL (`updated_at`). Debido a diferencias de reloj local o eventos locales previos, `loadData` rechazaba las actualizaciones canónicas de la base de datos (ej. `status = 'ontheway'`) y las sobrescribía con el estado en memoria anterior (`status = 'assigned'`), dejando la carrera atascada en `ASIGNADAS`.
5. **Intento de Re-registro de Callbacks `.on()` sobre Canales Suscritos:**
   Al re-intentar suscribirse tras cambios de autenticación, el código volvía a ejecutar `.on('postgres_changes', ...)` sobre una instancia de canal que ya había llamado a `.subscribe()`, activando la excepción fatal de Supabase: `cannot add postgres_changes callbacks for realtime after subscribe()`.

---

## 2. Cambios Realizados por Archivo

### A. `apps/jat-app/app/(dashboard)/operations/page.tsx`
- **Gestión Dinámica de JWT de Realtime:** Se desacopló la creación del canal de la actualización de la sesión. El canal se crea y suscribe **una sola vez**, y el token JWT se actualiza dinámicamente vía `supabase.realtime.setAuth(access_token)` utilizando el listener `supabase.auth.onAuthStateChange`.
- **Fusión Canónica de Datos en `loadData`:** Se eliminó la condición `if (existingTime > fetchedTime)`. La respuesta proveniente de la base de datos PostgreSQL (REST / Realtime) se establece siempre como estado canónico para `status`, `surcharge_status`, `surcharge_amount`, `driver_id`, etc., preservando únicamente las relaciones de objetos unidos (`driver`, `customer`, `company`).
- **Ticker Silencioso de Resiliencia (10s):** Se agregó un intervalo `setInterval(() => loadData(true), 10000)` que actualiza los datos en segundo plano sin mostrar spinners, actuando como capa de respaldo si la conexión WebSocket se interrumpe o se suspende la pestaña.

### B. `apps/jat-app/app/(dashboard)/driver/page.tsx`
- **Buffer de Eventos de Carga Inicial (`pendingRealtimeEventsRef`):** Todos los eventos `postgres_changes` recibidos mientras el perfil del conductor está cargando se almacenan en un buffer temporal y se aplican automáticamente apenas se completa la carga del perfil.
- **Filtro Dinámico de Cola de Asignaciones:** Procesa y actualiza en tiempo real las carreras pertenecientes al motoquero autenticado que están en estado `assigned` u `ontheway`, removiendo aquellas que pasan a `completed` o `cancelled`.
- **Mapeo Directo de Atributos de Cliente:** Extrae `customer_phone` y `requester_person` directamente del payload CDC para habilitar llamadas instantáneas desde la UI sin esperar un REST join adicional.
- **Ticker Silencioso de Resiliencia (10s):** Se agregó `setInterval(() => loadDriverData(true), 10000)`.

---

## 3. Estado Actual de la Infraestructura

- **Supabase Cloud:** `public.rides` está activada (Toggle Verde / ON) en la publicación `supabase_realtime`.
- **Realtime CDC Status:** Extension `postgres_changes` = `OK` (`"Subscribed to PostgreSQL"`).
- **Modo REPLICA IDENTITY:** `FULL` en la tabla `public.rides`.
- **Latencia de WebSocket:** ~160 ms – 190 ms.

---

## 4. Garantía de Seguridad e Invariabilidad (Qué NO se modificó)

- **Base de Datos PostgreSQL:** Ningún esquema, tabla, columna o tipo fue alterado.
- **Seguridad RLS:** Ninguna política de RLS fue modificada o eliminada (`rides_select_policy`, etc.).
- **Funciones y Triggers:** Ninguna función SQL (`get_user_role()`, etc.) ni trigger de auditoría fue tocado.
- **Lógica de Negocio:** La máquina de estados de las carreras y las validaciones se mantienen 100% intactas.
- **Despliegues:** No se ejecutó despliegue a Vercel ni producción remota.

---

## 5. Arquitectura del Pipeline Realtime

```
[ Acción del Usuario (Operador / Motoquero) ]
                     │
                     ▼
       [ PostgreSQL (public.rides) ]
                     │
                     ▼ (WAL / Replica Identity FULL ~170ms)
       [ Supabase Realtime CDC Server ]
                     │
                     ▼ (WebSocket Seguro con JWT Role)
       [ Callback .on('postgres_changes') en React ]
                     │
                     ▼
       [ Actualización de Estado (setRides / setQueue) ]
                     │
                     ▼
       [ Re-renderizado de UI (Kanban / Panel Motoquero) ]
```

### Capa de Resiliencia Dual
1. **Capa 1 (WebSocket Realtime):** Latencia ultra baja (~170ms) para actualizaciones instantáneas.
2. **Capa 2 (Ticker Silencioso 10s):** Sincronización en segundo plano cada 10 segundos que garantiza consistencia ante pérdidas de paquete, suspensiones de pestañas en laptops o reconexiones de Wi-Fi.

---

## 6. Archivos Modificados y Creados

### Archivos Modificados:
- `apps/jat-app/app/(dashboard)/operations/page.tsx`
- `apps/jat-app/app/(dashboard)/driver/page.tsx`

### Archivos Creados:
- `apps/jat-app/REALTIME_HANDOFF.md` *(Este documento de handoff)*

---

## 7. Comandos de Validación Ejecutados y Resultados

1. **Chequeo de Tipos TypeScript:**
   ```bash
   npx tsc --noEmit
   ```
   *Resultado:* **0 errores.**

2. **Compilación de Producción Next.js:**
   ```bash
   npm run build
   ```
   *Resultado:* **`✓ Compiled successfully`**. Generación de páginas estáticas y dinámicas limpia.

3. **Prueba E2E de Race Condition y Amortiguación:**
   ```bash
   node scratch/test_race_condition_fix_wait.js
   ```
   *Resultado:*
   - `SCENARIO 1 RESULT: PASSED ✅` (Amortiguación de eventos durante carga de perfil)
   - `SCENARIO 2 RESULT: PASSED ✅` (Fusión de sobrecargas y actualización de estado)

4. **Prueba Bidireccional WebSocket Node.js:**
   ```bash
   node scratch/test_driver_to_operator_realtime.js
   ```
   *Resultado:* `Total events received by Operator WebSocket: 2` (Confirmado en ~170ms).

---

## 8. Pruebas Manuales Pendientes para el Usuario

1. Refrescar **F5** una sola vez en las pestañas del Operador (`/operations`) y del Motoquero (`/driver`).
2. En el panel del Motoquero, presionar **`[ EN CAMINO ]`** y verificar el movimiento dinámico de la tarjeta a la columna **EN CURSO** en el panel del Operador.
3. En el panel del Motoquero, presionar **`[ SOLICITAR AJUSTE DE TARIFA ]`** y verificar la alerta inmediata en la Central.
