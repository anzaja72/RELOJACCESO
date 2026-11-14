/**
 * Tablets: solo el superadmin las crea; activar en /kiosco solo ocupa una tablet ya creada y nunca crea otra.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "reloj-terminals-"));
const { activateTerminal, createTerminal, getDb, heartbeat, listTerminals, revokeTerminal, terminalTokenActive, TerminalUnavailableError } =
  await import("@/lib/db");
const { seedTiendas } = await import("../scripts/seed-tiendas.mjs");
seedTiendas(getDb(), { password: "prueba-no-productiva-1" });

const activar = (siteId, previousId) =>
  activateTerminal({ siteId, userAgent: "Android tablet", activatedBy: "kiosco@test", previousId });
const vigentes = (siteId) => listTerminals().filter((t) => t.siteId === siteId && !t.revoked);
const sinTablet = (fn) => assert.throws(fn, (e) => e instanceof TerminalUnavailableError);

test("sin tablets creadas por el superadmin no se puede activar", () => {
  sinTablet(() => activar("site_baq_bv"));
  assert.equal(listTerminals().length, 0, "no se crea nada");
});

test("el latido nunca crea tablets", () => {
  heartbeat({ id: "inventada", siteId: "site_baq_bv", userAgent: "x", path: "/kiosk" });
  assert.equal(listTerminals().length, 0);
});

test("el superadmin crea una tablet, queda sin activar y el primer equipo la ocupa", () => {
  const t = createTerminal({ siteId: "site_baq_bv", label: "Tablet caja", by: "admin@test" });
  assert.equal(t.activated, false);
  assert.equal(t.online, false);
  const a = activar("site_baq_bv");
  assert.equal(a.terminalId, t.id);
  assert.ok(terminalTokenActive(t.id, a.tokenId));
  const [now] = vigentes("site_baq_bv");
  assert.equal(now.activated, true);
  assert.equal(now.label, "Tablet caja", "conserva el nombre que puso el superadmin");
});

test("con una sola tablet, activar en otro equipo la reemplaza y el anterior deja de marcar", () => {
  const [t] = vigentes("site_baq_bv");
  const before = getDb().prepare("SELECT token_id FROM terminals WHERE id = ?").get(t.id).token_id;
  const b = activar("site_baq_bv"); // otro navegador: no conoce el id
  assert.equal(b.terminalId, t.id);
  assert.equal(listTerminals().filter((x) => x.siteId === "site_baq_bv").length, 1, "no se crea otra");
  assert.ok(!terminalTokenActive(t.id, before), "el equipo anterior queda fuera");
  assert.ok(terminalTokenActive(t.id, b.tokenId));
});

test("con varias tablets en uso, un equipo nuevo no reemplaza ninguna; el que ya la tenía sí la recupera", () => {
  const [uno] = vigentes("site_baq_bv");
  createTerminal({ siteId: "site_baq_bv", by: "admin@test" });
  const dos = activar("site_baq_bv"); // ocupa la nueva, que estaba libre
  assert.notEqual(dos.terminalId, uno.id);
  sinTablet(() => activar("site_baq_bv"));
  assert.equal(activar("site_baq_bv", uno.id).terminalId, uno.id, "el navegador que la tenía la recupera");
  assert.equal(vigentes("site_baq_bv").length, 2);
});

test("una tablet revocada no se vuelve a activar, ni desde el equipo que la tenía", () => {
  const [uno, dos] = vigentes("site_baq_bv");
  revokeTerminal(uno.id, "gerente@test");
  revokeTerminal(dos.id, "gerente@test");
  sinTablet(() => activar("site_baq_bv", uno.id));
  assert.equal(vigentes("site_baq_bv").length, 0);
  assert.equal(listTerminals().filter((x) => x.siteId === "site_baq_bv").length, 2, "no se crean nuevas");
});

test("una tablet de otra tienda no se ocupa", () => {
  const bv = createTerminal({ siteId: "site_baq_bv", by: "admin@test" });
  sinTablet(() => activar("site_baq_ap", bv.id));
  assert.equal(vigentes("site_baq_ap").length, 0);
});
