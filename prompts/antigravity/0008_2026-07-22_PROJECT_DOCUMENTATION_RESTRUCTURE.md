# Prompt ID

PRM-0008

---

# Fecha

2026-07-22

---

# Proyecto

JATapp

---

# Sprint

SPR-001 Foundation

---

# Rol

Implementation Engineer & Project Librarian

---

# Nombre

PROJECT_DOCUMENTATION_RESTRUCTURE

---

# Objetivo

Reestructurar la organización documental del proyecto para separar claramente los documentos de gobierno (Project Constitution) de la documentación funcional del producto (Project Bible).

Esta decisión responde a la evolución metodológica del proyecto y tiene como finalidad establecer una jerarquía documental clara y escalable.

No modificar contenido.

No crear documentos funcionales.

Únicamente reorganizar la estructura.

---

# Contexto

Durante el diseño de la metodología se identificó que el Project Constitution y el Project Bible representan niveles diferentes de responsabilidad.

A partir de este momento la jerarquía oficial será:

Project Constitution

↓

Project Bible

↓

Architecture

↓

ADR

↓

Sprint Documentation

↓

Implementation

La Constitución gobierna el proyecto.

El Project Bible describe el producto.

La documentación técnica describe la implementación.

---

# Tareas

## 1. Crear la nueva estructura

Crear:

docs/

PROJECT_CONSTITUTION/

PROJECT_BIBLE/

(si alguna carpeta ya existe, conservarla).

---

## 2. Crear el índice del Project Constitution

Crear:

docs/PROJECT_CONSTITUTION/README.md

Con una estructura base que incluya:

- Objetivo
- Alcance
- Índice
- Historial de versiones
- Estado del documento

No desarrollar contenido.

---

## 3. Crear el documento principal

Crear:

docs/PROJECT_CONSTITUTION/CONSTITUTION.md

Con la siguiente estructura inicial:

- Título
- Estado
- Versión
- Autores
- Fecha
- Tabla de contenido
- Placeholder indicando "Pendiente de redacción"

No escribir contenido.

---

## 4. Actualizar la navegación

Actualizar los README necesarios para reflejar la nueva jerarquía documental.

La navegación deberá distinguir claramente entre:

- Project Constitution
- Project Bible
- Architecture
- ADR
- Sprint Documentation

---

## 5. Mantener compatibilidad

No eliminar documentos existentes.

No mover contenido sin autorización.

Si algún documento debe migrarse en el futuro, registrar la recomendación en el reporte final.

---

## 6. Validar consistencia

Verificar:

- Enlaces rotos.
- Duplicados.
- Convenciones de nombres.
- Integridad de la navegación.

No realizar correcciones automáticas fuera del alcance del presente prompt.

---

# Restricciones

No modificar contenido metodológico.

No redactar la Constitución.

No crear nuevos ADR.

No modificar revisiones existentes.

No alterar el historial de trazabilidad.

---

# Resultado esperado

Generar un reporte indicando:

- Carpetas creadas.
- Archivos creados.
- Documentos actualizados.
- Estado de la navegación.
- Recomendaciones para futuras migraciones.
