import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const sandbox = process.env.SANDBOX === "true";
const src = path.join(dataDir, sandbox ? "asistencia.sandbox.db" : "asistencia.db");
const destDir = path.join(dataDir, "backups");
fs.mkdirSync(destDir, { recursive: true });
if (!fs.existsSync(src)) {
  console.error("No hay base:", src);
  process.exit(1);
}
const dest = path.join(destDir, `asistencia-${new Date().toISOString().replaceAll(":", "")}.db`);
fs.copyFileSync(src, dest);
console.log("Backup:", dest);
console.log("RPO declarado: 24 h si este comando corre diario. Ver docs/EXIT_PLAN.md");
