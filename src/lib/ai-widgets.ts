// Bloques visuales que el modelo puede pedir con <ui-widget>{json}</ui-widget>.
// El JSON se valida campo por campo: lo que no encaja se descarta y el texto sigue siendo la respuesta.
export type Tone = "neutral" | "good" | "warn" | "bad";
export type Widget =
  | { type: "kpi_cards"; title?: string; items: Array<{ label: string; value: string; hint?: string; tone: Tone }> }
  | { type: "bar_chart"; title: string; unit?: string; items: Array<{ label: string; value: number }> }
  | { type: "line_chart"; title: string; unit?: string; points: Array<{ label: string; value: number }> }
  | { type: "ranking"; title: string; unit?: string; items: Array<{ label: string; detail?: string; value: number }> }
  | { type: "comparison_table"; title: string; columns: string[]; rows: string[][] };

const MAX_WIDGETS = 5;
const MAX_ITEMS = 14;
const MAX_COLS = 6;

const str = (v: unknown, max = 80): string | null =>
  typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) || null : null;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const tone = (v: unknown): Tone => (v === "good" || v === "warn" || v === "bad" ? v : "neutral");

function pairs(v: unknown) {
  const out: Array<{ label: string; value: number }> = [];
  for (const raw of arr(v)) {
    const o = obj(raw);
    const label = str(o.label);
    const value = num(o.value);
    if (label && value !== null) out.push({ label, value });
  }
  return out;
}

export function parseWidget(raw: unknown): Widget | null {
  const o = obj(raw);
  const title = str(o.title, 100);
  const unit = str(o.unit, 12) ?? undefined;
  switch (o.type) {
    case "kpi_cards": {
      const items = arr(o.items)
        .map((r) => {
          const i = obj(r);
          const label = str(i.label);
          const value = str(i.value, 24);
          return label && value ? { label, value, hint: str(i.hint, 60) ?? undefined, tone: tone(i.tone) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return items.length ? { type: "kpi_cards", title: title ?? undefined, items } : null;
    }
    case "bar_chart": {
      const items = pairs(o.items);
      return title && items.length ? { type: "bar_chart", title, unit, items } : null;
    }
    case "line_chart": {
      const points = pairs(o.points);
      return title && points.length >= 2 ? { type: "line_chart", title, unit, points } : null;
    }
    case "ranking": {
      const items = arr(o.items)
        .map((r) => {
          const i = obj(r);
          const label = str(i.label);
          const value = num(i.value);
          return label && value !== null ? { label, detail: str(i.detail, 70) ?? undefined, value } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return title && items.length ? { type: "ranking", title, unit, items } : null;
    }
    case "comparison_table": {
      const columns = (Array.isArray(o.columns) ? o.columns : []).slice(0, MAX_COLS).map((c) => str(c, 30)).filter((c): c is string => !!c);
      const rows = arr(o.rows)
        .map((r) => (Array.isArray(r) ? r.slice(0, columns.length).map((c) => str(c, 60) ?? "—") : null))
        .filter((r): r is string[] => !!r && r.length > 0);
      return title && columns.length >= 2 && rows.length ? { type: "comparison_table", title, columns, rows } : null;
    }
    default:
      return null;
  }
}

/** Separa el texto de los bloques <ui-widget>; ignora los que no son JSON válido. */
export function extractWidgets(text: string): { text: string; widgets: Widget[] } {
  const widgets: Widget[] = [];
  const clean = text
    .replace(/```(?:json|html)?\s*(<ui-widget>[\s\S]*?<\/ui-widget>)\s*```/gi, "$1")
    .replace(/<ui-widget>([\s\S]*?)<\/ui-widget>/gi, (_m, body: string) => {
      if (widgets.length < MAX_WIDGETS) {
        try {
          const w = parseWidget(JSON.parse(body.trim()));
          if (w) widgets.push(w);
        } catch {
          /* JSON inválido: se descarta el bloque */
        }
      }
      return "";
    })
    .replace(/<\/?ui-widget>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: clean, widgets };
}
