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
};

export default function AuditPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<Awaited<ReturnType<typeof api.integrity>> | null>(null);

  useEffect(() => {
    void api
      .audit()
      .then((res) => {
        setEvents(res.events);
        setSelected(res.events[0] ?? null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar");
      });
    // Solo gerentes y auditor lo ven; para otros roles simplemente no se muestra.
    void api.integrity().then(setIntegrity).catch(() => undefined);
  }, []);

  return (
    <AppShell title="Auditoría" meta="Accesos, cambios, exportaciones, enrolamiento y correcciones">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      {integrity && (
        <p
          className={integrity.ok ? "ok-text" : "err-text"}
          style={{ padding: "12px 22px", borderBottom: "1px solid var(--border-soft)" }}
        >
          {integrity.ok
            ? `Registro íntegro: ${integrity.chain.checked} eventos sellados y ${integrity.punches.checked} marcaciones cotejadas`
            : `Registro alterado: ${integrity.chain.reason ?? ""} ${integrity.punches.mismatches.length ? `· ${integrity.punches.mismatches.length} marcación(es) no coinciden con el registro sellado` : ""}`}
          {integrity.chainSince ? ` · sellado desde ${new Date(integrity.chainSince).toLocaleDateString(LOCALE)}` : ""}
          {integrity.punches.uncovered ? ` · ${integrity.punches.uncovered} marcaciones previas al sellado sin cotejo` : ""}
        </p>
      )}
      <div className="split">
        <div className="split-list">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className={`row shade ${selected?.id === event.id ? "active" : ""}`}
              onClick={() => setSelected(event)}
            >
              <strong>{event.type}</strong>
              <span>{new Date(event.created_at).toLocaleString(LOCALE)}</span>
            </button>
          ))}
          {events.length === 0 && !error && <p className="empty">Sin eventos.</p>}
        </div>
        <div className="detail">
          {selected ? (
            <>
              <h2>{selected.type}</h2>
              <p>{selected.id}</p>
              <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 16 }}>
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </>
          ) : (
            <p className="empty">Seleccione un evento.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
