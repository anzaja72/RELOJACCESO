# Feature Specification: Operación empresarial Reloj CR

**Feature Branch**: `001-enterprise-ops`  
**Created**: 2026-09-12  
**Status**: Implemented  
**Input**: Endurecer el PoC RFP-BIO-2026-01 con Spec Kit + Ponytail + Graphify; UX Inbox-level (blanco, aire, hover sombreado).

## User Scenarios & Testing

### User Story 1 — Operar el día (P1)

Un gerente abre Operación, ve el feed, un detalle al clic, presentes/ausentes y terminales, y exporta CSV.

**Why this priority**: Es el tablero de la oferta.  
**Independent Test**: Sembrar un punch y verlo en `/admin` con detalle.  
**Acceptance Scenarios**:

1. **Given** hay marcaciones, **When** abre `/admin`, **Then** ve lista + panel de detalle, no ceros eternos.
2. **Given** token demo, **When** exporta CSV, **Then** descarga `marcaciones.csv`.

### User Story 2 — Marcar y enrolar (P1)

El personal marca Entrada/Salida; RR.HH. enrola con consentimiento y puede revocar.

**Acceptance Scenarios**:

1. **Given** plantillas en la sede, **When** pulsa Entrada con rostro, **Then** overlay de éxito o rechazo claro.
2. **Given** consentimiento, **When** guarda 2–3 muestras, **Then** `enrolled=true` y evento `template.enrolled`.
3. **Given** un enrolado, **When** revoca consentimiento, **Then** se borran descriptores y queda evento `consent.revoked`.

### User Story 3 — Auditoría y webhooks (P2)

Un integrador consulta `/api/audit` y, si hay `WEBHOOK_URL`, recibe POST HMAC.

**Acceptance Scenarios**:

1. **Given** API key, **When** GET `/api/audit`, **Then** lista eventos recientes.
2. **Given** sin `WEBHOOK_URL`, **When** ocurre un punch, **Then** solo se persiste el evento (sin fallo).

### User Story 4 — UI Inbox (P1)

Operador usa sidebar + lista + detalle. Botones con hover sombreado.

**Acceptance Scenarios**:

1. **Given** desktop, **When** navega, **Then** rail izquierdo fijo, canvas blanco, tipografía fina.
2. **Given** hover en botón/nav, **When** el puntero entra, **Then** el fondo se sombrea en ≤200 ms.

## Requirements

- **FR-001**: Shell de tres zonas (rail / lista / detalle) en admin y enrolar.
- **FR-002**: Distintivo DEMO visible.
- **FR-003**: PATCH empleado: `active`, `revokeConsent`.
- **FR-004**: DELETE plantillas de un empleado.
- **FR-005**: GET `/api/audit` (admin).
- **FR-006**: Rate limit en POST punches/identify/sync.
- **FR-007**: `X-Request-Id` en JSON.
- **FR-008**: Webhook opcional HMAC-SHA256.
- **FR-009**: Identify ignora empleados inactivos.
- **FR-010**: Hover sombreado en controles primarios.
- **FR-011**: Graphify actualizado (`graphify-out/`).

## Success Criteria

- **SC-001**: Kiosco, enrolar y admin hidratan datos reales en <3 s.
- **SC-002**: Revocar consentimiento deja 0 plantillas.
- **SC-003**: Replay del mismo ULID no duplica punch.
- **SC-004**: UI se lee como bandeja Inbox (gris/blanco, sin skin “selva”).

## Assumptions

- Sigue siendo DEMO: sin SSO, sin PAD certificado, sin E2EE productivo.
- Spec Kit, Ponytail y Graphify son proceso, no runtime del kiosco.
