# Enviar un demo a un socio

`http://127.0.0.1:47321` solo lo ves tú. El socio necesita una URL pública **HTTPS** (la cámara del kiosco lo exige fuera de localhost), **o** arrancar Reloj CR en su propia máquina.

El demo del agente Cursor **no es Docker en la nube**: es `npm run dev` en una VM temporal. Para Windows del socio: [`WINDOWS.md`](WINDOWS.md).

## Opción A — Túnel (la más rápida, 5 minutos)

En tu máquina, con Reloj CR ya en `npm run dev`:

```bash
# Cloudflare (recomendado, HTTPS)
cloudflared tunnel --url http://127.0.0.1:47321

# o ngrok
ngrok http 47321
```

Mándale la URL `https://….trycloudflare.com` (o `ngrok.io`).

Dile que entre a `/login` con `admin@reloj.cr` y la `ADMIN_PASSWORD` que configuraste. Con `npm run dev` y sin `.env.local` la clave es la de fábrica (`RelojCR-Admin-2026!`): **no dejes un túnel abierto así**.

Si Next bloquea `/_next` desde el host del túnel:

```bash
ALLOWED_DEV_ORIGINS=tu-subdominio.trycloudflare.com npm run dev
```

## Opción B — Render (HTTPS listo para el socio)

Sí se puede. Receta: [`docs/RENDER.md`](RENDER.md).

Resumen: Web Service **Docker** + disco `/data` (plan Starter) + secretos en el dashboard (`ADMIN_PASSWORD`, `NVIDIA_API_KEY`). URL tipo `https://reloj-cr-xxxx.onrender.com`. Empuje `main` a GitHub; Render no habla Origin de forma nativa.

## Opción C — Docker en un VPS (demo más estable)

En un servidor con Docker:

```bash
git clone <este-repo>
cd reloj-cr
cp .env.example .env
# edite NVIDIA_API_KEY / ADMIN_PASSWORD en .env
docker compose up --build -d
```

Ponga Caddy o nginx con un certificado delante de `:47321`. Sin HTTPS el kiosco facial no abre la cámara en el celular del socio.

## Qué no enviar

- No commitee ni pegue la `NVIDIA_API_KEY` en el chat ni en la URL.
- No use `SANDBOX=true` y producción en el mismo archivo SQLite.
- El preview de Cursor (`127.0.0.1`) no es compartible con terceros.

## Credenciales

En producción (Docker / Render) no hay valores de fábrica: se usan `ADMIN_PASSWORD`, `SUPERVISOR_PIN` y `DEMO_API_KEY` del entorno. Solo `npm run dev` sin `.env.local` usa `RelojCR-Admin-2026!` / `2468` / `demo-rfp-bio-2026`.

El kiosco se activa una vez por tablet con un usuario operador o superior.
