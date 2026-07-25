---
Document ID: RB-002
Document Title: Public Repository Security Audit Checklist
Document Type: Runbook (RB)
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, KGG.md, standards/RST-001.md, RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md
Related Assets: None
Classification: Internal
Created: 2026-07-24
Last Updated: 2026-07-24
Review Cycle: Every Sprint
---

# RB-002 — Runbook de Auditoría de Seguridad para Repositorios Públicos

---

## 1. Propósito
Este documento establece el proceso oficial obligatorio que debe ejecutarse en el ecosistema **KODE** antes de cambiar la visibilidad de cualquier repositorio de **Privado a Público**. 

El objetivo primordial es mitigar la fuga accidental de credenciales, secretos, datos reales de clientes, certificados e información interna sensible de infraestructura.

---

## 2. Verificación del Estado del Repositorio
Antes de iniciar el escaneo de seguridad, se debe asegurar que el árbol de trabajo local del repositorio esté limpio y libre de archivos temporales.

### Comandos de Inspección (PowerShell)
```powershell
# 1. Comprobar que no hay archivos modificados o sin seguimiento fuera de las reglas
git status

# 2. Listar todos los archivos indexados por Git para auditoría visual rápida
git ls-files

# 3. Listar archivos ocultos y del sistema en la raíz
dir -Force
```

### Checklist
*   `[ ]` El árbol de trabajo está completamente limpio (*working tree clean*).
*   `[ ]` Solo existen archivos correspondientes al alcance aprobado del proyecto.
*   `[ ]` No existen carpetas temporales de compilación o de IDEs sin ignorar.

---

## 3. Auditoría de Variables de Entorno
Queda estrictamente prohibida la indexación de archivos con variables de entorno reales en repositorios públicos.

### Archivos Permitidos
*   `.env.example` (Únicamente como plantilla o documentación sin datos reales)

### Archivos Prohibidos (Fugas de Seguridad)
*   `.env`
*   `.env.local`
*   `.env.production.local`
*   `.env.development.local`
*   `.env.test.local`

---

## 4. Validación de Git Ignore
El archivo `.gitignore` del proyecto debe incluir de forma explícita las reglas de exclusión para evitar indexaciones accidentales.

### Reglas Mínimas Obligatorias
```
.env
.env.*
node_modules/
.next/
dist/
build/
```

---

## 5. Detección de Secretos en el Código
Para asegurar que no existan strings correspondientes a tokens, API keys o passwords hardcodeados, se deben ejecutar los siguientes comandos PowerShell de búsqueda recursiva.

### Comandos de Búsqueda
```powershell
git grep -i "apikey"
git grep -i "token"
git grep -i "secret"
git grep -i "password"
git grep -i "private_key"
git grep -i "service_role"
git grep -i "client_secret"
git grep -i "authorization"
git grep -i "bearer"
```

### Interpretación de Resultados
*   **Aprobado:** Coincidencias en archivos de documentación técnica (ej. `README.md`, `KAC.md`) donde se describen conceptos, o variables de configuración de ejemplo (ej. `NEXT_PUBLIC_DEMO_MODE=true`).
*   **Rechazado:** Cualquier coincidencia que revele un string de conexión real, clave privada real o token activo.

---

## 6. Auditoría de Archivos Sensibles y Binarios
Búsqueda de archivos de certificados, bases de datos locales o respaldos comprimidos que no deban ser públicos.

### Comandos de Búsqueda (PowerShell)
```powershell
# Buscar certificados y llaves
Get-ChildItem -Recurse -Include *.pem, *.key, *.pfx, *.crt

# Buscar bases de datos y respaldos
Get-ChildItem -Recurse -Include *.sqlite, *.db, *.bak

# Buscar comprimidos no autorizados
Get-ChildItem -Recurse -Include *.zip, *.rar
```

---

## 7. Verificación de Credenciales Cloud
Se debe comprobar explícitamente que no existan credenciales pertenecientes a proveedores SaaS o Cloud en el repositorio:
*   Claves de acceso y tokens de **Supabase** (`anon key`, `service_role`).
*   Tokens de API de **Cloudflare**, **Azure**, **AWS** o **GitHub PAT**.
*   API keys de **Google Cloud**, **OpenAI**, **Gemini** o **Claude**.

---

## 8. Auditoría de Datos Personales (PII)
El repositorio no debe almacenar bajo ninguna circunstancia:
*   Bases de datos con registros reales de usuarios/clientes.
*   Archivos de reportes financieros o bitácoras de operaciones reales de MotoJAT.
*   Logs de servidores de producción o archivos `.bak` de bases de datos.

---

## 9. Lista de Aprobación de Seguridad (Checklist de Firma)

El *Release Manager* o el *Chief Security Officer* deberá validar y firmar el siguiente checklist antes de cambiar la visibilidad del repositorio:

*   `[ ]` **Git Ignore verificado:** Todas las extensiones y carpetas temporales están excluidas.
*   `[ ]` **Sin credenciales:** No hay passwords ni llaves de APIs expuestas en el código.
*   `[ ]` **Sin secretos:** Escaneo de palabras clave limpio de tokens activos.
*   `[ ]` **Sin certificados:** Ningún archivo `.pem` o `.key` indexado.
*   `[ ]` **Sin datos de clientes (PII):** Sin bases de datos ni logs reales de MotoJAT.
*   `[ ]` **Sin backups:** Cero respaldos binarios indexados.
*   `[ ]` **Repositorio revisado:** Estructura limpia aprobada para publicación.

**Estado Final de la Revisión:** `[ ] APROBADO PARA LANZAMIENTO PÚBLICO`

---

## 10. Automatización Futura (PowerShell Check Script)
Este runbook servirá como especificación técnica para el futuro script de automatización:
👉 [public_repo_check.ps1](file:///D:/Antigravity%20Projects/workspace/JATapp/scripts/security/public_repo_check.ps1)

### Formato de Salida Esperado del Script
```
======================================
SantaCruzDevs Public Repository Audit
======================================

PASS Environment Variables
PASS Secrets Scan
PASS Certificates
PASS Git Ignore
PASS Sensitive Files
PASS Personal Data

--------------------------------------
RESULT
SAFE FOR PUBLIC RELEASE
```

---

## 11. Control de Cambios e Historial
*   **Versión 1.0 (2026-07-24):** Creación e integración oficial del Runbook de Auditoría de Seguridad para Repositorios Públicos (RB-002) bajo el mandato JATapp.

---

### Navegación
*   **Volver al índice:** [Volver al índice](../PROJECT_CONSTITUTION/README.md)
