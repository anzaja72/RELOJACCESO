# Matriz RFP-BIO-2026-01 — Reloj CR · Oferta software v1

Leyenda: **Sí** (cubierto en software), **Parcial** (software listo / falta contrato u ensayo), **No** (fuera de alcance, plantilla).

| Id | Requisito | Estado | Dónde | Evidencia |
| --- | --- | --- | --- | --- |
| G01 | Biometría facial + PAD/liveness documentado | Parcial | `/kiosk`, `src/lib/face.ts`, `docs/BIOMETRIA.md` | Matching 128-d + desafío pasivo (parpadeo/giro). Umbrales declarados. **No** ensayo de lab / ISO 30107. |
| G02 | Marcaciones en dashboard central ≤60 s | Sí | `/admin` poll 5 s; `GET /api/v1/punches/stream` SSE 4 s | Feed de operación y SSE autenticado. |
| G03 | REST/JSON abierto, auth, sandbox, maestros + eventos | Sí | `/api/v1`, `/openapi.yaml`, `SANDBOX=true` | JWT + API key, catálogo, punches, OpenAPI. |
| G04 | Cola offline IndexedDB sin pérdida ni duplicados | Sí | `src/lib/offline.ts`, `POST /api/sync`, ULID | Tests `scripts/queue.test.mjs` + smoke. |
| G05 | Pack de salida CSV+XLSX+PDF+JSON + plan de salida | Sí | `/api/v1/exports/pack`, `docs/EXIT_PLAN.md` | UI Operación / Reportes. |
| F01 | CRUD colaboradores + traslado + baja lógica | Sí | `/people`, `PATCH /api/v1/employees/{id}` | `siteId`, `deleted`, wipe de plantillas. |
| F02 | Auditoría de enrolamiento | Sí | `enrollment_audit`, `/api/v1/enrollment-audit` | ts, operador, UA, sede, acción. |
| F03 | IN/OUT + tipos configurables | Sí | Ajustes `event_types`, kiosco | BREAK_START/END de fábrica. |
| F04 | País / zona / restaurante + RBAC | Sí | `countries`, `zones`, `users.role` | Roles: superadmin, zone_manager, site_manager, operator, auditor. |
| F05 | Tarde / ausente / salida temprana / omisión + excepciones | Sí | `src/lib/attendance-rules.ts`, `/reports` | Turnos lun–vie 07:00–16:00 semilla. |
| F06 | Correcciones con motivo + aprobador + log inmutable | Sí | `/admin`, `POST /api/v1/corrections` | Tabla `corrections` + evento `punch.corrected`. |
| F07 | Alertas (ausente, tarde, terminal offline, sync fail) | Sí | `/settings`, webhooks `WEBHOOK_URL` | In-app + HMAC. Ausente/tarde vía reporte; offline/sync automáticos. |
| F08 | Respaldo controlado si falla la cara | Sí | `/kiosk` PIN supervisor, `POST /api/v1/punches/pin` | Motivo + PIN + auditoría. **No** USB/RFID/huella. |
| B05 | Modalidad alternativa | Sí | Igual F08 | Software-controlled, no driver nativo. |
| R01 | Presentes / ausentes / tardes / novedades por restaurante | Sí | `/reports`, `GET /api/v1/reports` | Totales + lista. |
| R02 | Filtros país/zona/sede/empleado/fecha/estado | Parcial | `/reports` sede/fecha/estado/empleado | País/zona vía jerarquía y alcance RBAC, no combo dedicado. |
| R03 | Estado de terminal + sync | Sí | `/admin`, `/api/terminals`, alertas | Heartbeat 12 s, online <45 s. |
| R04 | Export XLSX, CSV, PDF | Sí | `/api/v1/exports/pack?format=` | XLSX OOXML real (zip store). |
| R05 | Historial de cambios / UI de auditoría | Sí | `/audit`, correcciones, enrollment-audit | Eventos + payload. |
| I01 | REST versionado `/api/v1` | Sí | `src/app/api/v1` | HTTPS: terminar TLS en reverse proxy; README. |
| I02 | OpenAPI completo | Sí | `/openapi.yaml`, `/api/v1/openapi` | Cubre v1 + legado. |
| I03 | API keys + JWT; camino OIDC | Sí | `POST /api/v1/auth/login`, `GET /api/v1/auth/oidc` | Stub OIDC documentado. |
| I04 | Sandbox distinto de producción | Sí | `SANDBOX=true` → `asistencia.sandbox.db` | Flag en `/api/v1/health`. |
| I05 | Punches incrementales id/cursor/`since` | Sí | `GET /api/v1/punches?since=&cursor=` | ULID ordenable. |
| I06 | Webhooks punch.created, terminal.offline, sync.failed | Sí | `src/lib/webhook.ts`, `recordEvent` | HMAC `X-Reloj-Signature`. |
| I07 | Ids idempotentes ULID | Sí | `ulidx` en kiosco y API | `POST` repetido → 200 same id. |
| I08 | Rate limits + códigos de error | Sí | `src/lib/http.ts`, body `code` | 80/min general, 10/min login; `AUTH_REQUIRED`, `VALIDATION`, `INVALID_PIN`… |
| S01 | Cifrado en reposo de plantillas | Sí | `src/lib/crypto-box.ts` AES-GCM | Clave de entorno. |
| S02 | Roles + MFA admin | Parcial | RBAC + TOTP opcional (`POST /api/v1/auth/totp`) | Contraseña obligatoria; TOTP no forzado de fábrica. |
| S03 | Audit de acceso, cambios, exports, admin | Sí | `events` + `/audit` | login, export.pack, settings, punches. |
| S04 | Backup/restore + RPO/RTO documentados | Sí | `npm run backup` / `restore`, `docs/EXIT_PLAN.md` | Supuestos, no SLA vendido. |
| S05 | Región cloud Costa Rica | No | Ajuste + `docs/CONTRACT_TEMPLATES.md` | Declaración que rellena el oferente. |
| S06 | Retención / borrado + wipe biométrico | Sí | Ajustes, `deleted: true`, `POST .../retention` | Hard-delete de `face_templates`. |
| S07 | ISO / SOC | No | `docs/CONTRACT_TEMPLATES.md` | No se fingen certificados. |
| S08 | Export de salida | Sí | G05 | Paquete + plan. |
| SV02 | Teléfono on-call | No | Plantilla contractual | — |
| SV03 | SLA disponibilidad | No | Plantilla contractual | — |
| SV04 | Ventana de mantenimiento contratada | No | Plantilla contractual | — |
| SV05 | RMA / stock de terminales | No | Plantilla contractual | Hardware-agnóstico. |

## Completo en software vs. contractual / operaciones

**Software-completo:** kiosco facial, enrolamiento auditado, cola offline, dashboard ≤60 s, API v1, RBAC, novedades, correcciones, alertas+webhook, PIN supervisor, exportaciones, cifrado de plantillas, backup de archivo, sandbox, retención.

**Sigue siendo contractual u operacional (no se simula):** stock y RMA de tablets/Pi, P1 telefónico, créditos de SLA, certificados ISO/SOC, contrato real de región cloud en Costa Rica, ensayo FAR/FRR de laboratorio.
