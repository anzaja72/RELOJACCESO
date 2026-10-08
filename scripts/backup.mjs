import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Copia consistente de la base con la API de respaldo de SQLite: es segura con el servidor
// en marcha (modo WAL), a diferencia de copiar el archivo. Verifica la copia y conserva
// solo las últimas BACKUP_KEEP (14 por defecto).
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const sandbox = process.env.SANDBOX === "true";
const src = path.join(dataDir, sandbox ? "asistencia.sandbox.db" : "asistencia.db");
const destDir = path.join(dataDir, "backups");
const keep = Number(process.env.BACKUP_KEEP || 14);
fs.mkdirSync(destDir, { recursive: true });
if (!fs.existsSync(src)) {
  console.error("No hay base:", src);
  process.exit(1);
}
const dest = path.join(destDir, `asistencia-${new Date().toISOString().replaceAll(":", "")}.db`);

const db = new Database(src, { readonly: true, fileMustExist: true });
try {
  await db.backup(dest);
} finally {
  db.close();
}

// La copia sale en modo WAL; se pasa a un solo archivo para que sea portable.
const copy = new Database(dest);
copy.pragma("journal_mode = DELETE");
const check = copy.pragma("integrity_check", { simple: true });
const events = copy.prepare("SELECT count(*) AS n FROM events").get().n;
copy.close();
if (check !== "ok") {
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(dest + ext, { force: true });
  console.error("La copia no pasó la verificación de integridad:", check);
  process.exit(1);
}

const old = fs.readdirSync(destDir).filter((f) => /^asistencia-.*\.db$/.test(f)).sort().slice(0, -keep);
for (const f of old) fs.rmSync(path.join(destDir, f));

console.log("Backup verificado:", dest, `(${events} eventos)`);
if (old.length) console.log(`Se borraron ${old.length} copias antiguas (se conservan ${keep}).`);
console.log("Copie también este archivo fuera del servidor. Ver docs/EXIT_PLAN.md");
