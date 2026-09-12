import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const routes = [
  ["GET", "/api/v1", "Versión, edición, sandbox"],
  ["POST", "/api/v1/auth/login", "JWT (email + clave + TOTP opcional)"],
  ["GET", "/api/v1/catalog", "Países, zonas, sedes, tipos de evento"],
  ["GET", "/api/v1/punches?since=&cursor=", "Incremental autenticado"],
  ["GET", "/api/v1/punches/stream", "SSE cada 4 s"],
  ["POST", "/api/v1/punches/pin", "Respaldo supervisor + motivo"],
  ["GET", "/api/v1/reports", "Novedades + filtros país/zona"],
  ["POST", "/api/v1/anomalies", "Escanear anomalías P3"],
  ["POST", "/api/v1/ai/briefing", "Briefing del día (LLM o plantilla)"],
  ["POST", "/api/v1/ai/chat", "Pregunta a Reloj CR"],
  ["GET", "/api/v1/exports/pack", "JSON / CSV / XLSX / PDF / ZIP"],
  ["POST", "/api/v1/corrections", "Corrección con aprobador"],
  ["GET", "/api/health", "Salud y terminales (legado)"],
  ["POST", "/api/punches", "Marcación ULID kiosco"],
  ["POST", "/api/sync", "Cola offline"],
];

export default function DocsPage() {
  return (
    <AppShell title="API" meta=" /api/v1 · JWT o X-API-Key demo-rfp-bio-2026">
      <div className="split-list">
        {routes.map(([method, path, note]) => (
          <div key={path} className="row">
            <strong>
              {method} {path}
            </strong>
            <span>{note}</span>
          </div>
        ))}
        <div className="detail">
          <p className="muted">
            <Link href="/openapi.yaml">openapi.yaml</Link> · Spec Kit en{" "}
            <code>specs/001-enterprise-ops</code>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
