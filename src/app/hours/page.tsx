"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, downloadFile, stores } from "@/lib/api-client";
import { fmtHours, mondayOf } from "@/lib/planning";
import type { HoursRow } from "@/lib/stores";
import type { Employee, Site } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";
import { INCIDENT_LABEL } from "@/lib/workday";

const DAY = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** UI-09 control de horas · RF-15 vista consultiva de RR. HH. (no calcula nómina). */
export default function HoursPage() {
  const perms = usePermissions();
  const [week, setWeek] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState({ zone: "", site: "", employee: "", review: "" });
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [cutAt, setCutAt] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useCallback(
    (format?: string) =>
      new URLSearchParams({
        week,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        ...(format ? { format } : {}),
      }).toString(),
    [week, filters],
  );

  useEffect(() => {
    void stores
      .hours(qs())
      .then((r) => {
        setRows(r.rows);
        setCutAt(r.cutAt);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Inicie sesión"));
  }, [qs]);

  useEffect(() => {
    void Promise.all([stores.region(week), api.people(false)])
      .then(([region, people]) => {
        setZones(region.zones.map((z) => ({ id: z.id, name: z.name })));
        setSites(region.zones.flatMap((z) => z.cities.flatMap((c) => c.sites.map((s) => s.site))));
        setEmployees(people.employees);
      })
      .catch(() => undefined);
  }, [week]);

  const showSalary = perms.can("employee.salary_view");
  const total = (pick: (r: HoursRow) => number | null) => rows.reduce((sum, r) => sum + (pick(r) ?? 0), 0);

  async function download(format: "csv" | "xlsx") {
    try {
      await downloadFile(`/api/v1/hours?${qs(format)}`, `horas-${week}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar");
    }
  }

  return (
    <AppShell
      title="Control de horas"
      meta="Previsto (cronograma aprobado) vs. efectivo (marcaciones) · almuerzo excluido · sin liquidación automática"
      actions={
        <>
          <Button variant="outline" className="shade" onClick={() => void download("csv")}>CSV</Button>
          <Button variant="outline" className="shade" onClick={() => void download("xlsx")}>XLSX</Button>
        </>
      }
    >
      <div className="toolbar">
        <label>
          Semana (lunes)
          <Input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
        </label>
        <label>
          Zona
          <select className="native-select" value={filters.zone} onChange={(e) => setFilters({ ...filters, zone: e.target.value })}>
            <option value="">Todas</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        <label>
          Tienda
          <select className="native-select" value={filters.site} onChange={(e) => setFilters({ ...filters, site: e.target.value })}>
            <option value="">Todas</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.city} · {s.name}</option>)}
          </select>
        </label>
        <label>
          Empleado
          <select className="native-select" value={filters.employee} onChange={(e) => setFilters({ ...filters, employee: e.target.value })}>
            <option value="">Todos</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>
          Revisión
          <select className="native-select" value={filters.review} onChange={(e) => setFilters({ ...filters, review: e.target.value })}>
            <option value="">Todas</option>
            <option value="pendiente">Con pendientes</option>
            <option value="ok">Sin pendientes</option>
          </select>
        </label>
        {cutAt && <span className="muted" style={{ marginTop: 18 }}>Corte {cutAt.slice(0, 16).replace("T", " ")} UTC</span>}
      </div>
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      <div className="section">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tienda</th>
                <th>Tipo</th>
                {showSalary && <th className="num">Salario</th>}
                <th className="num">Referencia</th>
                <th className="num">Programadas</th>
                <th className="num">Trabajadas netas</th>
                <th className="num">Almuerzo excluido</th>
                <th className="num">Diferencia</th>
                <th className="num">Exceso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.employeeId}>
                  <tr className="clickable" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)}>
                    <td><strong>{r.employeeName}</strong><div className="muted" style={{ fontSize: 11.5 }}>{r.documentId ?? r.employeeCode} · {r.role}</div></td>
                    <td>{r.siteName}</td>
                    <td>{r.typeName ?? <span className="pill bad">sin tipo</span>}</td>
                    {showSalary && <td className="num">{r.salary == null ? "—" : r.salary.toLocaleString("es-CO")}</td>}
                    <td className="num">{r.referenceMin != null ? fmtHours(r.referenceMin) : r.minimumMin != null ? `mín. ${fmtHours(r.minimumMin)}` : "—"}</td>
                    <td className="num">{r.plannedMin == null ? <span className="muted">sin aprobado</span> : fmtHours(r.plannedMin)}</td>
                    <td className="num">{fmtHours(r.workedMin)}</td>
                    <td className="num">{fmtHours(r.lunchMin)}</td>
                    <td className="num">{fmtHours(r.diffMin)}</td>
                    <td className="num" style={{ color: r.excessMin ? "#b42318" : undefined }}>{r.excessMin ? fmtHours(r.excessMin) : "—"}</td>
                    <td>
                      <div className="tabs-row">
                        {r.excessNovelty && (
                          <Link className={`pill ${r.excessNovelty.status === "pendiente" ? "bad" : "ok"}`} href="/novelties?kind=exceso" onClick={(e) => e.stopPropagation()}>
                            exceso {r.excessNovelty.status}
                          </Link>
                        )}
                        {r.shortfallMin > 0 && <span className="pill warn">bajo mínimo {fmtHours(r.shortfallMin)}</span>}
                        {r.incidents > 0 && <span className="pill warn">{r.incidents} incidencias</span>}
                        {!r.pendingReview && <span className="pill ok">sin pendientes</span>}
                      </div>
                    </td>
                  </tr>
                  {open === r.employeeId && (
                    <tr>
                      <td colSpan={showSalary ? 11 : 10} style={{ background: "#fafafa" }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Día</th><th>Programado</th><th>Entrada</th><th>Sale almuerzo</th><th>Regresa</th><th>Salida</th>
                              <th className="num">Neto</th><th className="num">Almuerzo</th><th>Incidencias</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.days.map((d, i) => (
                              <tr key={d.date}>
                                <td>{DAY[i]} {d.date}</td>
                                <td>{d.plannedKind === "descanso" ? "Descanso" : d.plannedMin == null ? "—" : fmtHours(d.plannedMin)}</td>
                                <td>{d.workday?.firstIn ?? "—"}</td>
                                <td>{d.workday?.lunchOut ?? "—"}</td>
                                <td>{d.workday?.lunchIn ?? "—"}</td>
                                <td>{d.workday?.lastOut ?? "—"}</td>
                                <td className="num">{fmtHours(d.workday?.workedMin ?? null)}</td>
                                <td className="num">
                                  {d.workday?.lunchMin != null ? `${d.workday.lunchMin}′` : "—"}
                                  {d.workday?.lunchDiffMin ? ` (${d.workday.lunchDiffMin > 0 ? "+" : ""}${d.workday.lunchDiffMin}′)` : ""}
                                </td>
                                <td>
                                  {d.workday?.incidents.map((x) => (
                                    <span key={x} className="pill warn" style={{ marginRight: 4 }}>{INCIDENT_LABEL[x]}</span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {rows.length > 0 && (
                <tr>
                  <td colSpan={showSalary ? 5 : 4}><strong>Totales ({rows.length})</strong></td>
                  <td className="num">{fmtHours(total((r) => r.plannedMin))}</td>
                  <td className="num">{fmtHours(total((r) => r.workedMin))}</td>
                  <td className="num">{fmtHours(total((r) => r.lunchMin))}</td>
                  <td />
                  <td className="num">{fmtHours(total((r) => r.excessMin))}</td>
                  <td />
                </tr>
              )}
              {rows.length === 0 && <tr><td colSpan={11} className="muted">Sin datos en el filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Los excesos sobre la jornada de referencia se envían a revisión regional; no se clasifican como horas extra pagables ni se compensan automáticamente.
        </p>
      </div>
    </AppShell>
  );
}
