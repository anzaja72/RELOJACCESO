"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BrandSettings } from "@/components/brand-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { authHeaders } from "@/lib/client-session";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  scope_type: string;
  totp_enabled: number;
};

export default function SettingsPage() {
  const [eventTypes, setEventTypes] = useState("IN,OUT,BREAK_START,BREAK_END");
  const [retention, setRetention] = useState("365");
  const [region, setRegion] = useState("");
  const [pin, setPin] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; type: string; message: string; acked: number }>>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const alertRes = (await api.alerts()) as { alerts: Array<{ id: string; type: string; message: string; acked: number }> };
      setAlerts(alertRes.alerts || []);
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
    <AppShell title="Ajustes" meta="Tipos de evento, retención, PIN supervisor, región declarada">
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
            {status && <p className="ok-text">{status}</p>}
          </div>
          <BrandSettings />
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
          <h2>Alertas</h2>
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
    </AppShell>
  );
}
