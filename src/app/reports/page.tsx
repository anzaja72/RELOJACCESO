"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/client-session";
import { PUBLIC_API_KEY } from "@/lib/config";
import type { Employee, Site, Terminal } from "@/lib/types";

type Row = {
  employee: { id: string; name: string; code: string; siteId: string };
  status: string;
  lateMin: number;
};

type Country = { id: string; name: string; code: string };
type Zone = { id: string; name: string; country_id: string };

function ReportsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [countryId, setCountryId] = useState(search.get("country") || "");
  const [zoneId, setZoneId] = useState(search.get("zone") || "");
  const [siteId, setSiteId] = useState(search.get("site") || "");
  const [employeeId, setEmployeeId] = useState(search.get("employee") || "");
  const [day, setDay] = useState(
    search.get("day") ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()),
  );
  const [status, setStatus] = useState(search.get("status") || "");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [exReason, setExReason] = useState("");
  const [exType, setExType] = useState("justified");
  const [briefing, setBriefing] = useState<Array<{ text: string; href: string }>>([]);
  const [briefMeta, setBriefMeta] = useState<string | null>(null);

  const visibleZones = useMemo(
    () => zones.filter((z) => !countryId || z.country_id === countryId),
    [zones, countryId],
  );
  const visibleSites = useMemo(
    () =>
      sites.filter((s) => {
        if (countryId && s.countryId !== countryId) return false;
        if (zoneId && s.zoneId !== zoneId) return false;
        return true;
      }),
    [sites, countryId, zoneId],
  );

  function pushQuery(next: Record<string, string>) {
    const qs = new URLSearchParams();
    const merged = { country: countryId, zone: zoneId, site: siteId, employee: employeeId, day, status, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    router.replace(`/reports?${qs.toString()}`);
  }

  async function load() {
    try {
      const cat = await api.catalog();
      setSites(cat.sites);
      setCountries((cat.countries as Country[]) || []);
      setZones((cat.zones as Zone[]) || []);
      const people = await api.employees(siteId || undefined);
      setEmployees(people.employees);
      const qs = new URLSearchParams();
      if (countryId) qs.set("country", countryId);
      if (zoneId) qs.set("zone", zoneId);
      if (siteId) qs.set("site", siteId);
      if (employeeId) qs.set("employee", employeeId);
      if (day) qs.set("day", day);
      if (status) qs.set("status", status);
      const report = (await api.reports(qs.toString())) as {
        rows: Row[];
        totals: Record<string, number>;
        terminals: Terminal[];
      };
      setRows(report.rows || []);
      setTotals(report.totals || {});
      setTerminals(report.terminals || []);
      setSelected(report.rows?.[0] ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inicie sesión para ver reportes");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, zoneId, siteId, employeeId, day, status]);

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

  async function makeBriefing() {
    try {
      const res = await api.briefing(day, siteId || undefined);
      setBriefing(res.briefing.bullets);
      setBriefMeta(`${res.briefing.source} · ${res.llm.provider}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el briefing");
    }
  }

  return (
    <AppShell
      title="Reportes"
      meta={`Presentes ${totals.present ?? 0} · ausentes ${totals.absent ?? 0} · tardes ${totals.late ?? 0} · omisiones ${totals.omission ?? 0}`}
      actions={
        <>
          <select className="native-select" value={countryId} onChange={(e) => { setCountryId(e.target.value); setZoneId(""); pushQuery({ country: e.target.value, zone: "" }); }}>
            <option value="">País</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="native-select" value={zoneId} onChange={(e) => { setZoneId(e.target.value); pushQuery({ zone: e.target.value }); }}>
            <option value="">Zona</option>
            {visibleZones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
          <select className="native-select" value={siteId} onChange={(e) => { setSiteId(e.target.value); pushQuery({ site: e.target.value }); }}>
            <option value="">Sede</option>
            {visibleSites.map((s) => (
              <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
            ))}
          </select>
          <select className="native-select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); pushQuery({ employee: e.target.value }); }}>
            <option value="">Colaborador</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); pushQuery({ day: e.target.value }); }} />
          <select className="native-select" value={status} onChange={(e) => { setStatus(e.target.value); pushQuery({ status: e.target.value }); }}>
            <option value="">Estado</option>
            <option value="present">Presente</option>
            <option value="late">Tarde</option>
            <option value="absent">Ausente</option>
            <option value="early_out">Salida temprana</option>
            <option value="omission">Omisión</option>
          </select>
          <Button className="shade" onClick={() => void makeBriefing()}>Generar briefing del día</Button>
          <Button className="shade" onClick={() => void download("xlsx")}>XLSX</Button>
          <Button variant="outline" className="shade" onClick={() => void download("csv")}>CSV</Button>
          <Button variant="outline" className="shade" onClick={() => void download("pdf")}>PDF</Button>
        </>
      }
    >
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      {briefing.length > 0 && (
        <div className="detail" style={{ borderBottom: "1px solid #f0f0f0" }}>
          <h2>Briefing {briefMeta}</h2>
          <ol style={{ margin: "12px 0 0 18px", fontSize: 13.5, lineHeight: 1.5 }}>
            {briefing.map((b) => (
              <li key={b.text} style={{ marginBottom: 8 }}>
                {b.text}{" "}
                <a href={b.href} style={{ color: "#171717" }}>abrir</a>
              </li>
            ))}
          </ol>
        </div>
      )}
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
          <h2 style={{ marginTop: 28, fontSize: 14 }}>Terminales y sync</h2>
          {terminals.length === 0 && <p className="muted">Sin latidos en el filtro.</p>}
          {terminals.map((t) => (
            <div key={t.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{t.label}</strong>
              <span>
                {t.online ? "En línea" : "Silencio"} · {new Date(t.lastSeen).toLocaleTimeString("es-CR")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default function ReportsRoute() {
  return (
    <Suspense fallback={<AppShell title="Reportes" meta="Cargando filtros…"><p className="empty">Cargando…</p></AppShell>}>
      <ReportsPage />
    </Suspense>
  );
}
