"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      })
      .catch(() => {
        setError("No se pudieron cargar las sedes");
        setLoading(false);
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
        setSelectedId((id) => id ?? data.punches[0]?.id ?? null);
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
  const selected = punches.find((p) => p.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return punches;
    return punches.filter((p) =>
      `${p.employeeName} ${p.employeeCode} ${p.type} ${p.decision}`.toLowerCase().includes(q),
    );
  }, [punches, query]);

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
    <AppShell
      title="Operación"
      meta={`${present} presentes · ${rows.length - present} ausentes · ${punches.length} marcaciones`}
      actions={
        <>
          <input
            className="search"
            placeholder="Buscar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <OfflineBadge online={online} queued={0} />
          {sites.length > 0 && (
            <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
          )}
          <Button className="shade" onClick={() => void exportCsv()}>
            Exportar CSV
          </Button>
        </>
      }
    >
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      <div className="split">
        <div className="split-list">
          {loading && <p className="empty">Cargando…</p>}
          {!loading &&
            filtered.map((punch) => (
              <button
                key={punch.id}
                type="button"
                className={`row shade ${selectedId === punch.id ? "active" : ""}`}
                onClick={() => setSelectedId(punch.id)}
              >
                <strong>
                  {punch.employeeName || "Desconocido"} ·{" "}
                  {punch.type === "IN" ? "Entrada" : "Salida"}
                </strong>
                <span>
                  {new Date(punch.capturedAt).toLocaleTimeString("es-CR")} ·{" "}
                  {punch.decision}
                </span>
                <div className="tags">
                  {punch.employeeCode ? <span className="pill">{punch.employeeCode}</span> : null}
                  {punch.offline ? <span className="pill">sync</span> : null}
                </div>
              </button>
            ))}
          {!loading && filtered.length === 0 && (
            <p className="empty">Sin marcaciones en esta sede.</p>
          )}
        </div>
        <div className="detail">
          {selected ? (
            <>
              <h2>{selected.employeeName || "Desconocido"}</h2>
              <p>
                {selected.type === "IN" ? "Entrada" : "Salida"} · {selected.decision}
              </p>
              <dl className="kv">
                <div>
                  <dt>Código</dt>
                  <dd>{selected.employeeCode || "—"}</dd>
                </div>
                <div>
                  <dt>Capturado</dt>
                  <dd>{new Date(selected.capturedAt).toLocaleString("es-CR")}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{selected.matchScore ?? "—"}</dd>
                </div>
                <div>
                  <dt>Terminal</dt>
                  <dd>{selected.terminalId}</dd>
                </div>
                <div>
                  <dt>ULID</dt>
                  <dd style={{ fontSize: 11 }}>{selected.id}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="empty">Seleccione una marcación.</p>
          )}
          <h2 style={{ marginTop: 28, fontSize: 14 }}>Plantilla</h2>
          {rows.map((row) => (
            <div key={row.employee.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{row.employee.name}</strong>
              <span>
                {row.employee.code} · {row.status === "present" ? "Presente" : "Ausente"}
              </span>
            </div>
          ))}
          <h2 style={{ marginTop: 20, fontSize: 14 }}>Terminales</h2>
          {terminals.length === 0 && <p className="muted">Ningún heartbeat aún.</p>}
          {terminals.map((t) => (
            <div key={t.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{t.label}</strong>
              <span>
                {t.online ? "En línea" : "Silencio"} ·{" "}
                {new Date(t.lastSeen).toLocaleTimeString("es-CR")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
