"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { stores, type RegionSummary } from "@/lib/api-client";
import { mondayOf } from "@/lib/planning";

const TONE: Record<string, string> = { aprobado: "ok", enviado: "warn", devuelto: "bad" };

/** UI-02 · Inicio del gerente de zona: ciudades, tiendas, horarios, pendientes. */
export default function RegionPage() {
  const [week, setWeek] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const [data, setData] = useState<RegionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void stores
      .region(week)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Inicie sesión"));
  }, [week]);

  return (
    <AppShell title="Inicio regional" meta="Ciudades, tiendas, cronogramas y pendientes de su jurisdicción">
      <div className="toolbar">
        <label>
          Semana (lunes)
          <Input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
        </label>
        {data && (
          <div className="tabs-row" style={{ marginTop: 18 }}>
            <Link className="pill warn" href={`/planner?mode=regional&week=${week}`}>
              {data.pending.plans.length} cronogramas por revisar
            </Link>
            <Link className={`pill ${data.pending.urgent ? "bad" : ""}`} href="/novelties?status=pendiente">
              {data.pending.urgent} urgentes
            </Link>
            <Link className={`pill ${data.pending.excess ? "warn" : ""}`} href="/novelties?status=pendiente&kind=exceso">
              {data.pending.excess} excesos de horas
            </Link>
            <Link className="pill" href="/novelties?status=pendiente">
              {data.pending.novelties} novedades pendientes
            </Link>
          </div>
        )}
      </div>
      {error && <p className="err-text" style={{ padding: "12px 22px" }}>{error}</p>}
      {data?.pending.plans.length ? (
        <div className="section">
          <h3>Cronogramas enviados</h3>
          <div className="tabs-row">
            {data.pending.plans.map((p) => (
              <Link key={p.planId} className="pill warn" href={`/planner?week=${week}&site=${p.siteId}`}>
                {p.site} · v{p.version}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {data?.zones.map((zone) => (
        <div key={zone.id} className="section">
          <h3>{zone.name}</h3>
          {zone.cities.map((city) => (
            <div key={city.city} style={{ marginBottom: 16 }}>
              <p className="muted" style={{ marginBottom: 8 }}>
                {city.city}
              </p>
              <div className="card-grid">
                {city.sites.map((s) => (
                  <Link key={s.site.id} className="card" href={`/planner?site=${s.site.id}&week=${week}`}>
                    <strong>{s.site.name}</strong>
                    <span>
                      {s.employees} empleados{s.guests ? ` · ${s.guests} en movilidad` : ""}
                      {s.incomplete ? ` · ${s.incomplete} fichas incompletas` : ""}
                    </span>
                    <div className="tabs-row">
                      {s.plan ? (
                        <span className={`pill ${TONE[s.plan.status] ?? ""}`}>
                          v{s.plan.version} · {s.plan.status}
                        </span>
                      ) : (
                        <span className="pill">sin cronograma</span>
                      )}
                      {s.approved && s.plan?.status !== "aprobado" && <span className="pill ok">hay versión vigente</span>}
                      {s.coverageGaps > 0 && <span className="pill bad">{s.coverageGaps} franjas sin responsable</span>}
                      {s.warnings > 0 && <span className="pill warn">{s.warnings} advertencias</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </AppShell>
  );
}
