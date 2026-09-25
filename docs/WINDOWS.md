# Reloj CR en una PC Windows

El demo que Ángel mostró **no era un Docker en internet**. Corría con `npm run dev` (Next.js, puerto **47321**) dentro de una máquina temporal de Cursor. Esa URL (`127.0.0.1` o un túnel `trycloudflare.com`) **desaparece** cuando se apaga el agente. El socio tiene que **arrancarlo en su propia PC**.

Hay dos caminos. En Windows, **Docker Desktop es el más simple** (evita compilar `better-sqlite3`).

## Camino A — Docker Desktop (recomendado)

1. Instala [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/). Arráncalo y espera a que diga *Engine running*.
2. Descomprime el zip/`tar.gz` (o clona el repo) en, por ejemplo, `C:\reloj-cr`.
3. PowerShell:

```powershell
cd C:\reloj-cr
copy .env.example .env
notepad .env
docker compose up --build
```

En `.env` complete `JWT_SECRET` y `TEMPLATE_KEY` (32+ caracteres cada uno), `ADMIN_PASSWORD` (12+) y `SUPERVISOR_PIN` (6+ dígitos). Sin ellos Docker no arranca el servicio.

4. En el navegador: [http://127.0.0.1:47321](http://127.0.0.1:47321)
5. Login: `admin@reloj.cr` / la `ADMIN_PASSWORD` de `.env`

La primera vez tarda (compila la imagen). SQLite queda en el volumen Docker `reloj-data`, no en una carpeta visible.

Para parar: `Ctrl+C` o `docker compose down`. Los datos se conservan hasta `docker compose down -v`.

## Camino B — Node en Windows (sin Docker)

Hace falta **Node.js 22 LTS** (no 18) y, para `better-sqlite3`, **Visual Studio Build Tools** con la carga *Desktop development with C++*.

```powershell
cd C:\reloj-cr
copy .env.example .env.local
npm install
npm run dev
```

Abre [http://127.0.0.1:47321](http://127.0.0.1:47321).

Si `npm install` falla con errores de `node-gyp` / `better-sqlite3`, usa el **camino A** o instala [Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

## Lo que no va a funcionar

| Intento | Por qué |
| --- | --- |
| Abrir el preview de Cursor desde Windows | Es `127.0.0.1` de *otra* máquina |
| Reusar un enlace `trycloudflare.com` viejo | El túnel muere con el agente |
| Netlify / Vercel | SQLite en disco; no encaja en serverless |
| Solo descomprimir y hacer doble clic | No hay `.exe`; hay que arrancar Node o Docker |

## Cámara del kiosco

En `http://127.0.0.1:47321/kiosk?site=R01` Chrome suele pedir cámara. Si entran por IP de LAN (`http://192.168.…`) sin HTTPS, Chrome bloquea la cámara salvo que marquen ese origen en `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

## Credenciales

| | Docker (`.env`) | `npm run dev` sin `.env.local` |
| --- | --- | --- |
| Admin | `admin@reloj.cr` / `ADMIN_PASSWORD` | `RelojCR-Admin-2026!` |
| PIN supervisor | `SUPERVISOR_PIN` | `2468` |
| API | `DEMO_API_KEY` (opcional) | `demo-rfp-bio-2026` |

El kiosco pide activarse la primera vez: elija la sede y entre con un usuario operador o superior. IA (Nemotron) es opcional: sin `NVIDIA_API_KEY` el briefing y el chat siguen con SQL.
