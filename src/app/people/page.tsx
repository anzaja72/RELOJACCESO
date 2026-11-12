"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SitePicker } from "@/components/site-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, downloadDossier, stores, type HrFields } from "@/lib/api-client";
import { localDay } from "@/lib/config";
import type { EmployeeType } from "@/lib/stores";
import type { Employee, Site } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";

export default function PeoplePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [siteId, setSiteId] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("Colaborador");
  const [pin, setPin] = useState("");
  const [transfer, setTransfer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const perms = usePermissions();
  const [types, setTypes] = useState<EmployeeType[]>([]);
  const [hr, setHr] = useState({ documentId: "", employeeTypeId: "", salary: "", employmentStatus: "activo" });
  const [salaryWas, setSalaryWas] = useState("");
  const [editType, setEditType] = useState<Partial<EmployeeType> | null>(null);
  const [dossierTo, setDossierTo] = useState(() => localDay());
  const [dossierFrom, setDossierFrom] = useState(() => localDay(new Date(Date.now() - 29 * 86_400_000)));

  async function reload(site?: string) {
    const [sitesRes, people, typesRes] = await Promise.all([api.sites(), api.people(true), stores.types()]);
    setSites(sitesRes.sites);
    setTypes(typesRes.types);
    const sid = site || siteId || sitesRes.sites[0]?.id || "";
    if (!siteId && sid) setSiteId(sid);
    setEmployees(people.employees);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Inicie sesión para gestionar personas");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    return employees.filter((e) => {
      if (siteId && e.siteId !== siteId) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${e.name} ${e.code} ${e.role}`.toLowerCase().includes(q);
    });
  }, [employees, siteId, query]);

  function pick(employee: Employee) {
    setSelected(employee);
    setName(employee.name);
    setCode(employee.code);
    setRole(employee.role);
    setTransfer(employee.siteId);
    setPin("");
    setHr({
      documentId: employee.documentId ?? "",
      employeeTypeId: employee.employeeTypeId ?? "",
      salary: "",
      employmentStatus: employee.employmentStatus ?? "activo",
    });
    setSalaryWas("");
    setStatus(null);
    setError(null);
    // El salario vive en contratos (nómina) y solo lo entregan a quien puede verlo.
    if (perms.can("employee.salary_view")) {
      void api
        .contracts(employee.id)
        .then(({ contracts }) => {
          const value = contracts[0] ? String(contracts[0].monthly_salary) : "";
          setHr((h) => ({ ...h, salary: value }));
          setSalaryWas(value);
        })
        .catch(() => undefined);
    }
  }

  /** Ficha laboral: solo RR. HH. (la API rechaza al resto). */
  function hrBody(): HrFields {
    if (!perms.can("employee.hr_edit")) return {};
    return {
      documentId: hr.documentId.trim() || null,
      employeeTypeId: hr.employeeTypeId || null,
      employmentStatus: hr.employmentStatus,
    };
  }

  async function saveSalary(employeeId: string) {
    if (!perms.can("employee.salary_view") || hr.salary === salaryWas || hr.salary === "") return;
    const type = types.find((t) => t.id === hr.employeeTypeId);
    await api.saveContract({
      employeeId,
      monthlySalary: Number(hr.salary),
      weeklyHours: type?.weeklyHours ?? type?.minWeeklyHours ?? 42,
    });
  }

  async function saveType() {
    if (!editType) return;
    setError(null);
    try {
      await stores.saveType(editType);
      setEditType(null);
      setTypes((await stores.types()).types);
      setStatus("Tipo de jornada guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tipo");
    }
  }

  async function create() {
    setError(null);
    try {
      const { employee } = await api.createEmployee({ name, code, siteId, role, pin: pin || undefined, ...hrBody() });
      await saveSalary(employee.id);
      await reload(siteId);
      setStatus("Colaborador creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    }
  }

  async function save() {
    if (!selected) return;
    setError(null);
    try {
      await api.patchEmployee(selected.id, {
        name,
        code,
        role,
        siteId: transfer !== selected.siteId ? transfer : undefined,
        pin: pin || undefined,
        ...hrBody(),
      });
      await saveSalary(selected.id);
      await reload(siteId);
      setStatus(transfer !== selected.siteId ? "Traslado registrado." : "Datos actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function toggle(active: boolean) {
    if (!selected) return;
    await api.patchEmployee(selected.id, { active });
    await reload(siteId);
    setStatus(active ? "Reactivado." : "Desactivado.");
  }

  async function exportDossier() {
    if (!selected) return;
    try {
      const { sha256 } = await downloadDossier(selected.id, dossierFrom, dossierTo);
      setStatus(`Expediente descargado. Huella SHA-256: ${sha256 ?? "n/d"}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el expediente");
    }
  }

  async function softDelete() {
    if (!selected) return;
    await api.patchEmployee(selected.id, { deleted: true });
    setSelected(null);
    await reload(siteId);
    setStatus("Baja lógica. Plantillas biométricas borradas.");
  }

  return (
    <AppShell
      title="Personas"
      meta="Ficha de RR. HH., tienda base, tipo de jornada y baja lógica (plantillas se eliminan)"
      actions={
        <>
          <input className="search" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} />
          {sites.length > 0 && <SitePicker sites={sites} value={siteId} onChange={setSiteId} />}
        </>
      }
    >
      {error && <p className="err-text" style={{ padding: 16 }}>{error}</p>}
      <div className="split">
        <div className="split-list">
          {visible.map((employee) => (
            <button
              key={employee.id}
              type="button"
              className={`row shade ${selected?.id === employee.id ? "active" : ""}`}
              onClick={() => pick(employee)}
            >
              <strong>{employee.name}</strong>
              <span>
                {employee.code} · {employee.role} ·{" "}
                {employee.deleted ? "baja" : employee.active ? "activo" : "inactivo"}
              </span>
              <div className="tags">
                <span className="pill">{employee.enrolled ? `${employee.templateCount} plantillas` : "sin enrollar"}</span>
                {types.find((t) => t.id === employee.employeeTypeId) ? (
                  <span className="pill">{types.find((t) => t.id === employee.employeeTypeId)?.name}</span>
                ) : (
                  <span className="pill warn">sin tipo de jornada</span>
                )}
                {!employee.documentId && <span className="pill warn">sin identificación</span>}
              </div>
            </button>
          ))}
          {visible.length === 0 && <p className="empty">Sin colaboradores en el filtro.</p>}
        </div>
        <div className="detail">
          <h2>{selected ? selected.name : "Nuevo colaborador"}</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" />
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Puesto" />
            </div>
            <Label>Sede (traslado)</Label>
            <select className="native-select" value={transfer || siteId} onChange={(e) => setTransfer(e.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            <Label>Ficha laboral (RR. HH.)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={hr.documentId}
                disabled={!perms.can("employee.hr_edit")}
                onChange={(e) => setHr({ ...hr, documentId: e.target.value })}
                placeholder="Identificación"
              />
              <select
                className="native-select"
                value={hr.employeeTypeId}
                disabled={!perms.can("employee.hr_edit")}
                onChange={(e) => setHr({ ...hr, employeeTypeId: e.target.value })}
              >
                <option value="">Tipo de jornada…</option>
                {types.filter((t) => t.active).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {perms.can("employee.salary_view") && (
                <Input
                  type="number"
                  min={0}
                  value={hr.salary}
                  onChange={(e) => setHr({ ...hr, salary: e.target.value })}
                  placeholder="Salario mensual (COP)"
                />
              )}
              <select
                className="native-select"
                value={hr.employmentStatus}
                disabled={!perms.can("employee.hr_edit")}
                onChange={(e) => setHr({ ...hr, employmentStatus: e.target.value })}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="retirado">Retirado</option>
              </select>
            </div>
            {!perms.can("employee.manage") && perms.ready && (
              <p className="muted">Solo RR. HH. crea empleados, cambia su tienda base o cargo y edita esta ficha.</p>
            )}
            <Label>PIN personal (opcional, no abre marcación libre)</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Solo con supervisor" />
            <div className="flex flex-wrap gap-2">
              {selected ? (
                <Button className="shade" onClick={() => void save()}>Guardar</Button>
              ) : (
                <Button className="shade" onClick={() => void create()}>Crear</Button>
              )}
              {selected ? (
                <>
                  <Button variant="outline" className="shade" onClick={() => void toggle(!selected.active)}>
                    {selected.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button variant="outline" className="shade" onClick={() => void softDelete()}>
                    Baja + borrar biometría
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                className="shade"
                onClick={() => {
                  setSelected(null);
                  setName("");
                  setCode("");
                  setRole("Colaborador");
                  setPin("");
                }}
              >
                Nuevo
              </Button>
            </div>
            {status && <p className="ok-text">{status}</p>}
          </div>
          {selected && (
            <div className="form" style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 14 }}>Expediente de cumplimiento (PDF)</h2>
              <p className="muted">
                Horas, marcaciones, correcciones aprobadas, alertas de jornada y estado de integridad del registro.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Desde</Label>
                  <Input type="date" value={dossierFrom} onChange={(e) => setDossierFrom(e.target.value)} />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input type="date" value={dossierTo} onChange={(e) => setDossierTo(e.target.value)} />
                </div>
              </div>
              <div>
                <Button variant="outline" className="shade" onClick={() => void exportDossier()}>
                  Descargar expediente
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="section">
        <h3>Tipos de jornada (RF-02)</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          Valores de referencia del anexo; parametrizables y sujetos a validación jurídica. Un responsable de turno cuenta para la cobertura obligatoria.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th><th className="num">Días/semana</th><th className="num">Horas/semana</th><th className="num">Mínimo</th>
                <th className="num">Almuerzo</th><th>Responsable de turno</th><th>Vigencia</th><th>Nota</th><th />
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong>{!t.active && <span className="pill" style={{ marginLeft: 6 }}>inactivo</span>}</td>
                  <td className="num">{t.variableDays ? "variable" : t.daysPerWeek}</td>
                  <td className="num">{t.weeklyHours ?? "—"}</td>
                  <td className="num">{t.minWeeklyHours ?? "—"}</td>
                  <td className="num">{t.lunchMin}′</td>
                  <td>{t.isShiftLead ? "Sí" : "No"}</td>
                  <td>{t.validFrom ?? "—"}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 260 }} className="muted">{t.note}</td>
                  <td>
                    {perms.can("types.manage") && (
                      <Button variant="outline" className="shade" onClick={() => setEditType(t)}>Editar</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {perms.can("types.manage") && !editType && (
          <Button variant="outline" className="shade" style={{ marginTop: 10 }} onClick={() => setEditType({ name: "", daysPerWeek: 6, weeklyHours: 42, lunchMin: 30, active: true })}>
            Nuevo tipo
          </Button>
        )}
        {editType && (
          <div className="toolbar" style={{ padding: "12px 0 0", border: 0 }}>
            <label>Nombre<Input value={editType.name ?? ""} onChange={(e) => setEditType({ ...editType, name: e.target.value })} /></label>
            <label>Días/semana<Input type="number" min={0} max={7} value={editType.daysPerWeek ?? ""} disabled={editType.variableDays} onChange={(e) => setEditType({ ...editType, daysPerWeek: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Horas/semana<Input type="number" min={0} max={84} value={editType.weeklyHours ?? ""} onChange={(e) => setEditType({ ...editType, weeklyHours: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Mínimo<Input type="number" min={0} max={84} value={editType.minWeeklyHours ?? ""} onChange={(e) => setEditType({ ...editType, minWeeklyHours: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Almuerzo (min)<Input type="number" min={0} max={180} value={editType.lunchMin ?? 30} onChange={(e) => setEditType({ ...editType, lunchMin: Number(e.target.value) })} /></label>
            <label>Vigencia desde<Input type="date" value={editType.validFrom ?? ""} onChange={(e) => setEditType({ ...editType, validFrom: e.target.value || null })} /></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 18 }}><input type="checkbox" checked={Boolean(editType.variableDays)} onChange={(e) => setEditType({ ...editType, variableDays: e.target.checked })} />Días variables</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 18 }}><input type="checkbox" checked={Boolean(editType.isShiftLead)} onChange={(e) => setEditType({ ...editType, isShiftLead: e.target.checked })} />Responsable de turno</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 18 }}><input type="checkbox" checked={editType.active !== false} onChange={(e) => setEditType({ ...editType, active: e.target.checked })} />Activo</label>
            <Button className="shade" style={{ marginTop: 18 }} onClick={() => void saveType()}>Guardar tipo</Button>
            <Button variant="outline" className="shade" style={{ marginTop: 18 }} onClick={() => setEditType(null)}>Cancelar</Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
