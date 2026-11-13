import fs from "node:fs";
import path from "node:path";
import { getDb, getSiteByCode, listSites, recordEvent } from "@/lib/db";
import { DomainError, type StoreActor } from "@/lib/stores";

/**
 * Limpieza de datos de DEMOSTRACIÓN: borra todas las tiendas que no se indiquen en `keep`, con sus
 * empleados, marcaciones, cronogramas, novedades y demás datos dependientes.
 *
 * Por qué dentro de la app y no con SQL suelto:
 *  · hace un respaldo verificable antes de escribir;
 *  · deja un evento sellado `data.purged` en la cadena de auditoría y el control de integridad lo respeta
 *    (sin él, borrar marcaciones aparecería como «registros alterados»);
 *  · nunca borra a una persona con cédula real: quien tenga cédula distinta de «DEMO-…» debe moverse antes.
 * La auditoría (`events`), los usuarios, las regiones y los ajustes NO se tocan.
 */

/** Tablas que jamás se limpian. */
const PROTECTED = new Set(["events", "sites", "employees", "users", "zones", "countries", "settings", "employee_types", "shifts"]);

type Counts = Record<string, number>;

export type PurgePlan = {
  keep: Array<{ id: string; code: string; name: string }>;
  remove: Array<{ id: string; code: string; name: string; city: string; employees: number; punches: number }>;
  employees: number;
  punches: number;
  counts: Counts;
  orphanUsers: string[];
};

function tableColumns(db: ReturnType<typeof getDb>) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  return tables
    .filter((t) => !PROTECTED.has(t.name))
    .map((t) => ({ table: t.name, cols: new Set((db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{ name: string }>).map((c) => c.name)) }));
}

/** Condiciones de borrado de una tabla según las columnas que tenga (usa tablas temporales _del_*). */
function conditions(cols: Set<string>) {
  const parts: string[] = [];
  if (cols.has("employee_id")) parts.push("employee_id IN (SELECT id FROM _del_emp)");
  if (cols.has("site_id")) parts.push("site_id IN (SELECT id FROM _del_site)");
  if (cols.has("from_site_id")) parts.push("from_site_id IN (SELECT id FROM _del_site)");
  if (cols.has("punch_id")) parts.push("punch_id IN (SELECT id FROM _del_punch)");
  if (cols.has("plan_id")) parts.push("plan_id IN (SELECT id FROM shift_plans WHERE site_id IN (SELECT id FROM _del_site))");
  return parts.length ? parts.join(" OR ") : null;
}

/** Calcula (y opcionalmente ejecuta) la limpieza. `execute` exige además un usuario con sesión, no la clave API. */
export async function purgeStores(input: { keep: string[]; execute: boolean }, actor: StoreActor & { via?: string }): Promise<PurgePlan & { executed: boolean; backup?: string }> {
  if (actor.role !== "superadmin") throw new DomainError("Solo el superadmin puede limpiar datos", 403, "FORBIDDEN");
  if (input.execute && actor.via === "api_key") throw new DomainError("La limpieza exige iniciar sesión con un usuario, no la clave de integración", 403, "FORBIDDEN");
  if (!input.keep.length) throw new DomainError("Indique al menos una tienda a conservar (keep)");

  const db = getDb();
  const all = listSites();
  const keep = input.keep.map((ref) => {
    const site = getSiteByCode(ref);
    if (!site) throw new DomainError(`La tienda a conservar «${ref}» no existe. Tiendas: ${all.map((s) => s.code).join(", ")}`, 404, "NOT_FOUND");
    return site;
  });
  const keepIds = new Set(keep.map((s) => s.id));
  const remove = all.filter((s) => !keepIds.has(s.id));

  db.exec("DROP TABLE IF EXISTS _del_site; DROP TABLE IF EXISTS _del_emp; DROP TABLE IF EXISTS _del_punch;");
  db.exec("CREATE TEMP TABLE _del_site (id TEXT PRIMARY KEY); CREATE TEMP TABLE _del_emp (id TEXT PRIMARY KEY); CREATE TEMP TABLE _del_punch (id TEXT PRIMARY KEY);");
  try {
    const insSite = db.prepare("INSERT INTO _del_site (id) VALUES (?)");
    for (const s of remove) insSite.run(s.id);
    db.exec("INSERT INTO _del_emp SELECT id FROM employees WHERE site_id IN (SELECT id FROM _del_site)");
    db.exec("INSERT INTO _del_punch SELECT id FROM punches WHERE site_id IN (SELECT id FROM _del_site) OR employee_id IN (SELECT id FROM _del_emp)");

    // Candado: una cédula real no se borra jamás.
    const real = db
      .prepare("SELECT name, site_id FROM employees WHERE id IN (SELECT id FROM _del_emp) AND document_id IS NOT NULL AND document_id NOT LIKE 'DEMO-%'")
      .all() as Array<{ name: string; site_id: string }>;
    if (real.length) {
      const where = (id: string) => all.find((s) => s.id === id)?.code ?? id;
      throw new DomainError(
        `Hay ${real.length} persona(s) con cédula real en tiendas que se borrarían (${real.slice(0, 5).map((e) => `${e.name} en ${where(e.site_id)}`).join("; ")}${real.length > 5 ? "…" : ""}). Muévalas antes a una tienda que conserve, o agregue esa tienda a las que se conservan.`,
        409,
        "REAL_PEOPLE",
      );
    }

    const count = (table: string, where: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;
    const counts: Counts = {};
    const tables = tableColumns(db);
    for (const { table, cols } of tables) {
      const where = conditions(cols);
      if (!where) continue;
      const n = count(table, where);
      if (n) counts[table] = n;
    }
    const employees = count("employees", "id IN (SELECT id FROM _del_emp)");
    counts.employees = employees;
    counts.sites = remove.length;

    const perSite = remove.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      city: s.city,
      employees: count("employees", `site_id = '${s.id.replace(/'/g, "''")}'`),
      punches: count("punches", `site_id = '${s.id.replace(/'/g, "''")}'`),
    }));
    const orphanUsers = (db.prepare("SELECT email, scope_type, scope_id FROM users WHERE active = 1 AND scope_type = 'site' AND scope_id IN (SELECT id FROM _del_site)").all() as Array<{ email: string }>).map((u) => u.email);

    const plan: PurgePlan = {
      keep: keep.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      remove: perSite,
      employees,
      punches: counts.punches ?? 0,
      counts,
      orphanUsers,
    };
    if (!input.execute || !remove.length) return { ...plan, executed: false };

    // 1) Respaldo verificable
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const dir = path.join(dataDir, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `pre-limpieza-${new Date().toISOString().replaceAll(":", "")}.db`);
    await db.backup(backup);

    // 2) Identificadores para que la integridad sepa qué se borró a propósito
    const employeeIds = (db.prepare("SELECT id FROM _del_emp").all() as Array<{ id: string }>).map((r) => r.id);
    // Marcas borradas cuyo dueño NO se borra (sin empleado reconocido, o de alguien que se conserva pero marcó en una tienda borrada).
    const otherPunchIds = (db.prepare("SELECT id FROM punches WHERE id IN (SELECT id FROM _del_punch) AND (employee_id IS NULL OR employee_id NOT IN (SELECT id FROM _del_emp))").all() as Array<{ id: string }>).map((r) => r.id);

    // 3) Borrado en una sola transacción: dependientes, luego empleados, luego tiendas
    db.transaction(() => {
      for (const { table, cols } of tables) {
        const where = conditions(cols);
        if (where) db.exec(`DELETE FROM ${table} WHERE ${where}`);
      }
      db.exec("DELETE FROM employees WHERE id IN (SELECT id FROM _del_emp)");
      db.exec("DELETE FROM sites WHERE id IN (SELECT id FROM _del_site)");
      recordEvent(db, "data.purged", {
        by: actor.email,
        keptSites: keep.map((s) => s.code),
        deletedSites: remove.map((s) => ({ id: s.id, code: s.code, name: s.name })),
        employeeIds,
        otherPunchIds,
        counts,
        backup: path.basename(backup),
      });
    })();
    return { ...plan, executed: true, backup };
  } finally {
    db.exec("DROP TABLE IF EXISTS _del_site; DROP TABLE IF EXISTS _del_emp; DROP TABLE IF EXISTS _del_punch;");
  }
}
