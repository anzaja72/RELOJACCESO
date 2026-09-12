"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { setSession } from "@/lib/client-session";
import type { SessionUser } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@reloj.cr");
  const [password, setPassword] = useState("RelojCR-Admin-2026!");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({
        email,
        password,
        totp: totp || undefined,
      });
      setSession(res.token, res.user as SessionUser);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Sesión" meta="JWT + clave API · TOTP opcional">
      <div className="detail" style={{ maxWidth: 420 }}>
        <h2>Entrar a operación</h2>
        <p>
          Usuarios semilla (contraseña <code>RelojCR-Admin-2026!</code>):
          admin, zona, sede, operador y auditor @reloj.cr. También vale la clave
          API <code>demo-rfp-bio-2026</code> en integraciones.
        </p>
        <div className="form" style={{ marginTop: 16 }}>
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
          <Input id="totp" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="000000" />
          <Button className="shade" disabled={busy} onClick={() => void submit()}>
            Entrar
          </Button>
          {error && <p className="err-text">{error}</p>}
        </div>
      </div>
    </AppShell>
  );
}
