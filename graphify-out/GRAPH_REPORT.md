# Graph Report - .  (2026-09-24)

## Corpus Check
- Corpus is ~36,164 words - fits in a single context window. You may not need a graph.

## Summary
- 591 nodes · 1521 edges · 42 communities (33 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.84)
- Token cost: 113,733 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_SQLite Data Layer & Ops|SQLite Data Layer & Ops]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Admin UI Pages & Shell|Admin UI Pages & Shell]]
- [[_COMMUNITY_RFP Compliance & Exit Plan|RFP Compliance & Exit Plan]]
- [[_COMMUNITY_AI Briefing & Chat|AI Briefing & Chat]]
- [[_COMMUNITY_Face Kiosk & Matching|Face Kiosk & Matching]]
- [[_COMMUNITY_DB Core & Template Crypto|DB Core & Template Crypto]]
- [[_COMMUNITY_Deployment Paths|Deployment Paths]]
- [[_COMMUNITY_Admin Dashboard Client|Admin Dashboard Client]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Enterprise Ops Spec & Constitution|Enterprise Ops Spec & Constitution]]
- [[_COMMUNITY_Enrollment & Webcam Capture|Enrollment & Webcam Capture]]
- [[_COMMUNITY_AI Pack v1.1 Design|AI Pack v1.1 Design]]
- [[_COMMUNITY_Root Layout & App Config|Root Layout & App Config]]
- [[_COMMUNITY_Biometrics & PAD Design|Biometrics & PAD Design]]
- [[_COMMUNITY_Dialog Component|Dialog Component]]
- [[_COMMUNITY_Match Tests|Match Tests]]
- [[_COMMUNITY_Card Component|Card Component]]
- [[_COMMUNITY_Offline Queue Tests|Offline Queue Tests]]
- [[_COMMUNITY_Tabs Component|Tabs Component]]
- [[_COMMUNITY_Attendance Tests|Attendance Tests]]
- [[_COMMUNITY_Backup Script|Backup Script]]
- [[_COMMUNITY_Model Download Script|Model Download Script]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_AI Smoke Test|AI Smoke Test]]
- [[_COMMUNITY_Badge Component|Badge Component]]
- [[_COMMUNITY_Agent Instructions|Agent Instructions]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Health Route|Health Route]]
- [[_COMMUNITY_Restore Script|Restore Script]]
- [[_COMMUNITY_RFP Smoke Test|RFP Smoke Test]]
- [[_COMMUNITY_Utils|Utils]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 61 edges
2. `json()` - 56 edges
3. `handleGet()` - 38 edges
4. `handlePost()` - 34 edges
5. `README Reloj CR Oferta software v1` - 28 edges
6. `serverError()` - 26 edges
7. `recordEvent()` - 24 edges
8. `listPunches()` - 21 edges
9. `RFP requirement matrix (G/F/R/I/S/SV)` - 20 edges
10. `reportForDay()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Hard-delete templates on baja/revoke` --semantically_similar_to--> `Consent revocation wipes descriptors`  [INFERRED] [semantically similar]
  docs/BIOMETRIA.md → specs/001-enterprise-ops/spec.md
- `reloj-data volume` --semantically_similar_to--> `Persistent /data disk`  [INFERRED] [semantically similar]
  docker-compose.yml → docs/RENDER.md
- `Spec before code` --rationale_for--> `Spec 001-enterprise-ops`  [INFERRED]
  .specify/memory/constitution.md → specs/001-enterprise-ops/spec.md
- `Hardware-agnostic principle` --rationale_for--> `PIN supervisor fallback (F08/B05)`  [INFERRED]
  .specify/memory/constitution.md → README.md
- `DEMO explicito` --conceptually_related_to--> `Passive liveness heuristic (EAR blink / nose motion)`  [INFERRED]
  .specify/memory/constitution.md → docs/BIOMETRIA.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AI pack v1.1 (P0-P3) on trusted punches** — docs_ai_p0_reports, docs_ai_p1_briefing, docs_ai_p2_chat, docs_ai_p3_anomalies, docs_ai_sql_fallback [EXTRACTED 1.00]
- **Offline punch integrity (queue, ULID, sync, fallback)** — readme_offline_queue, readme_ulid_idempotency, public_openapi_legacy_api, memory_constitution_offline_no_silencioso, docs_exit_plan_rpo_rto [INFERRED 0.85]
- **Deployment paths for partner demo** — docs_render_render_deployment, docs_share_cloudflared_tunnel, docs_share_vps_docker, docs_windows_docker_desktop, docs_windows_node_path, docker_compose_reloj_cr_service [INFERRED 0.85]

## Communities (42 total, 9 thin omitted)

### Community 0 - "API Route Handlers"
Cohesion: 0.09
Nodes (52): GET(), POST(), GET(), POST(), GET(), POST(), GET(), POST() (+44 more)

### Community 1 - "SQLite Data Layer & Ops"
Cohesion: 0.10
Nodes (68): retrieve(), createEmployee(), getDb(), getSiteByCode(), listEmployees(), listPunches(), listSites(), listTerminals() (+60 more)

### Community 2 - "NPM Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, @base-ui/react, better-sqlite3, class-variance-authority, cn, idb, lucide-react, next (+30 more)

### Community 3 - "Admin UI Pages & Shell"
Cohesion: 0.14
Nodes (15): HINTS, EventRow, AppShell(), links, routes, api, clearSession(), getSessionUser() (+7 more)

### Community 4 - "RFP Compliance & Exit Plan"
Cohesion: 0.13
Nodes (30): ISO/IEC 30107 PAD certification, Hard-delete templates on baja/revoke, Plantillas contractuales, S05 cloud region declaration, S07 ISO/SOC certifications, SV02-SV05 support/SLA/RMA templates, Plan de salida y portabilidad, Backup/restore scripts (+22 more)

### Community 5 - "AI Briefing & Chat"
Cohesion: 0.15
Nodes (24): Briefing, BriefingBullet, factsPayload(), generateBriefing(), qs(), templateBriefing(), answerChat(), canned() (+16 more)

### Community 6 - "Face Kiosk & Matching"
Cohesion: 0.13
Nodes (20): KioskClient(), ResultState, euclidean(), GalleryEntry, identifyFace(), BioDB, cacheGallery(), db() (+12 more)

### Community 7 - "DB Core & Template Crypto"
Cohesion: 0.15
Nodes (18): GET(), key(), openJson(), sealJson(), attendanceToday(), createDb(), globalForDb, hasColumn() (+10 more)

### Community 8 - "Deployment Paths"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 9 - "Admin Dashboard Client"
Cohesion: 0.13
Nodes (21): reloj-cr compose service, reloj-data volume, NVIDIA Nemotron LLM provider, RPO/RTO assumptions, Desplegar en Render, Persistent /data disk, Render Docker deployment, Enviar demo a un socio (+13 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.21
Nodes (13): SitePicker(), fetchAttendance(), request(), getToken(), AttendanceRow, Punch, PunchMethod, Site (+5 more)

### Community 11 - "Enterprise Ops Spec & Constitution"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 12 - "Enrollment & Webcam Capture"
Cohesion: 0.18
Nodes (19): Plan 001-enterprise-ops, http.ts request id + in-memory rate limit, Out of scope: SSO, MQTT, RFID, Electron, Redis, PAD real, webhook.ts optional POST, Spec 001-enterprise-ops, AppShell Inbox three-zone UI, GET /api/audit, Consent revocation wipes descriptors (+11 more)

### Community 13 - "AI Pack v1.1 Design"
Cohesion: 0.20
Nodes (11): OfflineBadge(), captureFromVideo(), WebcamPanel(), detectAllBoxes(), detectFace(), eyeAspect(), FaceApi, FaceCapture (+3 more)

### Community 14 - "Root Layout & App Config"
Cohesion: 0.27
Nodes (12): IA Reloj CR v1.1 doc, AI pack v1.1, AI prohibitions (no punitive score, no CCTV), LLM egress privacy (aggregates + ids only), P0 reportes /reports, P1 daily briefing, P2 chat Pregunta a Reloj CR, P3 anomaly rules (+4 more)

### Community 15 - "Biometrics & PAD Design"
Cohesion: 0.24
Nodes (5): metadata, sans, APP, MODEL_BYTES, GET()

### Community 16 - "Dialog Component"
Cohesion: 0.27
Nodes (11): Biometria y PAD doc, AES-256-GCM encrypted templates, @vladmandic/face-api models, Browser face pipeline (G01), Passive liveness heuristic (EAR blink / nose motion), Matching thresholds (MATCH_THRESHOLD 0.48), Hardware-agnostic principle, /api/v1/punches/pin (+3 more)

### Community 20 - "Match Tests"
Cohesion: 0.46
Nodes (7): crc32(), toSpreadsheetXml(), toXlsx(), u16(), u32(), xmlEscape(), zipStore()

### Community 21 - "Card Component"
Cohesion: 0.29
Nodes (7): a, b, c, euclidean(), identify(), result, unknown

### Community 23 - "Offline Queue Tests"
Cohesion: 0.38
Nodes (6): classifyEmployee(), Exception, hmToMin(), localParts(), Novelty, Schedule

### Community 24 - "Tabs Component"
Cohesion: 0.33
Nodes (4): failed, leftover, none, queued

### Community 26 - "Backup Script"
Cohesion: 0.67
Nodes (3): classify(), hmToMin(), sched

### Community 27 - "Model Download Script"
Cohesion: 0.50
Nodes (3): dest, destDir, src

### Community 28 - "Next.js Config"
Cohesion: 0.50
Nodes (3): bases, dest, files

## Knowledge Gaps
- **123 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `json()` connect `API Route Handlers` to `SQLite Data Layer & Ops`, `Biometrics & PAD Design`, `DB Core & Template Crypto`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `getDb()` connect `SQLite Data Layer & Ops` to `API Route Handlers`, `AI Briefing & Chat`, `DB Core & Template Crypto`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `README Reloj CR Oferta software v1` connect `RFP Compliance & Exit Plan` to `Dialog Component`, `Admin Dashboard Client`, `Enrollment & Webcam Capture`, `Root Layout & App Config`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `json()` (e.g. with `GET()` and `PATCH()`) actually correct?**
  _`json()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.091324200913242 - nodes in this community are weakly interconnected._
- **Should `SQLite Data Layer & Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.10328638497652583 - nodes in this community are weakly interconnected._