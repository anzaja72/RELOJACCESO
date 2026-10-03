import { readFileSync } from "node:fs";
import path from "node:path";
import { ulid } from "ulidx";
import {
  isKioskDenied,
  isResponse,
  kioskSite,
  kioskTerminalId,
  readActor,
  requireKiosk,
  requireActor,
  requireAdmin,
  requireApprover,
  requireWrite,
  type Actor,
} from "@/lib/auth";
import { APP, DUPLICATE_COOLDOWN_MS, TIMEZONE } from "@/lib/config";
import {
  applyRetention,
  dumpMasters,
  enableTotp,
  ensureOfflineAlerts,
  eventTypes,
  findUserByEmail,
  getSetting,
  incrementalsPunches,
  integrityReport,
  insertAlert,
  insertCorrection,
  insertException,
  insertEnrollmentAudit,
  listAlerts,
  listCorrections,
  listCountries,
  listEmployeesScoped,
  listEnrollmentAudit,
  listExceptions,
  listSchedules,
  listSettings,
  listSitesScoped,
  listUsersPublic,
  listZones,
  reportForDay,
  retentionDays,
  setSetting,
  setSupervisorPin,
  siteIdsForScope,
  toSession,
  todayLocal,
  upsertSchedule,
  verifySupervisorPin,
  ackAlert,
} from "@/lib/db-ops";
import {
  activateTerminal,
  createEmployee,
  getDb,
  getEmployee,
  listPunches,
  listSites,
  listTerminals,
  listEmployees,
  patchEmployee,
  recentDuplicate,
  recordEvent,
  revokeTerminal,
  statsToday,
  upsertPunch,
} from "@/lib/db";
import { badRequest, json, parseJson, rateLimit, serverError } from "@/lib/http";
import { isHex, isLogo, parseBrand } from "@/lib/brand";
import { buildDossier } from "@/lib/dossier";
import { toCsv, toSimplePdf, toXlsx, zipStore } from "@/lib/pack";
import {
  canApprove,
  newTotpSecret,
  signTerminalToken,
  signToken,
  TERMINAL_TOKEN_HOURS,
  totpCode,
  verifyPassword,
  verifyTotp,
} from "@/lib/session";
import type { PunchType, SyncItem } from "@/lib/types";

export const runtime = "nodejs";

function joinPath(parts: string[]) {
  return parts.join("/");
}

function actorOrThrow(request: Request) {
  return requireActor(request);
}

function scopeOf(actor: Actor) {
  return { role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId };
}

async function handleGet(request: Request, parts: string[]) {
  const route = joinPath(parts);
  const url = new URL(request.url);

  if (route === "health") {
    getDb();
    const base = {
      ok: true,
      edition: APP.edition,
      sandbox: process.env.SANDBOX === "true",
      rfp: APP.rfp,
      time: new Date().toISOString(),
      timezone: TIMEZONE,
    };
    if (!readActor(request)) return json(base, 200, request);
    ensureOfflineAlerts();
    return json(
      {
        ...base,
        terminals: listTerminals(),
        today: statsToday(),
        rateLimit: { windowSec: 60, max: 80, loginMax: 10 },
      },
      200,
      request,
    );
  }

  if (route === "openapi") {
    const file = path.join(process.cwd(), "public", "openapi.yaml");
    return new Response(readFileSync(file, "utf8"), {
      headers: { "Content-Type": "application/yaml; charset=utf-8" },
    });
  }

  // Pública: la pantalla de login y los kioscos necesitan los colores antes de autenticarse.
  if (route === "brand") {
    const brand = parseBrand({
      name: getSetting("brand_name"),
      primary: getSetting("brand_primary"),
      dark: getSetting("brand_dark"),
      light: getSetting("brand_light"),
      logo: getSetting("brand_logo"),
    });
    return json({ brand }, 200, request);
  }

  if (route === "catalog") {
    return json(
      {
        countries: listCountries(),
        zones: listZones(),
        sites: listSites(),
        eventTypes: eventTypes(),
        edition: APP.edition,
        sandbox: process.env.SANDBOX === "true",
        cloudRegionDeclared: getSetting("cloud_region_declared"),
      },
      200,
      request,
    );
  }

  if (route === "auth/oidc") {
    return json(
      {
        configured: Boolean(process.env.OIDC_ISSUER),
        issuer: process.env.OIDC_ISSUER || null,
        clientId: process.env.OIDC_CLIENT_ID || null,
        note:
          "Stub OIDC/OAuth2. En enterprise: redirigir al IdP, validar id_token, mapear grupos a roles Reloj CR (superadmin, zone_manager, site_manager, operator, auditor).",
      },
      200,
      request,
    );
  }

  if (route === "auth/me") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    return json({ user: actor }, 200, request);
  }

  if (route === "employees") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";
    const site = url.searchParams.get("site") ?? undefined;
    const employees = listEmployeesScoped(scopeOf(actor), includeDeleted).filter(
      (e) => !site || e.siteId === site || listSites().find((s) => s.id === e.siteId)?.code === site,
    );
    return json({ employees }, 200, request);
  }

  // Expediente PDF: datos laborales sensibles, solo gerentes y auditor, y solo de su alcance.
  if (parts[0] === "employees" && parts[2] === "dossier" && parts.length === 3) {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    if (!canApprove(actor.role) && actor.role !== "auditor") {
      return json({ error: "Se requiere gerente de sede, auditor o superior", code: "FORBIDDEN" }, 403, request);
    }
    const employee = getEmployee(parts[1]);
    const allowed = siteIdsForScope(scopeOf(actor));
    if (!employee || (allowed && !allowed.includes(employee.siteId))) {
      return json({ error: "No encontrado", code: "NOT_FOUND" }, 404, request);
    }
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const to = url.searchParams.get("to") || todayLocal();
    const from = url.searchParams.get("from") || new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    if (!day.test(from) || !day.test(to) || from > to) {
      return badRequest("from y to deben ser fechas AAAA-MM-DD con from <= to", { code: "VALIDATION" }, request);
    }
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) {
      return badRequest("El periodo máximo es de un año", { code: "VALIDATION" }, request);
    }
    const doc = buildDossier({ employeeId: employee.id, from, to, generatedBy: actor.email });
    if (!doc) return json({ error: "No encontrado", code: "NOT_FOUND" }, 404, request);
    recordEvent(getDb(), "dossier.generated", { employeeId: employee.id, from, to, by: actor.email, sha256: doc.sha256 });
    return new Response(Buffer.from(toSimplePdf(doc.title, doc.lines, { font: "Courier", size: 8, lineHeight: 11 })), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${doc.filename}"`,
        "X-Document-Sha256": doc.sha256,
        "Cache-Control": "no-store",
      },
    });
  }

  if (route === "integrity") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    if (!canApprove(actor.role) && actor.role !== "auditor") {
      return json({ error: "Se requiere gerente de sede, auditor o superior", code: "FORBIDDEN" }, 403, request);
    }
    return json(integrityReport(), 200, request);
  }

  if (route.startsWith("employees/") && parts.length === 2) {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    const employee = getEmployee(parts[1]);
    if (!employee) return json({ error: "No encontrado", code: "NOT_FOUND" }, 404, request);
    return json({ employee }, 200, request);
  }

  if (route === "punches/stream") {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const encoder = new TextEncoder();
    const site = url.searchParams.get("site") ?? undefined;
    const stream = new ReadableStream({
      start(controller) {
        const tick = () => {
          const punches = listPunches({ siteId: site, limit: 40 });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ punches, ts: Date.now() })}\n\n`));
        };
        tick();
        const id = setInterval(tick, 4000);
        const close = () => clearInterval(id);
        request.signal.addEventListener("abort", close);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (route === "punches") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    const punches = incrementalsPunches({
      since: url.searchParams.get("since") ?? undefined,
      afterId: url.searchParams.get("cursor") ?? url.searchParams.get("afterId") ?? undefined,
      siteId: url.searchParams.get("site") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 200,
    }).filter((p) => {
      const allowed = listSitesScoped(scopeOf(actor)).map((s) => s.id);
      if (allowed.length && actor.scopeType !== "all") return allowed.includes(p.siteId);
      return true;
    });
    return json({ punches, nextCursor: punches.at(-1)?.id ?? null }, 200, request);
  }

  if (route === "reports") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    const report = reportForDay({
      day: url.searchParams.get("day") ?? undefined,
      siteId: url.searchParams.get("site") ?? undefined,
      employeeId: url.searchParams.get("employee") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      countryId: url.searchParams.get("country") ?? undefined,
      zoneId: url.searchParams.get("zone") ?? undefined,
      scope: scopeOf(actor),
    });
    return json(report, 200, request);
  }

  if (route === "exports/pack") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    recordEvent(getDb(), "export.pack", { actor: actor.email, format: url.searchParams.get("format") });
    const dump = dumpMasters();
    const format = url.searchParams.get("format") || "json";
    const punchRows = (dump.punches as Array<Record<string, unknown>>).map((p) => ({
      id: p.id,
      sede: p.siteId,
      tipo: p.type,
      decision: p.decision,
      colaborador: p.employeeName,
      codigo: p.employeeCode,
      capturado: p.capturedAt,
      metodo: p.method,
      novedad: p.novelty,
    }));
    if (format === "csv") {
      return new Response(toCsv(punchRows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="reloj-cr-marcaciones.csv"',
        },
      });
    }
    if (format === "xlsx") {
      return new Response(Buffer.from(toXlsx("marcaciones", punchRows)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="reloj-cr-marcaciones.xlsx"',
        },
      });
    }
    if (format === "pdf") {
      const lines = punchRows.slice(0, 40).map((p) => `${p.capturado} ${p.codigo} ${p.tipo} ${p.decision}`);
      return new Response(Buffer.from(toSimplePdf("Reloj CR · Marcaciones", lines)), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="reloj-cr-marcaciones.pdf"',
        },
      });
    }
    if (format === "zip") {
      const body = JSON.stringify({ generatedAt: new Date().toISOString(), edition: APP.edition, dump }, null, 2);
      const zip = zipStore([
        { name: "dump.json", data: body },
        { name: "marcaciones.csv", data: toCsv(punchRows) },
        { name: "LEAME.txt", data: "Paquete de portabilidad Reloj CR. Ver docs/EXIT_PLAN.md.\n" },
      ]);
      return new Response(Buffer.from(zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="reloj-cr-salida.zip"',
        },
      });
    }
    return json(
      {
        generatedAt: new Date().toISOString(),
        edition: APP.edition,
        sandbox: process.env.SANDBOX === "true",
        exportedBy: actor.email,
        dump,
      },
      200,
      request,
    );
  }

  if (route === "corrections") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    return json({ corrections: listCorrections(url.searchParams.get("punch") ?? undefined) }, 200, request);
  }

  if (route === "schedules") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    return json({ schedules: listSchedules(url.searchParams.get("employee") ?? undefined) }, 200, request);
  }

  if (route === "exceptions") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    return json({ exceptions: listExceptions(url.searchParams.get("employee") ?? undefined) }, 200, request);
  }

  if (route === "alerts") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    ensureOfflineAlerts();
    return json({ alerts: listAlerts() }, 200, request);
  }

  if (route === "settings") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    const settings = listSettings();
    delete settings.supervisor_pin;
    delete settings.brand_logo; // pesa decenas de KB; se pide por /api/v1/brand
    return json(
      {
        settings,
        retentionDays: retentionDays(),
        eventTypes: eventTypes(),
        users: actor.role === "superadmin" ? listUsersPublic() : [],
      },
      200,
      request,
    );
  }

  if (route === "enrollment-audit") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    return json({ audit: listEnrollmentAudit(url.searchParams.get("employee") ?? undefined) }, 200, request);
  }

  if (route === "users") {
    const actor = actorOrThrow(request);
    if (isResponse(actor)) return actor;
    if (actor.role !== "superadmin") {
      return json({ error: "Solo superadmin", code: "FORBIDDEN" }, 403, request);
    }
    return json({ users: listUsersPublic() }, 200, request);
  }

  if (route === "sites") {
    const actor = readActor(request);
    const sites = actor ? listSitesScoped(scopeOf(actor)) : listSites();
    return json({ sites, countries: listCountries(), zones: listZones() }, 200, request);
  }

  return json({ error: "Ruta no encontrada", code: "NOT_FOUND", path: route }, 404, request);
}

async function handlePost(request: Request, parts: string[]) {
  const route = joinPath(parts);

  if (route === "auth/login") {
    const limited = rateLimit(request, 10);
    if (limited) return limited;
    try {
      const body = await parseJson<{ email?: string; password?: string; totp?: string }>(request);
      if (!body.email || !body.password) return badRequest("email y password son obligatorios", { code: "VALIDATION" }, request);
      const user = findUserByEmail(body.email);
      if (!user || !user.active || !verifyPassword(body.password, user.password_hash)) {
        return json({ error: "Credenciales inválidas", code: "INVALID_CREDENTIALS" }, 401, request);
      }
      if (user.totp_enabled && user.totp_secret) {
        if (!body.totp) {
          return json({ error: "Se requiere TOTP", code: "TOTP_REQUIRED" }, 401, request);
        }
        if (!verifyTotp(user.totp_secret, body.totp)) {
          return json({ error: "TOTP inválido", code: "INVALID_TOTP" }, 401, request);
        }
      }
      const session = toSession(user);
      const token = signToken(session);
      recordEvent(getDb(), "auth.login", { email: user.email, role: user.role });
      return json({ token, user: session, expiresHours: 12 }, 200, request);
    } catch (error) {
      return serverError(error, request);
    }
  }

  if (route === "auth/totp") {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    if (actor.via === "api_key") {
      return json({ error: "Active TOTP con un usuario JWT", code: "FORBIDDEN" }, 403, request);
    }
    const secret = newTotpSecret();
    enableTotp(actor.id, secret);
    recordEvent(getDb(), "auth.totp_enabled", { userId: actor.id });
    return json(
      {
        secret,
        codeNow: totpCode(secret),
        note: "Secreto en Base64 (no Base32). Use totpCode de Reloj CR o un autenticador compatible con este algoritmo documentado en README.",
      },
      200,
      request,
    );
  }

  if (route === "terminals/activate") {
    const limited = rateLimit(request, 10);
    if (limited) return limited;
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    try {
      const body = await parseJson<{ siteId?: string; label?: string }>(request);
      if (!body.siteId) return badRequest("siteId es obligatorio", { code: "VALIDATION" }, request);
      const allowed = listSitesScoped(scopeOf(actor));
      if (!allowed.some((s) => s.id === body.siteId || s.code === body.siteId)) {
        return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403, request);
      }
      const terminal = activateTerminal({
        siteId: body.siteId,
        label: body.label,
        userAgent: request.headers.get("user-agent") || "unknown",
        activatedBy: actor.email,
      });
      const token = signTerminalToken({
        terminalId: terminal.terminalId,
        siteId: terminal.site.id,
        tokenId: terminal.tokenId,
      });
      return json(
        {
          token,
          terminalId: terminal.terminalId,
          site: terminal.site,
          expiresHours: TERMINAL_TOKEN_HOURS,
        },
        201,
        request,
      );
    } catch (error) {
      return serverError(error, request);
    }
  }

  if (parts[0] === "terminals" && parts[1] && parts[2] === "revoke" && parts.length === 3) {
    const actor = requireApprover(request);
    if (isResponse(actor)) return actor;
    if (!revokeTerminal(parts[1], actor.email)) {
      return json({ error: "Terminal no encontrada o ya revocada", code: "NOT_FOUND" }, 404, request);
    }
    return json({ ok: true }, 200, request);
  }

  if (route === "employees") {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    try {
      const body = await parseJson<{
        name?: string;
        code?: string;
        siteId?: string;
        role?: string;
        pin?: string;
      }>(request);
      if (!body.name?.trim() || !body.code?.trim() || !body.siteId) {
        return badRequest("name, code y siteId son obligatorios", { code: "VALIDATION" }, request);
      }
      const employee = createEmployee({
        name: body.name,
        code: body.code,
        siteId: body.siteId,
        role: body.role,
      });
      if (body.pin) patchEmployee(employee.id, { pin: body.pin });
      return json({ employee: getEmployee(employee.id) }, 201, request);
    } catch (error) {
      return serverError(error, request);
    }
  }

  if (route === "punches" || route === "punches/pin") {
    const limited = rateLimit(request, 40);
    if (limited) return limited;
    const caller = requireKiosk(request);
    if (isKioskDenied(caller)) return caller;
    try {
      const body = await parseJson<
        Partial<SyncItem> & {
          offline?: boolean;
          supervisorPin?: string;
          employeePin?: string;
        }
      >(request);
      body.siteId = kioskSite(caller, body.siteId);
      body.terminalId = kioskTerminalId(caller, body.terminalId);
      if (!body.siteId || !body.type || !body.terminalId) {
        return badRequest("siteId, type y terminalId son obligatorios", { code: "VALIDATION" }, request);
      }
      const allowed = eventTypes();
      if (!allowed.includes(body.type)) {
        return badRequest(`type debe ser uno de: ${allowed.join(", ")}`, { code: "VALIDATION" }, request);
      }
      if (route === "punches/pin") {
        if (!body.employeeId || !body.reason?.trim() || !body.supervisorPin) {
          return badRequest("employeeId, reason y supervisorPin son obligatorios", { code: "VALIDATION" }, request);
        }
        if (!verifySupervisorPin(body.supervisorPin)) {
          return json({ error: "PIN de supervisor inválido", code: "INVALID_PIN" }, 403, request);
        }
        const employee = getEmployee(body.employeeId);
        if (!employee || !employee.active) {
          return json({ error: "Colaborador inactivo o inexistente", code: "NOT_FOUND" }, 404, request);
        }
        const item: SyncItem = {
          id: body.id || ulid(),
          employeeId: body.employeeId,
          siteId: body.siteId,
          type: body.type as PunchType,
          capturedAt: body.capturedAt || new Date().toISOString(),
          terminalId: body.terminalId,
          matchScore: null,
          decision: "matched",
          livenessHint: "skipped",
          method: "supervisor_pin",
          eventType: body.type,
          supervisorId: "supervisor_pin",
          reason: body.reason,
        };
        const result = upsertPunch({ ...item, offline: Boolean(body.offline) });
        insertEnrollmentAudit({
          employeeId: body.employeeId,
          operatorName: "supervisor_pin",
          userAgent: request.headers.get("user-agent"),
          siteId: employee.siteId,
          action: "fallback_pin",
        });
        recordEvent(getDb(), "punch.fallback_pin", {
          punchId: item.id,
          employeeId: body.employeeId,
          reason: body.reason,
        });
        return json({ punch: result.punch, created: result.created }, result.created ? 201 : 200, request);
      }

      if (!body.id || !body.capturedAt) {
        return badRequest("id y capturedAt son obligatorios", { code: "VALIDATION" }, request);
      }
      let decision = body.decision ?? (body.employeeId ? "matched" : "unknown");
      if (body.employeeId && decision === "matched") {
        const dup = recentDuplicate({
          employeeId: body.employeeId,
          type: body.type as PunchType,
          capturedAt: body.capturedAt,
          cooldownMs: DUPLICATE_COOLDOWN_MS,
        });
        if (dup) decision = "duplicate";
      }
      const result = upsertPunch({
        id: body.id,
        employeeId: body.employeeId ?? null,
        siteId: body.siteId,
        type: body.type as PunchType,
        capturedAt: body.capturedAt,
        terminalId: body.terminalId,
        matchScore: body.matchScore ?? null,
        decision,
        livenessHint: body.livenessHint ?? "skipped",
        offline: Boolean(body.offline),
        method: body.method ?? "face",
        eventType: body.eventType ?? body.type,
        supervisorId: body.supervisorId ?? null,
        reason: body.reason ?? null,
      });
      return json({ punch: result.punch, created: result.created }, result.created ? 201 : 200, request);
    } catch (error) {
      return serverError(error, request);
    }
  }

  if (route === "corrections") {
    const actor = requireApprover(request);
    if (isResponse(actor)) return actor;
    try {
      const body = await parseJson<{
        punchId?: string;
        reason?: string;
        newTs?: string;
        newType?: string;
      }>(request);
      if (!body.punchId || !body.reason?.trim()) {
        return badRequest("punchId y reason son obligatorios", { code: "VALIDATION" }, request);
      }
      const row = insertCorrection({
        punchId: body.punchId,
        reason: body.reason.trim(),
        requestedBy: actor.email,
        approvedBy: actor.email,
        newTs: body.newTs,
        newType: body.newType,
      });
      if (!row) return json({ error: "Marcación no encontrada", code: "NOT_FOUND" }, 404, request);
      return json({ correction: row }, 201, request);
    } catch (error) {
      return serverError(error, request);
    }
  }

  if (route === "schedules") {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    const body = await parseJson<{
      employeeId?: string;
      weekday?: number;
      startHm?: string;
      endHm?: string;
      lateGraceMin?: number;
    }>(request);
    if (!body.employeeId || body.weekday == null || !body.startHm || !body.endHm) {
      return badRequest("employeeId, weekday, startHm y endHm son obligatorios", { code: "VALIDATION" }, request);
    }
    const id = upsertSchedule({
      employeeId: body.employeeId,
      weekday: body.weekday,
      startHm: body.startHm,
      endHm: body.endHm,
      lateGraceMin: body.lateGraceMin,
    });
    return json({ id }, 201, request);
  }

  if (route === "exceptions") {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    const body = await parseJson<{
      employeeId?: string;
      date?: string;
      type?: string;
      reason?: string;
    }>(request);
    if (!body.employeeId || !body.date || !body.type || !body.reason) {
      return badRequest("employeeId, date, type y reason son obligatorios", { code: "VALIDATION" }, request);
    }
    return json({ exception: insertException({ ...body, createdBy: actor.email } as never) }, 201, request);
  }

  if (route === "alerts") {
    const limited = rateLimit(request, 20);
    if (limited) return limited;
    const caller = requireKiosk(request);
    if (isKioskDenied(caller)) return caller;
    const body = await parseJson<{ type?: string; message?: string; siteId?: string; employeeId?: string }>(
      request,
    );
    if (!body.type || !body.message) return badRequest("type y message son obligatorios", { code: "VALIDATION" }, request);
    const id = insertAlert(body.type, body.message, body.siteId, body.employeeId);
    return json({ id }, 201, request);
  }

  if (route === "settings/retention") {
    const actor = requireApprover(request);
    if (isResponse(actor)) return actor;
    applyRetention();
    return json({ ok: true, retentionDays: retentionDays() }, 200, request);
  }

  return json({ error: "Ruta no encontrada", code: "NOT_FOUND" }, 404, request);
}

async function handlePatch(request: Request, parts: string[]) {
  const route = joinPath(parts);
  if (parts[0] === "employees" && parts[1]) {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    try {
      const body = await parseJson<{
        active?: boolean;
        revokeConsent?: boolean;
        name?: string;
        code?: string;
        siteId?: string;
        deleted?: boolean;
        pin?: string | null;
        role?: string;
      }>(request);
      const employee = patchEmployee(parts[1], body);
      if (body.revokeConsent) {
        insertEnrollmentAudit({
          employeeId: parts[1],
          operatorId: actor.id,
          operatorName: actor.name,
          userAgent: request.headers.get("user-agent"),
          siteId: employee.siteId,
          action: "revoke",
        });
      }
      return json({ employee }, 200, request);
    } catch (error) {
      return serverError(error, request);
    }
  }
  if (parts[0] === "alerts" && parts[1]) {
    const actor = requireWrite(request);
    if (isResponse(actor)) return actor;
    ackAlert(parts[1]);
    return json({ ok: true }, 200, request);
  }
  if (route === "settings") {
    const actor = requireApprover(request);
    if (isResponse(actor)) return actor;
    const body = await parseJson<Record<string, string>> (request);
    const allowed = [
      "event_types",
      "retention_days",
      "cloud_region_declared",
      "alert_absent",
      "alert_late",
      "alert_terminal_offline",
      "alert_sync_failed",
      "labor_max_daily_hours",
      "labor_max_weekly_hours",
    ];
    // La marca es global: solo el superadmin la cambia. Vacío = versión básica.
    const brandKeys = ["brand_name", "brand_primary", "brand_dark", "brand_light", "brand_logo"];
    if (brandKeys.some((k) => k in body)) {
      if (actor.role !== "superadmin") {
        return json({ error: "Solo el superadmin cambia la marca", code: "FORBIDDEN" }, 403, request);
      }
      const colors = brandKeys.slice(1, 4).map((k) => body[k] ?? "");
      const clearing = colors.every((c) => c === "");
      if (!clearing && !colors.every(isHex)) {
        return badRequest("Los colores deben ser hexadecimales de 6 dígitos, p. ej. #D62300", { code: "VALIDATION" }, request);
      }
      const logo = body.brand_logo ?? "";
      if (logo !== "" && !isLogo(logo)) {
        return badRequest("El logo debe ser PNG, JPG, WebP o SVG de hasta 200 KB", { code: "VALIDATION" }, request);
      }
      for (const k of brandKeys) {
        if (k === "brand_logo") {
          // Un guardado que no menciona el logo no lo borra.
          if (k in body) setSetting(k, logo);
        } else {
          setSetting(k, k === "brand_name" ? (body[k] ?? "").trim().slice(0, 60) : (body[k] ?? "").toUpperCase());
        }
      }
    }
    for (const [key, value] of Object.entries(body)) {
      if (key === "supervisor_pin") {
        setSupervisorPin(value);
        continue;
      }
      if (!allowed.includes(key)) continue;
      setSetting(key, value);
    }
    recordEvent(getDb(), "settings.updated", { by: actor.email, keys: Object.keys(body) });
    return json({ ok: true }, 200, request);
  }
  return json({ error: "Ruta no encontrada", code: "NOT_FOUND" }, 404, request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await handleGet(request, (await context.params).path);
  } catch (error) {
    return serverError(error, request);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await handlePost(request, (await context.params).path);
  } catch (error) {
    return serverError(error, request);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await handlePatch(request, (await context.params).path);
  } catch (error) {
    return serverError(error, request);
  }
}
