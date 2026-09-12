"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SitePicker } from "@/components/site-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import type { Employee, Site } from "@/lib/types";

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

  async function reload(site?: string) {
    const [sitesRes, people] = await Promise.all([api.sites(), api.people(true)]);
    setSites(sitesRes.sites);
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
    setStatus(null);
    setError(null);
  }

  async function create() {
    setError(null);
    try {
      await api.createEmployee({ name, code, siteId, role, pin: pin || undefined });
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
      });
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
      meta="CRUD, traslado entre sedes y baja lógica (plantillas se eliminan)"
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
        </div>
      </div>
    </AppShell>
  );
}
