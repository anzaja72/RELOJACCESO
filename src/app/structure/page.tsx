"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { getSessionUser } from "@/lib/client-session";
import { useSessionRole } from "@/lib/use-session";
import { ROLE_LABEL, scopeLabel, type CountryRow, type ZoneRow } from "@/lib/scope-label";
import type { Employee, Site, Terminal } from "@/lib/types";

type Data = {
  sites: Site[];
  zones: ZoneRow[];
  countries: CountryRow[];
  employees: Employee[];
  terminals: Terminal[];
};

// País → región → sede → tablets, solo con lo que el usuario puede ver. El superadmin también
// crea y edita regiones y sedes; los gerentes pueden revocar las tablets de su alcance.
export default function StructurePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const role = useSessionRole();
  const [zoneForm, setZoneForm] = useState({ name: "", countryId: "" });
  const [siteForm, setSiteForm] = useState({ code: "", name: "", city: "", zoneId: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; city: string; zoneId: string } | null>(null);

  const isSuper = role === "superadmin";
  const isApprover = isSuper || role === "zone_manager" || role === "site_manager";

  const load = useCallback(async () => {
    try {
      const [s, p, t] = await Promise.all([api.mySites(), api.people(false), api.terminals()]);
      setData({ ...s, employees: p.employees, terminals: t.terminals });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setStatus(null);
    try {
      await action();
      setStatus(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción");
    }
  }

  const user = typeof window === "undefined" ? null : getSessionUser();
  const countOf = (siteId: string) => data?.employees.filter((e) => e.siteId === siteId).length ?? 0;
  const tabletsOf = (siteId: string) => data?.terminals.filter((t) => t.siteId === siteId) ?? [];

  return (
    <AppShell title="Estructura" meta="Países, regiones, sedes y tablets que usted puede ver">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      {status && <p className="ok-text" style={{ padding: "8px 22px" }}>{status}</p>}
      <div className="split">
        <div className="split-list">
          {data?.countries
            .filter((c) => data.zones.some((z) => z.country_id === c.id && (isSuper || data.sites.some((s) => s.zoneId === z.id))))
            .map((country) => (
              <div key={country.id}>
                <p className="row" style={{ fontWeight: 600 }}>{country.name}</p>
                {data.zones
                  .filter((z) => z.country_id === country.id)
                  .map((zone) => {
                    const sites = data.sites.filter((s) => s.zoneId === zone.id);
                    if (!sites.length && !isSuper) return null;
                    return (
                      <div key={zone.id} style={{ marginLeft: 16 }}>
                        <p className="row">
                          <strong>Región · {zone.name}</strong>
                          <span>{sites.length} {sites.length === 1 ? "sede" : "sedes"}</span>
                        </p>
                        {sites.map((site) => {
                          const tablets = tabletsOf(site.id);
                          const online = tablets.filter((t) => t.online).length;
                          const isEditing = editing?.id === site.id;
                          return (
                            <div key={site.id} className="row" style={{ marginLeft: 16 }}>
                              <strong>{site.code} · {site.name}</strong>
                              <span>
                                {site.city} · {countOf(site.id)} personas · {tablets.length} tablets ({online} en línea)
                              </span>
                              {tablets.map((t) => (
                                <span key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                                  <span>
                                    {t.online ? "● " : "○ "}
                                    {t.label || t.id}
                                  </span>
                                  {isApprover && (
                                    <button
                                      type="button"
                                      className="native-select shade"
                                      onClick={() => void run(() => api.revokeTerminal(t.id), `Tablet ${t.label || t.id} revocada.`)}
                                    >
                                      Revocar
                                    </button>
                                  )}
                                </span>
                              ))}
                              {isSuper && !isEditing && (
                                <button
                                  type="button"
                                  className="native-select shade"
                                  style={{ marginTop: 6 }}
                                  onClick={() =>
                                    setEditing({ id: site.id, name: site.name, city: site.city, zoneId: site.zoneId ?? "" })
                                  }
                                >
                                  Editar sede
                                </button>
                              )}
                              {isEditing && editing && (
                                <div className="form" style={{ marginTop: 8 }}>
                                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nombre de la sede" />
                                  <Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} aria-label="Ciudad" />
                                  <select
                                    className="native-select"
                                    value={editing.zoneId}
                                    onChange={(e) => setEditing({ ...editing, zoneId: e.target.value })}
                                    aria-label="Región"
                                  >
                                    {data.zones.map((z) => (
                                      <option key={z.id} value={z.id}>{z.name}</option>
                                    ))}
                                  </select>
                                  <div className="flex gap-2">
                                    <Button
                                      className="shade"
                                      onClick={() =>
                                        void run(async () => {
                                          await api.updateSite(editing.id, {
                                            name: editing.name,
                                            city: editing.city,
                                            zoneId: editing.zoneId,
                                          });
                                          setEditing(null);
                                        }, "Sede actualizada.")
                                      }
                                    >
                                      Guardar
                                    </Button>
                                    <Button variant="outline" className="shade" onClick={() => setEditing(null)}>
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            ))}
          {data && data.sites.length === 0 && <p className="empty">Su perfil no tiene sedes asignadas.</p>}
        </div>
        <div className="detail">
          <h2>Su alcance</h2>
          {user && data ? (
            <p>
              <strong>{ROLE_LABEL[user.role]}</strong>
              <br />
              {scopeLabel(user, data.sites, data.zones)}
            </p>
          ) : (
            <p className="muted">Inicie sesión para ver su alcance.</p>
          )}
          <h2 style={{ marginTop: 24, fontSize: 14 }}>Cómo se reparte la información</h2>
          <ul className="muted" style={{ lineHeight: 1.7, paddingLeft: 18, listStyle: "disc" }}>
            <li><strong>Superadmin y auditor:</strong> todas las regiones y sedes.</li>
            <li><strong>Gerente de zona:</strong> las sedes de su región.</li>
            <li><strong>Gerente de sede y operador:</strong> solo su sede.</li>
          </ul>
          <p className="muted" style={{ marginTop: 12 }}>
            Personas, Operación, Reportes, Auditoría y las exportaciones solo muestran datos de estas sedes.
            Las tablets se activan desde la pantalla Kiosco, en la propia tablet.
          </p>

          {isSuper && data && (
            <>
              <h2 style={{ marginTop: 28, fontSize: 14 }}>Nueva región</h2>
              <div className="form" style={{ marginTop: 8 }}>
                <Label>Nombre</Label>
                <Input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="Ej. Región Pacífico" />
                <Label>País</Label>
                <select
                  className="native-select"
                  value={zoneForm.countryId}
                  onChange={(e) => setZoneForm({ ...zoneForm, countryId: e.target.value })}
                >
                  <option value="">Elija un país</option>
                  {data.countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  className="shade"
                  disabled={!zoneForm.name.trim() || !zoneForm.countryId}
                  onClick={() =>
                    void run(async () => {
                      await api.createZone(zoneForm);
                      setZoneForm({ name: "", countryId: "" });
                    }, "Región creada.")
                  }
                >
                  Crear región
                </Button>
              </div>

              <h2 style={{ marginTop: 28, fontSize: 14 }}>Nueva sede</h2>
              <div className="form" style={{ marginTop: 8 }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Código</Label>
                    <Input value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} placeholder="BK-PDP" />
                  </div>
                  <div>
                    <Label>Ciudad</Label>
                    <Input value={siteForm.city} onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })} placeholder="Barranquilla" />
                  </div>
                </div>
                <Label>Nombre</Label>
                <Input value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} placeholder="Burger King Portal del Prado" />
                <Label>Región</Label>
                <select
                  className="native-select"
                  value={siteForm.zoneId}
                  onChange={(e) => setSiteForm({ ...siteForm, zoneId: e.target.value })}
                >
                  <option value="">Elija una región</option>
                  {data.zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
                <Button
                  className="shade"
                  disabled={!siteForm.code.trim() || !siteForm.name.trim() || !siteForm.city.trim() || !siteForm.zoneId}
                  onClick={() =>
                    void run(async () => {
                      await api.createSite(siteForm);
                      setSiteForm({ code: "", name: "", city: "", zoneId: "" });
                    }, "Sede creada.")
                  }
                >
                  Crear sede
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
