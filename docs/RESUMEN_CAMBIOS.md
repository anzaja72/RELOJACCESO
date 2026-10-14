# Resumen ejecutivo de cambios — Reloj CR v1.1

> Documento para dirección y usuarios clave. Describe qué cambió en la plataforma, por qué importa y qué puede hacer ahora el equipo que antes no podía. Sin tecnicismos.

---

## 1. Tablero de control de asistencia (pantalla de Reportes)

**Antes:** la pantalla de reportes mostraba el listado diario de novedades y nada más; para entender el comportamiento del equipo había que revisar día por día.

**Ahora:** al abrir *Reportes* aparece un **tablero mensual** con:

- **Indicadores del mes:** presentes, ausentes, tardanzas y omisiones, con la evolución día a día en una gráfica de barras.
- **Puntualidad:** tarjetas con el trabajador más puntual, el menos puntual y la sede con mejor puntualidad, con su atraso promedio en minutos.
- **Composición del equipo:** gráfica circular de estados (puntuales, tardes, ausentes, salidas tempranas).
- **Selector de mes:** se puede consultar cualquier mes del año, no solo el día en curso.

**Valor:** el gerente ve en 5 segundos cómo se comporta la operación, sin exportar nada ni abrir Excel.

---

## 2. Horas y salario por trabajador (módulo de nómina horaria)

**Antes:** la plataforma registraba marcaciones, pero no decía cuántas horas ordinarias ni extra trabajó cada persona ni cuánto representaba eso en dinero.

**Ahora:** el tablero incluye la tabla **“Horas y valores del mes”**, con un renglón por trabajador:

- Horas ordinarias trabajadas.
- Horas extra **diurnas, nocturnas y festivas**, valorizadas por separado con los multiplicadores de ley (recargo nocturno y dominical/festivo).
- Valor total del mes en pesos y la tarifa hora de cada persona.
- Semáforo de contrato: quién tiene contrato formal cargado y quién no.

**Valor:** insumo directo para nómina y para negociar horas extras con respaldo de datos, en lugar de cálculos manuales en hojas de cálculo.

---

## 3. Parámetros de cumplimiento legal configurables (pantalla Ajustes)

**Antes:** las reglas (gracia de tolerancia, horarios, etc.) estaban fijas en el sistema; cambiarlas requería soporte técnico.

**Ahora:** *Ajustes* ofrece tres bloques editables por el administrador:

- **Condiciones legales:** recargos por hora extra (diurna/nocturna/festiva), ventana de turno nocturno, lista de festivos del año, máximo de horas semanales, umbral de alerta por faltas injustificadas y **plazo de 48 horas para corregir marcaciones** (fuera de plazo solo un superadministrador puede forzar la corrección, y todo queda en la bitácora).
- **Turnos:** alta y edición de turnos (mañana, estándar, tarde, noche o el que se necesite) y asignación de un turno a cada colaborador y día de la semana. El sistema calcula solo las horas planificadas.
- **Contratos:** registro del salario mensual y de las horas semanales de cada colaborador, base del cálculo de horas y valores.

**Valor:** la empresa responde a cambios de ley o de convenio toque una pantalla, sin intervención de TI; el histórico queda protegido.

---

## 4. Informe mensual automático a contabilidad/sistema externo

**Antes:** el cierre mensual se hacía copiando datos a mano hacia el sistema de nómina o de contabilidad.

**Ahora:** en *Ajustes → Informe mensual* se configura una sola vez la dirección (URL) del sistema que recibirá el cierre. Con eso:

- El sistema prepara el reporte mensual completo (KPIs, serie diaria y nómina valorizada).
- Lo envía **firmado digitalmente**, de modo que el receptor puede verificar que vino de Reloj CR y no fue alterado.
- Hay un botón **“Enviar ahora”** para forzar el envío y una marca de **último envío exitoso**; además, el sistema reintenta solo en el siguiente acceso si la recepción falla.

**Valor:** cierre mensual sin trabajo manual, con trazabilidad y verificación de integridad.

---

## 5. IAnálisis: asistente de consultas con filtro regional

**Antes:** la función de inteligencia artificial (“Pregunta”) respondía con datos de toda la compañía, sin distinguir región ni sede.

**Ahora:** la pantalla se llama **IAnálisis** y agrega tres filtros encadenados — **País → Zona → Sede** — que aplican tanto al chat como al *briefing del día*:

- El chat responde solo con datos del alcance seleccionado (presentes, atrasos, terminales, sincronizaciones y correcciones), con citas de evidencia.
- El briefing genera sus 5 viñetas y enlaces de seguimiento **ya filtrados por la región elegida**.
- Los enlaces abren el reporte con el filtro puesto, sin tener que recomponerlo.

**Valor:** un gerente de región ve únicamente a sus sedes; la misma pregunta da respuestas distintas y correctas según quién la hace.

---

## 6. Datos de demostración (100 colaboradores)

**Antes:** la base venía con 5 personas de ejemplo, insuficiente para mostrar la plataforma en una reunión.

**Ahora:** existe una carga de demostración reproducible (`npm run seed:dummy`) que genera:

- **5 sedes** en Colombia (Bogotá, Medellín, Cartagena, etc.) en dos regiones.
- **105 colaboradores** con nombre, código, cargo y sede.
- Horarios completos de octubre con una mezcla realista: gente puntual, personas que llegan tarde, ausencias, salidas anticipadas, licencias médicas justificadas y trabajadores del turno nocturno con horas extra de madrugada.
- Contratos con salario y horas semanales reales en pesos.
- Alertas de ejemplo: colaboradores que exceden el máximo legal de horas semanales aparecen en la bandeja de alertas.

**Valor:** la herramienta se puede recorrer completa con datos creíbles en una demostración o capacitación, y se puede regenerar en cero minutos si se ensucia.

---

## 7. Control de calidad de esta versión

La versión se verificó antes de entregarse:

- Cálculo de horas y salarios probado con **8 escenarios de casos reales** (turnos con descanso, jornadas partidas, noche que cruza medianoche, festivos): todos pasan.
- Compilación sin errores y todas las pruebas automáticas en verde.
- Recorrido de humo de todos los servicios nuevos: altas de turno, contratos, tablero, envío del informe con firma verificada y **bloqueo real de correcciones fuera de plazo** (se probó con un usuario no autorizado y respondió “plazo vencido”).
- Contraseñas y claves de desarrollo documentadas para los perfiles de prueba (superadmin, gerente de región, gerente de sede, operador y auditor).

---

## Cómo usarlo en 30 segundos

1. Entrar a `/login` con `admin@reloj.cr` / `RelojCR-Admin-2026!`.
2. Abrir **Reportes** → ver el tablero del mes con gráficas y nómina.
3. Abrir **Ajustes** → pestañas de Condiciones legales, Turnos, Contratos e Informe mensual.
4. Abrir **IAnálisis** → elegir País/Zona/Sede y preguntar.
5. Si se necesita regenerar la demo: `npm run seed:dummy`.
