"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { authHeaders } from "@/lib/client-session";
import type { Employee, Site, Terminal } from "@/lib/types";
import { LOCALE, TIMEZONE } from "@/lib/config";

type Row = {
  employee: { id: string; name: string; code: string; siteId: string };
  status: string;
  lateMin: number;
};

type Country = { id: string; name: string; code: string };
type Zone = { id: string; name: string; country_id: string };

type Punct = {
  employee?: { id: string; name: string; code: string; siteId: string };
  siteId?: string;
  name?: string;
  presentDays: number;
  lateDays: number;
  avgLateMin: number;
} | null;

type Dash = {
  month: string;
  days: number;
  totals: { present: number; absent: number; late: number; earlyOut: number; omission: number };
  series: Array<{ day: string; present: number; absent: number; late: number; earlyOut: number; omission: number }>;
  kpis: { mostPunctual: Punct; leastPunctual: Punct; mostPunctualSite: Punct };
  payroll: Array<{
    employeeId: string;
    name: string;
    code: string;
    siteName: string;
    hasContract: boolean | null;
    currency: string;
    workedHours: number;
    ordinaryHours: number;
    extraDayHours: number;
    extraNightHours: number;
    extraHolidayHours: number;
    hourlyRate: number;
    ordinaryValue: number;
    extraDayValue: number;
    extraNightValue: number;
    extraHolidayValue: number;
    surchargeValue: number;
    absenceDays: number;
    absenceDiscount: number;
    totalValue: number;
  }>;
  params: {
    maxWeeklyHours: number;
    absenceThreshold: number;
    correctionWindowHours: number;
    multipliers: { day: number; night: number; holiday: number };
  };
};

// Colores con significado fijo (tarde = ámbar, ausente = rojo) y neutros que siguen el tema del cliente.
const DONUT_COLORS = ["var(--foreground)", "#f59e0b", "#e11d48", "var(--ink-4)", "#7c3aed"];
const PAGE = 8;

function num(n: number, digits = 0) {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

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
      new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date()),
  );
  const [status, setStatus] = useState(search.get("status") || "");
  const [month, setMonth] = useState(
    search.get("month") || new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date()).slice(0, 7),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [dash, setDash] = useState<Dash | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [exReason, setExReason] = useState("");
  const [exType, setExType] = useState("justified");
  const [briefing, setBriefing] = useState<Array<{ text: string; href: string }>>([]);
  const [briefMeta, setBriefMeta] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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
    const merged = { country: countryId, zone: zoneId, site: siteId, employee: employeeId, day, status, month, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    router.replace(`/reports?${qs.toString()}`);
  }

  function filterQs(withDay: boolean) {
    const qs = new URLSearchParams();
    if (countryId) qs.set("country", countryId);
    if (zoneId) qs.set("zone", zoneId);
    if (siteId) qs.set("site", siteId);
    if (employeeId) qs.set("employee", employeeId);
    if (withDay && day) qs.set("day", day);
    if (withDay && status) qs.set("status", status);
    return qs;
  }

  async function load() {
    try {
      const cat = await api.catalog();
      setSites(cat.sites);
      setCountries((cat.countries as Country[]) || []);
      setZones((cat.zones as Zone[]) || []);
      const people = await api.employees(siteId || undefined);
      setEmployees(people.employees);
      const report = (await api.reports(filterQs(true).toString())) as {
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

  async function loadDash() {
    try {
      const qs = filterQs(false);
      qs.set("month", month);
      const d = (await api.dashboard(qs.toString())) as Dash;
      setDash(d);
      setPage(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, zoneId, siteId, employeeId, day, status]);

  useEffect(() => {
    void loadDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, zoneId, siteId, employeeId, month]);

  async function download(format: string) {
    const headers = authHeaders();
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
    >
      <div className="filter-card">
        <div className="filter-grid">
          <label className="filter-field">
            <span>País</span>
            <select className="native-select" value={countryId} onChange={(e) => { setCountryId(e.target.value); setZoneId(""); pushQuery({ country: e.target.value, zone: "" }); }}>
              <option value="">Todos</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Zona</span>
            <select className="native-select" value={zoneId} onChange={(e) => { setZoneId(e.target.value); pushQuery({ zone: e.target.value }); }}>
              <option value="">Todas</option>
              {visibleZones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Sede</span>
            <select className="native-select" value={siteId} onChange={(e) => { setSiteId(e.target.value); pushQuery({ site: e.target.value }); }}>
              <option value="">Todas</option>
              {visibleSites.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Colaborador</span>
            <select className="native-select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); pushQuery({ employee: e.target.value }); }}>
              <option value="">Todos los colaboradores</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Día</span>
            <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); pushQuery({ day: e.target.value }); }} />
          </label>
          <label className="filter-field">
            <span>Mes del panel</span>
            <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); pushQuery({ month: e.target.value }); }} />
          </label>
        </div>
        <div className="filter-row">
          <label className="filter-field" style={{ minWidth: 180 }}>
            <span>Estado</span>
            <select className="native-select" value={status} onChange={(e) => { setStatus(e.target.value); pushQuery({ status: e.target.value }); }}>
              <option value="">Todos</option>
              <option value="present">Presente</option>
              <option value="late">Tarde</option>
              <option value="absent">Ausente</option>
              <option value="early_out">Salida temprana</option>
              <option value="omission">Omisión</option>
            </select>
          </label>
          <div className="filter-actions">
            <Button variant="outline" className="shade" onClick={() => void makeBriefing()}>Generar briefing del día</Button>
            <Button className="shade" onClick={() => void download("xlsx")}>XLSX</Button>
            <Button variant="outline" className="shade" onClick={() => void download("csv")}>CSV</Button>
            <Button variant="outline" className="shade" onClick={() => void download("pdf")}>PDF</Button>
          </div>
        </div>
      </div>
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      {briefing.length > 0 && (
        <div className="detail" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h2>Briefing {briefMeta}</h2>
          <ol style={{ margin: "12px 0 0 18px", fontSize: 13.5, lineHeight: 1.5 }}>
            {briefing.map((b) => (
              <li key={b.text} style={{ marginBottom: 8 }}>
                {b.text}{" "}
                <a href={b.href} style={{ color: "var(--foreground)" }}>abrir</a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {dash && (
        <div className="panel">
          <div className="panel-head">
            <h2>Panel {dash.month}</h2>
            <span className="muted">
              {dash.days} días · extras ×{dash.params.multipliers.day} diurna, ×{dash.params.multipliers.night} nocturna, ×
              {dash.params.multipliers.holiday} festiva · <strong>máx. {dash.params.maxWeeklyHours} h/semana</strong>
            </span>
          </div>

          <div className="kpi-row">
            {[
              ["Presentes", dash.totals.present, "var(--foreground)"],
              ["Ausentes", dash.totals.absent, "var(--foreground)"],
              ["Tardes", dash.totals.late, "#e11d48"],
              ["Omisiones", dash.totals.omission, "#7c3aed"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="kpi-card">
                <div className="kpi-label">{label}</div>
                <div className="kpi-value" style={{ color: String(color) }}>{num(Number(value))}</div>
              </div>
            ))}
            {[
              ["Trabajador más puntual", dash.kpis.mostPunctual ? dash.kpis.mostPunctual.employee?.name : null,
                dash.kpis.mostPunctual ? `${num(dash.kpis.mostPunctual.avgLateMin, 1)} min de atraso promedio` : "—", "#15803d"],
              ["Sede más puntual", dash.kpis.mostPunctualSite ? dash.kpis.mostPunctualSite.name : null,
                dash.kpis.mostPunctualSite ? `${num(dash.kpis.mostPunctualSite.avgLateMin, 1)} min de atraso promedio` : "—", "#15803d"],
              ["Trabajador menos puntual", dash.kpis.leastPunctual ? dash.kpis.leastPunctual.employee?.name : null,
                dash.kpis.leastPunctual ? `${num(dash.kpis.leastPunctual.avgLateMin, 1)} min de atraso promedio` : "—", "#b91c1c"],
            ].map(([label, name, sub, color]) => (
              <div key={String(label)} className="kpi-card kpi-person">
                <div className="kpi-name">{name ?? "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: String(color), marginTop: 3 }}>{sub}</div>
                <div className="kpi-label" style={{ marginTop: 10 }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <h3>Estados del mes</h3>
              <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Puntuales", value: Math.max(0, dash.totals.present - dash.totals.late) },
                        { name: "Tardes", value: dash.totals.late },
                        { name: "Ausentes", value: dash.totals.absent },
                        { name: "Salida temprana", value: dash.totals.earlyOut },
                        { name: "Omisiones", value: dash.totals.omission },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={1}
                      label={({ name, percent }) => ((percent ?? 0) >= 0.02 ? `${name} ${Math.round((percent ?? 0) * 100)}%` : "")}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Cell key={i} fill={DONUT_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <span>TOTAL</span>
                  <strong>
                    {num(dash.totals.present + dash.totals.absent + dash.totals.omission + dash.totals.earlyOut)}
                  </strong>
                </div>
              </div>
            </div>
            <div className="chart-card">
              <h3>Diario (puntuales / ausentes / tardes)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dash.series.map((s) => ({ ...s, dd: s.day.slice(8), onTime: Math.max(0, s.present - s.late) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dd" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                  <Tooltip />
                  <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="onTime" name="Puntual" stackId="a" fill="var(--foreground)" />
                  <Bar dataKey="absent" name="Ausente" stackId="a" fill="#e11d48" />
                  <Bar dataKey="late" name="Tarde" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="omission" name="Omisión" stackId="a" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="table-card">
            <h3>
              Horas y valores del mes · {dash.params.correctionWindowHours} h de plazo para correcciones · umbral de{" "}
              {dash.params.absenceThreshold} faltas
            </h3>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 10px" }}>
              Valor de los recargos y las horas extra según las marcaciones, menos las ausencias injustificadas. Se suma al sueldo base: no incluye seguridad social, incapacidades ni prestaciones, que liquida el sistema de nómina.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="pay-table">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Sede</th>
                    <th className="r">Trabajadas</th>
                    <th className="r">Ordinarias</th>
                    <th className="r">Extra diurna</th>
                    <th className="r">Extra noct.</th>
                    <th className="r">Extra fest.</th>
                    <th className="r">Valor hora</th>
                    <th className="r">Recargos y extras</th>
                    <th className="r">Ausencias</th>
                    <th className="r">A pagar adicional</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.payroll.slice(page * PAGE, page * PAGE + PAGE).map((p) => (
                    <tr key={p.employeeId}>
                      <td style={{ fontWeight: 600 }}>
                        {p.name}
                        {p.hasContract === false && <span className="pill warn" style={{ marginLeft: 6 }}>sin contrato</span>}
                      </td>
                      <td className="soft">{p.siteName}</td>
                      <td className="r">{num(p.workedHours, 1)} h</td>
                      <td className="r">{num(p.ordinaryHours, 1)} h</td>
                      <td className="r" style={{ color: p.extraDayHours > 0 ? "#e11d48" : undefined }}>{num(p.extraDayHours, 1)} h</td>
                      <td className="r" style={{ color: p.extraNightHours > 0 ? "#7c3aed" : undefined }}>{num(p.extraNightHours, 1)} h</td>
                      <td className="r" style={{ color: p.extraHolidayHours > 0 ? "#e11d48" : undefined }}>{num(p.extraHolidayHours, 1)} h</td>
                      <td className="r">{p.hasContract ? `$${num(p.hourlyRate)}` : "—"}</td>
                      <td className="r">
                        {p.hasContract ? `$${num(p.surchargeValue + p.extraDayValue + p.extraNightValue + p.extraHolidayValue)}` : "—"}
                      </td>
                      <td className="r">
                        {p.hasContract ? (p.absenceDays > 0 ? `−$${num(p.absenceDiscount)} (${p.absenceDays} d)` : "—") : "—"}
                      </td>
                      <td className="r" style={{ fontWeight: 600 }}>{p.hasContract ? `$${num(p.totalValue)}` : "—"}</td>
                    </tr>
                  ))}
                  {dash.payroll.length === 0 && (
                    <tr>
                      <td colSpan={11} className="empty" style={{ textAlign: "center" }}>
                        Sin colaboradores en el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {dash.payroll.length > 0 && (
              <div className="pager">
                <span className="muted">
                  Mostrando {Math.min(PAGE, dash.payroll.length - page * PAGE)} de {dash.payroll.length} colaboradores
                  {siteId ? ` en ${sites.find((x) => x.id === siteId)?.name ?? "la sede"}` : ""}
                </span>
                <div className="pager-nav">
                  <Button variant="outline" className="shade" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
                    Anterior
                  </Button>
                  <strong>
                    Página {page + 1} de {Math.max(1, Math.ceil(dash.payroll.length / PAGE))}
                  </strong>
                  <Button
                    variant="outline"
                    className="shade"
                    disabled={(page + 1) * PAGE >= dash.payroll.length}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
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
                {t.online ? "En línea" : "Silencio"} · {new Date(t.lastSeen).toLocaleTimeString(LOCALE)}
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
