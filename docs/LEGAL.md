# Valor legal del registro de asistencia

Esto es una ayuda técnica. Su valor probatorio y los límites de jornada deben validarse con el abogado laboral de la empresa.

## Registro sellado (integridad)

- Cada evento de auditoría guarda el hash del anterior (`events.prev_hash`, `events.hash`, SHA-256). Editar, borrar o reordenar un evento rompe la cadena.
- Cada marca y cada corrección dejan en su evento los campos que importan (colaborador, tipo, fecha/hora, terminal). `GET /api/v1/integrity` coteja la tabla `punches` contra esos eventos, así que un `UPDATE` o `DELETE` directo a la base se detecta (`modified` / `missing`).
- La pantalla **Auditoría** muestra el estado. Roles: gerente de sede o superior y auditor.
- **Límite:** lo anterior a la primera ejecución con esta versión se sella "desde esa fecha" (`settings.integrity_chain_since`); no se puede probar nada previo. La retención (`retention_days`) borra eventos viejos y la cadena se valida desde el primer eslabón que queda.
- **Límite:** quien tenga acceso de escritura al servidor *y* conozca el algoritmo puede reescribir toda la cadena. Para reducir ese riesgo, guarde periódicamente el último sello (`head`) fuera del servidor.

## Expediente por trabajador

`GET /api/v1/employees/{id}/dossier?from=AAAA-MM-DD&to=AAAA-MM-DD` (PDF; botón en **Personas**). Incluye horas por día, marcaciones, correcciones con motivo y aprobador, alertas de jornada, estado de integridad y la huella SHA-256 del contenido. Cada descarga queda en auditoría (`dossier.generated`, con la huella).

Solo gerente de sede o superior y auditor, y solo de su alcance. Contiene datos personales: trátelo según la política de datos de la empresa.

## Alertas de jornada

`labor_limits` en el escáner de anomalías (`POST /api/v1/anomalies`). Límites configurables en `settings`:

| Clave | Por defecto | Nota |
|---|---|---|
| `labor_max_daily_hours` | 10 | jornada + 2 horas extras |
| `labor_max_weekly_hours` | 42 | Ley 2101 de 2021, vigente desde julio de 2026 |

También avisa de 12 h extras semanales superadas y de 7 días seguidos sin descanso. Un turno que cruza la medianoche se cuenta en el día en que empezó, y una entrada sin salida no suma horas.

Pendiente: recargos nocturnos, dominicales y festivos; la hora de inicio del trabajo nocturno cambió con la reforma laboral de 2025 y debe confirmarse con el abogado.

## Retención

El valor por defecto (`retention_days` = 365) es corto para sustentar reclamaciones laborales. Defina con el abogado cuánto tiempo conservar y ajuste el valor antes de aplicar la retención.
