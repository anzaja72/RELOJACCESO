"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { useSessionRole } from "@/lib/use-session";
import {
  MAX_LOGO_CHARS,
  PRESETS,
  applyBrand,
  brandVars,
  contrast,
  isHex,
  isLogo,
  parseBrand,
  type Brand,
} from "@/lib/brand";

const EMPTY: Brand = { name: "", primary: "", dark: "", light: "", logo: "" };

const FIELDS: Array<{ key: "primary" | "dark" | "light"; label: string; hint: string }> = [
  { key: "primary", label: "Color de acento", hint: "botones y menú activo" },
  { key: "dark", label: "Color oscuro", hint: "texto y títulos" },
  { key: "light", label: "Color de fondo", hint: "fondo de la app" },
];

/** Vista previa: pinta una muestra con los colores del borrador sin tocar el resto de la aplicación. */
function Preview({ brand }: { brand: Brand | null }) {
  const vars = brand ? brandVars(brand) : null;
  return (
    <div
      aria-label="Vista previa de la marca"
      style={{
        ...(vars as React.CSSProperties),
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: vars ? "var(--background)" : "var(--card)",
        color: vars ? "var(--foreground)" : "inherit",
      }}
    >
      {brand?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt="Logo" style={{ height: 40, width: "auto", maxWidth: 56, objectFit: "contain" }} />
      ) : (
        <span className="rail-avatar" style={vars ? { background: "var(--primary)", color: "var(--primary-foreground)" } : undefined}>
          RC
        </span>
      )}
      <div style={{ flex: 1 }}>
        <strong style={{ display: "block", fontSize: 14 }}>{brand?.name || "Reloj CR"}</strong>
        <small style={{ opacity: 0.7 }}>Así se verá la aplicación</small>
      </div>
      <span
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          fontSize: 12.5,
          background: vars ? "var(--primary)" : "#171717",
          color: vars ? "var(--primary-foreground)" : "#fff",
        }}
      >
        Botón
      </span>
    </div>
  );
}

// La marca es global: solo el superadmin la cambia. Lo que se edita aquí es un borrador
// que se muestra en la vista previa; la aplicación cambia únicamente al guardar.
export function BrandSettings() {
  const [draft, setDraft] = useState<Brand>(EMPTY);
  const [saved, setSaved] = useState<Brand | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const canEdit = useSessionRole() === "superadmin";

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
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? EMPTY);

  function edit(next: Brand) {
    setDraft(next);
    setMessage(null);
  }

  function pickLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (!isLogo(url)) {
        setMessage({
          ok: false,
          text: `El logo debe ser PNG, JPG, WebP o SVG de hasta ${Math.round((MAX_LOGO_CHARS * 0.75) / 1000)} KB.`,
        });
        return;
      }
      edit({ ...draft, logo: url });
    };
    reader.readAsDataURL(file);
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
        brand_logo: basic ? "" : draft.logo,
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
        {canEdit
          ? "Versión básica o colores propios del cliente. Lo que cambie aquí es solo una vista previa: la aplicación cambia cuando pulse Guardar marca."
          : "Solo el superadmin puede cambiar la marca. Aquí se muestra la que está en uso."}
      </p>
      <div style={{ marginTop: 12 }}>
        <Preview brand={canEdit ? valid : saved} />
      </div>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, opacity: canEdit ? 1 : 0.55 }}>
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
            <Button key={label} variant="outline" className="shade" onClick={() => edit({ ...brand, logo: draft.logo })}>
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
          <div>
            <Label>
              Logo <span className="muted">· PNG, JPG, WebP o SVG; aparece en la barra lateral</span>
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                aria-label="Subir logo"
                onChange={(e) => {
                  pickLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {draft.logo && (
                <Button variant="outline" className="shade" onClick={() => edit({ ...draft, logo: "" })}>
                  Quitar logo
                </Button>
              )}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              Se usa solo con los tres colores completos. Suba únicamente un logo que el cliente haya autorizado.
            </p>
          </div>
          {lowContrast && (
            <p className="err-text">El texto oscuro casi no se distingue del fondo: elija colores con más contraste.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="shade" onClick={() => void save()} disabled={!dirty}>
              Guardar marca
            </Button>
            <Button
              variant="outline"
              className="shade"
              disabled={!dirty}
              onClick={() => {
                setDraft(saved ?? EMPTY);
                setMessage(null);
              }}
            >
              Descartar cambios
            </Button>
          </div>
          {dirty && <p className="muted">Hay cambios sin guardar: la aplicación todavía no los usa.</p>}
          {message && <p className={message.ok ? "ok-text" : "err-text"}>{message.text}</p>}
        </div>
      </fieldset>
    </div>
  );
}
