import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MODEL_BYTES } from "@/lib/config";

export default function HomePage() {
  return (
    <AppShell title="Bandeja" meta="RFP-BIO-2026-01 · Costa Rica">
      <div className="detail" style={{ maxWidth: 560 }}>
        <h2>Reloj de personal, en el navegador.</h2>
        <p>
          La misma URL en tablet Android, Chromium en Raspberry Pi o laptop.
          Matching facial local, cola offline con ULID, sin Electron ni SDK USB.
        </p>
      </div>
      <div className="home-grid">
        <Link href="/kiosk?site=R01" className="home-card shade">
          <span className="pill">Marcación</span>
          <h2>Kiosco</h2>
          <p>Entrada y salida con cámara. Cruce en el cliente.</p>
        </Link>
        <Link href="/enroll" className="home-card shade">
          <span className="pill">Alta</span>
          <h2>Enrolar</h2>
          <p>2–3 muestras, consentimiento, sin guardar fotos.</p>
        </Link>
        <Link href="/admin" className="home-card shade">
          <span className="pill">Hoy</span>
          <h2>Operación</h2>
          <p>Feed, presentes, terminales y CSV.</p>
        </Link>
      </div>
      <div className="detail">
        <p className="muted">
          Modelos {MODEL_BYTES.total}. Liveness heurística. Plantillas sin E2EE
          de producción. Offline: DevTools → Network → Offline → marcar.
        </p>
      </div>
    </AppShell>
  );
}
