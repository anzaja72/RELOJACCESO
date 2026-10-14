"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api-client";
import { LOCALE } from "@/lib/config";

type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  created_at: string;
  label?: string;
  actor?: string | null;
  person?: string | null;
  site?: string | null;
};

type Integrity = Awaited<ReturnType<typeof api.integrity>>;

const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });

// Por qué falló la verificación, dicho para una persona que no es técnica.
const REASON: Record<string, string> = {
  "evento sin sello": "hay un registro que no quedó sellado",
  "falta o cambió un evento anterior": "falta un registro o alguien lo cambió",
  "el contenido del evento fue modificado": "el contenido de un registro fue modificado",
};

function IntegrityBanner({ integrity }: { integrity: Integrity }) {
  const marks = integrity.punches.mismatches.length;
  return (
    <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border-soft)" }}>
      {integrity.ok ? (
        <p className="ok-text">
          ✔ Todo en orden: ningún registro ha sido modificado desde que se guardó.
        </p>
      ) : (
        <p className="err-text">
          ⚠ Atención: hay registros que no coinciden con lo que se guardó originalmente
          {integrity.chain.reason ? ` (${REASON[integrity.chain.reason] ?? integrity.chain.reason})` : ""}
          {marks ? `. ${marks} marcación(es) no coinciden` : ""}. Avise al administrador del sistema.
        </p>
      )}
      <p className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>
        Se revisaron {integrity.chain.checked} eventos y {integrity.punches.checked} marcaciones
        {integrity.chainSince ? `. Control activo desde el ${new Date(integrity.chainSince).toLocaleDateString(LOCALE)}` : ""}
        {integrity.punches.uncovered
          ? `. ${integrity.punches.uncovered} marcaciones anteriores a esa fecha no se pueden verificar`
          : ""}
        .
      </p>
      <details style={{ marginTop: 6, fontSize: 12.5 }}>
        <summary style={{ cursor: "pointer" }}>¿Qué significa «integridad»?</summary>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
          Es la garantía de que los datos de asistencia no se alteraron después de registrarse. Cada
          movimiento queda encadenado al anterior, como los eslabones de una cadena: si alguien edita
          o borra una marcación directamente en la base de datos, la cadena se rompe y este aviso lo
          muestra. Sirve como respaldo si más adelante hay que demostrar qué pasó y cuándo.
        </p>
      </details>
    </div>
  );
}

export default function AuditPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);

  useEffect(() => {
    void api
      .audit()
      .then((res) => {
        const rows = res.events as EventRow[];
        setEvents(rows);
        setSelected(rows[0] ?? null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar");
      });
    // Solo gerentes y auditor lo ven; para otros perfiles simplemente no se muestra.
    void api.integrity().then(setIntegrity).catch(() => undefined);
  }, []);

  return (
    <AppShell title="Auditoría" meta="Quién hizo qué, sobre quién, en qué sede y cuándo">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      {integrity && <IntegrityBanner integrity={integrity} />}
      <div className="split">
        <div className="split-list">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className={`row shade ${selected?.id === event.id ? "active" : ""}`}
              onClick={() => setSelected(event)}
            >
              <strong>{event.label ?? event.type}</strong>
              <span>
                {[event.person, event.site, event.actor ? `por ${event.actor}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
              <span>{when(event.created_at)}</span>
            </button>
          ))}
          {events.length === 0 && !error && <p className="empty">Sin eventos.</p>}
        </div>
        <div className="detail">
          {selected ? (
            <>
              <h2>{selected.label ?? selected.type}</h2>
              <dl className="kv" style={{ marginTop: 12 }}>
                <div><dt>Cuándo</dt><dd>{when(selected.created_at)}</dd></div>
                <div><dt>Quién lo hizo</dt><dd>{selected.actor ?? "Sistema o terminal"}</dd></div>
                <div><dt>Sobre quién</dt><dd>{selected.person ?? "—"}</dd></div>
                <div><dt>Sede</dt><dd>{selected.site ?? "—"}</dd></div>
              </dl>
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>Datos técnicos</summary>
                <p className="muted" style={{ fontSize: 12 }}>
                  Tipo: {selected.type} · Identificador: {selected.id}
                </p>
                <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 8 }}>
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="empty">Seleccione un evento.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
