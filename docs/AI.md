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

1. Cree `.env.local` en la raíz del repo (Next.js la carga solo; no la suba a git).
2. Para **NVIDIA Nemotron** (el snippet `client.chat.completions.create` de build.nvidia.com):

```bash
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-pegue-aqui-su-clave
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_ENABLE_THINKING=1
LLM_REASONING_BUDGET=4096
LLM_MAX_TOKENS=2048
```

La clave se obtiene en [build.nvidia.com](https://build.nvidia.com) → API key. Reloj CR **no usa** el SDK de Python: llama el mismo endpoint OpenAI-compatible (`/v1/chat/completions`) **sin stream** (el briefing necesita el JSON completo). `temperature` por defecto es 0.2 para no inventar nombres.

3. Reinicie `npm run dev`. En `/ai`, el briefing debe decir `llm · nvidia` (si la clave falla, cae a `template · nvidia`).

Otras opciones: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, o `LLM_BASE_URL` + `LLM_API_KEY`.

Sin ninguna clave, briefing y chat usan **plantillas SQL**.

Demo para un socio: [`docs/SHARE.md`](SHARE.md).

## Privacidad: qué sale del servidor

Si hay clave, el POST al proveedor publica **solo agregados e ids** del día filtrado: totales, nombres ya en RR.HH., ids de punch/empleado/terminal, mensajes de anomalía. **No** salen descriptores faciales, fotos (no existen), PIN, hashes ni `TEMPLATE_KEY`.

Sin clave no hay egreso a un LLM.

## Límites

- Prohibido: score de “empleado problema”, CCTV de cocina, fine-tuning, predicción de no-show para despidos.
- El chat rechaza sanción / despido / consejo legal.
- Si el hecho no está en la consulta: `[NO ENCONTRADO]`.

## Cron

`GET` o `POST /api/v1/ai/briefing?day=YYYY-MM-DD&site=site_r01` con `X-API-Key`.
