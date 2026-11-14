// Lista las tablets (terminales) registradas, con quién las activó, desde qué equipo y su último latido.
// Solo lectura. Uso en el servidor (lee el script por la entrada estándar, no hace falta reconstruir):
//   docker exec -i reloj-cr node --input-type=module - < scripts/tablets.mjs
// En local: DATA_DIR=./data node scripts/tablets.mjs
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const Database = require("better-sqlite3");
const file = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), process.env.SANDBOX === "true" ? "asistencia.sandbox.db" : "asistencia.db");
const db = new Database(file, { readonly: true, fileMustExist: true });

const equipo = (ua = "") =>
  /Headless|Playwright|curl|node/i.test(ua) ? "automático (pruebas)"
  : /Android/i.test(ua) ? "Android"
  : /iPad|iPhone/i.test(ua) ? "iPad/iPhone"
  : /Macintosh|Mac OS/i.test(ua) ? "Mac"
  : /Windows/i.test(ua) ? "Windows"
  : ua.slice(0, 24) || "desconocido";
const hace = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 2 ? "en línea" : min < 120 ? `hace ${min} min` : min < 2880 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
};

const rows = db
  .prepare(
    `SELECT t.*, s.code AS tienda,
            (SELECT COUNT(*) FROM punches p WHERE p.terminal_id = t.id) AS marcas
       FROM terminals t LEFT JOIN sites s ON s.id = t.site_id
      ORDER BY s.code, t.last_seen`,
  )
  .all();

console.log(`${rows.length} tablets registradas (${rows.filter((r) => !r.revoked_at).length} vigentes)\n`);
console.table(
  rows.map((r) => ({
    tienda: r.tienda ?? r.site_id,
    nombre: r.label,
    id: `…${String(r.id).slice(-6)}`,
    "activada por": r.activated_by ?? "(sin activación)",
    equipo: equipo(r.user_agent),
    "último latido": hace(r.last_seen),
    marcas: r.marcas,
    estado: r.revoked_at ? "revocada" : "vigente",
  })),
);
