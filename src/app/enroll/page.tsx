"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OfflineBadge } from "@/components/offline-badge";
import { SitePicker } from "@/components/site-picker";
import { WebcamPanel } from "@/components/webcam-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api-client";
import { ENROLL_SAMPLES } from "@/lib/config";
import { detectFace, loadFaceModels } from "@/lib/face";
import type { Employee, Site } from "@/lib/types";

export default function EnrollPage() {
  const cameraRoot = useRef<HTMLDivElement>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [siteId, setSiteId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("Colaborador");
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<number[][]>([]);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listReady, setListReady] = useState(false);

  const site = useMemo(
    () => sites.find((s) => s.id === siteId),
    [sites, siteId],
  );

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    void loadFaceModels()
      .then(() => setModelsReady(true))
      .catch(() => setCameraError("No se pudieron cargar los modelos faciales."));
    void api
      .sites()
      .then(({ sites: rows }) => {
        setSites(rows);
        if (rows[0]) setSiteId(rows[0].id);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "No se pudieron cargar las sedes",
        );
        setListReady(true);
      });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    setListReady(false);
    void api
      .employees(siteId)
      .then((res) => {
        setEmployees(res.employees);
        setListReady(true);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar colaboradores",
        );
        setListReady(true);
      });
  }, [siteId]);

  function pickEmployee(employee: Employee) {
    setSelectedId(employee.id);
    setName(employee.name);
    setCode(employee.code);
    setRole(employee.role);
    setSamples([]);
    setConsent(Boolean(employee.consentAt));
    setStatus(null);
    setError(null);
  }

  async function captureSample() {
    setError(null);
    const video = cameraRoot.current?.querySelector("video");
    if (!video) return;
    const face = await detectFace(video);
    if (!face) {
      setError("No se detectó un rostro nítido. Mejor luz, de frente.");
      return;
    }
    if (face.boxRatio < 0.14) {
      setError("Acérquese: el rostro debe llenar el óvalo.");
      return;
    }
    setSamples((prev) => [...prev.slice(0, ENROLL_SAMPLES - 1), face.descriptor]);
    setStatus(`Muestra ${Math.min(samples.length + 1, ENROLL_SAMPLES)} de ${ENROLL_SAMPLES} capturada.`);
  }

  async function save() {
    setError(null);
    if (!consent) {
      setError("El consentimiento biométrico es obligatorio.");
      return;
    }
    if (!name.trim() || !code.trim() || !siteId) {
      setError("Nombre, código y sede son obligatorios.");
      return;
    }
    if (samples.length < 2) {
      setError("Capture al menos 2 muestras faciales.");
      return;
    }
    if (!navigator.onLine) {
      setError("El enrolamiento requiere red. Las marcaciones sí pueden ir a cola offline.");
      return;
    }
    setSaving(true);
    try {
      const consentAt = new Date().toISOString();
      let employeeId = selectedId;
      if (!employeeId) {
        const created = await api.createEmployee({
          name,
          code,
          siteId,
          role,
          consentAt,
        });
        employeeId = created.employee.id;
        setSelectedId(employeeId);
      }
      await api.saveTemplates(employeeId, samples, consentAt);
      const refreshed = await api.employees(siteId);
      setEmployees(refreshed.employees);
      setStatus(`Plantillas guardadas para ${name}. No se almacenó ninguna foto.`);
      setSamples([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enrolar");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.patchEmployee(selectedId, { revokeConsent: true });
      const refreshed = await api.employees(siteId);
      setEmployees(refreshed.employees);
      setConsent(false);
      setStatus("Consentimiento revocado. Plantillas borradas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Enrolar"
      meta={`Descriptores, no fotos. ${site?.name ?? ""}`}
      actions={
        <>
          <OfflineBadge online={online} queued={0} />
          {sites.length > 0 && (
            <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
          )}
        </>
      }
    >
      <div className="split">
        <div className="split-list">
          {!listReady && <p className="empty">Cargando…</p>}
          {listReady &&
            employees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className={`row shade ${selectedId === employee.id ? "active" : ""}`}
                onClick={() => pickEmployee(employee)}
              >
                <strong>{employee.name}</strong>
                <span>
                  {employee.code} · {employee.role}
                </span>
                <div className="tags">
                  <span className="pill">
                    {employee.enrolled
                      ? `${employee.templateCount} plantillas`
                      : "Sin enrolar"}
                  </span>
                </div>
              </button>
            ))}
          {listReady && employees.length === 0 && (
            <p className="empty">No hay colaboradores en esta sede.</p>
          )}
        </div>
        <div className="detail" ref={cameraRoot}>
          <WebcamPanel
            ready={modelsReady}
            onReadyChange={setModelsReady}
            error={cameraError}
            onError={setCameraError}
            hint={`${samples.length}/${ENROLL_SAMPLES} muestras`}
          />
          <div className="sample-row">
            {Array.from({ length: ENROLL_SAMPLES }).map((_, i) => (
              <div key={i} className={`sample-slot ${samples[i] ? "done" : ""}`}>
                {samples[i] ? <Check className="size-3.5" /> : i + 1}
              </div>
            ))}
            <Button
              className="shade"
              onClick={() => void captureSample()}
              disabled={!modelsReady || samples.length >= ENROLL_SAMPLES}
            >
              Capturar
            </Button>
            <Button variant="outline" className="shade" onClick={() => setSamples([])}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="form" style={{ marginTop: 16 }}>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="María Solís" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" />
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Puesto" />
            </div>
            <label className="consent-box">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(Boolean(value))} />
              <span>
                Autorizo el tratamiento de mi plantilla facial (Ley 8968).
                Plantillas cifradas en reposo (AES-GCM). No se guardan fotos.
                Queda auditoría de operador, sede y user-agent.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button className="shade" onClick={() => void save()} disabled={saving}>
                Guardar
              </Button>
              <Button
                variant="outline"
                className="shade"
                onClick={() => {
                  setSelectedId("");
                  setName("");
                  setCode("");
                  setRole("Colaborador");
                  setSamples([]);
                  setConsent(false);
                }}
              >
                <Plus className="size-4" />
                Nuevo
              </Button>
              {selectedId ? (
                <Button variant="outline" className="shade" onClick={() => void revoke()} disabled={saving}>
                  Revocar
                </Button>
              ) : null}
            </div>
            {status && <p className="ok-text">{status}</p>}
            {error && <p className="err-text">{error}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
