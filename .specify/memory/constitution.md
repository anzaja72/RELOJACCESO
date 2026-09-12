# Reloj CR Constitution

## Core Principles

### I. Spec before code
Los cambios de producto se describen en `specs/` (qué / por qué / criterios) antes de ampliar superficie. Spec Kit manda el orden: constitution → specify → plan → tasks → implement.

### II. Ponytail (mínimo que cumple)
No se añade dependencia, capa ni pantalla que el RFP no exija. Se reutiliza SQLite, IndexedDB, face-api y las rutas existentes. Validación, no pérdida de datos y accesibilidad no se recortan.

### III. Hardware-agnostic
La misma URL en Chrome/Chromium. Sin Electron, agentes Pi ni SDK USB. Cámara solo vía `getUserMedia`.

### IV. Offline no silencioso
Marcación con ULID. Si no hay red, cola IndexedDB visible. Sync idempotente. Nunca perder un punch.

### V. Consentimiento y auditoría
No hay plantilla sin consentimiento. Revocar consentimiento borra descriptores. Cada alta, punch y revocación deja evento. Webhook HMAC es opcional (`WEBHOOK_URL`).

### VI. DEMO explícito
La UI lleva distintivo DEMO. No se afirma PAD de producción ni E2EE de plantillas.

### VII. UX Inbox
Interfaz clara, mucha aire, tipografía fina, contraste alto. Hover = sombreado suave, no decoración.

## Governance

Esta constitución prima sobre preferencias de stack. Excepciones se marcan `ponytail:` con techo y upgrade. Graphify (`graphify-out/`) se actualiza tras cambios de código.

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12
