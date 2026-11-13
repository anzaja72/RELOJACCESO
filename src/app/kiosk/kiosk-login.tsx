"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { clearSession } from "@/lib/client-session";
import { setStoreKiosk, setTerminal, type TerminalBinding } from "@/lib/terminal";

// Kiosco de tienda: se activa con el usuario KIOSCO de la tienda (código o nombre + contraseña).
// Ese usuario no tiene sesión: la tablet solo recibe un token para marcar en su tienda.
export function KioskLogin({ onActivated }: { onActivated: (binding: TerminalBinding) => void }) {
  const [tienda, setTienda] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.kioskActivate({ tienda: tienda.trim(), password });
      // Si alguien había iniciado sesión en este navegador, se cierra: el kiosco no debe abrir otras pantallas.
      clearSession();
      const binding = { token: res.token, terminalId: res.terminalId, siteId: res.site.id };
      setTerminal(binding);
      setStoreKiosk();
      setPassword("");
      onActivated(binding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar el kiosco");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kiosk-standalone kiosk-login">
      <div className="detail">
        <h1>Kiosco de marcación</h1>
        <p className="muted">Active esta tablet con el usuario de kiosco de la tienda. Después solo mostrará la captura de entradas y salidas.</p>
        <form
          className="form"
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void activate();
          }}
        >
          <Label htmlFor="tienda">Tienda</Label>
          <Input id="tienda" value={tienda} onChange={(e) => setTienda(e.target.value)} placeholder="AP o Alto Prado" autoComplete="username" />
          <Label htmlFor="password">Contraseña del kiosco</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Button className="shade" type="submit" disabled={busy || !tienda.trim() || !password}>
            {busy ? "Activando…" : "Activar kiosco"}
          </Button>
          {error && <p className="err-text">{error}</p>}
        </form>
      </div>
    </div>
  );
}
