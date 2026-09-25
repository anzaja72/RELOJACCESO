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
  }, []);

  return (
    <AppShell title="Auditoría" meta="Accesos, cambios, exportaciones, enrolamiento y correcciones">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
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
