"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api-client";
import { getSessionUser } from "@/lib/client-session";
import { ROLE_LABEL, scopeLabel, type CountryRow, type ZoneRow } from "@/lib/scope-label";
import type { Employee, Site, Terminal } from "@/lib/types";

type Data = {
  sites: Site[];
  zones: ZoneRow[];
  countries: CountryRow[];
  employees: Employee[];
  terminals: Terminal[];
};

// País → región → sede, solo con lo que el usuario puede ver, y qué hace cada perfil.
export default function StructurePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = typeof window === "undefined" ? null : getSessionUser();

  useEffect(() => {
    void Promise.all([api.mySites(), api.people(false), api.terminals()])
      .then(([s, p, t]) => setData({ ...s, employees: p.employees, terminals: t.terminals }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo cargar"));
  }, []);

  const countOf = (siteId: string) => data?.employees.filter((e) => e.siteId === siteId).length ?? 0;
  const tabletsOf = (siteId: string) => data?.terminals.filter((t) => t.siteId === siteId) ?? [];

  return (
    <AppShell title="Estructura" meta="Países, regiones y sedes que usted puede ver">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      <div className="split">
        <div className="split-list">
          {data?.countries
            .filter((c) => data.zones.some((z) => z.country_id === c.id && data.sites.some((s) => s.zoneId === z.id)))
            .map((country) => (
              <div key={country.id}>
                <p className="row" style={{ fontWeight: 600 }}>{country.name}</p>
                {data.zones
                  .filter((z) => z.country_id === country.id)
                  .map((zone) => {
                    const sites = data.sites.filter((s) => s.zoneId === zone.id);
                    if (!sites.length) return null;
                    return (
                      <div key={zone.id} style={{ marginLeft: 16 }}>
                        <p className="row">
                          <strong>Región · {zone.name}</strong>
                          <span>{sites.length} {sites.length === 1 ? "sede" : "sedes"}</span>
                        </p>
                        {sites.map((site) => {
                          const tablets = tabletsOf(site.id);
                          const online = tablets.filter((t) => t.online).length;
                          return (
                            <div key={site.id} className="row" style={{ marginLeft: 16 }}>
                              <strong>{site.code} · {site.name}</strong>
                              <span>
                                {site.city} · {countOf(site.id)} personas · {tablets.length} tablets ({online} en línea)
                              </span>
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
          </p>
        </div>
      </div>
    </AppShell>
  );
}
