# Backlog IA — Reloj CR (pack mínimo v1.1)

Status: **Done** (implementado sobre la oferta software RFP; la IA no reemplaza biometría).
Principle: AI on top of trusted punches; never replaces biometrics; every answer cites punch ids + date range + deep link.

## Pack

- P0: Classic stats dashboard (RFP R01–R05 prerequisite) — **Done** (`/reports`, filtros país/zona/sede/empleado/fecha/estado)
- P1: Daily briefing (LLM) — 5 bullets + deep links, Spanish — **Done** (`/api/v1/ai/briefing`, fallback SQL)
- P2: Scoped chat "Pregunta a Reloj CR" (LLM+RAG on DB) — only present/late/absent/terminals/sync/corrections; [NO ENCONTRADO] if missing; no sanction advice — **Done** (`/ai`)
- P3: Anomaly rules — buddy-punch/PIN fallback spikes, degraded terminal, omission spikes; in-app + webhook; mark reviewed — **Done** (`anomalies`, `anomaly.detected`)

## Out of v1.1

Employee "problem" scoring for punishment; kitchen CCTV AI; fine-tuning; no-show prediction used for firing.

## Implement order later: P0 leftovers → P3 rules → P1 briefing → P2 chat.

Hecho en ese orden. Setup: [`docs/AI.md`](AI.md).
