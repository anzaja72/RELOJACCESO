# Reloj CR — DEMO de asistencia biométrica (RFP-BIO-2026-01)

Versión de operación (Spec Kit + Ponytail + Graphify): UI tipo bandeja, auditoría, revocación de consentimiento, rate limit y webhook HMAC opcional. Sigue siendo un **DEMO**.

PoC de **kiosco + enrolamiento + dashboard** para restaurantes en Costa Rica. Corre en **cualquier navegador moderno** (Chrome en tablet Android, Chromium en Raspberry Pi, laptop). No hay Electron, ni agente exclusivo de Pi, ni SDK USB de huella.

La cámara usa `getUserMedia`. El matching facial corre **en el navegador** (`@vladmandic/face-api` / TinyFaceDetector + FaceRecognitionNet). SQLite guarda sedes, colaboradores, plantillas y marcaciones. IndexedDB guarda la **cola offline**.

> **Esto es un DEMO.** La franja ámbar en la UI lo deja explícito. No sustituye un sistema productivo del RFP.

## Un comando

```bash
npm install
npm run dev
```

Abra [http://127.0.0.1:47321](http://127.0.0.1:47321).

Docker:

```bash
docker compose up --build
```

## En tablet o Raspberry Pi (misma LAN)

El servidor escucha en `0.0.0.0:47321`. En desarrollo, Next.js solo sirve `/_next` a `localhost` salvo que el host esté en `allowedDevOrigins`. La config incluye `127.0.0.1` y las IPs LAN del equipo al arrancar; si usa un túnel, añada el host en `ALLOWED_DEV_ORIGINS`.

1. En el host: `npm run dev` (o Compose).
2. Averigüe la IP (`ip a` / `hostname -I`).
3. En la tablet o el Pi, Chrome/Chromium: `http://IP-DEL-HOST:47321/kiosk?site=R01`.

La cámara exige **localhost o HTTPS** en la mayoría de navegadores. En LAN HTTP, Chrome a veces pide un flag o un origen de confianza (`chrome://flags/#unsafely-treat-insecure-origin-as-secure`). En el Pi, Chromium kiosk:

```bash
chromium-browser --kiosk --use-fake-ui-for-media-stream http://IP:47321/kiosk?site=R01
```

(`--use-fake-ui-for-media-stream` solo evita el prompt; no simula un rostro.)

## Pantallas

| Ruta | Uso |
| --- | --- |
| `/` | Entrada del PoC |
| `/kiosk` o `/kiosk?site=R01` | Marcación a pantalla completa: **Entrada** / **Salida** |
| `/enroll` | Alta + 2–3 muestras + consentimiento |
| `/admin` | Operación: lista + detalle, presentes, CSV |
| `/audit` | Bitácora |
| `/docs` y `/openapi.yaml` | API REST |

Etiquetas: Marcación, Entrada, Salida, Enrolar, Operación.

## Datos semilla

| Código | Sede | Ciudad |
| --- | --- | --- |
| R01 | Soda El Parque | San José |
| R02 | Mariscos del Caribe | Limón |

Colaboradores de ejemplo (sin cara hasta que enrolé con la webcam): María Solís, Carlos Méndez, Ana Vargas, Luis Herrera, Sofía Jiménez.

Token admin del DEMO (también en `.env.example`):

```
X-API-Key: demo-rfp-bio-2026
```

## Offline (cómo probarlo)

1. Enrolé un rostro en `/enroll`.
2. Marque **Entrada** en `/kiosk` (debe verse el overlay de éxito).
3. DevTools → **Network** → marque **Offline**.
4. Marque otra vez. Verá el distintivo **Sin red** y el texto de cola. La ULID queda en IndexedDB (`reloj-cr` / store `queue`).
5. Desactive Offline. En unos segundos `POST /api/sync` vacía la cola. Repetir el mismo id no duplica (idempotente).

Si cae la red **no se pierde** la marcación: o viaja al servidor o queda en cola visible.

## API (resumen)

Público (kiosco): `GET /api/sites`, `GET /api/employees`, `GET /api/templates`, `POST /api/identify`, `POST /api/punches`, `POST /api/sync`, `POST /api/terminals/heartbeat`, `GET /api/health`.

Admin (token): `POST /api/employees`, `PATCH /api/employees/{id}`, `DELETE /api/employees/{id}/templates`, `GET /api/punches/export`, `GET /api/audit`.

Proceso: constitución en `.specify/memory/constitution.md`, spec en `specs/001-enterprise-ops/`. Grafo: `graphify-out/`. Reglas: `.cursor/rules/ponytail.mdc`.

`POST /api/identify` sigue la forma verify/identify: `{ descriptor[128], siteId }` → `{ decision, employee, score }`. El kiosco **prioriza el cruce local** para seguir funcionando offline.

`GET /api/events` es la bitácora estilo webhook: en producción se firmaría HMAC; aquí solo se persiste en SQLite.

## Modelos faciales

Servidos desde `/public/models` (se descargan con `npm run models` si faltan):

| Modelo | Tamaño aprox. | Uso |
| --- | --- | --- |
| Tiny Face Detector | 190 KB | Detección en tablet/Pi |
| Face Landmark 68 | 350 KB | Alineación + heurística DEMO |
| Face Recognition | ~4–6 MB | Descriptor 128-d |

**Total ~6.8 MB** la primera vez. Después el navegador los cachea.

## Arquitectura (patrones, no un fork)

Inspiración leída, no clonada:

- **Facenox** — matching local, plantillas (no fotos), consentimiento, CSV, cooldown anti-duplicado.
- **Edge Attendance** — cola offline + sync, multi-sede, estado de terminal, dashboard.
- **OpenBiometrics** — `identify` 1:N, liveness como concepto, eventos/webhooks.

Stack: Next.js 16 + TypeScript + Tailwind + shadcn/ui, SQLite (`better-sqlite3`), IndexedDB (`idb`).

## DEMO frente al RFP de producción

| Tema | Este DEMO | Producción (RFP) |
| --- | --- | --- |
| PAD / anti-spoof | Heurística (tamaño de cara + movimiento). **No es liveness certificado.** | PAD auditado, FAR/FRR medidos |
| Plantillas | JSON en SQLite, sin E2EE | Cifrado en reposo, claves por sede |
| Auth | Token demo en el cliente | SSO, rotación, RBAC |
| Hardware | Cualquier webcam del navegador | Integración certificada, RFID opcional |
| Nómina / SLA | Fuera de alcance | Integraciones y disponibilidad |
| MQTT / agentes Pi | No | Opcional; HTTP basta aquí |

## Scripts

```bash
npm run dev      # :47321 en todas las interfaces
npm start        # producción local
npm test         # distancia euclidiana / 1:N
npm run models   # re-descarga pesos si faltan
```

Variable de entorno: copie `.env.example` → `.env.local`. **No commitee secretos reales.**
