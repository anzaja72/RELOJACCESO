"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SitePicker } from "@/components/site-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/client-session";
import { PUBLIC_API_KEY } from "@/lib/config";
import type { Site } from "@/lib/types";

type Row = {
  employee: { id: string; name: string; code: string; siteId: string };
  status: string;
  lateMin: number;
};

export default function ReportsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [day, setDay] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()),
  );
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [exReason, setExReason] = useState("");
  const [exType, setExType] = useState("justified");

  async function load() {
    try {
      const sitesRes = await api.sites();
      setSites(sitesRes.sites);
      const sid = siteId || sitesRes.sites[0]?.id || "";
      if (!siteId && sid) setSiteId(sid);
      const qs = new URLSearchParams();
      if (sid) qs.set("site", sid);
      if (day) qs.set("day", day);
      if (status) qs.set("status", status);
      const report = (await api.reports(qs.toString())) as {
        rows: Row[];
        totals: Record<string, number>;
      };
      setRows(report.rows || []);
      setTotals(report.totals || {});
      setSelected(report.rows?.[0] ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inicie sesión para ver reportes");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, day, status]);

  async function download(format: string) {
    const token = getToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : { "X-API-Key": PUBLIC_API_KEY };
    const res = await fetch(`/api/v1/exports/pack?format=${format}&site=${encodeURIComponent(siteId)}`, {
      headers,
    });
    if (!res.ok) {
      setError("Exportación no autorizada");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `reloj-cr.${format === "json" ? "json" : format}`;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function addException() {
    if (!selected || !exReason.trim()) return;
    try {
      await api.createException({
        employeeId: selected.employee.id,
        date: day,
        type: exType,
        reason: exReason.trim(),
      });
      setExReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la excepción");
    }
  }

  return (
    <AppShell
      title="Reportes"
      meta={`Presentes ${totals.present ?? 0} · ausentes ${totals.absent ?? 0} · tardes ${totals.late ?? 0}`}
      actions={
        <>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <select className="native-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="present">Presente</option>
            <option value="late">Tarde</option>
            <option value="absent">Ausente</option>
            <option value="early_out">Salida temprana</option>
            <option value="omission">Omisión</option>
          </select>
          {sites.length > 0 && <SitePicker sites={sites} value={siteId} onChange={setSiteId} />}
          <Button className="shade" onClick={() => void download("xlsx")}>XLSX</Button>
          <Button variant="outline" className="shade" onClick={() => void download("csv")}>CSV</Button>
          <Button variant="outline" className="shade" onClick={() => void download("pdf")}>PDF</Button>
          <Button variant="outline" className="shade" onClick={() => void download("zip")}>Paquete</Button>
        </>
      }
    >
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      <div className="split">
        <div className="split-list">
          {rows.map((row) => (
            <button
              key={row.employee.id}
              type="button"
              className={`row shade ${selected?.employee.id === row.employee.id ? "active" : ""}`}
              onClick={() => setSelected(row)}
            >
              <strong>{row.employee.name}</strong>
              <span>
                {row.employee.code} · {row.status}
                {row.lateMin ? ` · ${row.lateMin} min` : ""}
              </span>
            </button>
          ))}
          {rows.length === 0 && <p className="empty">Sin novedades para el filtro.</p>}
        </div>
        <div className="detail">
          {selected ? (
            <>
              <h2>{selected.employee.name}</h2>
              <p>
                {selected.status} · {selected.employee.code}
              </p>
              <h2 style={{ marginTop: 24, fontSize: 14 }}>Excepción del día</h2>
              <p className="muted">Franco, cambio de turno o justificación. Queda en bitácora.</p>
              <div className="form" style={{ marginTop: 12 }}>
                <select className="native-select" value={exType} onChange={(e) => setExType(e.target.value)}>
                  <option value="justified">Justificado</option>
                  <option value="off">Franco / no labora</option>
                  <option value="shift_change">Cambio de turno</option>
                </select>
                <Input value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="Motivo" />
                <Button className="shade" onClick={() => void addException()}>
                  Registrar excepción
                </Button>
              </div>
            </>
          ) : (
            <p className="empty">Seleccione una fila.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
