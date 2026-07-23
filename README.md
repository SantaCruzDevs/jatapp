---
Document ID: KODE-ROOT-001
Document Title: JATapp Root Project README
Document Type: Directory Index
Version: 1.0
Status: Approved
Owner: Jesús Daniel Murichi Barrientos
Steward: Santa Cruz Devs
Governed By: PB-000 (Constitution)
Depends On: CONSTITUTION.md, KAC.md, KGG.md, RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md
Related Assets: None
Classification: Public
Created: 2026-07-22
Last Updated: 2026-07-23
Review Cycle: Every Sprint
---

# JATapp — MotoJAT Enterprise Logistics Platform

JATapp es la plataforma de transformación digital y gestión logística express para MotoJAT, desarrollada bajo los estándares de ingeniería y gobernanza del ecosistema **KODE** (Knowledge-Oriented Development Ecosystem).

Este repositorio contiene la arquitectura de producto, la documentación gobernada y el primer **Prototipo Comercial Colaborativo en Vivo**.

---

## 📁 Estructura del Repositorio

*   `apps/` - Módulos de aplicación de la plataforma.
    *   `apps/jat-demo/` - **Prototipo de Demostración Comercial en Vivo (JAT-DEMO-003)**.
*   `packages/` - Componentes y librerías lógicas reutilizables (Futura extracción).
*   `docs/` - Repositorio de conocimiento estructurado.
    *   `docs/PROJECT_CONSTITUTION/` - Constitución de gobernanza y estándares metodológicos de KODE.
    *   `docs/PROJECT_BIBLE/` - Especificación de producto, reglas de negocio e identidad de marca de MotoJAT.
    *   `docs/RUNBOOKS/` - Manuales operativos de infraestructura y despliegue.
*   `mock-data/` - Colección de datos corporativos simulados.
*   `prompts/` - Registro histórico de interacción con agentes de inteligencia artificial.

---

## 🚀 Prototipo Comercial (Quick Start)

El prototipo simula la interacción colaborativa en tiempo real de tres roles logísticos clave: **Administrador (Fabiana)**, **Operador Central (Mesa de control)** y **Motoquero (Flota en calle)**.

### Ejecución Local
1. Descargue o clone este repositorio.
2. Abra el archivo [apps/jat-demo/index.html](apps/jat-demo/index.html) directamente en cualquier navegador web moderno (no requiere un servidor web para desarrollo básico).
3. **Prueba de Colaboración en Vivo:** Abra el mismo archivo en tres pestañas o ventanas distintas del navegador y asigne a cada una un rol diferente (*Administrador, Operador, Motoquero*). El estado se sincronizará automáticamente entre ventanas utilizando la Storage API.

---

## 🌐 Despliegue en Producción (Vercel)

El proyecto está configurado para desplegarse de manera continua y estática en Vercel. 

*   **Configuración de Despliegue:** Definida en [vercel.json](vercel.json).
*   **Manual de Despliegue Completo:** Consulte el runbook oficial en [RB-001 (Commercial Demo Deployment)](docs/RUNBOOKS/RB-001_DEPLOYMENT_VERCEL.md) para detalles sobre la configuración de DNS y proxy SSL en Cloudflare.

---

## ⚖️ Licencia
Este proyecto se distribuye bajo la licencia MIT. Consulte el archivo [LICENSE](LICENSE) para más detalles.

---

### Navegación KODE
*   **Constitución del Proyecto:** [Constitution](docs/PROJECT_CONSTITUTION/CONSTITUTION.md)
*   **Catálogo de Activos de Conocimiento:** [KAC](docs/PROJECT_CONSTITUTION/KAC.md)
*   **Índice de Metadatos:** [Metadata Index](docs/PROJECT_CONSTITUTION/KODE_METADATA_INDEX.md)
