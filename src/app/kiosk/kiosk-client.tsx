"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ulid } from "ulidx";
import { LogIn, LogOut, UserRoundX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OfflineBadge } from "@/components/offline-badge";
import { WebcamPanel } from "@/components/webcam-panel";
import { api } from "@/lib/api-client";
import { detectFace, livenessHint, loadFaceModels } from "@/lib/face";
import { identifyFace, type GalleryEntry } from "@/lib/match";
import { cacheGallery, enqueuePunch, flushQueue, listQueued, readGallery } from "@/lib/offline";
import { getTerminal, getTerminalId, type TerminalBinding } from "@/lib/terminal";
import { KioskActivation } from "./kiosk-activation";
import type { PunchType, Site, SyncItem } from "@/lib/types";
import { LOCALE, TIMEZONE } from "@/lib/config";

const SITES_KEY = "reloj-cr-sites";

type ResultState = {
  tone: "ok" | "bad" | "warn";
  title: string;
  detail: string;
};

export function KioskClient() {
  const search = useSearchParams();
  const querySite = search.get("site");
  const cameraRoot = useRef<HTMLDivElement>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [clock, setClock] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<PunchType>("IN");
  const [eventTypes, setEventTypes] = useState<string[]>(["IN", "OUT"]);
  const [pinEmployee, setPinEmployee] = useState("");
  const [pinReason, setPinReason] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [binding, setBinding] = useState<TerminalBinding | null>(null);
  const [bindingChecked, setBindingChecked] = useState(false);

  useEffect(() => {
    setBinding(getTerminal());
    setBindingChecked(true);
  }, []);

  const site = useMemo(
    () => sites.find((s) => s.id === siteId || s.code === siteId),
    [sites, siteId],
  );

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat(LOCALE, {
          timeZone: TIMEZONE,
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    void loadFaceModels()
      .then(() => setModelsReady(true))
      .catch(() =>
        setCameraError("No se pudieron cargar los modelos faciales (~6.8 MB)."),
      );
  }, []);

  useEffect(() => {
    void api
      .sites()
      .then(({ sites: rows }) => {
        try {
          window.localStorage.setItem(SITES_KEY, JSON.stringify(rows));
        } catch {
          /* sin espacio: sigue funcionando */
        }
        setSites(rows);
        const wanted = querySite?.toUpperCase();
        // Una terminal activada queda atada a su sede.
        const match = binding
          ? rows.find((s) => s.id === binding.siteId)
          : (rows.find((s) => s.code === wanted || s.id === querySite) ?? rows[0]);
        if (match) setSiteId(match.id);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // Sin red: una terminal activada sigue en su sede con la lista guardada.
        if (binding) {
          setSiteId(binding.siteId);
          try {
            const saved = window.localStorage.getItem(SITES_KEY);
            if (saved) setSites(JSON.parse(saved) as Site[]);
          } catch {
            /* lista corrupta: se ignora */
          }
          return;
        }
        setLoadError(
          err instanceof Error ? err.message : "No se pudieron cargar las sedes",
        );
      });
  }, [querySite, binding]);

  useEffect(() => {
    void api.catalog().then((c) => {
      if (c.eventTypes?.length) setEventTypes(c.eventTypes);
    }).catch(() => undefined);
  }, []);

  const refreshQueue = useCallback(async () => {
    setQueued((await listQueued()).length);
  }, []);

  const loadGallery = useCallback(async (id: string) => {
    const cached = await readGallery(id);
    if (cached) {
      setGallery(
        cached.employees.map((employee) => ({
          employee,
          descriptors: cached.templates
            .filter((t) => t.employeeId === employee.id)
            .map((t) => t.descriptor),
        })),
      );
    }
    if (!navigator.onLine) return;
    try {
      const { employees, templates } = await api.gallery(id);
      await cacheGallery(id, employees, templates);
      setGallery(
        employees.map((employee) => ({
          employee,
          descriptors: templates
            .filter((t) => t.employeeId === employee.id)
            .map((t) => t.descriptor),
        })),
      );
    } catch {
      /* keep cache */
    }
  }, []);

  useEffect(() => {
    if (siteId && binding) void loadGallery(siteId);
  }, [siteId, binding, loadGallery]);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!siteId || !binding) return;
    // Si el servidor revocó la terminal, api-client borra el token: volver a activar.
    const recheck = () => {
      if (!getTerminal()) setBinding(null);
    };
    const ping = () => {
      if (!navigator.onLine) return;
      void api
        .heartbeat({
          id: getTerminalId(),
          siteId,
          label: `Kiosco ${site?.code ?? ""}`,
          userAgent: navigator.userAgent,
          path: "/kiosk",
        })
        .then(recheck, recheck);
    };
    ping();
    const id = window.setInterval(ping, 12000);
    return () => window.clearInterval(id);
  }, [siteId, site?.code, binding]);

  useEffect(() => {
    async function syncNow() {
      if (!navigator.onLine || !getTerminal()) return;
      setSyncing(true);
      await flushQueue();
      await refreshQueue();
      setSyncing(false);
    }
    window.addEventListener("online", syncNow);
    if (navigator.onLine) void syncNow();
    return () => window.removeEventListener("online", syncNow);
  }, [refreshQueue, binding]);

  const enrolledCount = gallery.filter((g) => g.descriptors.length > 0).length;

  async function punch(type: PunchType) {
    if (busy || !site) return;
    setBusy(true);
    setResult(null);
    try {
      const video = cameraRoot.current?.querySelector("video");
      if (!video) throw new Error("Cámara no disponible");
      const first = await detectFace(video);
      if (!first) {
        setResult({
          tone: "bad",
          title: "Sin rostro",
          detail: "Mire de frente, con buena luz, y vuelva a intentar.",
        });
        return;
      }
      await new Promise((r) => window.setTimeout(r, 420));
      const second = await detectFace(video);
      let live = livenessHint(first, second);
      if (!live.ok) {
        await new Promise((r) => window.setTimeout(r, 350));
        const third = await detectFace(video);
        live = third ? livenessHint(first, third) : live;
        if (!live.ok) {
          setShowPin(true);
          setResult({ tone: "warn", title: "No verificado", detail: live.reason });
          return;
        }
      }
      const match = identifyFace(first.descriptor, gallery);
      const item: SyncItem = {
        id: ulid(),
        employeeId: match.employee?.id ?? null,
        siteId: site.id,
        type,
        capturedAt: new Date().toISOString(),
        terminalId: getTerminalId(),
        matchScore: match.score,
        decision: match.decision,
        livenessHint: live.verdict,
      };

      if (match.decision !== "matched") {
        if (navigator.onLine) {
          try {
            await api.createPunch(item);
          } catch {
            await enqueuePunch(item);
            await refreshQueue();
          }
        } else {
          await enqueuePunch(item);
          await refreshQueue();
        }
        setShowPin(true);
        setResult({
          tone: "bad",
          title: "No reconocido",
          detail: enrolledCount
            ? "Use PIN de supervisor con motivo. No hay marcación libre."
            : "Nadie está enrolado en esta sede. Use Enrolar o PIN autorizado.",
        });
        return;
      }

      if (navigator.onLine) {
        try {
          const saved = await api.createPunch(item);
          if (saved.punch.decision === "duplicate") {
            setResult({
              tone: "warn",
              title: "Ya marcada",
              detail: `${match.employee?.name} acaba de registrar ${type === "IN" ? "entrada" : "salida"}.`,
            });
            return;
          }
        } catch {
          await enqueuePunch(item);
          await refreshQueue();
          setResult({
            tone: "ok",
            title: type === "IN" ? "Entrada guardada offline" : "Salida guardada offline",
            detail: `${match.employee?.name} · se sincronizará al volver la red.`,
          });
          return;
        }
      } else {
        await enqueuePunch(item);
        await refreshQueue();
        setResult({
          tone: "ok",
          title: type === "IN" ? "Entrada en cola" : "Salida en cola",
          detail: `${match.employee?.name} · sin pérdida de datos. Score ${match.score}.`,
        });
        return;
      }

      setResult({
        tone: "ok",
        title: type === "IN" ? "Entrada registrada" : "Salida registrada",
        detail: `${match.employee?.name} · ${match.employee?.code} · score ${match.score}`,
      });
    } catch (error) {
      setResult({
        tone: "bad",
        title: "Error",
        detail: error instanceof Error ? error.message : "No se pudo marcar",
      });
    } finally {
      setBusy(false);
      window.setTimeout(() => setResult(null), 4200);
    }
  }

  async function punchWithPin() {
    if (!site || !pinEmployee || !pinReason.trim() || !supervisorPin) {
      setResult({
        tone: "warn",
        title: "Faltan datos",
        detail: "Colaborador, motivo y PIN de supervisor son obligatorios.",
      });
      return;
    }
    setBusy(true);
    try {
      const saved = await api.pinPunch({
        employeeId: pinEmployee,
        siteId: site.id,
        type: eventType,
        terminalId: getTerminalId(),
        reason: pinReason.trim(),
        supervisorPin,
      });
      const name = gallery.find((g) => g.employee.id === pinEmployee)?.employee.name;
      setSupervisorPin("");
      setPinReason("");
      setShowPin(false);
      setResult({
        tone: saved.created ? "ok" : "warn",
        title: saved.created ? "Marcación autorizada" : "Ya existía",
        detail: `${name || pinEmployee} · PIN supervisor · ${eventType}`,
      });
    } catch (error) {
      setResult({
        tone: "bad",
        title: "PIN rechazado",
        detail: error instanceof Error ? error.message : "No autorizado",
      });
    } finally {
      setBusy(false);
      window.setTimeout(() => setResult(null), 4200);
    }
  }

  // Sin terminal activada no se monta la cámara ni se descarga la galería.
  if (!binding) {
    return bindingChecked ? (
      <KioskActivation initialSite={querySite} onActivated={setBinding} />
    ) : null;
  }

  return (
    <AppShell
      title={site ? site.name : loadError ? "Sin sede" : "Cargando sede…"}
      meta={`${clock} · ${enrolledCount} plantillas${loadError ? ` · ${loadError}` : ""}`}
      actions={
        <>
          <OfflineBadge online={online} queued={queued} syncing={syncing} />
        </>
      }
    >
      <div className="split">
        <div className="detail" ref={cameraRoot}>
          <WebcamPanel
            ready={modelsReady}
            onReadyChange={setModelsReady}
            error={cameraError}
            onError={setCameraError}
            hint="Rostro en el óvalo"
          />
          <div className="punch-row">
            <button
              className="punch-btn in shade"
              disabled={busy || !modelsReady}
              onClick={() => {
                setEventType("IN");
                void punch("IN");
              }}
            >
              <LogIn className="size-4" />
              Entrada
            </button>
            <button
              className="punch-btn out shade"
              disabled={busy || !modelsReady}
              onClick={() => {
                setEventType("OUT");
                void punch("OUT");
              }}
            >
              <LogOut className="size-4" />
              Salida
            </button>
          </div>
        </div>
        <div className="detail">
          <h2>Marcación</h2>
          <p>
            El cruce es local. Sin red, la ULID queda en IndexedDB y se
            sincroniza al volver. El respaldo no es marcación libre: exige PIN
            de supervisor, colaborador y motivo.
          </p>
          <label className="muted" style={{ display: "block", marginTop: 16 }}>
            Tipo de evento
          </label>
          <select
            className="native-select"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="punch-btn shade"
            style={{ marginTop: 12, width: "100%" }}
            onClick={() => setShowPin((v) => !v)}
          >
            Respaldo PIN supervisor
          </button>
          {showPin ? (
            <div className="form" style={{ marginTop: 12 }}>
              <select
                className="native-select"
                value={pinEmployee}
                onChange={(e) => setPinEmployee(e.target.value)}
              >
                <option value="">Colaborador</option>
                {gallery.map((g) => (
                  <option key={g.employee.id} value={g.employee.id}>
                    {g.employee.name} · {g.employee.code}
                  </option>
                ))}
              </select>
              <input
                className="search"
                placeholder="Motivo (obligatorio)"
                value={pinReason}
                onChange={(e) => setPinReason(e.target.value)}
              />
              <input
                className="search"
                type="password"
                placeholder="PIN supervisor"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
              />
              <button
                type="button"
                className="punch-btn in shade"
                disabled={busy}
                onClick={() => void punchWithPin()}
              >
                Autorizar marcación
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {result && (
        <div className={`result-overlay ${result.tone}`} role="alertdialog">
          {result.tone === "bad" ? (
            <UserRoundX className="size-8" />
          ) : (
            <LogIn className="size-8" />
          )}
          <h2>{result.title}</h2>
          <p>{result.detail}</p>
        </div>
      )}
    </AppShell>
  );
}
