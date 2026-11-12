"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, stores } from "@/lib/api-client";
import { fmtHours } from "@/lib/planning";
import type { Novelty } from "@/lib/stores";
import type { Employee, Site } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";

const TABS = [
  { id: "pendiente", label: "Pendientes", qs: { status: "pendiente" } },
  { id: "urgente", label: "Urgentes", qs: { kind: "urgente" } },
  { id: "exceso", label: "Horas adicionales", qs: { kind: "exceso" } },
  { id: "programada", label: "Programadas", qs: { kind: "programada" } },
  { id: "aprobada", label: "Aprobadas", qs: { status: "aprobada" } },
  { id: "rechazada", label: "Rechazadas", qs: { status: "rechazada" } },
  { id: "todas", label: "Todas", qs: {} },
] as const;

const LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  incapacidad: "Incapacidad",
  capacitacion: "Capacitación",
  licencia: "Licencia",
  retiro: "Renuncia / retiro",
  cambio_tienda: "Cambio temporal de tienda",
  otra: "Otra",
  marcacion_no_autorizada: "Marcación en tienda no autorizada",
  cobertura_urgente: "Cobertura urgente",
  otra_urgente: "Otra urgente",
  horas_adicionales: "Horas adicionales",
};
const STATUS_TONE: Record<string, string> = { pendiente: "bad", aprobada: "ok", rechazada: "", registrada: "" };

function NoveltiesPage() {
  const search = useSearchParams();
  const perms = usePermissions();
  const initialTab =
    TABS.find((t) => t.id === search.get("kind"))?.id ?? TABS.find((t) => t.id === search.get("status"))?.id ?? "pendiente";
  const [tab, setTab] = useState<string>(initialTab);
  const [rows, setRows] = useState<Novelty[]>([]);
  const [types, setTypes] = useState<{ programada: string[]; urgente: string[] }>({ programada: [], urgente: [] });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [selected, setSelected] = useState<Novelty | null>(null);
  const [comment, setComment] = useState("");
  const [form, setForm] = useState({ kind: "programada", type: "vacaciones", employeeId: "", startDate: "", endDate: "", note: "", evidence: "" });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const def = TABS.find((t) => t.id === tab) ?? TABS[0];
    const qs = new URLSearchParams({ ...def.qs, ...(siteFilter ? { site: siteFilter } : {}), ...(employeeFilter ? { employee: employeeFilter } : {}) });
    try {
      const res = await stores.novelties(qs.toString());
      setRows(res.novelties);
      setTypes(res.types);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inicie sesión para ver novedades");
    }
  }, [tab, siteFilter, employeeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota; el setState ocurre tras await
    void load();
  }, [load]);

  useEffect(() => {
    void Promise.all([api.people(false), stores.region(new Date().toISOString().slice(0, 10))])
      .then(([people, region]) => {
        setEmployees(people.employees);
        setSites(region.zones.flatMap((z) => z.cities.flatMap((c) => c.sites.map((s) => s.site))));
      })
      .catch(() => undefined);
  }, []);

  const names = useMemo(() => new Map(sites.map((s) => [s.id, `${s.city} · ${s.name}`])), [sites]);

  async function decide(decision: "aprobada" | "rechazada") {
    if (!selected) return;
    try {
      const res = await stores.decideNovelty(selected.id, decision, comment);
      setSelected(res.novelty);
      setComment("");
      setStatus(decision === "aprobada" ? "Aprobada. El registro original se conserva." : "Rechazada con comentario.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo decidir");
    }
  }

  async function create() {
    try {
      await stores.createNovelty({ ...form, endDate: form.endDate || form.startDate });
      setStatus(form.kind === "urgente" ? "Novedad urgente registrada: queda pendiente del regional." : "Novedad programada registrada: se verá en el cronograma.");
      setForm({ ...form, note: "", evidence: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    }
  }

  const typeOptions = form.kind === "urgente" ? types.urgente : types.programada;

  return (
    <AppShell
      title="Novedades"
      meta="Programadas, urgentes y horas adicionales · aprobación regional con trazabilidad"
      actions={
        <>
          <select className="native-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">Todas las tiendas</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.city} · {s.name}
              </option>
            ))}
          </select>
          <select className="native-select" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Todos los empleados</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="toolbar">
        <div className="tabs-row">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      {status && <p className="ok-text" style={{ padding: "12px 22px" }}>{status}</p>}
      <div className="split">
        <div className="split-list">
          {rows.map((n) => (
            <button key={n.id} type="button" className={`row shade ${selected?.id === n.id ? "active" : ""}`} onClick={() => setSelected(n)}>
              <strong>
                {n.employeeName ?? n.employeeId} · {LABEL[n.type] ?? n.type}
              </strong>
              <span>
                {n.startDate === n.endDate ? n.startDate : `${n.startDate} → ${n.endDate}`} · {names.get(n.siteId ?? "") ?? n.siteId}
              </span>
              <div className="tags">
                <span className={`pill ${n.kind === "urgente" ? "bad" : n.kind === "exceso" ? "warn" : ""}`}>{n.kind}</span>
                <span className={`pill ${STATUS_TONE[n.status] ?? ""}`}>{n.status}</span>
                {n.minutes != null && <span className="pill warn">+{fmtHours(n.minutes)} h</span>}
              </div>
            </button>
          ))}
          {rows.length === 0 && <p className="empty">Sin novedades en este filtro.</p>}
        </div>
        <div className="detail">
          {selected ? (
            <>
              <h2>{LABEL[selected.type] ?? selected.type}</h2>
              <dl className="kv">
                <div><dt>Empleado</dt><dd>{selected.employeeName}</dd></div>
                <div><dt>Tienda</dt><dd>{names.get(selected.siteId ?? "") ?? selected.siteId}</dd></div>
                <div><dt>Periodo</dt><dd>{selected.startDate} → {selected.endDate}</dd></div>
                {selected.minutes != null && <div><dt>Horas excedentes</dt><dd>{fmtHours(selected.minutes)}</dd></div>}
                <div><dt>Causa / observación</dt><dd>{selected.note ?? "—"}</dd></div>
                <div><dt>Evidencia</dt><dd>{selected.evidence ?? "—"}</dd></div>
                <div><dt>Registró</dt><dd>{selected.createdBy} · {selected.createdAt.slice(0, 16).replace("T", " ")}</dd></div>
                <div><dt>Estado</dt><dd>{selected.status}</dd></div>
                {selected.decidedBy && (
                  <div><dt>Decisión</dt><dd>{selected.decidedBy} · {selected.decidedAt?.slice(0, 16).replace("T", " ")} · {selected.decisionComment ?? ""}</dd></div>
                )}
              </dl>
              {selected.kind === "exceso" && (
                <p className="notice warn">La aprobación autoriza el tratamiento operativo; no liquida horas extra ni compensa días automáticamente.</p>
              )}
              {selected.status === "pendiente" && perms.can("novelty.decide") && (
                <div className="form" style={{ marginTop: 12 }}>
                  <Input placeholder="Comentario (obligatorio al rechazar)" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="flex gap-2">
                    <Button className="shade" onClick={() => void decide("aprobada")}>Aprobar</Button>
                    <Button variant="outline" className="shade" onClick={() => void decide("rechazada")}>Rechazar</Button>
                  </div>
                </div>
              )}
              <Button variant="outline" className="shade" style={{ marginTop: 12 }} onClick={() => setSelected(null)}>
                Registrar nueva
              </Button>
            </>
          ) : perms.can("novelty.create") ? (
            <>
              <h2>Registrar novedad</h2>
              <div className="form" style={{ marginTop: 12 }}>
                <select className="native-select" value={form.kind} onChange={(e) => {
                  const kind = e.target.value;
                  setForm({ ...form, kind, type: kind === "urgente" ? types.urgente[0] ?? "" : types.programada[0] ?? "" });
                }}>
                  <option value="programada">Programada (vacaciones, incapacidad…)</option>
                  <option value="urgente">Urgente (requiere aprobación regional)</option>
                </select>
                <select className="native-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>{LABEL[t] ?? t}</option>
                  ))}
                </select>
                <select className="native-select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">Empleado…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} · {e.code}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <Input placeholder={form.kind === "urgente" ? "Causa (obligatoria)" : "Observación"} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <Input placeholder="Evidencia disponible (referencia, número de incapacidad…)" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
                <Button className="shade" disabled={!form.employeeId || !form.startDate} onClick={() => void create()}>
                  Registrar
                </Button>
              </div>
            </>
          ) : (
            <p className="muted">Seleccione una novedad para ver su detalle.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function Novelties() {
  return (
    <Suspense fallback={<p className="empty">Cargando novedades…</p>}>
      <NoveltiesPage />
    </Suspense>
  );
}
