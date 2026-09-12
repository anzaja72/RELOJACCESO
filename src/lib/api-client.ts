import { PUBLIC_API_KEY } from "@/lib/config";
import type {
  AttendanceRow,
  Employee,
  Punch,
  Site,
  SyncItem,
  Terminal,
} from "@/lib/types";

async function request<T>(
  path: string,
  init: RequestInit & { admin?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.admin) headers.set("X-API-Key", PUBLIC_API_KEY);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: string }).error)
        : `Error ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  sites: () => request<{ sites: Site[] }>("/api/sites"),
  employees: (site?: string) =>
    request<{ employees: Employee[] }>(
      site ? `/api/employees?site=${encodeURIComponent(site)}` : "/api/employees",
    ),
  gallery: (site?: string) =>
    request<{
      employees: Employee[];
      templates: { id: string; employeeId: string; descriptor: number[]; createdAt: string }[];
    }>(site ? `/api/templates?site=${encodeURIComponent(site)}` : "/api/templates"),
  createEmployee: (body: {
    name: string;
    code: string;
    siteId: string;
    role?: string;
    consentAt?: string;
  }) =>
    request<{ employee: Employee }>("/api/employees", {
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
    ),
  createPunch: (body: SyncItem & { offline?: boolean }) =>
    request<{ punch: Punch; created: boolean }>("/api/punches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sync: (punches: SyncItem[]) =>
    request<{ ok: boolean; accepted: string[]; duplicates: string[] }>(
      "/api/sync",
      { method: "POST", body: JSON.stringify({ punches }) },
    ),
  terminals: () => request<{ terminals: Terminal[] }>("/api/terminals"),
  heartbeat: (body: {
    id: string;
    siteId: string;
    label?: string;
    userAgent: string;
    path: string;
  }) =>
    request<{ ok: boolean }>("/api/terminals/heartbeat", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEmployee: (
    id: string,
    body: { active?: boolean; revokeConsent?: boolean },
  ) =>
    request<{ employee: Employee }>(`/api/employees/${id}`, {
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
  health: () =>
    request<{
      ok: boolean;
      today: { present: number; absent: number; enrolled: number; punches: number };
      terminals: Terminal[];
    }>("/api/health"),
};

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
    timeZone: "America/Costa_Rica",
  });
  const rows: AttendanceRow[] = employeesRes.employees.map((employee) => {
    const mine = punchesRes.punches.filter((p) => p.employeeId === employee.id);
    const last = mine[0] ?? null;
    const lastIn = mine.find((p) => {
      const day = new Date(p.capturedAt).toLocaleDateString("en-CA", {
        timeZone: "America/Costa_Rica",
      });
      return p.type === "IN" && p.decision === "matched" && day === today;
    });
    const lastOut = mine.find((p) => {
      const day = new Date(p.capturedAt).toLocaleDateString("en-CA", {
        timeZone: "America/Costa_Rica",
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
