"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { authHeaders } from "@/lib/client-session";
import type { Employee } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  scope_type: string;
  totp_enabled: number;
};

type Shift = { id: string; name: string; start_hm: string; end_hm: string; break_min: number };

type ContractRow = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  monthly_salary: number;
  weekly_hours: number;
  currency: string;
};

type ScheduleRow = { id: string; weekday: number; start_hm: string; end_hm: string; shift_id: string | null };

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const LEGAL_KEYS = [
  "ot_day_multiplier",
  "ot_night_multiplier",
  "ot_holiday_multiplier",
  "night_start_hm",
  "night_end_hm",
  "correction_window_hours",
  "unjustified_absence_alert",
  "max_weekly_hours",
  "holidays",
] as const;

const MONTHLY_KEYS = ["monthly_report_endpoint", "monthly_report_enabled"] as const;

export default function SettingsPage() {
  const [eventTypes, setEventTypes] = useState("IN,OUT,BREAK_START,BREAK_END");
  const [retention, setRetention] = useState("365");
  const [region, setRegion] = useState("");
  const [pin, setPin] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; type: string; message: string; acked: number }>>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftForm, setShiftForm] = useState({ name: "", startHm: "07:00", endHm: "16:00", breakMin: "60" });
  const [people, setPeople] = useState<Employee[]>([]);
  const [assignEmp, setAssignEmp] = useState("");
  const [assignDay, setAssignDay] = useState("1");
  const [assignShiftId, setAssignShiftId] = useState("");
  const [empSchedules, setEmpSchedules] = useState<ScheduleRow[]>([]);

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractEmp, setContractEmp] = useState("");
  const [salary, setSalary] = useState("");
  const [weeklyH, setWeeklyH] = useState("48");

  const [legal, setLegal] = useState<Record<string, string>>({
    ot_day_multiplier: "1.25",
    ot_night_multiplier: "1.75",
    ot_holiday_multiplier: "2.0",
    night_start_hm: "19:00",
    night_end_hm: "06:00",
    correction_window_hours: "48",
    unjustified_absence_alert: "3",
    max_weekly_hours: "48",
    holidays: "[]",
  });
  const [monthly, setMonthly] = useState<Record<string, string>>({
    monthly_report_endpoint: "",
    monthly_report_enabled: "0",
    monthly_report_last_sent: "",
  });
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const data = (await api.settings()) as {
        settings: Record<string, string>;
        eventTypes: string[];
        users: UserRow[];
      };
      setEventTypes((data.eventTypes || []).join(","));
      setRetention(data.settings.retention_days || "365");
      setRegion(data.settings.cloud_region_declared || "");
      setUsers(data.users || []);
      setLegal((prev) => {
        const next = { ...prev };
        for (const k of LEGAL_KEYS) if (data.settings[k] != null) next[k] = data.settings[k];
        return next;
      });
      setMonthly((prev) => {
        const next = { ...prev };
        for (const k of MONTHLY_KEYS) if (data.settings[k] != null) next[k] = data.settings[k];
        next.monthly_report_last_sent = data.settings.monthly_report_last_sent || "";
        return next;
      });
      const alertRes = (await api.alerts()) as { alerts: Array<{ id: string; type: string; message: string; acked: number }> };
      setAlerts(alertRes.alerts || []);
      const [shiftRes, peopleRes, contractRes] = await Promise.all([api.shifts(), api.people(), api.contracts()]);
      setShifts(shiftRes.shifts as Shift[]);
      setPeople(peopleRes.employees);
      setContracts(contractRes.contracts as ContractRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inicie sesión como gerente o superadmin");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    try {
      await api.saveSettings({
        event_types: JSON.stringify(eventTypes.split(",").map((s) => s.trim()).filter(Boolean)),
        retention_days: retention,
        cloud_region_declared: region,
        ...(pin ? { supervisor_pin: pin } : {}),
      });
      setPin("");
      setStatus("Ajustes guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function saveLegal() {
    try {
      const body: Record<string, string> = {};
      for (const k of LEGAL_KEYS) body[k] = legal[k];
      await api.saveSettings(body);
      setStatus("Condiciones legales guardadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function saveMonthly() {
    try {
      const body: Record<string, string> = {};
      for (const k of MONTHLY_KEYS) body[k] = monthly[k];
      await api.saveSettings(body);
      setStatus("Informe mensual guardado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const res = await api.monthlySend();
      setStatus(res.ok ? `Informe mensual enviado (HTTP ${res.status}).` : `Fallo: ${res.error || `HTTP ${res.status}`}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }

  async function saveShift() {
    if (!shiftForm.name.trim()) return;
    try {
      await api.saveShift({
        name: shiftForm.name.trim(),
        startHm: shiftForm.startHm,
        endHm: shiftForm.endHm,
        breakMin: Number(shiftForm.breakMin) || 0,
      });
      setShiftForm({ name: "", startHm: "07:00", endHm: "16:00", breakMin: "60" });
      const res = await api.shifts();
      setShifts(res.shifts as Shift[]);
      setStatus("Turno creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el turno");
    }
  }

  async function loadEmpSchedules(employeeId: string) {
    if (!employeeId) {
      setEmpSchedules([]);
      return;
    }
    const res = await api.schedules(employeeId);
    setEmpSchedules(res.schedules as ScheduleRow[]);
  }

  async function assignShift() {
    if (!assignEmp || !assignShiftId) return;
    try {
      await api.saveSchedule({ employeeId: assignEmp, weekday: Number(assignDay), shiftId: assignShiftId });
      await loadEmpSchedules(assignEmp);
      const person = people.find((p) => p.id === assignEmp);
      setStatus(`Turno asignado a ${person?.name ?? ""} el ${WEEKDAYS[Number(assignDay)]}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo asignar el turno");
    }
  }

  async function saveContract() {
    if (!contractEmp || !(Number(salary) > 0)) return;
    try {
      await api.saveContract({
        employeeId: contractEmp,
        monthlySalary: Number(salary),
        weeklyHours: Number(weeklyH) || 48,
      });
      const res = await api.contracts();
      setContracts(res.contracts as ContractRow[]);
      const person = people.find((p) => p.id === contractEmp);
      setStatus(`Contrato de ${person?.name ?? ""} guardado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el contrato");
    }
  }

  async function applyRetention() {
    const headers = authHeaders();
    const res = await fetch("/api/v1/settings/retention", {
      method: "POST",
      headers,
    });
    if (!res.ok) setError("No se pudo aplicar la retención");
    else setStatus("Retención aplicada sobre marcaciones y eventos viejos.");
  }

  return (
    <AppShell title="Ajustes" meta="Política, turnos, contratos, condiciones legales e informe mensual">
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      <div className="split">
        <div className="detail">
          <h2>Política de software</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <Label>Tipos de evento (F03)</Label>
            <Input value={eventTypes} onChange={(e) => setEventTypes(e.target.value)} />
            <Label>Retención en días (S06)</Label>
            <Input value={retention} onChange={(e) => setRetention(e.target.value)} />
            <Label>Región cloud declarada (S05 — plantilla, no contrato)</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            <Label>Nuevo PIN de supervisor (F08)</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="2468 de fábrica" />
            <div className="flex flex-wrap gap-2">
              <Button className="shade" onClick={() => void save()}>Guardar</Button>
              <Button variant="outline" className="shade" onClick={() => void applyRetention()}>
                Aplicar retención ahora
              </Button>
            </div>
          </div>

          <h2 style={{ marginTop: 28, fontSize: 14 }}>Condiciones legales y estatutarias</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <div className="punch-row" style={{ marginTop: 0 }}>
              <div>
                <Label>Recargo extra diurna (×)</Label>
                <Input value={legal.ot_day_multiplier} onChange={(e) => setLegal({ ...legal, ot_day_multiplier: e.target.value })} />
              </div>
              <div>
                <Label>Recargo extra nocturna (×)</Label>
                <Input value={legal.ot_night_multiplier} onChange={(e) => setLegal({ ...legal, ot_night_multiplier: e.target.value })} />
              </div>
              <div>
                <Label>Recargo extra festiva (×)</Label>
                <Input value={legal.ot_holiday_multiplier} onChange={(e) => setLegal({ ...legal, ot_holiday_multiplier: e.target.value })} />
              </div>
              <div>
                <Label>Ventana nocturna (inicio–fin)</Label>
                <div style={{ display: "flex", gap: 6 }}>
                  <Input type="time" value={legal.night_start_hm} onChange={(e) => setLegal({ ...legal, night_start_hm: e.target.value })} />
                  <Input type="time" value={legal.night_end_hm} onChange={(e) => setLegal({ ...legal, night_end_hm: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Plazo corrección (horas)</Label>
                <Input value={legal.correction_window_hours} onChange={(e) => setLegal({ ...legal, correction_window_hours: e.target.value })} />
              </div>
              <div>
                <Label>Alerta faltas injustificadas (n)</Label>
                <Input value={legal.unjustified_absence_alert} onChange={(e) => setLegal({ ...legal, unjustified_absence_alert: e.target.value })} />
              </div>
              <div>
                <Label>Máx. horas/semana (legal)</Label>
                <Input value={legal.max_weekly_hours} onChange={(e) => setLegal({ ...legal, max_weekly_hours: e.target.value })} />
              </div>
              <div>
                <Label>Festivos (JSON: [&quot;2026-12-25&quot;])</Label>
                <Input value={legal.holidays} onChange={(e) => setLegal({ ...legal, holidays: e.target.value })} />
              </div>
            </div>
            <Button className="shade" onClick={() => void saveLegal()}>Guardar condiciones</Button>
          </div>

          <h2 style={{ marginTop: 28, fontSize: 14 }}>Informe mensual a endpoint</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <Label>Endpoint (URL POST con firma HMAC)</Label>
            <Input
              value={monthly.monthly_report_endpoint}
              onChange={(e) => setMonthly({ ...monthly, monthly_report_endpoint: e.target.value })}
              placeholder="https://ejemplo.com/api/nomina/informe"
            />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={monthly.monthly_report_enabled === "1"}
                onChange={(e) => setMonthly({ ...monthly, monthly_report_enabled: e.target.checked ? "1" : "0" })}
              />
              Enviar automáticamente el primer día de cada mes
            </label>
            <div className="flex flex-wrap gap-2">
              <Button className="shade" onClick={() => void saveMonthly()}>Guardar informe</Button>
              <Button variant="outline" className="shade" disabled={sending} onClick={() => void sendNow()}>
                {sending ? "Enviando…" : "Enviar ahora"}
              </Button>
            </div>
            {monthly.monthly_report_last_sent && (
              <p className="muted">Último envío: {monthly.monthly_report_last_sent}</p>
            )}
          </div>

          <h2 style={{ marginTop: 28, fontSize: 14 }}>Usuarios RBAC</h2>
          {users.map((user) => (
            <div key={user.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{user.name}</strong>
              <span>
                {user.email} · {user.role} · {user.scope_type}
                {user.totp_enabled ? " · TOTP" : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="detail">
          <h2>Turnos</h2>
          {shifts.length === 0 && <p className="muted">Sin turnos.</p>}
          {shifts.map((s) => (
            <div key={s.id} className="row" style={{ padding: "8px 0" }}>
              <strong>{s.name}</strong>
              <span>
                {s.start_hm}–{s.end_hm} · descanso {s.break_min} min
              </span>
            </div>
          ))}
          <div className="form" style={{ marginTop: 14 }}>
            <Label>Nombre del turno</Label>
            <Input value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} placeholder="Ej. Rotativo A" />
            <div className="punch-row" style={{ marginTop: 0 }}>
              <div>
                <Label>Inicio</Label>
                <Input type="time" value={shiftForm.startHm} onChange={(e) => setShiftForm({ ...shiftForm, startHm: e.target.value })} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="time" value={shiftForm.endHm} onChange={(e) => setShiftForm({ ...shiftForm, endHm: e.target.value })} />
              </div>
              <div>
                <Label>Descanso (min)</Label>
                <Input value={shiftForm.breakMin} onChange={(e) => setShiftForm({ ...shiftForm, breakMin: e.target.value })} />
              </div>
            </div>
            <Button className="shade" onClick={() => void saveShift()}>Crear turno</Button>
          </div>

          <h2 style={{ marginTop: 24, fontSize: 14 }}>Asignar turno a colaborador</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <select
              className="native-select"
              value={assignEmp}
              onChange={(e) => {
                setAssignEmp(e.target.value);
                void loadEmpSchedules(e.target.value);
              }}
            >
              <option value="">Colaborador</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="punch-row" style={{ marginTop: 0 }}>
              <select className="native-select" value={assignDay} onChange={(e) => setAssignDay(e.target.value)}>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>{w}</option>
                ))}
              </select>
              <select className="native-select" value={assignShiftId} onChange={(e) => setAssignShiftId(e.target.value)}>
                <option value="">Turno</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <Button className="shade" onClick={() => void assignShift()}>Asignar</Button>
          </div>
          {empSchedules.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {empSchedules.map((s) => (
                <div key={s.id} className="row" style={{ padding: "6px 0" }}>
                  <strong style={{ fontSize: 13 }}>{WEEKDAYS[s.weekday]}</strong>
                  <span>
                    {s.start_hm}–{s.end_hm}
                    {s.shift_id ? ` · ${shifts.find((x) => x.id === s.shift_id)?.name ?? ""}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 28, fontSize: 14 }}>Contratos (salario → horas)</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <select className="native-select" value={contractEmp} onChange={(e) => setContractEmp(e.target.value)}>
              <option value="">Colaborador</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="punch-row" style={{ marginTop: 0 }}>
              <div>
                <Label>Salario mensual</Label>
                <Input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="2000000" />
              </div>
              <div>
                <Label>Horas semanales</Label>
                <Input value={weeklyH} onChange={(e) => setWeeklyH(e.target.value)} />
              </div>
            </div>
            <Button className="shade" onClick={() => void saveContract()}>Guardar contrato</Button>
          </div>
          {contracts.length === 0 && <p className="muted" style={{ marginTop: 10 }}>Sin contratos: los valores por hora no se calculan.</p>}
          {contracts.map((c) => (
            <div key={c.employee_id} className="row" style={{ padding: "8px 0" }}>
              <strong>{c.employee_name}</strong>
              <span>
                ${c.monthly_salary.toLocaleString("es-CO")} {c.currency} · {c.weekly_hours} h/semana · $
                {(c.monthly_salary / (c.weekly_hours * 4.33)).toFixed(0)}/hora
              </span>
            </div>
          ))}

          <h2 style={{ marginTop: 28, fontSize: 14 }}>Alertas</h2>
          {alerts.length === 0 && <p className="muted">Sin alertas.</p>}
          {alerts.map((alert) => (
            <div key={alert.id} className="row" style={{ padding: "10px 0" }}>
              <strong>{alert.type}</strong>
              <span>{alert.message}</span>
              {alert.acked ? null : (
                <Button
                  variant="outline"
                  className="shade"
                  style={{ marginTop: 8 }}
                  onClick={() => void api.ackAlert(alert.id).then(load)}
                >
                  Acusar
                </Button>
              )}
            </div>
          ))}
          <p className="muted" style={{ marginTop: 24 }}>
            ISO/SOC, SLA telefónico y stock RMA son contractuales: plantillas en{" "}
            <code>docs/CONTRACT_TEMPLATES.md</code>.
          </p>
        </div>
      </div>
      {status && <p className="ok-text" style={{ padding: 16 }}>{status}</p>}
    </AppShell>
  );
}
