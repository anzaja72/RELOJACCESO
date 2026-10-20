"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiWidgets } from "@/components/ai-widgets";
import { api } from "@/lib/api-client";
import type { Widget } from "@/lib/ai-widgets";
import type { Site } from "@/lib/types";

const HINTS = [
  "¿Quiénes están presentes hoy?",
  "¿Hay atrasos en R01?",
  "¿Qué terminales están offline?",
  "¿Hubo correcciones hoy?",
  "¿Falló alguna sincronización?",
];

type Country = { id: string; name: string; code: string };
type Zone = { id: string; name: string; country_id: string };

export default function AiPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [countryId, setCountryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [question, setQuestion] = useState(HINTS[0]);
  const [log, setLog] = useState<Array<{ q: string; a: string; cites: string; source: string; widgets: Widget[]; fellBack: boolean }>>([]);
  const [briefing, setBriefing] = useState<Array<{ text: string; href: string }>>([]);
  const [briefMeta, setBriefMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Segundos transcurridos mientras el modelo trabaja, para que se vea que la solicitud sigue viva.
  useEffect(() => {
    if (!pending) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  useEffect(() => {
    void api.catalog().then((cat) => {
      setSites(cat.sites);
      setCountries((cat.countries as Country[]) || []);
      setZones((cat.zones as Zone[]) || []);
    });
  }, []);

  const visibleZones = useMemo(
    () => zones.filter((z) => !countryId || z.country_id === countryId),
    [zones, countryId],
  );
  const visibleSites = useMemo(
    () =>
      sites.filter((s) => {
        if (countryId && s.countryId !== countryId) return false;
        if (zoneId && s.zoneId !== zoneId) return false;
        return true;
      }),
    [sites, countryId, zoneId],
  );

  function region() {
    return {
      siteId: siteId || undefined,
      countryId: countryId || undefined,
      zoneId: zoneId || undefined,
    };
  }

  async function ask(q = question) {
    setBusy(true);
    setPending(q);
    setError(null);
    try {
      const res = await api.chat({ question: q, ...region() });
      setLog((prev) => [
        {
          q,
          a: res.answer,
          cites: res.cites.map((c) => `${c.type}:${c.id}`).join(" · "),
          source: res.source,
          widgets: res.widgets ?? [],
          fellBack: res.source === "canned" && !!res.llm && res.llm.provider !== "none",
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preguntar");
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function brief() {
    setBusy(true);
    setPending("briefing del día");
    try {
      const res = await api.briefing(undefined, siteId || undefined, countryId || undefined, zoneId || undefined);
      setBriefing(res.briefing.bullets);
      setBriefMeta(`${res.briefing.source} · ${res.llm.provider}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar");
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="IAnálisis"
      meta="Consulta acotada e informe regional: presentes, atrasos, ausencias, terminales, sync y correcciones. Sin consejo de sanción."
      actions={
        <>
          <select
            className="native-select"
            value={countryId}
            onChange={(e) => {
              setCountryId(e.target.value);
              setZoneId("");
              setSiteId("");
            }}
          >
            <option value="">País</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="native-select"
            value={zoneId}
            onChange={(e) => {
              setZoneId(e.target.value);
              setSiteId("");
            }}
          >
            <option value="">Zona</option>
            {visibleZones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
          <select className="native-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Sede</option>
            {visibleSites.map((s) => (
              <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
            ))}
          </select>
          <Button className="shade" disabled={busy} onClick={() => void brief()}>
            Generar briefing del día
          </Button>
        </>
      }
    >
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      <div className="split">
        <div className="detail">
          <h2>Consulta acotada</h2>
          <p className="muted">
            Sin clave de IA responde con listas fijas. Con una clave configurada (NVIDIA, OpenAI o Anthropic) redacta sobre los mismos hechos.
            Filtre por país, zona o sede para informes regionales.
          </p>
          <div className="form" style={{ marginTop: 12 }}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button className="shade" disabled={busy} onClick={() => void ask()}>
                {pending ? (
                  <>
                    <span className="spinner spinner-sm" aria-hidden="true" /> Consultando…
                  </>
                ) : (
                  "Preguntar"
                )}
              </Button>
              {HINTS.map((h) => (
                <Button key={h} variant="outline" className="shade" disabled={busy} onClick={() => { setQuestion(h); void ask(h); }}>
                  {h}
                </Button>
              ))}
            </div>
          </div>
          {pending && (
            <div className="ai-pending" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>Consultando al modelo de IA… {elapsed} s</strong>
                <span>
                  Estamos analizando los datos de «{pending}». Puede tardar hasta un minuto; no cierre esta pantalla.
                </span>
              </div>
            </div>
          )}
          {log.map((item, i) => (
            <div key={`${item.q}-${i}`} className="row" style={{ padding: "14px 0" }}>
              <strong>{item.q}</strong>
              <span style={{ whiteSpace: "pre-wrap" }}>{item.a}</span>
              <AiWidgets widgets={item.widgets} />
              {item.cites ? <span>Citas: {item.cites}</span> : null}
              {item.fellBack && (
                <span className="err-text" style={{ marginTop: 6 }}>
                  El modelo no respondió a tiempo; se muestra la respuesta básica. Intente de nuevo.
                </span>
              )}
              <span className="pill" style={{ marginTop: 8 }}>{item.source}</span>
            </div>
          ))}
        </div>
        <div className="detail">
          <h2>Briefing {briefMeta || ""}</h2>
          {briefing.length === 0 && <p className="muted">Genere el briefing para ver 5 viñetas con enlaces a reportes.</p>}
          <ol style={{ margin: "12px 0 0 18px", fontSize: 13.5, lineHeight: 1.5 }}>
            {briefing.map((b) => (
              <li key={b.text} style={{ marginBottom: 10 }}>
                {b.text}{" "}
                <a href={b.href}>abrir</a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
