import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MODEL_BYTES } from "@/lib/config";

export default function HomePage() {
  return (
    <AppShell title="Bandeja" meta="Reloj CR · Oferta software v1 · RFP-BIO-2026-01">
      <div className="detail" style={{ maxWidth: 640 }}>
        <h2>Asistencia biométrica, 100 % navegador.</h2>
        <p>
          La misma URL en tablet Android, Chromium en Raspberry Pi o laptop.
          Matching facial local, cola offline con ULID, API versionada y
          exportaciones de salida. Sin drivers RFID ni huella USB: el respaldo
          es PIN de supervisor con bitácora.
        </p>
      </div>
      <div className="home-grid">
        <Link href="/kiosk?site=R01" className="home-card shade">
          <span className="pill">Marcación</span>
          <h2>Kiosco</h2>
          <p>Entrada, salida y respaldo PIN autorizado.</p>
        </Link>
        <Link href="/enroll" className="home-card shade">
          <span className="pill">Alta</span>
          <h2>Enrolar</h2>
          <p>Muestras faciales, consentimiento y auditoría.</p>
        </Link>
        <Link href="/admin" className="home-card shade">
          <span className="pill">Hoy</span>
          <h2>Operación</h2>
          <p>Feed ≤5 s, presentes, correcciones y paquete.</p>
        </Link>
        <Link href="/people" className="home-card shade">
          <span className="pill">F01</span>
          <h2>Personas</h2>
          <p>Alta, traslado entre sedes y baja lógica.</p>
        </Link>
        <Link href="/reports" className="home-card shade">
          <span className="pill">R01–R05</span>
          <h2>Reportes</h2>
          <p>Tarde, ausente, omisión · CSV / XLSX / PDF.</p>
        </Link>
        <Link href="/settings" className="home-card shade">
          <span className="pill">S06</span>
          <h2>Ajustes</h2>
          <p>Roles, retención, alertas y región declarada.</p>
        </Link>
        <Link href="/ai" className="home-card shade">
          <span className="pill">IA v1.1</span>
          <h2>Pregunta</h2>
          <p>Briefing del día y chat acotado, con citas.</p>
        </Link>
      </div>
      <div className="detail">
        <p className="muted">
          Modelos {MODEL_BYTES.total}. PAD pasivo documentado en{" "}
          <code>docs/BIOMETRIA.md</code>. Completo en software vs. contractual:
          ver <code>docs/RFP_COMPLIANCE.md</code>.
        </p>
      </div>
    </AppShell>
  );
}
