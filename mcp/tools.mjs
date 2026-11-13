// Herramientas MCP de Reloj CR.
//
// Lectura: consulta de asistencia, cronogramas, novedades, accesos y horas.
// Escritura: programar turnos, enviar/aprobar cronogramas, novedades, accesos, movilidad y ficha laboral.
//
// Seguridad:
//  - Las herramientas de escritura SOLO existen cuando quien conecta inició sesión con su usuario de
//    Reloj; con la clave de integración (superadmin compartido) el servidor es de solo lectura.
//  - Cada herramienta se registra únicamente si el rol tiene el permiso (mismos permisos que la web).
//    Reloj vuelve a validar en cada llamada: esto solo evita ofrecer al modelo acciones imposibles.
//  - Las acciones que deciden, envían o conceden acceso exigen `confirmado: true`, que el modelo solo
//    debe poner si la persona lo confirmó de forma explícita en la conversación.
//  - Nunca se expone el salario, las plantillas biométricas ni el PIN de supervisor, ni se pueden crear
//    marcaciones: la IA no marca por nadie.
import { z } from "zod";
import { RelojError } from "./reloj.mjs";

const TZ = "America/Bogota";
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export function mondayOf(date) {
  const d = new Date(`${date}T12:00:00Z`);
  // «2026-02-31» pasa la forma AAAA-MM-DD pero no es una fecha: no se corrige en silencio.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new Error(`Fecha inválida: «${date}». Use una fecha real en formato AAAA-MM-DD.`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const fmtMin = (min) => {
  if (min == null) return null;
  const abs = Math.abs(min);
  return `${min < 0 ? "-" : ""}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
};

const result = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const failure = (e) => ({
  isError: true,
  content: [
    {
      type: "text",
      text:
        e instanceof RelojError
          ? `Reloj CR rechazó la solicitud (${e.status}${e.code && e.code !== "ERROR" ? ` ${e.code}` : ""}): ${e.message}`
          : String(e?.message || e),
    },
  ],
});

const date = z.string().regex(DATE, "AAAA-MM-DD");
const hm = z.string().regex(HM, "HH:MM (24 h)");
const confirmed = z
  .literal(true)
  .describe("Debe ser true. Póngalo SOLO si la persona confirmó de forma explícita, en esta conversación, que quiere ejecutar esta acción.");
const sedeRef = z.string().describe("Código, id o nombre de la tienda (ej. BAQ-BV o Buenavista)");
const empRef = z.string().describe("Id, código o nombre del empleado");
const semana = z.string().regex(DATE).optional().describe("Cualquier fecha de la semana AAAA-MM-DD (por defecto, la semana actual); la semana va de lunes a domingo");

/** Texto de una celda del cronograma. */
function cellText(c) {
  if (c.kind === "descanso") return "descanso";
  if (c.kind === "novedad") return `novedad${c.note ? ` (${c.note})` : ""}`;
  // La nota viaja con el turno: así un turno partido («partido 12:30-14:00 / 15:30-21:00») se reconoce al volver a leerlo.
  return `${c.startHm}-${c.endHm}${c.lunchMin ? ` · almuerzo ${c.lunchMin} min` : ""}${c.note ? ` · ${c.note}` : ""}`;
}

/** Vista compacta de un cronograma (la respuesta completa de la API es demasiado grande para un modelo). */
export function compactPlan(view) {
  const cellsOf = new Map();
  for (const c of view.cells) {
    if (!cellsOf.has(c.employeeId)) cellsOf.set(c.employeeId, {});
    cellsOf.get(c.employeeId)[c.date] = cellText(c);
  }
  return {
    tienda: `${view.site.name} (${view.site.code}, ${view.site.city})`,
    tienda_id: view.site.id,
    semana: { inicia: view.weekStart, dias: view.dates },
    horario_tienda: { apertura: view.opensHm, cierre: view.closesHm, confirmado: view.hoursConfirmed },
    cronograma: view.plan
      ? {
          estado: view.plan.status,
          version: view.plan.version,
          enviado_por: view.plan.submittedBy,
          decidido_por: view.plan.decidedBy,
          observaciones: view.plan.comment,
          motivo_del_cambio: view.plan.changeReason,
        }
      : null,
    version_vigente: view.approved ? `v${view.approved.version}` : null,
    versiones: view.versions.map((v) => `v${v.version} ${v.status}`),
    empleados: view.employees.map((e) => ({
      id: e.id,
      codigo: e.code,
      nombre: e.name,
      cargo: e.role,
      tipo_jornada: e.typeName,
      responsable_de_turno: e.isLead,
      jornada_referencia_h: e.weeklyHours ?? (e.minWeeklyHours != null ? `mínimo ${e.minWeeklyHours}` : null),
      horas_programadas: fmtMin(view.totals[e.id] ?? 0),
      ficha_incompleta: e.missing.length ? e.missing : undefined,
      prestado_desde: e.guestFrom ? `${e.guestFrom.siteName} (solo ${e.guestFrom.dates.join(", ")})` : undefined,
      en_otra_tienda: e.awayDates.length ? e.awayDates.map((a) => `${a.date} en ${a.siteName}`) : undefined,
      turnos: cellsOf.get(e.id) ?? {},
    })),
    novedades: view.novelties.map((n) => `${n.employeeName}: ${n.type} ${n.startDate}→${n.endDate} (${n.status})`),
    franjas_sin_responsable: view.coverage.map((g) => `${g.date} ${g.fromHm}-${g.toHm}`),
    advertencias: view.warnings.map((w) => w.message),
  };
}

const compactNovelty = (n) => ({
  id: n.id,
  clase: n.kind,
  tipo: n.type,
  empleado: n.employeeName,
  empleado_id: n.employeeId,
  tienda_id: n.siteId,
  desde: n.startDate,
  hasta: n.endDate,
  estado: n.status,
  horas_excedentes: n.minutes != null ? fmtMin(n.minutes) : undefined,
  nota: n.note,
  evidencia: n.evidence,
  registrado_por: n.createdBy,
  decidido_por: n.decidedBy,
  comentario_decision: n.decisionComment,
});

const compactHours = (r, detail) => ({
  empleado_id: r.employeeId,
  empleado: r.employeeName,
  tienda: r.siteName,
  tipo_jornada: r.typeName,
  referencia_h: r.referenceMin != null ? fmtMin(r.referenceMin) : r.minimumMin != null ? `mínimo ${fmtMin(r.minimumMin)}` : null,
  programadas_h: r.plannedMin == null ? "sin cronograma aprobado" : fmtMin(r.plannedMin),
  trabajadas_netas_h: fmtMin(r.workedMin),
  almuerzo_excluido_h: fmtMin(r.lunchMin),
  diferencia_h: fmtMin(r.diffMin),
  exceso_h: r.excessMin ? fmtMin(r.excessMin) : null,
  bajo_minimo_h: r.shortfallMin ? fmtMin(r.shortfallMin) : null,
  descansos: r.restDays,
  incidencias: r.incidents,
  exceso_estado: r.excessNovelty?.status ?? null,
  pendiente_de_revision: r.pendingReview,
  ...(detail
    ? {
        dias: r.days.map((d) => ({
          fecha: d.date,
          programado: d.plannedKind === "descanso" ? "descanso" : d.plannedMin == null ? null : fmtMin(d.plannedMin),
          turno: d.plannedStartHm ? `${d.plannedStartHm}-${d.plannedEndHm}` : undefined,
          almuerzo_programado_min: d.plannedLunchMin ?? undefined,
          entrada: d.workday?.firstIn ?? null,
          sale_almuerzo: d.workday?.lunchOut ?? null,
          regresa: d.workday?.lunchIn ?? null,
          salida: d.workday?.lastOut ?? null,
          neto: d.workday?.workedMin != null ? fmtMin(d.workday.workedMin) : null,
          llegada_tarde_min: d.lateMin || undefined,
          almuerzo_tomado_min: d.workday?.lunchMin ?? undefined,
          almuerzo_excedido_min: d.workday?.lunchDiffMin > 0 ? d.workday.lunchDiffMin : undefined,
          incidencias: d.workday?.incidents ?? [],
        })),
      }
    : {}),
  // Nunca se incluye el salario: los datos salen hacia un proveedor de IA externo.
});

export const INSTRUCTIONS = `Reloj CR: asistencia, turnos y novedades de tiendas (Colombia, zona America/Bogota).
Actúa SIEMPRE con los permisos de la persona que inició sesión; si una acción no está disponible es porque su rol no la tiene.
Programar una semana: ver_cronograma → crear_cronograma → guardar_turnos (revise advertencias y franjas_sin_responsable) → enviar_cronograma. El gerente regional lo aprueba o devuelve con observaciones.
Reglas: debe haber siempre un gerente o coordinador (responsable de turno) durante la apertura; el almuerzo no cuenta como trabajado; un exceso sobre la jornada de referencia se escala a revisión y NUNCA se liquida ni se compensa automáticamente.
Antes de enviar, aprobar, devolver, decidir, conceder accesos o movilidad, pida confirmación explícita a la persona y recién entonces use confirmado=true.
No invente ids: obténgalos con ver_cronograma, listar_empleados o buscar_empleado. Nunca hay salarios en estas herramientas.`;

/**
 * @param server    McpServer
 * @param reloj     cliente de la API (reloj.mjs)
 * @param identity  { kind: "integration" } | { kind: "user", user, permissions: Set<string> }
 */
export function registerTools(server, { reloj, identity }) {
  const isUser = identity.kind === "user";
  const has = (perms) => !perms || (isUser ? perms.some((p) => identity.permissions.has(p)) : true);

  const tool = (name, description, shape, handler, { write = false, needs = null, destructive = false } = {}) => {
    if (write && !isUser) return; // la clave de integración es solo de lectura
    if (!has(needs)) return;
    server.registerTool(
      name,
      {
        description,
        inputSchema: shape,
        annotations: write
          ? { readOnlyHint: false, destructiveHint: destructive, idempotentHint: false, openWorldHint: false }
          : { readOnlyHint: true, openWorldHint: false },
      },
      async (args) => {
        try {
          return result(await handler(args ?? {}));
        } catch (e) {
          return failure(e);
        }
      },
    );
  };

  /* ───── resolución de nombres a ids ───── */
  async function resolveEmployee(ref) {
    const { employees } = await reloj.get("employees");
    const r = String(ref).trim().toLowerCase();
    const exact = employees.filter((e) => e.id.toLowerCase() === r || e.code.toLowerCase() === r);
    if (exact.length === 1) return exact[0];
    const named = employees.filter((e) => e.name.toLowerCase().includes(r));
    if (named.length === 1) return named[0];
    if (named.length > 1) {
      throw new Error(`«${ref}» es ambiguo: ${named.slice(0, 6).map((e) => `${e.name} (código ${e.code}, id ${e.id})`).join("; ")}. Use el id o el código.`);
    }
    throw new Error(`No encontré un empleado «${ref}» en su alcance. Use buscar_empleado o listar_empleados.`);
  }

  async function resolveSite(ref) {
    const { sites } = await reloj.get("sites");
    const r = String(ref).trim().toLowerCase();
    const exact = sites.filter((s) => s.id.toLowerCase() === r || s.code.toLowerCase() === r);
    if (exact.length === 1) return exact[0];
    const named = sites.filter((s) => s.name.toLowerCase().includes(r));
    if (named.length === 1) return named[0];
    if (named.length > 1) throw new Error(`«${ref}» es ambiguo: ${named.map((s) => `${s.name} (${s.code})`).join("; ")}. Use el código.`);
    throw new Error(`No encontré la tienda «${ref}» en su alcance. Use listar_sedes.`);
  }

  async function planView(sedeText, semanaText) {
    const site = await resolveSite(sedeText);
    return reloj.get("plans", { site: site.id, week: mondayOf(semanaText || todayLocal()) });
  }

  const requirePlan = (view, verb) => {
    if (!view.plan) throw new Error(`No hay cronograma para ${view.site.name} en la semana del ${view.weekStart}. Para ${verb}, primero use crear_cronograma.`);
    return view.plan;
  };

  /* ═════════════ Lectura ═════════════ */
  tool("mi_perfil", "Quién es la persona conectada, su rol, y qué acciones puede realizar en Reloj CR.", {}, async () =>
    isUser
      ? { usuario: identity.user.name, correo: identity.user.email, rol: identity.user.role, alcance: { tipo: identity.user.scopeType, id: identity.user.scopeId }, permisos: [...identity.permissions].sort() }
      : { modo: "integración de solo lectura (clave de API compartida): no hay usuario ni acciones de escritura" },
  );
  tool("estado_sistema", "Salud del sistema Reloj CR: terminales (en línea/fuera de línea) y marcaciones de hoy.", {}, () => reloj.get("health"));
  tool("catalogo", "Países, zonas, sedes y tipos de evento disponibles.", {}, () => reloj.get("catalog"));
  tool("listar_sedes", "Lista de tiendas accesibles con sus regiones y países.", {}, () => reloj.get("sites"));
  tool(
    "listar_empleados",
    "Lista empleados, opcionalmente filtrados por tienda. Incluye identificación, tipo de jornada y estado laboral (no el salario).",
    { sede: z.string().optional().describe("Id o código de tienda"), incluir_eliminados: z.boolean().optional() },
    ({ sede, incluir_eliminados }) => reloj.get("employees", { site: sede, includeDeleted: incluir_eliminados ? "1" : undefined }),
  );
  tool(
    "buscar_empleado",
    "Busca empleados por nombre, código o cargo (texto parcial). Úselo para obtener el id antes de programar turnos o novedades.",
    { texto: z.string().min(2), sede: z.string().optional() },
    async ({ texto, sede }) => {
      const { employees } = await reloj.get("employees", { site: sede });
      const q = texto.toLowerCase();
      return employees
        .filter((e) => `${e.name} ${e.code} ${e.role}`.toLowerCase().includes(q))
        .slice(0, 25)
        .map((e) => ({ id: e.id, codigo: e.code, nombre: e.name, cargo: e.role, tienda_id: e.siteId, tipo_jornada_id: e.employeeTypeId, estado: e.employmentStatus, activo: e.active }));
    },
  );
  tool("obtener_empleado", "Detalle de un empleado por ID.", { id: z.string() }, ({ id }) => reloj.get(`employees/${encodeURIComponent(id)}`));
  tool("tipos_jornada", "Tipos de jornada configurados (días por semana, horas, mínimo, almuerzo, si son responsables de turno).", {}, () => reloj.get("employee-types"));
  tool(
    "listar_marcaciones",
    "Marcaciones (entrada, salida a almuerzo, regreso, salida) recientes, con paginación por cursor. Solo consulta: no se pueden crear marcaciones.",
    {
      sede: z.string().optional().describe("Id o código de tienda"),
      desde: z.string().optional().describe("Fecha/hora ISO mínima"),
      cursor: z.string().optional().describe("nextCursor de la llamada anterior"),
      limite: z.number().int().min(1).max(500).optional(),
    },
    ({ sede, desde, cursor, limite }) => reloj.get("punches", { site: sede, since: desde, cursor, limit: limite ?? 50 }),
  );
  tool(
    "reporte_asistencia",
    "Reporte de asistencia de un día (presentes, tardías, ausencias) con filtros.",
    {
      dia: date.optional().describe("Día AAAA-MM-DD (por defecto hoy, America/Bogota)"),
      sede: z.string().optional(),
      empleado: z.string().optional().describe("ID de empleado"),
      estado: z.string().optional(),
      pais: z.string().optional(),
      zona: z.string().optional(),
    },
    ({ dia, sede, empleado, estado, pais, zona }) => reloj.get("reports", { day: dia, site: sede, employee: empleado, status: estado, country: pais, zone: zona }),
  );
  tool("listar_alertas", "Alertas activas (terminales fuera de línea, novedades urgentes, excesos de horas).", {}, () => reloj.get("alerts"));
  tool(
    "listar_anomalias",
    "Anomalías detectadas en marcaciones.",
    { dia: date.optional(), sede: z.string().optional(), revisadas: z.boolean().optional() },
    ({ dia, sede, revisadas }) => reloj.get("anomalies", { day: dia, site: sede, reviewed: revisadas === undefined ? undefined : revisadas ? "1" : "0" }),
  );
  tool("listar_horarios", "Horario semanal fijo asignado (patrón que usan asistencia y nómina), opcionalmente por empleado.", { empleado: z.string().optional() }, ({ empleado }) => reloj.get("schedules", { employee: empleado }));
  tool("listar_excepciones", "Excepciones del día (permisos, vacaciones, incapacidades), opcionalmente por empleado.", { empleado: z.string().optional() }, ({ empleado }) => reloj.get("exceptions", { employee: empleado }));
  tool("listar_correcciones", "Correcciones de marcaciones, opcionalmente por ID de marcación.", { marcacion: z.string().optional() }, ({ marcacion }) => reloj.get("corrections", { punch: marcacion }));
  tool("resumen_ia", "Resumen ejecutivo del día generado por el módulo de IA de Reloj CR.", { dia: date.optional(), sede: z.string().optional() }, ({ dia, sede }) => reloj.get("ai/briefing", { day: dia, site: sede }));

  tool(
    "resumen_regional",
    "Inicio del gerente regional: ciudades y tiendas de su región con el estado del cronograma de la semana, franjas sin responsable y pendientes por aprobar.",
    { semana },
    ({ semana: s }) => reloj.get("region", { week: mondayOf(s || todayLocal()) }),
    { needs: ["plan.view"] },
  );
  tool(
    "ver_cronograma",
    "Cronograma semanal de una tienda: turnos por empleado, descansos, novedades, totales de horas, franjas sin gerente/coordinador y advertencias. Úselo antes de proponer cambios.",
    { sede: sedeRef, semana },
    async ({ sede, semana: s }) => compactPlan(await planView(sede, s)),
    { needs: ["plan.view"] },
  );
  tool(
    "cronogramas_region",
    "Estado del cronograma de la semana en todas las tiendas visibles (resumen, sin turnos).",
    { semana },
    async ({ semana: s }) => {
      const { plans } = await reloj.get("plans", { scope: "region", week: mondayOf(s || todayLocal()) });
      return plans.map((v) => ({
        tienda: `${v.site.name} (${v.site.code})`,
        estado: v.plan ? `v${v.plan.version} ${v.plan.status}` : "sin cronograma",
        version_vigente: v.approved ? `v${v.approved.version}` : null,
        empleados: v.employees.length,
        franjas_sin_responsable: v.coverage.length,
        advertencias: v.warnings.length,
        fichas_incompletas: v.employees.filter((e) => e.missing.length).length,
      }));
    },
    { needs: ["plan.view"] },
  );
  tool(
    "horas_semanales",
    "Control de horas de la semana: programadas (cronograma aprobado) vs. trabajadas netas (sin almuerzo), diferencia, exceso sobre la jornada de referencia e incidencias. No incluye salarios ni cálculo de nómina.",
    {
      semana,
      sede: z.string().optional().describe("Id o código de tienda"),
      zona: z.string().optional().describe("Id de región"),
      empleado: z.string().optional().describe("Id de empleado"),
      revision: z.enum(["pendiente", "ok"]).optional(),
      detalle_por_dia: z.boolean().optional().describe("Incluye las marcas de cada día"),
    },
    async ({ semana: s, sede, zona, empleado, revision, detalle_por_dia }) => {
      const data = await reloj.get("hours", { week: mondayOf(s || todayLocal()), site: sede, zone: zona, employee: empleado, review: revision });
      return { semana: data.weekStart, corte: data.cutAt, empleados: data.rows.map((r) => compactHours(r, detalle_por_dia)) };
    },
    { needs: ["hours.view"] },
  );
  tool(
    "horas_nomina",
    "Corte de nómina de un período (quincena o mes, máx. 31 días): por empleado, horas por categoría legal colombiana (ordinarias diurnas, recargo nocturno, dominical/festivo, extras diurnas/nocturnas/festivas) contra el cronograma aprobado, tardanzas, almuerzos excedidos, ausencias por revisar, días trabajados sin turno aprobado, novedades y estado de autorización de las horas adicionales. Sin salarios ni valores.",
    {
      desde: date,
      hasta: date,
      sede: z.string().optional().describe("Id o código de tienda"),
      zona: z.string().optional().describe("Id de región"),
      empleado: z.string().optional().describe("Id de empleado"),
    },
    async ({ desde, hasta, sede, zona, empleado }) => {
      const data = await reloj.get("payroll-hours", { from: desde, to: hasta, site: sede, zone: zona, employee: empleado });
      const h = (n) => Math.round(n * 100) / 100;
      return {
        periodo: { desde: data.from, hasta: data.to },
        categorias: data.labels,
        empleados: data.rows.map((r) => ({
          empleado_id: r.employeeId,
          codigo: r.employeeCode,
          empleado: r.employeeName,
          cedula: r.documentId,
          tienda: r.siteName,
          tipo_jornada: r.typeName,
          horas_trabajadas: h(r.workedHours),
          horas: Object.fromEntries(Object.entries(r.hours).filter(([, v]) => v > 0).map(([k, v]) => [k, h(v)])),
          tardanzas: r.lateDays ? { dias: r.lateDays, minutos: r.lateMin } : undefined,
          almuerzo_excedido: r.lunchOverDays ? { dias: r.lunchOverDays, minutos: r.lunchOverMin } : undefined,
          ausencias_por_revisar: r.absences.length ? r.absences : undefined,
          trabajo_sin_turno_aprobado: r.workedWithoutPlan.length ? r.workedWithoutPlan : undefined,
          novedades_dias: Object.keys(r.noveltyDays).length ? r.noveltyDays : undefined,
          horas_adicionales: r.excessWeeks.length ? r.excessWeeks.map((w) => ({ semana: w.weekStart, exceso: fmtMin(w.excessMin), estado: w.status })) : undefined,
          incidencias_de_marcacion: r.incidents || undefined,
        })),
      };
    },
    { needs: ["hours.view"] },
  );
  tool(
    "listar_novedades",
    "Novedades: programadas (vacaciones, incapacidad…), urgentes (p. ej. marcación en tienda no autorizada) y horas adicionales por autorizar.",
    {
      estado: z.enum(["registrada", "pendiente", "aprobada", "rechazada"]).optional(),
      clase: z.enum(["programada", "urgente", "exceso"]).optional(),
      empleado: z.string().optional().describe("Id de empleado"),
      sede: z.string().optional().describe("Id de tienda"),
      desde: date.optional(),
      hasta: date.optional(),
    },
    async ({ estado, clase, empleado, sede, desde, hasta }) => {
      const data = await reloj.get("novelties", { status: estado, kind: clase, employee: empleado, site: sede, from: desde, to: hasta });
      return { novedades: data.novelties.map(compactNovelty), tipos_permitidos: data.types };
    },
    { needs: ["novelty.view"] },
  );
  tool(
    "listar_accesos",
    "Tiendas donde cada empleado puede marcar (permanentes, temporales y movilidad), con historial opcional de revocadas.",
    { empleado: z.string().optional().describe("Id de empleado"), incluir_historial: z.boolean().optional() },
    async ({ empleado, incluir_historial }) => {
      const [{ access }, { sites }, { employees }] = await Promise.all([
        reloj.get("access", { employee: empleado, history: incluir_historial ? "1" : undefined }),
        reloj.get("sites"),
        reloj.get("employees"),
      ]);
      const site = new Map(sites.map((s) => [s.id, `${s.name} (${s.code})`]));
      const emp = new Map(employees.map((e) => [e.id, e.name]));
      return access.map((a) => ({
        id: a.id,
        empleado: emp.get(a.employeeId) ?? a.employeeId,
        empleado_id: a.employeeId,
        tipo: a.kind,
        tienda: site.get(a.siteId) ?? a.siteId,
        origen: a.fromSiteId ? (site.get(a.fromSiteId) ?? a.fromSiteId) : null,
        desde: a.startDate,
        hasta: a.endDate,
        motivo: a.reason,
        autorizado_por: a.authorizedBy,
        revocado: a.revokedAt ? `${a.revokedAt.slice(0, 10)} por ${a.revokedBy}` : null,
      }));
    },
    { needs: ["plan.view"] },
  );

  /* ═════════════ Escritura ═════════════ */
  tool(
    "crear_cronograma",
    "Crea el borrador del cronograma de una tienda para una semana, o una NUEVA VERSIÓN si ya hay uno aprobado (entonces motivo_del_cambio es obligatorio). La versión aprobada sigue vigente hasta que se apruebe la nueva.",
    { sede: sedeRef, semana, motivo_del_cambio: z.string().max(300).optional() },
    async ({ sede, semana: s, motivo_del_cambio }) => {
      const site = await resolveSite(sede);
      const view = await reloj.post("plans", { siteId: site.id, weekStart: mondayOf(s || todayLocal()), changeReason: motivo_del_cambio });
      return compactPlan(view);
    },
    { write: true, needs: ["plan.edit"] },
  );
  tool(
    "guardar_turnos",
    "Programa turnos, descansos o novedades en el borrador (o cronograma devuelto) de una tienda. Cada celda indica empleado, una o varias fechas y el tipo. 'vaciar' borra la celda. Devuelve el cronograma recalculado con totales, cobertura y advertencias: revíselos y corrija antes de enviar.",
    {
      sede: sedeRef,
      semana,
      celdas: z
        .array(
          z.object({
            empleado: empRef,
            fechas: z.array(date).min(1).max(7).describe("Días de la semana a los que aplica"),
            tipo: z.enum(["turno", "descanso", "novedad", "vaciar"]),
            entrada: hm.optional().describe("Obligatoria si tipo=turno"),
            salida: hm.optional().describe("Obligatoria si tipo=turno; menor que la entrada = cruza medianoche"),
            almuerzo_min: z.number().int().min(0).max(180).optional().describe("Minutos de almuerzo que no cuentan como trabajados (por defecto 30)"),
            nota: z.string().max(200).optional(),
          }),
        )
        .min(1)
        .max(120),
    },
    async ({ sede, semana: s, celdas }) => {
      const view = await planView(sede, s);
      const plan = requirePlan(view, "guardar turnos");
      const known = new Map();
      for (const e of view.employees) {
        known.set(e.id.toLowerCase(), e);
        known.set(e.code.toLowerCase(), e);
      }
      const cells = [];
      for (const c of celdas) {
        const emp = known.get(c.empleado.trim().toLowerCase()) ?? (await resolveEmployee(c.empleado));
        if (c.tipo === "turno" && (!c.entrada || !c.salida)) throw new Error(`Falta entrada o salida para ${emp.name}: un turno necesita ambas (HH:MM).`);
        for (const fecha of c.fechas) {
          cells.push({
            employeeId: emp.id,
            date: fecha,
            kind: c.tipo === "vaciar" ? null : c.tipo,
            startHm: c.tipo === "turno" ? c.entrada : null,
            endHm: c.tipo === "turno" ? c.salida : null,
            lunchMin: c.tipo === "turno" ? (c.almuerzo_min ?? 30) : null,
            note: c.nota ?? null,
          });
        }
      }
      return compactPlan(await reloj.put(`plans/${plan.id}`, { cells }));
    },
    { write: true, needs: ["plan.edit"] },
  );
  tool(
    "enviar_cronograma",
    "Envía el borrador de la semana al gerente regional para su aprobación. Después ya no se puede editar hasta que lo devuelva.",
    { sede: sedeRef, semana, confirmado: confirmed },
    async ({ sede, semana: s }) => {
      const view = await planView(sede, s);
      const plan = requirePlan(view, "enviarlo");
      return compactPlan(await reloj.post(`plans/${plan.id}`, { action: "submit" }));
    },
    { write: true, needs: ["plan.submit"] },
  );
  tool(
    "aprobar_cronograma",
    "Aprueba el cronograma enviado de una tienda: pasa a ser la versión vigente. Solo el gerente regional.",
    { sede: sedeRef, semana, comentario: z.string().max(300).optional(), confirmado: confirmed },
    async ({ sede, semana: s, comentario }) => {
      const view = await planView(sede, s);
      const plan = requirePlan(view, "aprobarlo");
      return compactPlan(await reloj.post(`plans/${plan.id}`, { action: "approve", comment: comentario }));
    },
    { write: true, needs: ["plan.decide"] },
  );
  tool(
    "devolver_cronograma",
    "Devuelve el cronograma enviado al gerente de tienda con observaciones obligatorias, para que lo corrija y lo envíe de nuevo. Solo el gerente regional.",
    { sede: sedeRef, semana, observaciones: z.string().min(3).max(300), confirmado: confirmed },
    async ({ sede, semana: s, observaciones }) => {
      const view = await planView(sede, s);
      const plan = requirePlan(view, "devolverlo");
      return compactPlan(await reloj.post(`plans/${plan.id}`, { action: "return", comment: observaciones }));
    },
    { write: true, needs: ["plan.decide"] },
  );
  tool(
    "registrar_novedad",
    "Registra una novedad. Programada (vacaciones, incapacidad, capacitacion, licencia, retiro, cambio_tienda, otra): queda en el cronograma y afecta la cobertura. Urgente (cobertura_urgente, otra_urgente): exige causa y queda pendiente de aprobación del gerente regional.",
    {
      clase: z.enum(["programada", "urgente"]),
      tipo: z.string().describe("Tipo según la clase (ver descripción)"),
      empleado: empRef,
      desde: date,
      hasta: date.optional().describe("Por defecto igual a 'desde'"),
      nota: z.string().max(300).optional().describe("Obligatoria en las urgentes (la causa)"),
      evidencia: z.string().max(300).optional().describe("Referencia (número de incapacidad, etc.); no adjunte datos médicos"),
    },
    async ({ clase, tipo, empleado, desde, hasta, nota, evidencia }) => {
      const emp = await resolveEmployee(empleado);
      const data = await reloj.post("novelties", { kind: clase, type: tipo, employeeId: emp.id, startDate: desde, endDate: hasta ?? desde, note: nota, evidence: evidencia });
      return compactNovelty(data.novelty);
    },
    { write: true, needs: ["novelty.create"] },
  );
  tool(
    "decidir_novedad",
    "Aprueba o rechaza una novedad pendiente (excepción por marcación en otra tienda, novedad urgente u horas adicionales). Rechazar exige comentario. Aprobar horas adicionales NO las liquida ni compensa. Solo el gerente regional.",
    { id: z.string(), decision: z.enum(["aprobada", "rechazada"]), comentario: z.string().max(300).optional(), confirmado: confirmed },
    async ({ id, decision, comentario }) => compactNovelty((await reloj.patch(`novelties/${encodeURIComponent(id)}`, { decision, comment: comentario })).novelty),
    { write: true, needs: ["novelty.decide"], destructive: true },
  );
  tool(
    "habilitar_tienda",
    "Habilita o deshabilita a un empleado para marcar en otra tienda (casilla de accesos). Con 'hasta' es temporal; sin él, permanente. Solo el gerente regional, dentro de su región.",
    {
      empleado: empRef,
      sede: sedeRef.describe("Tienda donde podrá marcar (no la tienda base)"),
      habilitado: z.boolean(),
      hasta: date.optional(),
      motivo: z.string().max(200).optional(),
      confirmado: confirmed,
    },
    async ({ empleado, sede, habilitado, hasta, motivo }) => {
      const [emp, site] = await Promise.all([resolveEmployee(empleado), resolveSite(sede)]);
      const data = await reloj.post("access", { employeeId: emp.id, siteId: site.id, enabled: habilitado, endDate: hasta ?? null, reason: motivo ?? null });
      return { ok: true, empleado: emp.name, tienda: site.name, habilitado, hasta: hasta ?? null, autorizacion: data.access ?? null };
    },
    { write: true, needs: ["access.manage"] },
  );
  tool(
    "autorizar_movilidad",
    "Autoriza que un empleado trabaje temporalmente en otra tienda (cobertura, incapacidad, capacitación…). No cambia su tienda base: aparece en el cronograma y en el kiosco de la tienda destino durante esas fechas. Solo el gerente regional.",
    {
      empleado: empRef,
      sede_destino: sedeRef,
      desde: date,
      hasta: date,
      motivo: z.enum(["cobertura", "incapacidad", "capacitación", "apertura/cierre", "otra"]),
      detalle: z.string().max(200).optional(),
      confirmado: confirmed,
    },
    async ({ empleado, sede_destino, desde, hasta, motivo, detalle }) => {
      const [emp, site] = await Promise.all([resolveEmployee(empleado), resolveSite(sede_destino)]);
      const data = await reloj.post("mobility", { employeeId: emp.id, toSiteId: site.id, startDate: desde, endDate: hasta, reason: motivo, note: detalle });
      return { ok: true, empleado: emp.name, destino: site.name, desde, hasta, entre_ciudades: data.mobility.interCity, id: data.mobility.id };
    },
    { write: true, needs: ["mobility.manage"] },
  );
  tool(
    "revocar_acceso",
    "Revoca una autorización de tienda o una movilidad (queda en el historial). Use listar_accesos para obtener el id.",
    { id: z.string(), confirmado: confirmed },
    async ({ id }) => ({ ok: true, revocado: (await reloj.del(`access/${encodeURIComponent(id)}`)).access }),
    { write: true, needs: ["access.manage", "mobility.manage"], destructive: true },
  );
  tool(
    "fijar_horario_tienda",
    "Define la hora de apertura y cierre de una tienda; con ella se calcula la cobertura obligatoria de gerente/coordinador. Solo el gerente regional.",
    { sede: sedeRef, apertura: hm, cierre: hm.describe("HH:MM; 00:00 = medianoche"), confirmado: confirmed },
    async ({ sede, apertura, cierre }) => {
      const site = await resolveSite(sede);
      const data = await reloj.put("site-hours", { siteId: site.id, opensHm: apertura, closesHm: cierre });
      return { ok: true, tienda: data.site.name, apertura: data.site.opensHm, cierre: data.site.closesHm };
    },
    { write: true, needs: ["access.manage"] },
  );
  tool(
    "crear_empleado",
    "Da de alta un empleado en una tienda con su ficha laboral (cédula, cargo y tipo de jornada). Solo RR. HH. No maneja salarios. Después hay que enrolar su rostro en la tienda.",
    {
      nombre: z.string().min(3).max(120),
      codigo: z.string().regex(/^[A-Za-z0-9_-]{2,20}$/).describe("Código interno único, p. ej. AP-14"),
      sede: sedeRef,
      cargo: z.string().min(2).max(80),
      cedula: z.string().regex(/^\d{5,12}$/).describe("Solo números"),
      tipo_jornada: z.string().describe("Id o nombre del tipo de jornada (ver tipos_jornada)"),
      confirmado: confirmed,
    },
    async ({ nombre, codigo, sede, cargo, cedula, tipo_jornada }) => {
      const site = await resolveSite(sede);
      const { types } = await reloj.get("employee-types");
      const t = String(tipo_jornada).trim().toLowerCase();
      const type = types.find((x) => x.id.toLowerCase() === t) ?? types.find((x) => x.name.toLowerCase() === t);
      if (!type) throw new Error(`No existe el tipo de jornada «${tipo_jornada}». Tipos: ${types.map((x) => x.name).join(", ")}.`);
      const data = await reloj.post("employees", { name: nombre, code: codigo.toUpperCase(), siteId: site.id, role: cargo, documentId: cedula, employeeTypeId: type.id, employmentStatus: "activo" });
      const e = data.employee ?? data;
      return { ok: true, id: e.id, codigo: e.code, nombre: e.name, tienda: site.name, tipo_jornada: type.name, enrolado: false };
    },
    { write: true, needs: ["employee.manage"] },
  );
  tool(
    "trasladar_empleado",
    "Cambia la tienda BASE de un empleado (traslado definitivo). Para unos días en otra tienda use autorizar_movilidad. Solo RR. HH.",
    { empleado: empRef, sede_destino: sedeRef, confirmado: confirmed },
    async ({ empleado, sede_destino }) => {
      const [emp, site] = await Promise.all([resolveEmployee(empleado), resolveSite(sede_destino)]);
      const data = await reloj.patch(`employees/${encodeURIComponent(emp.id)}`, { siteId: site.id });
      const e = data.employee ?? data;
      return { ok: true, empleado: e.name, tienda_base: site.name };
    },
    { write: true, needs: ["employee.manage"] },
  );
  tool(
    "actualizar_ficha_laboral",
    "Actualiza la ficha laboral de un empleado: identificación, tipo de jornada y estado laboral. Solo RR. HH. No maneja salarios.",
    {
      empleado: empRef,
      identificacion: z.string().min(3).max(30).optional(),
      tipo_jornada: z.string().optional().describe("Id o nombre del tipo de jornada (ver tipos_jornada)"),
      estado: z.enum(["activo", "inactivo", "retirado"]).optional(),
      confirmado: confirmed,
    },
    async ({ empleado, identificacion, tipo_jornada, estado }) => {
      const emp = await resolveEmployee(empleado);
      const body = {};
      if (identificacion !== undefined) body.documentId = identificacion;
      if (estado !== undefined) body.employmentStatus = estado;
      if (tipo_jornada !== undefined) {
        const { types } = await reloj.get("employee-types");
        const r = tipo_jornada.trim().toLowerCase();
        const hit = types.find((t) => t.id.toLowerCase() === r || t.name.toLowerCase() === r) ?? types.find((t) => t.name.toLowerCase().includes(r));
        if (!hit) throw new Error(`Tipo de jornada «${tipo_jornada}» no existe. Opciones: ${types.map((t) => t.name).join("; ")}.`);
        body.employeeTypeId = hit.id;
      }
      if (!Object.keys(body).length) throw new Error("Indique al menos un campo a cambiar.");
      const data = await reloj.patch(`employees/${encodeURIComponent(emp.id)}`, body);
      const e = data.employee;
      return { ok: true, id: e.id, nombre: e.name, identificacion: e.documentId, tipo_jornada_id: e.employeeTypeId, estado: e.employmentStatus };
    },
    { write: true, needs: ["employee.hr_edit"] },
  );
}
