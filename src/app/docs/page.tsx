import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const routes = [
  ["GET", "/api/health", "Salud y terminales"],
  ["GET", "/api/sites", "Sedes"],
  ["GET", "/api/employees?site=R01", "Colaboradores"],
  ["PATCH", "/api/employees/{id}", "Activo / revocar consentimiento"],
  ["DELETE", "/api/employees/{id}/templates", "Borrar plantillas"],
  ["POST", "/api/identify", "1:N"],
  ["POST", "/api/punches", "Marcación ULID"],
  ["POST", "/api/sync", "Cola offline"],
  ["GET", "/api/audit", "Eventos (API key)"],
  ["GET", "/api/punches/export", "CSV"],
];

export default function DocsPage() {
  return (
    <AppShell title="API" meta="Token demo-rfp-bio-2026 · X-API-Key">
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
