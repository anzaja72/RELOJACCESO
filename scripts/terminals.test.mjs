/**
 * Reactivar el kiosco desde el mismo navegador reutiliza la tablet: no se acumulan tablets duplicadas.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "reloj-terminals-"));
const { activateTerminal, getDb, listTerminals, revokeTerminal, terminalTokenActive } = await import("@/lib/db");
const { seedTiendas } = await import("../scripts/seed-tiendas.mjs");
seedTiendas(getDb(), { password: "prueba-no-productiva-1" });

const activar = (siteId, previousId) =>
  activateTerminal({ siteId, userAgent: "Android tablet", activatedBy: "kiosco@test", previousId });
const deSede = (siteId) => listTerminals().filter((t) => t.siteId === siteId);

test("la primera activación crea la tablet", () => {
  const a = activar("site_baq_bv");
  assert.equal(deSede("site_baq_bv").length, 1);
  assert.ok(terminalTokenActive(a.terminalId, a.tokenId));
});

test("reactivar con el id anterior reutiliza la tablet y cambia el token", () => {
  const [prev] = deSede("site_baq_bv");
  const first = getDb().prepare("SELECT token_id FROM terminals WHERE id = ?").get(prev.id).token_id;
  const b = activar("site_baq_bv", prev.id);
  assert.equal(b.terminalId, prev.id);
  assert.equal(deSede("site_baq_bv").length, 1, "no se crea otra tablet");
  assert.ok(terminalTokenActive(prev.id, b.tokenId), "el token nuevo sirve");
  assert.ok(!terminalTokenActive(prev.id, first), "el token anterior deja de servir");
});

test("una tablet revocada vuelve a quedar vigente al reactivarla, sin duplicarse", () => {
  const [prev] = deSede("site_baq_bv");
  revokeTerminal(prev.id, "gerente@test");
  assert.ok(deSede("site_baq_bv")[0].revoked);
  const c = activar("site_baq_bv", prev.id);
  assert.equal(c.terminalId, prev.id);
  const [now] = deSede("site_baq_bv");
  assert.ok(!now.revoked);
  assert.ok(terminalTokenActive(prev.id, c.tokenId));
  assert.equal(deSede("site_baq_bv").length, 1);
});

test("un id de otra tienda o inexistente crea una tablet nueva en la tienda pedida", () => {
  const [bv] = deSede("site_baq_bv");
  const ap = activar("site_baq_ap", bv.id);
  assert.notEqual(ap.terminalId, bv.id, "no se mueve una tablet de Buenavista a Alto Prado");
  assert.equal(deSede("site_baq_ap").length, 1);
  assert.equal(deSede("site_baq_bv").length, 1);
  const otra = activar("site_baq_ap", "no-existe");
  assert.notEqual(otra.terminalId, "no-existe");
  assert.equal(deSede("site_baq_ap").length, 2);
});
