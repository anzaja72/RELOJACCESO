# Plan de salida y portabilidad — Reloj CR

## Qué se entrega al cliente (G05 / I08 / S08)

Desde Operación o Reportes, o vía API:

```
GET /api/v1/exports/pack?format=json
GET /api/v1/exports/pack?format=csv
GET /api/v1/exports/pack?format=xlsx
GET /api/v1/exports/pack?format=pdf
GET /api/v1/exports/pack?format=zip
```

El paquete JSON / ZIP incluye maestros (países, zonas, sedes, colaboradores, turnos, excepciones), marcaciones ULID, correcciones, auditoría de enrolamiento, eventos y terminales. **No incluye** el PIN de supervisor ni el material cifrado de plantillas en claro: las plantillas viajan solo si el operador exporta el dump interno de SQLite con la clave `TEMPLATE_KEY`.

CSV, XLSX (Office Open XML) y PDF cubren el reporte operativo de marcaciones.

## Copias de seguridad

```bash
npm run backup    # copia data/asistencia.db → data/backups/asistencia-<ISO>.db
npm run restore -- data/backups/<archivo>.db
```

`SANDBOX=true` usa `data/asistencia.sandbox.db` (I04). No mezclar con producción.

## RPO / RTO (supuestos de software, no SLA vendido)

| Supuesto | Valor declarado |
| --- | --- |
| RPO | 24 h si el operador corre `npm run backup` diario (o copia el volumen Docker `/data`) |
| RTO | minutos: restaurar el archivo SQLite y `npm run dev` / `docker compose up` |
| Pérdida online | 0 marcaciones si el kiosco tenía red o la cola IndexedDB se vació |
| Pérdida offline | 0 mientras el origen IndexedDB `reloj-cr` no se borre en el navegador |

Estos números **no** son un contrato de disponibilidad telefónica (SV02–SV04). Ver `docs/CONTRACT_TEMPLATES.md`.

## Cómo salir a otro sistema

1. Exportar el paquete ZIP + CSV de marcaciones.
2. Entregar el archivo SQLite (opcional) y rotar `TEMPLATE_KEY`.
3. Revocar claves API y usuarios JWT.
4. Aplicar retención o baja de plantillas (`PATCH` empleado `deleted: true` o `POST /api/v1/settings/retention`).
5. Apagar el proceso / contenedor. No hay agente nativo que desinstalar.

Ids de marcación son **ULID** estables e idempotentes: el destino puede reingestarlos sin duplicar.
