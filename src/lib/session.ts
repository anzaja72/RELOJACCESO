import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { jwtSecret } from "@/lib/secrets";

export type Role =
  | "superadmin"
  | "zone_manager"
  | "site_manager"
  | "operator"
  | "auditor";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  scopeType: "all" | "country" | "zone" | "site";
  scopeId: string | null;
};

function b64url(buf: Buffer | string) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64url");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return prev.length === next.length && timingSafeEqual(prev, next);
}

export type TerminalSession = {
  terminalId: string;
  siteId: string;
  tokenId: string;
};

function sign(body: Record<string, unknown>, hours: number) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...body, exp: Date.now() + hours * 3600_000 }));
  const sig = b64url(
    createHmac("sha256", jwtSecret()).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

function verify(token: string): Record<string, unknown> | null {
  const [header, payload, sig] = token.split(".");
  if (!header || !payload || !sig) return null;
  const expected = b64url(
    createHmac("sha256", jwtSecret()).update(`${header}.${payload}`).digest(),
  );
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return null;
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
  if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
  return data;
}

export function signToken(user: SessionUser, hours = 12) {
  return sign({ ...user, kind: "user" }, hours);
}

export function verifyToken(token: string): SessionUser | null {
  const data = verify(token);
  // Tokens sin `kind` son de usuario (emitidos antes de existir terminales).
  if (!data || (data.kind ?? "user") !== "user") return null;
  const user = data as unknown as SessionUser;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeType: user.scopeType,
    scopeId: user.scopeId,
  };
}

export const TERMINAL_TOKEN_HOURS = 24 * 365;

export function signTerminalToken(terminal: TerminalSession) {
  return sign({ ...terminal, kind: "terminal" }, TERMINAL_TOKEN_HOURS);
}

export function verifyTerminalToken(token: string): TerminalSession | null {
  const data = verify(token);
  if (!data || data.kind !== "terminal") return null;
  return {
    terminalId: String(data.terminalId),
    siteId: String(data.siteId),
    tokenId: String(data.tokenId),
  };
}

export function totpCode(secretB32: string, at = Date.now()) {
  const secret = Buffer.from(secretB32, "base64");
  const counter = Math.floor(at / 30_000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function verifyTotp(secretB32: string, code: string) {
  const now = Date.now();
  return [-1, 0, 1].some((w) => totpCode(secretB32, now + w * 30_000) === code);
}

export function newTotpSecret() {
  return randomBytes(20).toString("base64");
}

export const ROLE_RANK: Record<Role, number> = {
  auditor: 1,
  operator: 2,
  site_manager: 3,
  zone_manager: 4,
  superadmin: 5,
};

export function canWrite(role: Role) {
  return ROLE_RANK[role] >= ROLE_RANK.operator && role !== "auditor";
}

export function canApprove(role: Role) {
  return ROLE_RANK[role] >= ROLE_RANK.site_manager;
}
