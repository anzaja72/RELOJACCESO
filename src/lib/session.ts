import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.DEMO_API_KEY || "reloj-cr-jwt-v1";

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

export function signToken(user: SessionUser, hours = 12) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ ...user, exp: Date.now() + hours * 3600_000 }),
  );
  const sig = b64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string): SessionUser | null {
  const [header, payload, sig] = token.split(".");
  if (!header || !payload || !sig) return null;
  const expected = b64url(
    createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return null;
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & {
    exp: number;
  };
  if (data.exp < Date.now()) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    scopeType: data.scopeType,
    scopeId: data.scopeId,
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
