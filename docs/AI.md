# IA — Reloj CR v1.1

La IA **no sustituye** la biometría. Opera sobre marcaciones ya persistidas. Toda respuesta debe citar ids (punch/empleado/terminal) y un rango de fechas o un deep link a `/reports`.

## Qué hay

| Pieza | Ruta | Comportamiento |
| --- | --- | --- |
| P0 reportes | `/reports` | Filtros país / zona / sede / colaborador / fecha / estado + terminales + export |
| P3 anomalías | `/admin`, `POST /api/v1/anomalies` | Reglas: PIN frecuente, buddy-punch &lt;20 s, terminal degradado, omisión vs baseline |
| P1 briefing | botón en `/reports` y `/ai`, `GET|POST /api/v1/ai/briefing` | 5 viñetas en español con `href` |
| P2 chat | `/ai`, `POST /api/v1/ai/chat` | Solo presentes, atrasos, ausencias, terminales, sync, correcciones |

## Claves (nunca en git)

En `.env.local`:

```
OPENAI_API_KEY=
# OPENAI_MODEL=gpt-4o-mini
# ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-3-5-haiku-latest
# Compatible: LLM_BASE_URL=https://api.ejemplo.com/v1  LLM_API_KEY=  LLM_MODEL=
```

Sin clave, briefing y chat usan **plantillas deterministas** sobre SQL (siguen siendo útiles).

## Privacidad: qué sale del servidor

Si hay clave, el POST al proveedor publica **solo agregados e ids** del día filtrado: totales, nombres ya en RR.HH., ids de punch/empleado/terminal, mensajes de anomalía. **No** salen descriptores faciales, fotos (no existen), PIN, hashes ni `TEMPLATE_KEY`.

Sin clave no hay egreso a un LLM.

## Límites

- Prohibido: score de “empleado problema”, CCTV de cocina, fine-tuning, predicción de no-show para despidos.
- El chat rechaza sanción / despido / consejo legal.
- Si el hecho no está en la consulta: `[NO ENCONTRADO]`.

## Cron

`GET` o `POST /api/v1/ai/briefing?day=YYYY-MM-DD&site=site_r01` con `X-API-Key`.
