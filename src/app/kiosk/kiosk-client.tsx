"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ulid } from "ulidx";
import { LogIn, LogOut, UserRoundX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OfflineBadge } from "@/components/offline-badge";
import { SitePicker } from "@/components/site-picker";
import { WebcamPanel } from "@/components/webcam-panel";
import { api } from "@/lib/api-client";
import { detectFace, livenessHint, loadFaceModels } from "@/lib/face";
import { identifyFace, type GalleryEntry } from "@/lib/match";
import { cacheGallery, enqueuePunch, flushQueue, listQueued, readGallery } from "@/lib/offline";
import { getTerminalId } from "@/lib/terminal";
import type { PunchType, Site, SyncItem } from "@/lib/types";

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

  const site = useMemo(
    () => sites.find((s) => s.id === siteId || s.code === siteId),
    [sites, siteId],
  );

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("es-CR", {
          timeZone: "America/Costa_Rica",
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
        setSites(rows);
        const wanted = querySite?.toUpperCase();
        const match =
          rows.find((s) => s.code === wanted || s.id === querySite) ?? rows[0];
        if (match) setSiteId(match.id);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof Error ? err.message : "No se pudieron cargar las sedes",
        );
      });
  }, [querySite]);

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
    if (siteId) void loadGallery(siteId);
  }, [siteId, loadGallery]);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!siteId) return;
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
        .catch(() => undefined);
    };
    ping();
    const id = window.setInterval(ping, 12000);
    return () => window.clearInterval(id);
  }, [siteId, site?.code]);

  useEffect(() => {
    async function syncNow() {
      if (!navigator.onLine) return;
      setSyncing(true);
      await flushQueue();
      await refreshQueue();
      setSyncing(false);
    }
    window.addEventListener("online", syncNow);
    if (navigator.onLine) void syncNow();
    return () => window.removeEventListener("online", syncNow);
  }, [refreshQueue]);

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
      const live = livenessHint(first, second);
      if (!live.ok) {
        setResult({ tone: "warn", title: "No verificado", detail: live.reason });
        return;
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
        setResult({
          tone: "bad",
          title: "No reconocido",
          detail: enrolledCount
            ? "El rostro no coincide con las plantillas de esta sede."
            : "Nadie está enrolado en esta sede. Use Enrolar primero.",
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

  return (
    <AppShell
      title={site ? site.name : loadError ? "Sin sede" : "Cargando sede…"}
      meta={`${clock} · ${enrolledCount} plantillas${loadError ? ` · ${loadError}` : ""}`}
      actions={
        <>
          <OfflineBadge online={online} queued={queued} syncing={syncing} />
          {sites.length > 0 && (
            <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
          )}
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
              onClick={() => void punch("IN")}
            >
              <LogIn className="size-4" />
              Entrada
            </button>
            <button
              className="punch-btn out shade"
              disabled={busy || !modelsReady}
              onClick={() => void punch("OUT")}
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
            sincroniza al volver.
          </p>
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
