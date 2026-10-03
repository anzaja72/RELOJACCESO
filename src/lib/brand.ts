// Marca del cliente: tres colores (acento, texto oscuro y fondo claro) de los que
// se derivan todas las variables del tema. Sin marca (null) la app se ve "básica".

export type Brand = {
  name: string;
  /** Color de acento: botones, navegación activa. */
  primary: string;
  /** Texto y elementos oscuros. */
  dark: string;
  /** Fondo claro de la app. */
  light: string;
  /** Logo como data URL (vacío = sin logo). Nunca una URL externa. */
  logo: string;
};

export const BRAND_VARS_KEY = "reloj-cr-brand-vars";
export const BRAND_KEY = "reloj-cr-brand";
export const BRAND_EVENT = "reloj-cr-brand";

// Paleta del brand book de Burger King Colombia: Scarlet Red, Cocoa Brown, Bone White.
export const PRESETS: Record<string, Brand> = {
  "Burger King Colombia": { name: "Burger King Colombia", primary: "#D62300", dark: "#502314", light: "#F5EBDC", logo: "" },
};

const HEX = /^#[0-9a-f]{6}$/i;
// ~200 KB de imagen en base64. Solo data URL: no se cargan imágenes de terceros.
export const MAX_LOGO_CHARS = 280_000;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const isLogo = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_LOGO_CHARS && LOGO.test(v);
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

export function parseBrand(raw: Partial<Record<keyof Brand, unknown>> | null | undefined): Brand | null {
  if (!raw || !isHex(raw.primary) || !isHex(raw.dark) || !isHex(raw.light)) return null;
  return {
    name: typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "",
    primary: raw.primary.toUpperCase(),
    dark: raw.dark.toUpperCase(),
    light: raw.light.toUpperCase(),
    logo: isLogo(raw.logo) ? raw.logo : "",
  };
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** `t` = cuánto de `b` entra en la mezcla (0 = solo a, 1 = solo b). */
function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Texto legible sobre `bg`: blanco o el color oscuro, el que más contraste dé. */
function readableOn(bg: string, dark: string) {
  return contrast("#ffffff", bg) >= contrast(dark, bg) ? "#ffffff" : dark;
}

export function brandVars({ primary, dark, light }: Brand): Record<string, string> {
  const card = mix(light, "#ffffff", 0.6);
  const subtle = mix(light, dark, 0.07);
  const border = mix(light, dark, 0.16);
  return {
    "--background": light,
    "--foreground": dark,
    "--card": card,
    "--card-foreground": dark,
    "--popover": card,
    "--popover-foreground": dark,
    "--primary": primary,
    "--primary-foreground": readableOn(primary, dark),
    "--secondary": subtle,
    "--secondary-foreground": dark,
    "--muted": subtle,
    "--muted-foreground": mix(dark, light, 0.3),
    "--accent": mix(light, dark, 0.1),
    "--accent-foreground": dark,
    "--border": border,
    "--border-soft": mix(light, dark, 0.09),
    "--input": border,
    "--ring": primary,
    "--ink-2": mix(dark, light, 0.12),
    "--ink-3": mix(dark, light, 0.3),
    "--ink-4": mix(dark, light, 0.42),
    "--ink-5": mix(dark, light, 0.5),
  };
}

/** Aplica la marca al documento y la recuerda para que el kiosco la tenga sin red. */
export function applyBrand(brand: Brand | null, { persist = true }: { persist?: boolean } = {}) {
  const root = document.documentElement;
  const known = Object.keys(brandVars({ name: "", primary: "#000000", dark: "#000000", light: "#ffffff", logo: "" }));
  for (const k of known) root.style.removeProperty(k);
  if (brand) {
    for (const [k, v] of Object.entries(brandVars(brand))) root.style.setProperty(k, v);
  }
  // Vista previa: el logo y el nombre de la barra leen esto antes que lo guardado.
  if (!persist) {
    root.dataset.brandPreview = JSON.stringify(brand);
    window.dispatchEvent(new Event(BRAND_EVENT));
    return;
  }
  delete root.dataset.brandPreview;
  try {
    if (brand) {
      window.localStorage.setItem(BRAND_VARS_KEY, JSON.stringify(brandVars(brand)));
      window.localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
    } else {
      window.localStorage.removeItem(BRAND_VARS_KEY);
      window.localStorage.removeItem(BRAND_KEY);
    }
    window.dispatchEvent(new Event(BRAND_EVENT));
  } catch {
    /* sin almacenamiento: la marca se aplica igual en esta sesión */
  }
}

export function readStoredBrand(): Brand | null {
  try {
    return parseBrand(JSON.parse(window.localStorage.getItem(BRAND_KEY) || "null"));
  } catch {
    return null;
  }
}

/** Corre antes de pintar para evitar el parpadeo del tema básico. */
export const BRAND_BOOT_SCRIPT = `try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(
  BRAND_VARS_KEY,
)})||"null");if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}`;
