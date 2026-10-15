"use client";

import type { Widget } from "@/lib/ai-widgets";

const TONE: Record<string, string> = {
  neutral: "var(--foreground)",
  good: "#15803d",
  warn: "#b45309",
  bad: "#b91c1c",
};

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
  background: "var(--card)",
  marginTop: 10,
};

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

function Title({ children }: { children: React.ReactNode }) {
  return <strong style={{ display: "block", fontSize: 13, marginBottom: 10 }}>{children}</strong>;
}

function Bars({ items, unit }: { items: Array<{ label: string; value: number; detail?: string }>; unit?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((i, idx) => (
        <div key={`${i.label}-${idx}`}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}>
            <span>
              {i.label}
              {i.detail ? <span className="muted"> · {i.detail}</span> : null}
            </span>
            <strong>
              {fmt(i.value)}
              {unit ? ` ${unit}` : ""}
            </strong>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--border-soft, rgba(0,0,0,.08))", marginTop: 4 }}>
            <div style={{ width: `${(Math.abs(i.value) / max) * 100}%`, height: "100%", borderRadius: 4, background: "var(--primary)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Line({ points, unit }: { points: Array<{ label: string; value: number }>; unit?: string }) {
  const W = 420;
  const H = 120;
  const pad = 10;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución" style={{ width: "100%", height: "auto" }}>
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.value)} r={2.5} fill="var(--primary)" />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }} className="muted">
        <span>{points[0].label}</span>
        <span>
          máx. {fmt(peak.value)}
          {unit ? ` ${unit}` : ""} ({peak.label})
        </span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

export function AiWidgets({ widgets }: { widgets: Widget[] }) {
  if (!widgets.length) return null;
  return (
    <div>
      {widgets.map((w, idx) => {
        switch (w.type) {
          case "kpi_cards":
            return (
              <div key={idx} style={card}>
                {w.title && <Title>{w.title}</Title>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                  {w.items.map((i) => (
                    <div key={i.label} style={{ borderLeft: `3px solid ${TONE[i.tone]}`, paddingLeft: 10 }}>
                      <div className="muted" style={{ fontSize: 11.5 }}>{i.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: TONE[i.tone] }}>{i.value}</div>
                      {i.hint && <div className="muted" style={{ fontSize: 11.5 }}>{i.hint}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          case "bar_chart":
            return (
              <div key={idx} style={card}>
                <Title>{w.title}</Title>
                <Bars items={w.items} unit={w.unit} />
              </div>
            );
          case "ranking":
            return (
              <div key={idx} style={card}>
                <Title>{w.title}</Title>
                <Bars items={w.items.map((i) => ({ label: i.label, value: i.value, detail: i.detail }))} unit={w.unit} />
              </div>
            );
          case "line_chart":
            return (
              <div key={idx} style={card}>
                <Title>{w.title}</Title>
                <Line points={w.points} unit={w.unit} />
              </div>
            );
          case "comparison_table":
            return (
              <div key={idx} style={{ ...card, overflowX: "auto" }}>
                <Title>{w.title}</Title>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {w.columns.map((c, ci) => (
                        <th key={ci} style={{ textAlign: ci ? "right" : "left", padding: "4px 8px", color: "var(--ink-4)", fontSize: 11 }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {w.rows.map((r, ri) => (
                      <tr key={ri} style={{ borderTop: "1px solid var(--border-soft)" }}>
                        {r.map((c, ci) => (
                          <td key={ci} style={{ textAlign: ci ? "right" : "left", padding: "6px 8px", fontWeight: ci ? 400 : 600 }}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
