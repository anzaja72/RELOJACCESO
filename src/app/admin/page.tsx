"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { OfflineBadge } from "@/components/offline-badge";
import { SitePicker } from "@/components/site-picker";
import { Button } from "@/components/ui/button";
import { api, fetchAttendance } from "@/lib/api-client";
import { authHeaders } from "@/lib/client-session";
import type { AttendanceRow, Punch, Site, Terminal } from "@/lib/types";
import { LOCALE } from "@/lib/config";

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
  const [reason, setReason] = useState("");
  const [corrStatus, setCorrStatus] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Array<{
    id: string;
    kind: string;
    message: string;
    reviewed: boolean;
    punchIds: string[];
  }>>([]);

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
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    void api
      .scanAnomalies()
      .then(() => api.anomalies(new URLSearchParams({ site: siteId, reviewed: "0" }).toString()))
      .then((list) => setAnomalies(list.anomalies.filter((a) => !a.reviewed)))
      .catch(() => undefined);
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
    const res = await fetch(url, { headers: authHeaders() });
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
          <Button variant="outline" className="shade" onClick={() => { window.location.href = "/ai"; }}>
            Briefing / chat
          </Button>
          <Button
            variant="outline"
            className="shade"
            onClick={() => {
              void fetch(`/api/v1/exports/pack?format=zip`, { headers: authHeaders() })
                .then((r) => r.blob())
                .then((blob) => {
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = href;
                  a.download = "reloj-cr-salida.zip";
                  a.click();
                  URL.revokeObjectURL(href);
                });
            }}
          >
            Paquete salida
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
                  {new Date(punch.capturedAt).toLocaleTimeString(LOCALE)} ·{" "}
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
                  <dd>{new Date(selected.capturedAt).toLocaleString(LOCALE)}</dd>
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
                <div>
                  <dt>Método</dt>
                  <dd>{selected.method || "face"}</dd>
                </div>
                {selected.reason ? (
                  <div>
                    <dt>Motivo</dt>
                    <dd>{selected.reason}</dd>
                  </div>
                ) : null}
              </dl>
              <h2 style={{ marginTop: 20, fontSize: 14 }}>Corrección (F06)</h2>
              <p className="muted">Requiere motivo y aprobador. Queda inmutable en auditoría.</p>
              <div className="form" style={{ marginTop: 8 }}>
                <input
                  className="search"
                  placeholder="Motivo de la corrección"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  className="shade"
                  onClick={() => {
                    void api
                      .createCorrection({ punchId: selected.id, reason })
                      .then(() => {
                        setCorrStatus("Corrección registrada.");
                        setReason("");
                      })
                      .catch((err: unknown) => {
                        setCorrStatus(err instanceof Error ? err.message : "No se pudo corregir");
                      });
                  }}
                >
                  Registrar corrección
                </Button>
                {corrStatus && <p className="ok-text">{corrStatus}</p>}
              </div>
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
          <h2 style={{ marginTop: 20, fontSize: 14 }}>Anomalías (P3)</h2>
          {anomalies.length === 0 && <p className="muted">Sin anomalías abiertas en esta sede.</p>}
          {anomalies.map((a) => (
            <div key={a.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{a.kind}</strong>
              <span>{a.message}</span>
              {a.punchIds[0] ? <span>punch {a.punchIds[0]}</span> : null}
              <Button
                variant="outline"
                className="shade"
                style={{ marginTop: 8 }}
                onClick={() => {
                  void api.reviewAnomaly(a.id).then(() => {
                    setAnomalies((prev) => prev.filter((x) => x.id !== a.id));
                  });
                }}
              >
                Marcar revisada
              </Button>
            </div>
          ))}
          <h2 style={{ marginTop: 20, fontSize: 14 }}>Terminales</h2>
          {terminals.length === 0 && <p className="muted">Ningún heartbeat aún.</p>}
          {terminals.map((t) => (
            <div key={t.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{t.label}</strong>
              <span>
                {t.online ? "En línea" : "Silencio"} ·{" "}
                {new Date(t.lastSeen).toLocaleTimeString(LOCALE)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
