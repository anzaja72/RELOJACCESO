// Resuelve el alias "@/" de tsconfig hacia src/ (con extensión .ts) para que
// los tests importen el código real. Node 22 ya quita los tipos de .ts.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = src + specifier.slice(2);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
