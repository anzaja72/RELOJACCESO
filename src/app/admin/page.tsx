"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Radio } from "lucide-react";
import { DemoBanner } from "@/components/demo-banner";
import { NavLinks } from "@/components/nav-links";
import { OfflineBadge } from "@/components/offline-badge";
import { SitePicker } from "@/components/site-picker";
import { Button } from "@/components/ui/button";
import { fetchAttendance } from "@/lib/api-client";
import { PUBLIC_API_KEY } from "@/lib/config";
import type { AttendanceRow, Punch, Site, Terminal } from "@/lib/types";

export default function AdminPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

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

  useEffect(() => {
    void fetch("/api/sites")
      .then((r) => r.json())
      .then((data: { sites: Site[] }) => {
        setSites(data.sites);
        if (data.sites[0]) setSiteId(data.sites[0].id);
      });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchAttendance(siteId);
        if (cancelled) return;
        setRows(data.rows);
        setPunches(data.punches);
        setTerminals(data.terminals.filter((t) => t.siteId === siteId || !siteId));
        setUpdatedAt(
          new Intl.DateTimeFormat("es-CR", {
            timeZone: "America/Costa_Rica",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date()),
        );
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar");
          setLoading(false);
        }
      }
    }
    void load();
    const id = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [siteId]);

  const present = rows.filter((r) => r.status === "present").length;
  const enrolled = rows.filter((r) => r.employee.enrolled).length;
  const siteTerminals = useMemo(
    () => terminals.filter((t) => !siteId || t.siteId === siteId),
    [terminals, siteId],
  );

  async function exportCsv() {
    const url = `/api/punches/export?site=${encodeURIComponent(siteId)}`;
    const res = await fetch(url, { headers: { "X-API-Key": PUBLIC_API_KEY } });
    if (!res.ok) {
      setError("Exportación no autorizada o fallida");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "marcaciones.csv";
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="paper-skin">
      <DemoBanner />
      <NavLinks />
      <main className="page-wrap">
        <header className="page-hero">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Operación de hoy</h1>
            <p>
              Feed en vivo (cada 3 s). Token demo en la exportación CSV.
              {updatedAt ? ` Actualizado ${updatedAt}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <OfflineBadge online={online} queued={0} />
            {sites.length > 0 && (
              <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
            )}
            <Button className="min-h-12" onClick={() => void exportCsv()}>
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>
        </header>

        {error && <p className="err-text">{error}</p>}
        {loading && <p className="muted">Cargando tablero…</p>}

        <section className="stat-grid">
          <article className="stat-card">
            <span>Presentes</span>
            <strong>{present}</strong>
          </article>
          <article className="stat-card">
            <span>Ausentes</span>
            <strong>{rows.length - present}</strong>
          </article>
          <article className="stat-card">
            <span>Enrolados</span>
            <strong>{enrolled}</strong>
          </article>
          <article className="stat-card">
            <span>Marcaciones</span>
            <strong>{punches.length}</strong>
          </article>
        </section>

        <div className="admin-grid">
          <section className="panel">
            <h2>Feed de marcaciones</h2>
            {punches.length === 0 ? (
              <p className="empty-state">
                Aún no hay marcaciones. Abra el kiosco, enrolé un rostro y
                pulse Entrada.
              </p>
            ) : (
              <ol className="feed">
                {punches.map((punch) => (
                  <li key={punch.id}>
                    <b className={punch.type === "IN" ? "in" : "out"}>
                      {punch.type === "IN" ? "Entrada" : "Salida"}
                    </b>
                    <span>
                      {punch.employeeName || "Desconocido"}{" "}
                      {punch.employeeCode ? `· ${punch.employeeCode}` : ""}
                    </span>
                    <small>
                      {new Date(punch.capturedAt).toLocaleTimeString("es-CR")} ·{" "}
                      {punch.decision}
                      {punch.offline ? " · sync" : ""}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2>Presentes / ausentes</h2>
            <ul className="people-list">
              {rows.map((row) => (
                <li key={row.employee.id}>
                  <div>
                    <strong>{row.employee.name}</strong>
                    <span>
                      {row.employee.code} · {row.employee.role}
                    </span>
                  </div>
                  <em className={row.status === "present" ? "ok-text" : "muted"}>
                    {row.status === "present" ? "Presente" : "Ausente"}
                  </em>
                </li>
              ))}
              {rows.length === 0 && !loading && (
                <li className="muted">Sin colaboradores en esta sede.</li>
              )}
            </ul>
          </section>
        </div>

        <section className="panel">
          <h2 className="flex items-center gap-2">
            <Radio className="size-4" />
            Terminales
          </h2>
          {siteTerminals.length === 0 ? (
            <p className="empty-state">
              Ningún kiosco ha enviado heartbeat. Abra /kiosk en una tablet o
              en el Pi.
            </p>
          ) : (
            <ul className="terminal-list">
              {siteTerminals.map((terminal) => (
                <li key={terminal.id}>
                  <span className={terminal.online ? "dot on" : "dot off"} />
                  <div>
                    <strong>{terminal.label}</strong>
                    <small>
                      {terminal.online ? "En línea" : "Silencio"} ·{" "}
                      {terminal.path} ·{" "}
                      {new Date(terminal.lastSeen).toLocaleTimeString("es-CR")}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
