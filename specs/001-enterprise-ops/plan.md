# Plan: 001-enterprise-ops

## Stack (sin cambiar)

Next.js 16 + SQLite + IndexedDB + `@vladmandic/face-api`. Una app, un puerto.

## Cambios

1. Constitución Spec Kit + spec/plan/tasks en `specs/001-enterprise-ops/`.
2. Regla Ponytail y Graphify en `.cursor/rules/`.
3. `http.ts`: request id + rate limit en memoria (`ponytail:` techo un proceso).
4. `db.ts`: `patchEmployee`, `wipeTemplates`; identify filtra `active`.
5. `webhook.ts`: POST opcional si `WEBHOOK_URL` + `WEBHOOK_SECRET`.
6. Rutas: PATCH/DELETE empleado, GET `/api/audit`.
7. `AppShell` tipo Inbox; CSS blanco; hover `.shade`.
8. Admin lista+detalle; Enrolar lista+form; Kiosco canvas limpio.
9. `graphify update .` al cerrar.

## Fuera de alcance (Ponytail)

SSO, MQTT, RFID, Electron, Redis, segunda librería UI, PAD real.
