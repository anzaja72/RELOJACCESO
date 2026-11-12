"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stores } from "@/lib/api-client";
import { fmtHours, mondayOf, totalsByEmployee, type CellKind, type PlanCell } from "@/lib/planning";
import type { CellInput, Novelty, PlanView, PlannerEmployee } from "@/lib/stores";
import type { Site } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";

const DAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const STATUS_TONE: Record<string, string> = { aprobado: "ok", enviado: "warn", devuelto: "bad", borrador: "", sustituido: "" };
const NOVELTY_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  incapacidad: "Incapacidad",
  capacitacion: "Capacitación",
  licencia: "Licencia",
  retiro: "Retiro",
  cambio_tienda: "Cambio de tienda",
  otra: "Novedad",
  marcacion_no_autorizada: "Marcación no autorizada",
  cobertura_urgente: "Cobertura urgente",
  otra_urgente: "Urgente",
  horas_adicionales: "Horas adicionales",
};

const key = (employeeId: string, date: string) => `${employeeId}|${date}`;
const thisMonday = () => mondayOf(new Date().toISOString().slice(0, 10));

function cellText(cell: Pick<PlanCell, "kind" | "startHm" | "endHm" | "lunchMin"> | null) {
  if (!cell) return "—";
  if (cell.kind === "descanso") return "Descanso";
  if (cell.kind === "novedad") return "Novedad";
  return `${cell.startHm}–${cell.endHm}${cell.lunchMin ? ` · ${cell.lunchMin}′` : ""}`;
}

function noveltiesOn(novelties: Novelty[], employeeId: string, date: string) {
  return novelties.filter((n) => n.employeeId === employeeId && n.startDate <= date && n.endDate >= date);
}

function PlanGrid(props: {
  view: PlanView;
  cells: Map<string, PlanCell | null>;
  totals: Record<string, number>;
  editable: boolean;
  selected?: string | null;
  dirty?: Set<string>;
  onPick?: (employee: PlannerEmployee, date: string) => void;
}) {
  const { view, cells, totals } = props;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Empleado</th>
            {view.dates.map((d, i) => (
              <th key={d}>
                {DAY_LABEL[i]} {d.slice(8)}/{d.slice(5, 7)}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {view.employees.map((e) => {
            const total = totals[e.id] ?? 0;
            const over = e.weeklyHours != null && total > e.weeklyHours * 60;
            return (
              <tr key={e.id}>
                <td>
                  <strong style={{ fontSize: 13 }}>{e.name}</strong>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {e.typeName ?? "Sin tipo"}
                    {e.weeklyHours != null ? ` · ${e.weeklyHours} h` : e.minWeeklyHours != null ? ` · mín. ${e.minWeeklyHours} h` : ""}
                  </div>
                  <div className="tags" style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {e.isLead && <span className="pill on">Responsable</span>}
                    {e.guestFrom && <span className="pill warn">Desde {e.guestFrom.siteName}</span>}
                    {e.missing.length > 0 && <span className="pill bad">Ficha incompleta</span>}
                  </div>
                </td>
                {view.dates.map((date) => {
                  const k = key(e.id, date);
                  const cell = cells.has(k) ? cells.get(k)! : null;
                  const novs = noveltiesOn(view.novelties, e.id, date);
                  const away = e.awayDates.find((a) => a.date === date);
                  const outsideGuest = e.guestFrom && !e.guestFrom.dates.includes(date);
                  const disabled = !props.editable || Boolean(outsideGuest) || e.missing.length > 0;
                  const classes = [
                    "plan-cell",
                    cell?.kind ?? "",
                    novs.length || away ? "blocked" : "",
                    props.selected === k ? "selected" : "",
                    props.dirty?.has(k) ? "dirty" : "",
                  ].join(" ");
                  return (
                    <td key={date}>
                      <button type="button" className={classes} disabled={disabled} onClick={() => props.onPick?.(e, date)}>
                        {outsideGuest ? "Fuera de movilidad" : cellText(cell)}
                        {novs.map((n) => (
                          <small key={n.id}>{NOVELTY_LABEL[n.type] ?? n.type}</small>
                        ))}
                        {away && <small>En {away.siteName}</small>}
                      </button>
                    </td>
                  );
                })}
                <td className="num">
                  <strong style={{ color: over ? "#b42318" : undefined }}>{fmtHours(total)}</strong>
                </td>
              </tr>
            );
          })}
          {view.employees.length === 0 && (
            <tr>
              <td colSpan={9} className="muted">
                Sin empleados asignados a esta tienda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Findings({ view }: { view: PlanView }) {
  if (!view.coverage.length && !view.warnings.length && view.hoursConfirmed) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {view.coverage.length > 0 && (
        <div className="notice bad">
          <strong>Franjas sin gerente ni coordinador ({view.opensHm}–{view.closesHm})</strong>
          <ul>
            {view.coverage.slice(0, 10).map((g) => (
              <li key={`${g.date}-${g.fromHm}`}>
                {DAY_LABEL[view.dates.indexOf(g.date)]} {g.date}: {g.fromHm}–{g.toHm} · {view.site.name}
              </li>
            ))}
            {view.coverage.length > 10 && <li>… y {view.coverage.length - 10} más</li>}
          </ul>
        </div>
      )}
      {view.warnings.length > 0 && (
        <div className="notice warn">
          <strong>Advertencias</strong>
          <ul>
            {view.warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {!view.hoursConfirmed && (
        <div className="notice">
          Horario de apertura de {view.site.name} no confirmado: la cobertura se calcula con {view.opensHm}–{view.closesHm} por defecto.
        </div>
      )}
    </div>
  );
}

function SiteHours(props: { view: PlanView; onSaved: () => void; onError: (message: string) => void }) {
  const [opens, setOpens] = useState(props.view.opensHm);
  const [closes, setCloses] = useState(props.view.closesHm);
  return (
    <div className="toolbar" style={{ padding: 0, border: 0 }}>
      <label>
        Apertura
        <Input type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
      </label>
      <label>
        Cierre
        <Input type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
      </label>
      <Button
        variant="outline"
        className="shade"
        style={{ marginTop: 18 }}
        onClick={() =>
          void stores
            .setSiteHours(props.view.site.id, opens, closes)
            .then(props.onSaved)
            .catch((err: unknown) => props.onError(err instanceof Error ? err.message : "No se pudo guardar el horario"))
        }
      >
        Guardar horario de la tienda
      </Button>
    </div>
  );
}

function PlannerPage() {
  const search = useSearchParams();
  const router = useRouter();
  const perms = usePermissions();
  const [week, setWeek] = useState(() => mondayOf(search.get("week") || thisMonday()));
  const [siteId, setSiteId] = useState(search.get("site") || "");
  const [mode, setMode] = useState<"tienda" | "regional">(search.get("mode") === "regional" ? "regional" : "tienda");
  const [sites, setSites] = useState<Site[]>([]);
  const [view, setView] = useState<PlanView | null>(null);
  const [regionViews, setRegionViews] = useState<PlanView[]>([]);
  const [dirty, setDirty] = useState<Map<string, CellInput>>(new Map());
  const [selected, setSelected] = useState<{ employee: PlannerEmployee; date: string } | null>(null);
  const [form, setForm] = useState({ kind: "turno" as CellKind | "vacia", start: "07:00", end: "15:00", lunch: "30", note: "", wholeWeek: false });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void stores
      .region(week)
      .then((r) => {
        const list = r.zones.flatMap((z) => z.cities.flatMap((c) => c.sites.map((s) => s.site)));
        setSites(list);
        setSiteId((current) => current || list[0]?.id || "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Inicie sesión para planificar"));
  }, [week]);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (mode === "regional") {
        setRegionViews((await stores.regionPlans(week)).plans);
      } else if (siteId) {
        setView(await stores.plan(siteId, week));
      }
      setDirty(new Map());
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el cronograma");
    }
  }, [mode, siteId, week]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota; el setState ocurre tras await
    void load();
    const qs = new URLSearchParams({ week, ...(siteId ? { site: siteId } : {}), ...(mode === "regional" ? { mode } : {}) });
    router.replace(`/planner?${qs.toString()}`);
  }, [load, week, siteId, mode, router]);

  const savedCells = useMemo(() => {
    const map = new Map<string, PlanCell | null>();
    for (const c of view?.cells ?? []) map.set(key(c.employeeId, c.date), c);
    return map;
  }, [view]);

  const mergedCells = useMemo(() => {
    const map = new Map(savedCells);
    for (const [k, c] of dirty) map.set(k, c.kind ? (c as PlanCell) : null);
    return map;
  }, [savedCells, dirty]);

  const liveTotals = useMemo(
    () => totalsByEmployee([...mergedCells.values()].filter((c): c is PlanCell => Boolean(c))),
    [mergedCells],
  );

  const plan = view?.plan ?? null;
  const editable = Boolean(plan && (plan.status === "borrador" || plan.status === "devuelto") && perms.can("plan.edit"));

  function pick(employee: PlannerEmployee, date: string) {
    const current = mergedCells.get(key(employee.id, date));
    setSelected({ employee, date });
    setForm({
      kind: current?.kind ?? "turno",
      start: current?.startHm ?? "07:00",
      end: current?.endHm ?? "15:00",
      lunch: String(current?.lunchMin ?? 30),
      note: current?.note ?? "",
      wholeWeek: false,
    });
  }

  function applyCell() {
    if (!selected || !view) return;
    const dates = form.wholeWeek
      ? view.dates.slice(0, 6).filter((d) => !selected.employee.guestFrom || selected.employee.guestFrom.dates.includes(d))
      : [selected.date];
    const next = new Map(dirty);
    for (const date of dates) {
      next.set(key(selected.employee.id, date), {
        employeeId: selected.employee.id,
        date,
        kind: form.kind === "vacia" ? null : form.kind,
        startHm: form.kind === "turno" ? form.start : null,
        endHm: form.kind === "turno" ? form.end : null,
        lunchMin: form.kind === "turno" ? Number(form.lunch) || 0 : null,
        note: form.note || null,
      });
    }
    setDirty(next);
    setStatus(`${dates.length} celda(s) modificadas; pulse Guardar.`);
  }

  async function run(label: string, fn: () => Promise<PlanView>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await fn();
      setView(next);
      setDirty(new Map());
      setSelected(null);
      setComment("");
      setStatus(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operación rechazada");
    } finally {
      setBusy(false);
    }
  }

  const siteName = view?.site.name ?? sites.find((s) => s.id === siteId)?.name ?? "";

  return (
    <AppShell
      title="Planificador semanal"
      meta="Turnos, descansos y novedades por tienda · RF-04/05/06"
      actions={
        <div className="tabs-row">
          <button type="button" className={mode === "tienda" ? "on" : ""} onClick={() => setMode("tienda")}>
            Tienda
          </button>
          <button type="button" className={mode === "regional" ? "on" : ""} onClick={() => setMode("regional")}>
            Todas mis tiendas
          </button>
        </div>
      }
    >
      <div className="toolbar">
        <label>
          Semana (lunes)
          <Input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
        </label>
        {mode === "tienda" && (
          <label>
            Tienda
            <select className="native-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.city} · {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "tienda" && plan && (
          <span className={`pill ${STATUS_TONE[plan.status] ?? ""}`}>
            v{plan.version} · {plan.status}
          </span>
        )}
        {mode === "tienda" && view?.approved && view.approved.id !== plan?.id && (
          <span className="pill ok">Vigente: v{view.approved.version}</span>
        )}
      </div>
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      {status && <p className="ok-text" style={{ padding: "12px 22px" }}>{status}</p>}

      {mode === "regional" && (
        <div>
          {regionViews.map((v) => (
            <div key={v.site.id} className="section">
              <h3 style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="shade"
                  style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    setSiteId(v.site.id);
                    setMode("tienda");
                  }}
                >
                  {v.site.city} · {v.site.name}
                </button>
                {v.plan ? (
                  <span className={`pill ${STATUS_TONE[v.plan.status] ?? ""}`}>
                    v{v.plan.version} · {v.plan.status}
                  </span>
                ) : (
                  <span className="pill">sin cronograma</span>
                )}
                {v.coverage.length > 0 && <span className="pill bad">{v.coverage.length} franjas sin responsable</span>}
              </h3>
              <PlanGrid
                view={v}
                cells={new Map(v.cells.map((c) => [key(c.employeeId, c.date), c]))}
                totals={v.totals}
                editable={false}
              />
            </div>
          ))}
          {regionViews.length === 0 && <p className="empty">Sin tiendas en su alcance.</p>}
        </div>
      )}

      {mode === "tienda" && view && (
        <div>
          <div className="section" style={{ display: "grid", gap: 12 }}>
            {!plan && (
              <div className="notice">
                No hay cronograma para {siteName} en la semana del {week}.{" "}
                {perms.can("plan.edit") && (
                  <Button className="shade" disabled={busy} onClick={() => void run("Borrador creado.", () => stores.openPlan(view.site.id, week))}>
                    Crear cronograma
                  </Button>
                )}
              </div>
            )}
            {plan?.status === "devuelto" && plan.comment && (
              <div className="notice bad">
                Devuelto por {plan.decidedBy}: {plan.comment}
              </div>
            )}
            {plan?.changeReason && <div className="notice">Versión {plan.version} · motivo del cambio: {plan.changeReason}</div>}
            <Findings view={view} />
            {perms.can("access.manage") && (
              <SiteHours
                key={`${view.site.id}-${view.opensHm}-${view.closesHm}`}
                view={view}
                onSaved={() => void load()}
                onError={setError}
              />
            )}
          </div>

          <div className="section">
            <PlanGrid
              view={view}
              cells={mergedCells}
              totals={liveTotals}
              editable={editable}
              selected={selected ? key(selected.employee.id, selected.date) : null}
              dirty={new Set(dirty.keys())}
              onPick={pick}
            />
            {dirty.size > 0 && <p className="muted" style={{ marginTop: 8 }}>Totales provisionales: se recalculan al guardar.</p>}
          </div>

          {selected && editable && (
            <div className="section">
              <h3>
                {selected.employee.name} · {selected.date}
              </h3>
              <div className="toolbar" style={{ padding: 0, border: 0 }}>
                <label>
                  Tipo
                  <select className="native-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CellKind | "vacia" })}>
                    <option value="turno">Turno</option>
                    <option value="descanso">Descanso</option>
                    <option value="novedad">Novedad</option>
                    <option value="vacia">Vaciar</option>
                  </select>
                </label>
                {form.kind === "turno" && (
                  <>
                    <label>
                      Entrada
                      <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                    </label>
                    <label>
                      Salida
                      <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                    </label>
                    <label>
                      Almuerzo (min)
                      <Input type="number" min={0} max={180} value={form.lunch} onChange={(e) => setForm({ ...form, lunch: e.target.value })} />
                    </label>
                  </>
                )}
                <label style={{ minWidth: 200 }}>
                  Nota
                  <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
                  <input type="checkbox" checked={form.wholeWeek} onChange={(e) => setForm({ ...form, wholeWeek: e.target.checked })} />
                  Lunes a sábado
                </label>
                <Button className="shade" style={{ marginTop: 18 }} onClick={applyCell}>
                  Aplicar
                </Button>
              </div>
            </div>
          )}

          {plan && (
            <div className="section" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {editable && (
                <Button
                  className="shade"
                  disabled={busy || dirty.size === 0}
                  onClick={() => void run("Cambios guardados.", () => stores.saveCells(plan.id, [...dirty.values()]))}
                >
                  Guardar ({dirty.size})
                </Button>
              )}
              {editable && perms.can("plan.submit") && (
                <Button
                  variant="outline"
                  className="shade"
                  disabled={busy || dirty.size > 0}
                  title={dirty.size > 0 ? "Guarde antes de enviar" : undefined}
                  onClick={() => void run("Enviado al gerente de zona.", () => stores.planAction(plan.id, "submit"))}
                >
                  Enviar al gerente de zona
                </Button>
              )}
              {plan.status === "enviado" && perms.can("plan.decide") && (
                <>
                  <Input
                    style={{ maxWidth: 320 }}
                    placeholder="Observaciones (obligatorias al devolver)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <Button className="shade" disabled={busy} onClick={() => void run("Cronograma aprobado: es la versión vigente.", () => stores.planAction(plan.id, "approve", comment))}>
                    Aprobar
                  </Button>
                  <Button variant="outline" className="shade" disabled={busy} onClick={() => void run("Devuelto con observaciones.", () => stores.planAction(plan.id, "return", comment))}>
                    Devolver
                  </Button>
                </>
              )}
              {plan.status === "enviado" && !perms.can("plan.decide") && <span className="muted">En revisión del gerente de zona.</span>}
              {(plan.status === "aprobado" || plan.status === "sustituido") && perms.can("plan.edit") && (
                <>
                  <Input
                    style={{ maxWidth: 320 }}
                    placeholder="Justificación del cambio"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="shade"
                    disabled={busy}
                    onClick={() => void run("Nueva versión en borrador; la aprobada sigue vigente.", () => stores.openPlan(view.site.id, week, comment))}
                  >
                    Nueva versión
                  </Button>
                </>
              )}
              <span className="muted" style={{ marginLeft: "auto" }}>
                {view.versions.map((v) => `v${v.version} ${v.status}`).join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function Planner() {
  return (
    <Suspense fallback={<p className="empty">Cargando planificador…</p>}>
      <PlannerPage />
    </Suspense>
  );
}
