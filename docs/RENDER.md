# Desplegar Reloj CR en Render

Sí. Render encaja bien para un **demo HTTPS** que le puedas mandar a un socio. El kiosco facial funciona porque Render termina TLS.

Use **Docker** (no el runtime Node “nativo”): `better-sqlite3` necesita compilador y el `Dockerfile` ya lo trae.

## Límites honestos

| Tema | En Render |
| --- | --- |
| HTTPS / cámara | Sí, automático |
| SQLite | Necesita **disco persistente** (`/data`). Sin disco, cada redeploy borra marcaciones |
| Plan | Docker + disco = **Starter** (el free no monta disco) |
| Git | Render despliega desde **GitHub o GitLab**. Si este repo está solo en Origin, empuje `main` a un GitHub y conecte ese |
| Nemotron | Ponga `NVIDIA_API_KEY` en Environment del servicio (secret). No en el repo |
| Multi-instancia | No. Un solo web service; SQLite no se comparte entre réplicas |

No es un SLA de producción ni una región Costa Rica. Es un demo compartible.

## Pasos (Dashboard)

1. Suba el código a GitHub (mismo `main`).
2. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint** y seleccione el repo (lee `render.yaml`), **o** New → Web Service → **Docker**.
3. Root: `/`. Dockerfile: `Dockerfile`.
4. **Disk**: mount `/data`, 1 GB. Env `DATA_DIR=/data`.
5. Environment (secrets, no commitear):

```
ADMIN_PASSWORD=…          # cámbielo; no deje RelojCR-Admin-2026!
SUPERVISOR_PIN=…
DEMO_API_KEY=…
NEXT_PUBLIC_DEMO_API_KEY=  # igual que DEMO_API_KEY
NVIDIA_API_KEY=nvapi-…
LLM_PROVIDER=nvidia
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

6. Health check: `/api/health`.
7. Deploy. La URL será `https://reloj-cr-xxxx.onrender.com`.

Mándele a su socio:

- URL + `/login`
- usuario `admin@reloj.cr` y la **ADMIN_PASSWORD** que configuró
- kiosco: `https://….onrender.com/kiosk?site=R01`

En el plan Starter el servicio **se duerme** si no hay tráfico; el primer hit tarda ~1 min.

## CLI (opcional)

```bash
# con cuenta Render y repo en GitHub
# Blueprint aplica render.yaml; luego complete secretos en el dashboard
```

## Si el build falla

- Logs: `better-sqlite3` / `node-gyp` → use este Dockerfile, no “Node” runtime.
- Health check 502 → el proceso debe escuchar `process.env.PORT` (el `CMD` del Dockerfile ya lo hace).
- Cámara bloqueada → abra `https://`, no `http://`.
- Estilos rotos → raro en producción; no hace falta `ALLOWED_DEV_ORIGINS`.

## Alternativa gratis y corta

Sin pagar Starter: `cloudflared tunnel` en su laptop (`docs/SHARE.md`). Render vale cuando quiere un link que no dependa de su máquina.
