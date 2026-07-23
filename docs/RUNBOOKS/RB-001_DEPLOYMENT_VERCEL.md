---
Document ID: RB-001
Document Title: Commercial Demo Deployment Runbook
Document Type: Runbook (RB)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, KGG.md, standards/RST-001.md
Related Assets: None
Classification: Internal
Created: 2026-07-23
Last Updated: 2026-07-23
Review Cycle: Every Sprint
---

# RB-001 — Runbook de Despliegue de JATapp Demo Comercial (Vercel & Cloudflare)

---

## 1. Propósito
Este runbook establece el procedimiento estándar para realizar el despliegue del prototipo de la demo comercial de JATapp a Vercel, bajo el dominio corporativo gestionado por Cloudflare, respetando el modelo de cuentas de Santa Cruz Devs.

## 2. Arquitectura de Despliegue
El flujo de resolución de red y hosting está configurado de la siguiente manera:
```
Petición Web (Client) ➔ Cloudflare (Proxy/SSL/DNS) ➔ Vercel (Hosting Estático SPA)
```
*   **Dominio de Producción:** `https://jatappdemo.santacruzdevs.com`
*   **Hosting:** Vercel (cuenta fundadora: `murichi@gmail.com`).
*   **Servicio DNS / SSL:** Cloudflare (cuenta de compañía: `santacruzdevs.team@gmail.com`).

---

## 3. Configuración del Repositorio
El repositorio está preparado para su despliegue estático automático sin dependencias complejas de compilación:
*   **vercel.json:** Configurado en la raíz para reescribir todas las peticiones entrantes y servirlas desde el directorio lógico de la aplicación `apps/jat-demo/`.
*   **Variables de Entorno (.env.example):**
    ```env
    # JATapp Demo Environment Variables
    NEXT_PUBLIC_APP_ENV=production
    NEXT_PUBLIC_DEMO_MODE=true
    ```

---

## 4. Checklist de Preparación (Pre-deployment Checklist)
Antes de realizar el despliegue a producción, el *Release Manager* debe verificar:
1.  `[ ]` La cabecera de metadatos (STM-0002) está completa en todos los activos que se modificarán.
2.  `[ ]` No existen referencias absolutas a `localhost:xxxx` en `app.js`.
3.  `[ ]` La visualización responsiva móvil del Kanban y Dashboard ha sido testeada localmente.
4.  `[ ]` El archivo `vercel.json` se encuentra en la raíz del repositorio.

---

## 5. Instrucciones de Despliegue Paso a Paso

### Paso 1: Configurar Proyecto en Vercel
1.  Iniciar sesión en Vercel usando la cuenta `murichi@gmail.com`.
2.  Hacer clic en **Add New** ➔ **Project**.
3.  Importar el repositorio Git `SantaCruzDevs/JATapp`.
4.  En la configuración del proyecto:
    *   *Framework Preset:* **Other** o **None** (despliegue estático).
    *   *Root Directory:* `./` (el archivo `vercel.json` maneja la redirección interna).
5.  Hacer clic en **Deploy**.

### Paso 2: Configurar Dominio Personalizado en Vercel
1.  Dentro del proyecto en Vercel, ir a **Settings** ➔ **Domains**.
2.  Añadir el subdominio: `jatappdemo.santacruzdevs.com`.
3.  Copiar los registros CNAME sugeridos por Vercel para la delegación de DNS.

### Paso 3: Configurar DNS en Cloudflare
1.  Iniciar sesión en Cloudflare usando la cuenta `santacruzdevs.team@gmail.com`.
2.  Seleccionar la zona de dominio `santacruzdevs.com`.
3.  Ir a la sección de **DNS** ➔ **Records**.
4.  Añadir un registro CNAME:
    *   *Name:* `jatappdemo`
    *   *Target:* `cname.vercel-dns.com`
    *   *Proxy Status:* **DNS Only** (Recomendado para la autogeneración de certificados SSL de Vercel en el primer aprovisionamiento) o **Proxied** (si ya se cuenta con SSL universal SSL/TLS flexible/completo en Cloudflare).

---

## 6. Verificación Post-Despliegue
Realizar las siguientes pruebas manuales de aceptación:
1.  Ingresar a `https://jatappdemo.santacruzdevs.com`.
2.  Validar que el Dashboard y el Kanban carguen sin errores en la consola del navegador.
3.  Ejecutar el *Controlador de la Historia Comercial* completo (Pasos 1 a 6) para asegurar que el flujo interactivo de simulación funcione de extremo a extremo en producción.

---

### Navegación
*   **Volver al índice:** [Volver al índice](../PROJECT_CONSTITUTION/README.md)
