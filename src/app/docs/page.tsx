import Link from "next/link";
import { DemoBanner } from "@/components/demo-banner";
import { NavLinks } from "@/components/nav-links";

const routes = [
  ["GET", "/api/health", "Salud, hoy y terminales"],
  ["GET", "/api/sites", "Sedes semilla"],
  ["GET", "/api/employees?site=R01", "Colaboradores"],
  ["POST", "/api/employees", "Alta (API key)"],
  ["GET", "/api/templates?site=R01", "Galería de descriptores"],
  ["POST", "/api/identify", "1:N contra plantillas"],
  ["GET/POST", "/api/punches", "Feed y marcación ULID"],
  ["POST", "/api/sync", "Cola offline"],
  ["GET", "/api/punches/export", "CSV (API key)"],
  ["POST", "/api/terminals/heartbeat", "Latido del kiosco"],
  ["GET", "/api/events", "Bitácora tipo webhook (API key)"],
  ["GET", "/api/openapi", "OpenAPI YAML"],
];

export default function DocsPage() {
  return (
    <div className="paper-skin">
      <DemoBanner />
      <NavLinks />
      <main className="page-wrap">
        <p className="eyebrow">API</p>
        <h1>Rutas REST</h1>
        <p className="muted mb-4">
          Token demo: <code>demo-rfp-bio-2026</code> en <code>X-API-Key</code>.
          Especificación: <Link href="/openapi.yaml">/openapi.yaml</Link>
        </p>
        <ul className="people-list">
          {routes.map(([method, path, note]) => (
            <li key={path}>
              <div>
                <strong>
                  {method} {path}
                </strong>
                <span>{note}</span>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
