import { isResponse } from "@/lib/auth";
import { getEmployee, listEvents, listSites } from "@/lib/db";
import { json } from "@/lib/http";
import { allowedSiteIds, requireReader } from "@/lib/scope";

export const runtime = "nodejs";

// Nombre en español de cada tipo de evento, para que la auditoría se entienda sin conocer el sistema.
const LABEL: Record<string, string> = {
  "employee.created": "Persona creada",
  "employee.updated": "Persona activada o desactivada",
  "employee.transferred": "Persona trasladada de sede",
  "employee.deleted": "Persona dada de baja",
  "consent.revoked": "Consentimiento biométrico revocado",
  "template.enrolled": "Rostro enrolado",
  "template.wiped": "Plantillas faciales borradas",
  "punch.created": "Marcación registrada",
  "punch.fallback_pin": "Marcación autorizada con PIN de supervisor",
  "punch.corrected": "Marcación corregida",
  "exception.created": "Excepción del día registrada",
  "terminal.activated": "Tablet activada",
  "terminal.revoked": "Tablet revocada",
  "settings.updated": "Ajustes cambiados",
  "auth.login": "Inicio de sesión",
  "auth.totp_enabled": "Verificación en dos pasos activada",
  "export.pack": "Exportación de datos",
  "dossier.generated": "Expediente PDF generado",
  "anomaly.detected": "Anomalía detectada",
  "anomaly.reviewed": "Anomalía revisada",
  "retention.applied": "Retención de datos aplicada",
  "report.monthly_sent": "Informe mensual enviado",
  "contract.updated": "Contrato actualizado",
  "zone.created": "Región creada",
  "site.created": "Sede creada",
  "site.updated": "Sede actualizada",
  "ai.chat": "Consulta a IAnálisis",
  "ai.briefing": "Resumen del día generado",
};

const text = (v: unknown) => (typeof v === "string" && v ? v : null);

export function GET(request: Request) {
  const actor = requireReader(request);
  if (isResponse(actor)) return actor;
  const allowed = allowedSiteIds(actor);
  const sites = new Map(listSites().map((s) => [s.id, s.name]));
  const people = new Map<string, string | null>();
  const nameOf = (id: string | null) => {
    if (!id) return null;
    if (!people.has(id)) people.set(id, getEmployee(id)?.name ?? null);
    return people.get(id) ?? null;
  };

  const events = listEvents(80)
    .map((event) => ({ ...event, payload: JSON.parse(event.payload) as Record<string, unknown> }))
    // Quien no ve todas las sedes solo ve eventos de las suyas (los globales quedan fuera).
    .filter((event) => {
      if (!allowed) return true;
      const p = event.payload;
      return [p.siteId, p.from, p.to].some((s) => typeof s === "string" && allowed.includes(s));
    })
    .map((event) => {
      const p = event.payload;
      const employeeId = text(p.employeeId) ?? (event.type.startsWith("employee.") || event.type === "consent.revoked" ? text(p.id) : null);
      const siteId = text(p.siteId) ?? text(p.to);
      return {
        ...event,
        label: LABEL[event.type] ?? event.type,
        // Quién lo hizo, sobre quién y dónde: lo que hace falta para auditar.
        actor: text(p.by) ?? text(p.actor) ?? text(p.operator) ?? text(p.email) ?? text(p.reviewer),
        person: text(p.name) ?? nameOf(employeeId),
        site: siteId ? (sites.get(siteId) ?? siteId) : null,
      };
    });
  return json({
    events,
    note: "Cada evento queda encadenado al anterior; si alguien lo cambia, el registro de integridad lo detecta.",
  });
}
