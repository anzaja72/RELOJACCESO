"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { DemoBanner } from "@/components/demo-banner";
import { NavLinks } from "@/components/nav-links";
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
    void api.sites().then(({ sites: rows }) => {
      setSites(rows);
      if (rows[0]) setSiteId(rows[0].id);
    });
  }, []);

  useEffect(() => {
    if (!siteId) return;
    void api.employees(siteId).then((res) => setEmployees(res.employees));
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

  return (
    <div className="paper-skin">
      <DemoBanner />
      <NavLinks />
      <main className="page-wrap">
        <header className="page-hero">
          <div>
            <p className="eyebrow">Enrolar</p>
            <h1>Alta biométrica de colaborador</h1>
            <p>
              Se guardan solo descriptores numéricos (128 valores), no fotos.
              Consentimiento explícito obligatorio. {site?.name ?? ""}
            </p>
          </div>
          <OfflineBadge online={online} queued={0} />
        </header>

        <div className="enroll-grid">
          <section className="panel" ref={cameraRoot}>
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
                  {samples[i] ? <Check className="size-5" /> : i + 1}
                </div>
              ))}
              <Button
                className="min-h-12 flex-1 text-base"
                onClick={() => void captureSample()}
                disabled={!modelsReady || samples.length >= ENROLL_SAMPLES}
              >
                Capturar muestra
              </Button>
              <Button
                variant="outline"
                className="min-h-12"
                onClick={() => setSamples([])}
                disabled={samples.length === 0}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </section>

          <section className="panel form-panel">
            {sites.length > 0 && (
              <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
            )}
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  className="min-h-12 text-base"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="María Solís"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    className="min-h-12 text-base"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="MES-014"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="role">Puesto</Label>
                  <Input
                    id="role"
                    className="min-h-12 text-base"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <label className="consent-box">
              <Checkbox
                checked={consent}
                onCheckedChange={(value) => setConsent(Boolean(value))}
              />
              <span>
                Autorizo el tratamiento de mi plantilla facial para control de
                asistencia (Ley 8968, demo {site?.city ?? "CR"}). Entiendo que
                este DEMO no cifra las plantillas con E2EE de producción y que
                no se guardan fotografías, solo vectores.
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="min-h-12 flex-1 text-base"
                onClick={() => void save()}
                disabled={saving}
              >
                Guardar plantillas
              </Button>
              <Button
                variant="outline"
                className="min-h-12"
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
            </div>
            {status && <p className="ok-text">{status}</p>}
            {error && <p className="err-text">{error}</p>}
          </section>
        </div>

        <section className="panel">
          <h2>Colaboradores de la sede</h2>
          <p className="muted mb-3">
            Los registros semilla no tienen cara. Enrolar con la webcam de esta
            tablet o del Pi.
          </p>
          <ul className="people-list">
            {employees.map((employee) => (
              <li key={employee.id}>
                <button type="button" onClick={() => pickEmployee(employee)}>
                  <strong>{employee.name}</strong>
                  <span>
                    {employee.code} · {employee.role}
                  </span>
                </button>
                <em className={employee.enrolled ? "ok-text" : "muted"}>
                  {employee.enrolled
                    ? `${employee.templateCount} plantillas`
                    : "Sin enrolar"}
                </em>
              </li>
            ))}
            {employees.length === 0 && (
              <li className="muted">No hay colaboradores en esta sede.</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
