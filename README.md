# Reloj CR · Oferta software v1

Asistencia biométrica para restaurantes (RFP-BIO-2026-01), configurada para **Colombia**: zona horaria `America/Bogota` (UTC−5), formato `es-CO` y consentimiento biométrico según la Ley 1581 de 2012. **100 % navegador**, misma URL en tablet Android o Chromium en Raspberry Pi. No hay Electron, ni agente nativo, ni drivers USB de RFID/huella.

La modalidad alternativa (F08 / B05) es **PIN o código de supervisor con motivo y bitácora**.

Franja de producto: **Oferta software v1** · distintivo *PoC browser* (el matching y el PAD corren en Chromium; no es un ensayo de laboratorio).

## Un comando

```bash
npm install
npm run dev
```

Abra [http://127.0.0.1:47321](http://127.0.0.1:47321).

```bash
docker compose up --build
```

El servidor escucha en `0.0.0.0:47321`.

## Completo en software vs. contractual

| Software listo | El oferente contrata / declara |
| --- | --- |
| Kiosco facial, enrolamiento, cola offline, dashboard ≤60 s | SLA telefónico, RMA y stock de tablets/Pi (SV02–SV05) |
| API `/api/v1`, JWT + API key, sandbox, webhooks | Certificados ISO/SOC (S07) |
| RBAC, correcciones, novedades, alertas, exportaciones | Región cloud contractual (S05) — hay plantilla |
| AES-GCM de plantillas, backup de archivo, retención | Ensayo FAR/FRR / PAD ISO 30107 |

Matriz: [`docs/RFP_COMPLIANCE.md`](docs/RFP_COMPLIANCE.md). Biometría: [`docs/BIOMETRIA.md`](docs/BIOMETRIA.md). Salida: [`docs/EXIT_PLAN.md`](docs/EXIT_PLAN.md). Plantillas: [`docs/CONTRACT_TEMPLATES.md`](docs/CONTRACT_TEMPLATES.md).

## Roadmap

Pack IA v1.1 (P0 reportes, P3 anomalías, P1 briefing, P2 chat): [`docs/AI.md`](docs/AI.md) · estado [`docs/BACKLOG_AI_v1.1.md`](docs/BACKLOG_AI_v1.1.md). Nemotron: `NVIDIA_API_KEY` en `.env.local`. Demo para un socio: [`docs/SHARE.md`](docs/SHARE.md). PC Windows del socio: [`docs/WINDOWS.md`](docs/WINDOWS.md). ¿Render? Sí — [`docs/RENDER.md`](docs/RENDER.md) (Docker + disco `/data`). Sin clave LLM hay fallback SQL. No hay score punitivo ni CCTV.

## Kiosco en LAN (tablet o Pi)

1. `npm run dev` en el host.
2. `hostname -I` → IP.
3. En la tablet/Pi: `http://IP:47321/kiosk?site=R01`.

La cámara pide localhost o HTTPS. En HTTP de LAN, Chrome a veces exige `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. En el Pi:

```bash
chromium-browser --kiosk --use-fake-ui-for-media-stream http://IP:47321/kiosk?site=R01
```

Next.js solo sirve `/_next` a orígenes permitidos. La config añade `127.0.0.1` y las IPv4 LAN; túneles extra en `ALLOWED_DEV_ORIGINS`.

## Autenticación

| Vía | Uso |
| --- | --- |
| `POST /api/v1/auth/login` | JWT 12 h (UI admin). TOTP opcional: `POST /api/v1/auth/totp` |
| `POST /api/v1/terminals/activate` | Token de kiosco (1 año, atado a una sede). Lo pide un operador o superior desde `/kiosk` |
| `X-API-Key` / `Bearer` | Solo integraciones servidor a servidor (`DEMO_API_KEY`). La UI no la usa |
| `GET /api/v1/auth/oidc` | Stub: documenta el camino a un IdP empresarial |

Usuarios semilla (contraseña = `ADMIN_PASSWORD`; en desarrollo, `RelojCR-Admin-2026!`):

| Correo | Rol | Alcance |
| --- | --- | --- |
| admin@reloj.cr | superadmin | todo |
| zona@reloj.cr | zone_manager | Región Andina |
| sede@reloj.cr | site_manager | R01 |
| operador@reloj.cr | operator | R01 |
| auditor@reloj.cr | auditor | lectura |

PIN de supervisor: `SUPERVISOR_PIN` (en desarrollo, `2468`).

### Kiosco

Cada tablet se activa una vez en `/kiosk`: un operador, gerente o admin elige la sede e ingresa sus credenciales (no quedan guardadas). El kiosco recibe un token de terminal que solo sirve para su sede: descargar la galería, marcar, sincronizar la cola offline y enviar heartbeat. Si se pierde la tablet: `POST /api/v1/terminals/{id}/revoke` (gerente de sede o superior).

OIDC: configurar `OIDC_ISSUER` + `OIDC_CLIENT_ID` y mapear grupos a los cinco roles. El stub no inicia un flujo real.

## Sandbox

```bash
SANDBOX=true npm run dev
```

Usa `data/asistencia.sandbox.db`, distinto del archivo de producción. `/api/v1/health` expone `"sandbox": true`.

## HTTPS

La app no termina TLS. En producción: Caddy/nginx con certificado delante de `:47321`. El kiosco en internet público **debe** ser HTTPS (cámara).

## Exportaciones y salida

- CSV: `/admin` o `GET /api/punches/export`
- Pack: `GET /api/v1/exports/pack?format=json|csv|xlsx|pdf|zip`
- Plan: `docs/EXIT_PLAN.md`

## Límites y errores

- 80 solicitudes / minuto / IP (general); 10 / minuto en login; 429 `Demasiadas solicitudes`.
- Códigos JSON: `AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `INVALID_CREDENTIALS`, `TOTP_REQUIRED`, `INVALID_TOTP`, `INVALID_PIN`, `NOT_FOUND`.
- Cabecera `X-Request-Id` en respuestas JSON.

Webhooks opcionales (`WEBHOOK_URL`, `WEBHOOK_SECRET`): eventos `punch.created`, `terminal.offline`, `sync.failed` (HMAC-SHA256 en `X-Reloj-Signature`).

## Pantallas

| Ruta | Uso |
| --- | --- |
| `/` | Bandeja de la oferta |
| `/kiosk?site=R01` | Marcación + PIN supervisor |
| `/enroll` | Alta biométrica + consentimiento |
| `/login` | Sesión JWT |
| `/admin` | Feed ≤5 s, correcciones, CSV, pack |
| `/people` | CRUD, traslado, baja |
| `/reports` | Novedades + exportaciones |
| `/settings` | Eventos, retención, alertas, región declarada |
| `/audit` | Bitácora |
| `/docs` | Mapa de API |

## Datos semilla

| Código | Sede | Ciudad | Zona |
| --- | --- | --- | --- |
| R01 | Restaurante La Candelaria | Bogotá | Región Andina |
| R02 | Mariscos del Caribe | Barranquilla | Región Caribe |

Colaboradores de ejemplo sin cara hasta enrolar: María Solís, Carlos Méndez, Ana Vargas, Luis Herrera, Sofía Jiménez. Turnos lun–vie 07:00–16:00, gracia 10 min.

## Offline

1. Enrolar un rostro.
2. Marcar entrada en `/kiosk`.
3. DevTools → Network → Offline → marcar de nuevo (cola IndexedDB `reloj-cr`).
4. Volver online: `POST /api/sync` vacía la cola. El mismo ULID no duplica.

## API

OpenAPI: [/openapi.yaml](/openapi.yaml) y `GET /api/v1/openapi`.

Público: `GET /api/sites`, `GET /api/v1/catalog`, `GET /api/health` (solo `ok`; el detalle exige sesión), OpenAPI.

Token de terminal (o usuario con escritura): `GET /api/templates`, `POST /api/identify`, `POST /api/punches`, `POST /api/sync`, `POST /api/v1/punches`, `POST /api/v1/punches/pin`, `POST /api/terminals/heartbeat`, `POST /api/v1/alerts`.

Sesión de usuario: todo lo demás (`/api/employees`, `/api/punches` GET, `/api/terminals`, `/api/v1/employees`, `/reports`, `/exports/pack`, `/corrections`, `/settings`, …).

## Variables

Copie `.env.example` → `.env.local`. No suba secretos reales.

En producción (`NODE_ENV=production`) el servidor **no arranca** sin `JWT_SECRET`, `TEMPLATE_KEY`, `ADMIN_PASSWORD` y `SUPERVISOR_PIN`, y rechaza los valores de fábrica. Los defaults de la tabla solo aplican en desarrollo.

| Variable | Default (solo dev) | Uso |
| --- | --- | --- |
| `JWT_SECRET` | fijo de dev | Firma de sesiones y tokens de kiosco (32+) |
| `TEMPLATE_KEY` | `DEMO_API_KEY` o fijo de dev | AES-GCM plantillas (32+). No lo cambie tras enrolar |
| `ADMIN_PASSWORD` | `RelojCR-Admin-2026!` | Semilla de usuarios (12+) |
| `SUPERVISOR_PIN` | `2468` | Respaldo F08 (6+) |
| `DEMO_API_KEY` | `demo-rfp-bio-2026` | Integraciones; en prod 24+ caracteres o se desactiva |
| `SANDBOX` | unset | DB aparte |
| `DATA_DIR` | `./data` | SQLite |
| `WEBHOOK_URL` / `WEBHOOK_SECRET` | unset | HMAC |

## Scripts

```bash
npm run dev      # :47321
npm start
npm test         # matching + cola + novedades
npm run smoke    # rutas críticas (servidor arriba)
npm run backup
npm run restore -- data/backups/<archivo>.db
npm run models
```

## Stack

Next.js 16 + TypeScript + Tailwind + shadcn/ui, SQLite (`better-sqlite3`), IndexedDB (`idb`), `@vladmandic/face-api` en el cliente, ULID (`ulidx`).
