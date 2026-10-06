# 10. DECISION LOG

**Estado:** Draft  
**Versión:** 0.1  
**Última modificación:** 2026-07-22  
**Autores:** Antigravity  

## Objetivo
Mantener un registro histórico y cronológico de todas las decisiones clave (de arquitectura, negocio y producto) tomadas durante el desarrollo del proyecto JATapp.

## Tabla de Contenido
1. Objetivo
2. Registro de Decisiones
3. Pendiente de completar

## Registro de Decisiones

| Fecha | Decisión | Motivo | Responsable | Documento relacionado | ADR relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-10-05 | Settlement V2 — get_user_role EXECUTE Grant Fix | Restablecer permiso EXECUTE a authenticated sobre get_user_role() para permitir evaluación de RLS | Antigravity | 20261005211500_fix_get_user_role_execute_grant.sql | ADR-SECURITY-001 |

## Incidencia Técnica & Solución (2026-10-05)
* **Incidencia**: Error 42501 (`permission denied for function get_user_role`) en la vista `/drivers` al recalcular Pre-liquidación.
* **Diagnóstico H0.1/H0.2**: Las columnas `rides.is_settled` y las tablas V2 existen físicamente en la BD. El error provenía del bloqueo de PostgREST al evaluar RLS por falta de `GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated`.
* **Solución Aplicada**: Aplicación de la migración `20261005211500_fix_get_user_role_execute_grant.sql` mediante `supabase db push`.
* **Seguridad (Least Privilege)**: Permiso otorgado exclusivamente a `authenticated`. `anon` permanece sin acceso (`EXECUTE` denegado).

---

### Navegación
*   **Anterior:** [09_GLOSSARY](09_GLOSSARY.md)
*   **Siguiente:** [Volver al índice](README.md)
*   **Volver al índice:** [Índice](README.md)
