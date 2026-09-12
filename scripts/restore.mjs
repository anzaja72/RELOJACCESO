import fs from "node:fs";
import path from "node:path";

const from = process.argv[2];
if (!from) {
  console.error("Uso: npm run restore -- data/backups/<archivo>.db");
  process.exit(1);
}
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const sandbox = process.env.SANDBOX === "true";
const dest = path.join(dataDir, sandbox ? "asistencia.sandbox.db" : "asistencia.db");
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(from, dest);
console.log("Restaurado:", dest);
