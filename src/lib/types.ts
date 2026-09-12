export type PunchType = "IN" | "OUT";

export type PunchDecision =
  | "matched"
  | "unknown"
  | "duplicate"
  | "no_face"
  | "queued";

export type Site = {
  id: string;
  code: string;
  name: string;
  city: string;
  timezone: string;
};

export type Employee = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  role: string;
  active: boolean;
  consentAt: string | null;
  enrolled: boolean;
  templateCount: number;
};

export type FaceTemplate = {
  id: string;
  employeeId: string;
  descriptor: number[];
  createdAt: string;
};

export type Punch = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  siteId: string;
  type: PunchType;
  capturedAt: string;
  receivedAt: string;
  terminalId: string;
  matchScore: number | null;
  decision: PunchDecision;
  offline: boolean;
  livenessHint: "pass" | "fail" | "skipped";
};

export type Terminal = {
  id: string;
  siteId: string;
  label: string;
  lastSeen: string;
  userAgent: string;
  path: string;
  online: boolean;
};

export type IdentifyResult = {
  decision: "matched" | "unknown";
  employee: Employee | null;
  score: number | null;
  threshold: number;
};

export type AttendanceRow = {
  employee: Employee;
  status: "present" | "absent";
  lastPunch: Punch | null;
};

export type SyncItem = {
  id: string;
  employeeId: string | null;
  siteId: string;
  type: PunchType;
  capturedAt: string;
  terminalId: string;
  matchScore: number | null;
  decision: PunchDecision;
  livenessHint: "pass" | "fail" | "skipped";
};

export type QueuedPunch = SyncItem & {
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};
