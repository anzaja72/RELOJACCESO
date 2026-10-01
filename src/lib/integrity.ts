import { createHash } from "node:crypto";

// Cadena de hashes sobre el registro de eventos: cada evento sella al anterior,
// así que editar, borrar o reordenar un evento intermedio deja la cadena rota.
export const GENESIS_HASH = "0".repeat(64);

export type ChainRow = {
  id: string;
  type: string;
  payload: string;
  created_at: string;
  prev_hash: string | null;
  hash: string | null;
};

export function chainHash(
  prev: string,
  e: { id: string; type: string; payload: string; created_at: string },
) {
  return createHash("sha256")
    .update([prev, e.id, e.type, e.payload, e.created_at].join("\n"))
    .digest("hex");
}

/**
 * `rows` en orden de inserción. El primer eslabón se toma como ancla: la
 * retención puede haber borrado los anteriores, así que su prev_hash no se exige.
 */
export function verifyChain(rows: ChainRow[]): {
  ok: boolean;
  checked: number;
  brokenAt: string | null;
  reason: string | null;
} {
  let prev: string | null = null;
  for (const row of rows) {
    if (!row.hash || row.prev_hash === null) {
      return { ok: false, checked: rows.indexOf(row), brokenAt: row.id, reason: "evento sin sello" };
    }
    if (prev !== null && row.prev_hash !== prev) {
      return { ok: false, checked: rows.indexOf(row), brokenAt: row.id, reason: "falta o cambió un evento anterior" };
    }
    if (chainHash(row.prev_hash, row) !== row.hash) {
      return { ok: false, checked: rows.indexOf(row), brokenAt: row.id, reason: "el contenido del evento fue modificado" };
    }
    prev = row.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null, reason: null };
}
