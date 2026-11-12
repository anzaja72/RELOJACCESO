"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, stores } from "@/lib/api-client";
import type { StoreAccess } from "@/lib/stores";
import type { Employee, Site } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";

const today = () => new Date().toISOString().slice(0, 10);

function vigente(row: StoreAccess) {
  const d = today();
  return !row.revokedAt && (!row.startDate || row.startDate <= d) && (!row.endDate || row.endDate >= d);
}

/** UI-06 tiendas habilitadas para el biométrico · UI-07 movilidad entre sedes. */
export default function AccessPage() {
  const perms = usePermissions();
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [access, setAccess] = useState<StoreAccess[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState("");
  const [mob, setMob] = useState({ employeeId: "", toSiteId: "", startDate: today(), endDate: today(), reason: "cobertura", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [region, people, rows, mobility] = await Promise.all([
        stores.region(today()),
        api.people(false),
        stores.access(true),
        stores.mobility(),
      ]);
      setSites(region.zones.flatMap((z) => z.cities.flatMap((c) => c.sites.map((s) => s.site))));
      setEmployees(people.employees);
      setAccess(rows.access);
      setReasons(mobility.reasons);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inicie sesión como gerente regional");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota; el setState ocurre tras await
    void load();
  }, [load]);

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const visible = employees.filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(query.toLowerCase()));
  const canManage = perms.can("access.manage");

  async function toggle(employee: Employee, site: Site, enabled: boolean) {
    setError(null);
    try {
      await stores.setAccess({ employeeId: employee.id, siteId: site.id, enabled, endDate: enabled && until ? until : null });
      setStatus(`${employee.name}: ${enabled ? "habilitado" : "deshabilitado"} en ${site.name}${enabled && until ? ` hasta ${until}` : ""}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el permiso");
    }
  }

  async function createMobility() {
    setError(null);
    try {
      const res = await stores.createMobility(mob);
      setStatus(`Movilidad autorizada${res.mobility.interCity ? " (entre ciudades)" : ""}: se refleja en el cronograma y el biométrico del destino.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autorizar");
    }
  }

  async function revoke(row: StoreAccess) {
    try {
      await stores.revokeAccess(row.id);
      setStatus("Autorización revocada; queda en el historial.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar");
    }
  }

  const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  return (
    <AppShell
      title="Accesos y movilidad"
      meta="Tiendas donde cada empleado puede marcar · traslados temporales con trazabilidad"
      actions={<input className="search" placeholder="Buscar empleado" value={query} onChange={(e) => setQuery(e.target.value)} />}
    >
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      {status && <p className="ok-text" style={{ padding: "12px 22px" }}>{status}</p>}

      <div className="section">
        <h3>Tiendas habilitadas para el biométrico</h3>
        <div className="toolbar" style={{ padding: "0 0 12px", border: 0 }}>
          <label>
            Vigencia de nuevas autorizaciones
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <span className="muted" style={{ marginTop: 18 }}>{until ? `Temporal hasta ${until}` : "Vacío = permanente"}</span>
          {!canManage && <span className="pill warn" style={{ marginTop: 18 }}>Solo consulta: lo gestiona el gerente regional</span>}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                {sites.map((s) => (
                  <th key={s.id} className="check-cell">{s.city}<br />{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong style={{ fontSize: 13 }}>{e.name}</strong>
                    <div className="muted" style={{ fontSize: 11.5 }}>{e.code} · base {siteName.get(e.siteId) ?? e.siteId}</div>
                  </td>
                  {sites.map((s) => {
                    if (s.id === e.siteId) return <td key={s.id} className="check-cell"><span className="pill on">Base</span></td>;
                    const rows = access.filter((r) => r.employeeId === e.id && r.siteId === s.id && vigente(r));
                    const direct = rows.find((r) => r.kind !== "movilidad");
                    const mobility = rows.find((r) => r.kind === "movilidad");
                    return (
                      <td key={s.id} className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={`${e.name} en ${s.name}`}
                          checked={Boolean(direct)}
                          disabled={!canManage}
                          onChange={(ev) => void toggle(e, s, ev.target.checked)}
                        />
                        {direct?.endDate && <div className="muted" style={{ fontSize: 11 }}>hasta {direct.endDate}</div>}
                        {mobility && <div className="muted" style={{ fontSize: 11 }}>movilidad</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {perms.can("mobility.manage") && (
        <div className="section">
          <h3>Autorizar movilidad</h3>
          <div className="toolbar" style={{ padding: 0, border: 0 }}>
            <label>
              Empleado
              <select className="native-select" value={mob.employeeId} onChange={(e) => setMob({ ...mob, employeeId: e.target.value })}>
                <option value="">Seleccione…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · base {siteName.get(e.siteId) ?? e.siteId}</option>
                ))}
              </select>
            </label>
            <label>
              Tienda destino
              <select className="native-select" value={mob.toSiteId} onChange={(e) => setMob({ ...mob, toSiteId: e.target.value })}>
                <option value="">Seleccione…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.city} · {s.name}</option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <Input type="date" value={mob.startDate} onChange={(e) => setMob({ ...mob, startDate: e.target.value })} />
            </label>
            <label>
              Hasta
              <Input type="date" value={mob.endDate} onChange={(e) => setMob({ ...mob, endDate: e.target.value })} />
            </label>
            <label>
              Motivo
              <select className="native-select" value={mob.reason} onChange={(e) => setMob({ ...mob, reason: e.target.value })}>
                {reasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label style={{ minWidth: 200 }}>
              Detalle
              <Input value={mob.note} onChange={(e) => setMob({ ...mob, note: e.target.value })} />
            </label>
            <Button className="shade" style={{ marginTop: 18 }} disabled={!mob.employeeId || !mob.toSiteId} onClick={() => void createMobility()}>
              Autorizar
            </Button>
          </div>
        </div>
      )}

      <div className="section">
        <h3>Historial de autorizaciones</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tipo</th>
                <th>Origen → destino</th>
                <th>Periodo</th>
                <th>Motivo</th>
                <th>Autorizó</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {access.map((r) => (
                <tr key={r.id}>
                  <td>{empName(r.employeeId)}</td>
                  <td>{r.kind}</td>
                  <td>{r.fromSiteId ? `${siteName.get(r.fromSiteId) ?? r.fromSiteId} → ` : ""}{siteName.get(r.siteId) ?? r.siteId}</td>
                  <td>{r.startDate ?? "—"} → {r.endDate ?? "sin fin"}</td>
                  <td>{r.reason ?? "—"}</td>
                  <td>{r.authorizedBy} · {r.createdAt.slice(0, 10)}</td>
                  <td>
                    {r.revokedAt ? (
                      <span className="pill">revocada {r.revokedAt.slice(0, 10)} · {r.revokedBy}</span>
                    ) : vigente(r) ? (
                      <span className="pill ok">vigente</span>
                    ) : (
                      <span className="pill">fuera de periodo</span>
                    )}
                  </td>
                  <td>
                    {!r.revokedAt && perms.can(r.kind === "movilidad" ? "mobility.manage" : "access.manage") && (
                      <Button variant="outline" className="shade" onClick={() => void revoke(r)}>Revocar</Button>
                    )}
                  </td>
                </tr>
              ))}
              {access.length === 0 && (
                <tr><td colSpan={8} className="muted">Sin autorizaciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
