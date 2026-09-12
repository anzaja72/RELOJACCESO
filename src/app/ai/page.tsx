"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { Site } from "@/lib/types";

const HINTS = [
  "¿Quiénes están presentes hoy?",
  "¿Hay atrasos en R01?",
  "¿Qué terminales están offline?",
  "¿Hubo correcciones hoy?",
  "¿Falló alguna sincronización?",
];

export default function AiPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [question, setQuestion] = useState(HINTS[0]);
  const [log, setLog] = useState<Array<{ q: string; a: string; cites: string; source: string }>>([]);
  const [briefing, setBriefing] = useState<Array<{ text: string; href: string }>>([]);
  const [briefMeta, setBriefMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.sites().then((r) => {
      setSites(r.sites);
      if (r.sites[0]) setSiteId(r.sites[0].id);
    });
  }, []);

  async function ask(q = question) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.chat({ question: q, siteId: siteId || undefined });
      setLog((prev) => [
        {
          q,
          a: res.answer,
          cites: res.cites.map((c) => `${c.type}:${c.id}`).join(" · "),
          source: res.source,
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preguntar");
    } finally {
      setBusy(false);
    }
  }

  async function brief() {
    setBusy(true);
    try {
      const res = await api.briefing(undefined, siteId || undefined);
      setBriefing(res.briefing.bullets);
      setBriefMeta(`${res.briefing.source} · ${res.llm.provider}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Pregunta a Reloj CR"
      meta="Solo presentes, atrasos, ausencias, terminales, sync y correcciones. Sin consejo de sanción."
      actions={
        <>
          <select className="native-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
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
            Sin clave LLM usa mapeos fijos. Con OPENAI_API_KEY o ANTHROPIC_API_KEY redacta sobre los mismos hechos.
          </p>
          <div className="form" style={{ marginTop: 12 }}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button className="shade" disabled={busy} onClick={() => void ask()}>
                Preguntar
              </Button>
              {HINTS.map((h) => (
                <Button key={h} variant="outline" className="shade" onClick={() => { setQuestion(h); void ask(h); }}>
                  {h}
                </Button>
              ))}
            </div>
          </div>
          {log.map((item, i) => (
            <div key={`${item.q}-${i}`} className="row" style={{ padding: "14px 0" }}>
              <strong>{item.q}</strong>
              <span style={{ whiteSpace: "pre-wrap" }}>{item.a}</span>
              {item.cites ? <span>Citas: {item.cites}</span> : null}
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
