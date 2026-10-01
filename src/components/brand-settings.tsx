"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { PRESETS, applyBrand, contrast, isHex, parseBrand, type Brand } from "@/lib/brand";

const EMPTY: Brand = { name: "", primary: "", dark: "", light: "" };

const FIELDS: Array<{ key: "primary" | "dark" | "light"; label: string; hint: string }> = [
  { key: "primary", label: "Color de acento", hint: "botones y menú activo" },
  { key: "dark", label: "Color oscuro", hint: "texto y títulos" },
  { key: "light", label: "Color de fondo", hint: "fondo de la app" },
];

// Cambia la app entre la versión básica y los colores del cliente. Mientras se
// edita se previsualiza en vivo; solo "Guardar" lo vuelve la marca de todos.
export function BrandSettings() {
  const [draft, setDraft] = useState<Brand>(EMPTY);
  const [saved, setSaved] = useState<Brand | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api
      .brand()
      .then(({ brand }) => {
        const current = parseBrand(brand);
        setSaved(current);
        setDraft(current ?? EMPTY);
      })
      .catch(() => undefined);
  }, []);

  const valid = parseBrand(draft);
  const basic = !draft.primary && !draft.dark && !draft.light;
  const lowContrast = valid && contrast(valid.dark, valid.light) < 4.5;

  function edit(next: Brand) {
    setDraft(next);
    setMessage(null);
    applyBrand(parseBrand(next), { persist: false });
  }

  async function save() {
    if (!basic && !valid) {
      setMessage({ ok: false, text: "Los tres colores deben ser hexadecimales completos, p. ej. #D62300." });
      return;
    }
    try {
      await api.saveSettings({
        brand_name: basic ? "" : draft.name,
        brand_primary: basic ? "" : draft.primary,
        brand_dark: basic ? "" : draft.dark,
        brand_light: basic ? "" : draft.light,
      });
      const next = basic ? null : valid;
      applyBrand(next);
      setSaved(next);
      setMessage({ ok: true, text: next ? "Marca guardada y aplicada." : "Vuelve la versión básica." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo guardar" });
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 14 }}>Marca del cliente</h2>
      <p className="muted" style={{ marginTop: 6 }}>
        Versión básica o colores propios del cliente (de su brand book). Se ve en vivo antes de guardar.
      </p>
      <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
        <Button
          variant="outline"
          className="shade"
          aria-pressed={basic}
          style={basic ? { borderColor: "var(--primary)", borderWidth: 2 } : undefined}
          onClick={() => edit(EMPTY)}
        >
          Versión básica
        </Button>
        {Object.entries(PRESETS).map(([label, brand]) => (
          <Button key={label} variant="outline" className="shade" onClick={() => edit(brand)}>
            {label}
          </Button>
        ))}
      </div>
      <div className="form" style={{ marginTop: 12 }}>
        <Label>Nombre de la marca</Label>
        <Input value={draft.name} onChange={(e) => edit({ ...draft, name: e.target.value })} placeholder="Opcional" />
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label>
              {f.label} <span className="muted">· {f.hint}</span>
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={f.label}
                value={isHex(draft[f.key]) ? draft[f.key] : "#000000"}
                onChange={(e) => edit({ ...draft, [f.key]: e.target.value.toUpperCase() })}
                style={{ width: 40, height: 36, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "none" }}
              />
              <Input
                value={draft[f.key]}
                onChange={(e) => edit({ ...draft, [f.key]: e.target.value.trim() })}
                placeholder="#RRGGBB"
                maxLength={7}
              />
            </div>
          </div>
        ))}
        {lowContrast && (
          <p className="err-text">El texto oscuro casi no se distingue del fondo: elija colores con más contraste.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="shade" onClick={() => void save()}>
            Guardar marca
          </Button>
          <Button
            variant="outline"
            className="shade"
            onClick={() => {
              setDraft(saved ?? EMPTY);
              applyBrand(saved, { persist: false });
              setMessage(null);
            }}
          >
            Descartar cambios
          </Button>
        </div>
        {message && <p className={message.ok ? "ok-text" : "err-text"}>{message.text}</p>}
      </div>
    </div>
  );
}
