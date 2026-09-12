import Link from "next/link";
import { Camera, LayoutDashboard, UserPlus, WifiOff } from "lucide-react";
import { DemoBanner } from "@/components/demo-banner";
import { NavLinks } from "@/components/nav-links";
import { APP, MODEL_BYTES } from "@/lib/config";

export default function HomePage() {
  return (
    <div className="paper-skin">
      <DemoBanner />
      <NavLinks />
      <main className="page-wrap landing">
        <section className="landing-hero">
          <p className="eyebrow">{APP.rfp} · Costa Rica</p>
          <h1>
            Reloj de personal para restaurantes, en el navegador.
          </h1>
          <p className="lede">
            Kiosco de marcación facial + enrolamiento + dashboard. La misma URL
            corre en tablet Android (Chrome), Raspberry Pi (Chromium) o laptop.
            Sin Electron, sin SDK USB, sin MQTT.
          </p>
        </section>

        <section className="launch-grid">
          <Link href="/kiosk?site=R01" className="launch-card">
            <Camera className="size-8" />
            <h2>Kiosco</h2>
            <p>Entrada / Salida con cámara y cruce local de plantillas.</p>
          </Link>
          <Link href="/enroll" className="launch-card">
            <UserPlus className="size-8" />
            <h2>Enrolar</h2>
            <p>2–3 muestras, consentimiento y descriptores en SQLite.</p>
          </Link>
          <Link href="/admin" className="launch-card">
            <LayoutDashboard className="size-8" />
            <h2>Dashboard</h2>
            <p>Feed en vivo, presentes de hoy, terminales y CSV.</p>
          </Link>
        </section>
        <p className="muted mb-4">
          Contrato: <Link href="/docs">rutas REST</Link> ·{" "}
          <Link href="/openapi.yaml">openapi.yaml</Link>
        </p>

        <section className="panel facts">
          <div>
            <h2>Cómo probar el offline</h2>
            <ol>
              <li>Enrolé un rostro en /enroll.</li>
              <li>Marque Entrada en /kiosk.</li>
              <li>
                En DevTools → Network, active Offline y marque de nuevo. Verá
                la cola IndexedDB y el distintivo «Sin red».
              </li>
              <li>
                Reactivar la red: las ULID se sincronizan sin duplicar.
              </li>
            </ol>
          </div>
          <div>
            <h2>Límites del DEMO</h2>
            <ul>
              <li>
                <WifiOff className="size-4" /> La «liveness» es heurística, no
                PAD de producción.
              </li>
              <li>Plantillas sin E2EE de grado productivo.</li>
              <li>Modelos faciales en el cliente: {MODEL_BYTES.total}.</li>
              <li>Token demo visible. No hay nómina ni RFID.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
