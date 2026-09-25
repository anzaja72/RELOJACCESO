"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { getSessionUser, getToken } from "@/lib/client-session";
import { setTerminal, type TerminalBinding } from "@/lib/terminal";
import type { Site } from "@/lib/types";

// Una tablet solo marca después de que un operador (o superior) la activa para
// una sede. Las credenciales se usan una vez y no quedan guardadas en el kiosco.
export function KioskActivation({
  initialSite,
  onActivated,
}: {
  initialSite: string | null;
  onActivated: (binding: TerminalBinding) => void;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSessionName(getToken() ? (getSessionUser()?.name ?? "sesión actual") : null);
    void api
      .sites()
      .then(({ sites: rows }) => {
        setSites(rows);
        const wanted = initialSite?.toUpperCase();
        const match = rows.find((s) => s.code === wanted || s.id === initialSite) ?? rows[0];
        if (match) setSiteId(match.id);
      })
      .catch(() => setError("No se pudieron cargar las sedes"));
  }, [initialSite]);

  async function activate() {
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      const userToken =
        getToken() ??
        (await api.login({ email, password, totp: totp || undefined })).token;
      const res = await api.activateTerminal({ siteId, label: label || undefined }, userToken);
      const binding = { token: res.token, terminalId: res.terminalId, siteId: res.site.id };
      setTerminal(binding);
      setPassword("");
      onActivated(binding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar la terminal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Activar kiosco" meta="Esta tablet aún no está autorizada para marcar">
      <div className="detail" style={{ maxWidth: 460 }}>
        <h2>Activar terminal</h2>
        <p>
          Un operador, gerente de sede o administrador activa este dispositivo
          una sola vez para una sede. Después marca sin sesión de usuario.
        </p>
        <div className="form" style={{ marginTop: 16 }}>
          <Label htmlFor="site">Sede</Label>
          <select
            id="site"
            className="native-select"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
          <Label htmlFor="label">Nombre de la terminal (opcional)</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Tablet recepción"
          />
          {sessionName ? (
            <p className="muted">Se activará con la sesión de {sessionName}.</p>
          ) : (
            <>
              <Label htmlFor="email">Correo</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Label htmlFor="totp">TOTP (si está activo)</Label>
              <Input
                id="totp"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="000000"
              />
            </>
          )}
          <Button className="shade" disabled={busy || !siteId} onClick={() => void activate()}>
            Activar
          </Button>
          {error && <p className="err-text">{error}</p>}
        </div>
      </div>
    </AppShell>
  );
}
