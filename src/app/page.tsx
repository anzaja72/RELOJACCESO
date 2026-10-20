"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Camera,
  Clock,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/client-session";
import { MODEL_BYTES, TIMEZONE } from "@/lib/config";

type Module = {
  href: string;
  badge: string;
  title: string;
  text: string;
  icon: typeof Camera;
  note?: React.ReactNode;
  cta: string;
  primary?: boolean;
  tone?: "red" | "amber";
};

export default function HomePage() {
  const [online, setOnline] = useState(true);
  const [present, setPresent] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Personas con marcación hoy: solo si hay sesión; sin ella la tarjeta no muestra cifra.
  useEffect(() => {
    if (!getToken()) return;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
    void api
      .reports(new URLSearchParams({ day }).toString())
      .then((r) => setPresent(Number((r.totals as Record<string, number> | undefined)?.present ?? 0)))
      .catch(() => undefined);
  }, []);

  const modules: Module[] = [
    {
      href: "/kiosk?site=R01",
      badge: "Marcación",
      title: "Kiosco de Entrada / Salida",
      text: "Entrada, salida y respaldo PIN autorizado, con captura local y comparación biométrica en menos de 1 segundo.",
      icon: Camera,
      note: "Rostro o PIN de supervisor",
      cta: "Abrir Kiosco",
      primary: true,
      tone: "red",
    },
    {
      href: "/enroll",
      badge: "Alta",
      title: "Enrolar",
      text: "Muestras faciales, consentimiento de datos personales y auditoría visual de la captura.",
      icon: UserPlus,
      note: "Con consentimiento",
      cta: "Nuevo registro",
      tone: "amber",
    },
    {
      href: "/admin",
      badge: "Hoy",
      title: "Operación",
      text: "Feed en tiempo real, colaboradores presentes en turno, correcciones manuales y paquete de jornada.",
      icon: Clock,
      note: present === null ? "Marcaciones del día" : <><i className="dot" />{present} con marcación hoy</>,
      cta: "Ver monitor",
      tone: "amber",
    },
    {
      href: "/people",
      badge: "Personas",
      title: "Personas",
      text: "Alta de personal, traslados entre sedes y baja lógica manteniendo la trazabilidad.",
      icon: Users,
      note: "Alta, traslado y baja",
      cta: "Gestionar",
    },
    {
      href: "/reports",
      badge: "Reportes",
      title: "Reportes",
      text: "Tardanzas, ausentismo no justificado y omisión de salida, con horas extra y recargos. Exporta a CSV, XLSX y PDF.",
      icon: BarChart3,
      note: <span className="chips"><b>CSV</b><b>XLSX</b><b>PDF</b></span>,
      cta: "Exportar",
    },
    {
      href: "/settings",
      badge: "Ajustes",
      title: "Ajustes",
      text: "Roles de supervisor, retención de datos, alertas de descanso y política regional.",
      icon: Settings,
      note: "Seguridad por roles",
      cta: "Configurar",
    },
  ];

  return (
    <AppShell
      title="Bandeja"
      meta="Reloj CR · Oferta software v1 · RFP-BIO-2026-01"
      actions={
        <>
          <span className={`status-pill ${online ? "" : "off"}`}>
            <i className="dot" />
            {online ? "Sistema en línea" : "Sin conexión · la cola offline guarda las marcas"}
          </span>
          <Link href="/kiosk" className="cta-btn">
            <Camera className="size-4" />
            Marcar Asistencia
          </Link>
        </>
      }
    >
      <div className="home-wrap">
        <section className="hero">
          <div className="hero-chips">
            <span className="chip chip-ok"><i className="dot" />Matching facial local</span>
            <span className="chip">100 % en el navegador</span>
          </div>
          <h2>
            Asistencia biométrica, <em>100 % en navegador</em>
          </h2>
          <p>
            Tablet Android, Chromium en Raspberry Pi o laptop. Cola offline activa con ULID y API versionada. Sin
            drivers RFID ni huella USB: el respaldo para contingencia es el PIN de supervisor con bitácora inmutable.
          </p>
          <div className="hero-stats">
            <div>
              <small>Modelos de IA</small>
              <strong>{MODEL_BYTES.total} <span>caché local</span></strong>
            </div>
            <div>
              <small>Liveness test</small>
              <strong className="ok">PAD pasivo <span>ISO 30107-3</span></strong>
            </div>
            <div>
              <small>Modo respaldo</small>
              <strong>PIN con bitácora <span>supervisor</span></strong>
            </div>
          </div>
        </section>

        <div className="mod-head">
          <div>
            <small>MÓDULOS DEL SISTEMA</small>
            <h3>Operación de restaurante e inspección de turnos</h3>
          </div>
        </div>

        <div className="mod-grid">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href} className="mod-card">
                <div className="mod-top">
                  <span className={`mod-badge ${m.tone ?? ""}`}>{m.badge}</span>
                  <span className="mod-icon"><Icon className="size-4" /></span>
                </div>
                <h4>{m.title}</h4>
                <p>{m.text}</p>
                <div className="mod-foot">
                  <span className="mod-note">{m.note}</span>
                  <span className={m.primary ? "mod-cta primary" : "mod-cta"}>
                    {m.cta} <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mod-grid mod-grid-2">
          <Link href="/ai" className="mod-card ai-card">
            <div className="mod-top">
              <span className="mod-badge amber">IA v1.1</span>
              <span className="mod-icon"><Sparkles className="size-4" /></span>
            </div>
            <h4>IAnálisis · asistente operativo</h4>
            <p>
              Pregunte por atrasos, ausencias, horas extra o comparativos entre sedes y reciba un análisis con gráficos
              y citas a los registros. No aconseja sanciones.
            </p>
            <div className="mod-foot">
              <span className="mod-note">Briefing diario y consulta libre</span>
              <span className="mod-cta">Abrir IAnálisis <ArrowRight className="size-3.5" /></span>
            </div>
          </Link>
          <Link href="/structure" className="mod-card">
            <div className="mod-top">
              <span className="mod-badge">Estructura</span>
              <span className="mod-icon"><Building2 className="size-4" /></span>
            </div>
            <h4>Estructura</h4>
            <p>País, región y sede: personas y tablets de cada restaurante, solo de lo que su perfil puede ver.</p>
            <div className="mod-foot">
              <span className="mod-note">Alcance por perfil</span>
              <span className="mod-cta">Ver estructura <ArrowRight className="size-3.5" /></span>
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
