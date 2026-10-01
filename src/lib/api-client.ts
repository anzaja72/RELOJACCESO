import { clearSession, getToken } from "@/lib/client-session";
import { clearTerminal, getTerminal } from "@/lib/terminal";
import type {
  AttendanceRow,
  Employee,
  Punch,
  Site,
  SyncItem,
  Terminal,
} from "@/lib/types";
import { TIMEZONE } from "@/lib/config";

async function request<T>(
  path: string,
  init: RequestInit & { admin?: boolean; kiosk?: boolean; token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // kiosk: token de terminal (o la sesión de un usuario probando el kiosco).
  const bearer =
    init.token ??
    (init.kiosk ? (getTerminal()?.token ?? getToken()) : init.admin ? getToken() : null);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (response.status === 401 && !init.token) {
    if (init.kiosk && getTerminal()) clearTerminal();
    else if (init.admin) expireSession();
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: string }).error)
        : `Error ${response.status}`;
    const err = new Error(message) as Error & { code?: string; status?: number };
    if (typeof data === "object" && data && "code" in data) {
      err.code = String((data as { code: string }).code);
    }
    err.status = response.status;
    throw err;
  }
  return data as T;
}

function expireSession() {
  clearSession();
  const here = window.location.pathname + window.location.search;
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign(`/login?next=${encodeURIComponent(here)}`);
  }
}

export const api = {
  sites: () => request<{ sites: Site[] }>("/api/sites"),
  catalog: () =>
    request<{
      sites: Site[];
      countries: unknown[];
      zones: unknown[];
      eventTypes: string[];
    }>("/api/v1/catalog"),
  employees: (site?: string) =>
    request<{ employees: Employee[] }>(
      site ? `/api/employees?site=${encodeURIComponent(site)}` : "/api/employees",
      { admin: true },
    ),
  gallery: (site?: string) =>
    request<{
      employees: Employee[];
      templates: { id: string; employeeId: string; descriptor: number[]; createdAt: string }[];
    }>(site ? `/api/templates?site=${encodeURIComponent(site)}` : "/api/templates", {
      kiosk: true,
    }),
  createEmployee: (body: {
    name: string;
    code: string;
    siteId: string;
    role?: string;
    consentAt?: string;
    pin?: string;
  }) =>
    request<{ employee: Employee }>("/api/v1/employees", {
      method: "POST",
      admin: true,
      body: JSON.stringify(body),
    }),
  saveTemplates: (
    employeeId: string,
    descriptors: number[][],
    consentAt: string,
  ) =>
    request<{ ok: boolean; employee: Employee }>(
      `/api/employees/${employeeId}/templates`,
      {
        method: "POST",
        admin: true,
        body: JSON.stringify({ descriptors, consentAt }),
      },
    ),
  punches: (site?: string) =>
    request<{ punches: Punch[] }>(
      site ? `/api/punches?site=${encodeURIComponent(site)}&limit=80` : "/api/punches?limit=80",
      { admin: true },
    ),
  createPunch: (body: SyncItem & { offline?: boolean }) =>
    request<{ punch: Punch; created: boolean }>("/api/punches", {
      method: "POST",
      kiosk: true,
      body: JSON.stringify(body),
    }),
  pinPunch: (body: {
    employeeId: string;
    siteId: string;
    type: string;
    terminalId: string;
    reason: string;
    supervisorPin: string;
  }) =>
    request<{ punch: Punch; created: boolean }>("/api/v1/punches/pin", {
      method: "POST",
      kiosk: true,
      body: JSON.stringify(body),
    }),
  sync: (punches: SyncItem[]) =>
    request<{ ok: boolean; accepted: string[]; duplicates: string[] }>(
      "/api/sync",
      { method: "POST", kiosk: true, body: JSON.stringify({ punches }) },
    ),
  reportAlert: (body: { type: string; message: string; siteId?: string }) =>
    request<{ id: string }>("/api/v1/alerts", {
      method: "POST",
      kiosk: true,
      body: JSON.stringify(body),
    }),
  terminals: () => request<{ terminals: Terminal[] }>("/api/terminals", { admin: true }),
  heartbeat: (body: {
    id: string;
    siteId: string;
    label?: string;
    userAgent: string;
    path: string;
  }) =>
    request<{ ok: boolean }>("/api/terminals/heartbeat", {
      method: "POST",
      kiosk: true,
      body: JSON.stringify(body),
    }),
  patchEmployee: (
    id: string,
    body: {
      active?: boolean;
      revokeConsent?: boolean;
      name?: string;
      code?: string;
      siteId?: string;
      deleted?: boolean;
      pin?: string | null;
      role?: string;
    },
  ) =>
    request<{ employee: Employee }>(`/api/v1/employees/${id}`, {
      method: "PATCH",
      admin: true,
      body: JSON.stringify(body),
    }),
  wipeTemplates: (id: string) =>
    request<{ ok: boolean; employee: Employee }>(`/api/employees/${id}/templates`, {
      method: "DELETE",
      admin: true,
    }),
  audit: () =>
    request<{ events: Array<{ id: string; type: string; payload: unknown; created_at: string }> }>(
      "/api/audit",
      { admin: true },
    ),
  login: (body: { email: string; password: string; totp?: string }) =>
    request<{ token: string; user: { email: string; name: string; role: string } }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify(body) },
    ),
  activateTerminal: (body: { siteId: string; label?: string }, token: string) =>
    request<{ token: string; terminalId: string; site: Site }>("/api/v1/terminals/activate", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  me: () => request<{ user: { email: string; name: string; role: string } }>("/api/v1/auth/me", { admin: true }),
  reports: (qs: string) => request<Record<string, unknown>>(`/api/v1/reports?${qs}`, { admin: true }),
  settings: () => request<Record<string, unknown>>("/api/v1/settings", { admin: true }),
  integrity: () =>
    request<{
      ok: boolean;
      chainSince: string | null;
      chain: { ok: boolean; checked: number; brokenAt: string | null; reason: string | null };
      punches: { checked: number; uncovered: number; mismatches: Array<{ id: string; problem: string; detail: string }> };
    }>("/api/v1/integrity", { admin: true }),
  brand: () =>
    request<{ brand: { name: string; primary: string; dark: string; light: string } | null }>("/api/v1/brand"),
  saveSettings: (body: Record<string, string>) =>
    request<{ ok: boolean }>("/api/v1/settings", {
      method: "PATCH",
      admin: true,
      body: JSON.stringify(body),
    }),
  corrections: () => request<{ corrections: unknown[] }>("/api/v1/corrections", { admin: true }),
  createCorrection: (body: { punchId: string; reason: string; newTs?: string; newType?: string }) =>
    request<{ correction: unknown }>("/api/v1/corrections", {
      method: "POST",
      admin: true,
      body: JSON.stringify(body),
    }),
  exceptions: () => request<{ exceptions: unknown[] }>("/api/v1/exceptions", { admin: true }),
  createException: (body: { employeeId: string; date: string; type: string; reason: string }) =>
    request<{ exception: unknown }>("/api/v1/exceptions", {
      method: "POST",
      admin: true,
      body: JSON.stringify(body),
    }),
  alerts: () => request<{ alerts: unknown[] }>("/api/v1/alerts", { admin: true }),
  ackAlert: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/alerts/${id}`, { method: "PATCH", admin: true }),
  enrollmentAudit: (employee?: string) =>
    request<{ audit: unknown[] }>(
      employee
        ? `/api/v1/enrollment-audit?employee=${encodeURIComponent(employee)}`
        : "/api/v1/enrollment-audit",
      { admin: true },
    ),
  people: (includeDeleted = false) =>
    request<{ employees: Employee[] }>(
      `/api/v1/employees?includeDeleted=${includeDeleted ? "1" : "0"}`,
      { admin: true },
    ),
  briefing: (day?: string, site?: string) =>
    request<{
      briefing: { source: string; bullets: Array<{ text: string; href: string; cites: Array<{ type: string; id: string }> }> };
      llm: { provider: string };
    }>(
      `/api/v1/ai/briefing?${new URLSearchParams({ ...(day ? { day } : {}), ...(site ? { site } : {}) }).toString()}`,
      { method: "POST", admin: true },
    ),
  chat: (body: { question: string; day?: string; siteId?: string }) =>
    request<{
      answer: string;
      intent: string;
      cites: Array<{ type: string; id: string }>;
      source: string;
      missing: boolean;
    }>("/api/v1/ai/chat", { method: "POST", admin: true, body: JSON.stringify(body) }),
  anomalies: (qs = "") =>
    request<{ anomalies: Array<{
      id: string;
      kind: string;
      siteId: string | null;
      day: string;
      message: string;
      punchIds: string[];
      reviewed: boolean;
      reviewedBy: string | null;
    }> }>(`/api/v1/anomalies${qs ? `?${qs}` : ""}`, { admin: true }),
  scanAnomalies: (day?: string) =>
    request<{ created: number; anomalies: unknown[] }>(
      `/api/v1/anomalies${day ? `?day=${encodeURIComponent(day)}` : ""}`,
      { method: "POST", admin: true },
    ),
  reviewAnomaly: (id: string) =>
    request<{ anomaly: { id: string } }>(`/api/v1/anomalies/${id}`, {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ reviewed: true }),
    }),
  health: () =>
    request<{
      ok: boolean;
      today: { present: number; absent: number; enrolled: number; punches: number };
      terminals: Terminal[];
    }>("/api/health", { admin: true }),
};

/** Descarga el expediente PDF de un trabajador (la ruta exige el token en la cabecera). */
export async function downloadDossier(employeeId: string, from: string, to: string) {
  const res = await fetch(
    `/api/v1/employees/${encodeURIComponent(employeeId)}/dossier?from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${getToken() ?? ""}` }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "expediente.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return { name, sha256: res.headers.get("x-document-sha256") };
}

export async function fetchAttendance(site?: string): Promise<{
  punches: Punch[];
  employees: Employee[];
  terminals: Terminal[];
  rows: AttendanceRow[];
}> {
  const [punchesRes, employeesRes, terminalsRes] = await Promise.all([
    api.punches(site),
    api.employees(site),
    api.terminals(),
  ]);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: TIMEZONE,
  });
  const rows: AttendanceRow[] = employeesRes.employees.map((employee) => {
    const mine = punchesRes.punches.filter((p) => p.employeeId === employee.id);
    const last = mine[0] ?? null;
    const lastIn = mine.find((p) => {
      const day = new Date(p.capturedAt).toLocaleDateString("en-CA", {
        timeZone: TIMEZONE,
      });
      return p.type === "IN" && p.decision === "matched" && day === today;
    });
    const lastOut = mine.find((p) => {
      const day = new Date(p.capturedAt).toLocaleDateString("en-CA", {
        timeZone: TIMEZONE,
      });
      return p.type === "OUT" && p.decision === "matched" && day === today;
    });
    const present = Boolean(
      lastIn &&
        (!lastOut ||
          new Date(lastIn.capturedAt).getTime() >
            new Date(lastOut.capturedAt).getTime()),
    );
    return { employee, status: present ? "present" : "absent", lastPunch: last };
  });
  return {
    punches: punchesRes.punches,
    employees: employeesRes.employees,
    terminals: terminalsRes.terminals,
    rows,
  };
}
