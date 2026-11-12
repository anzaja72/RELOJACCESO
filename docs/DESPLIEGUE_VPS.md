# Despliegue en el VPS (Hostinger · Docker + Traefik)

Procedimiento para publicar una versión nueva de Reloj CR en `https://reloj.leia-softwarelab.tech`. Se usó y verificó el 12-nov-2026 (Next.js 16.4.0 → 16.4.6 y ajustes de tiendas).

## 1. Cómo está montado

| Elemento | Valor |
| --- | --- |
| Servidor | VPS Hostinger `srv1668992.hstgr.cloud` · `2.24.97.152` · Ubuntu con Docker y Traefik |
| Proyecto Docker | `reloj-cr`, contenedor `reloj-cr`, puerto interno `47321` |
| Carpeta | `/opt/reloj-cr` (clon de `https://github.com/anzaja72/RELOJACCESO.git`) |
| Archivos locales **no versionados** | `docker-compose.vps.yml` y `.env.vps` (configuración y secretos del VPS; `git` los ignora, no los borre) |
| Datos | Volumen Docker `reloj-data` montado en `/data` (base SQLite `asistencia.db` y `backups/`). **Sobrevive a las reconstrucciones.** |
| Dominio y TLS | Traefik (`letsencrypt`) enruta `reloj.leia-softwarelab.tech` al contenedor |
| Otros proyectos en el mismo VPS | `mcp` (conector MCP), `geovisor`, `hermes-agent`, `traefik`. **No los toque** al desplegar. |

La imagen se **construye en el VPS** a partir del código de `/opt/reloj-cr` (`build: .`). Por eso un despliegue es: traer el código con `git` y reconstruir con `docker compose`. La API de Hostinger («Update project») solo descarga imágenes: **no sirve** para publicar código nuevo.

## 2. Antes de empezar (en su equipo)

```bash
git switch <rama-a-publicar>
npm ci && npx tsc --noEmit && npm test && npm run build
npm audit --omit=dev          # debe decir: found 0 vulnerabilities
git status -sb                # sin cambios pendientes y sin «ahead»: la rama debe estar en GitHub
git push -u github <rama-a-publicar>
```

Anote el **commit** (`git rev-parse --short HEAD`) y calcule la **huella esperada** del código que debe quedar en el contenedor:

```bash
rm -rf /tmp/huella && mkdir /tmp/huella && git archive HEAD src | tar -x -C /tmp/huella
(cd /tmp/huella && LC_ALL=C find src -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-16)
```

Ejemplo real: commit `ebb60f4` → huella `430c938fbcec1421`.

Si la versión estrena **variables de entorno**, agréguelas antes a `.env.vps` (ver sección 7).

## 3. Despliegue paso a paso (en el VPS)

Entre por SSH: `ssh root@2.24.97.152`.

### Paso 1 · Estado del repositorio
```bash
cd /opt/reloj-cr && git remote -v && git branch --show-current && git status --short && git log -1 --oneline
```
Debe mostrar solo `?? .env.vps` y `?? docker-compose.vps.yml`. **Si aparecen cambios en archivos del código, deténgase**: alguien editó el servidor a mano y se perderían o chocarían.

Anote el commit actual: es su punto de **vuelta atrás**.

### Paso 2 · Respaldo (obligatorio)
```bash
docker exec reloj-cr node scripts/backup.mjs
```
Debe terminar con `Backup verificado: … (N eventos)`. **Si no lo dice, no continúe.** Luego sáquelo del contenedor:
```bash
docker cp reloj-cr:/data/backups ~/reloj-backups-$(date +%F)
```
Opcional pero recomendable: descargue esa carpeta a su equipo (`scp -r root@2.24.97.152:reloj-backups-<fecha> .`).

### Paso 3 · Traer el código y reconstruir
```bash
git fetch --all --prune && git checkout <rama-a-publicar> && git pull
docker compose -f docker-compose.vps.yml up -d --build
```
- La construcción tarda unos minutos y **no corta el servicio**: el sitio sigue sirviendo la versión anterior hasta que termina.
- Al recrear el contenedor hay **unos 15–20 s sin servicio**. Hágalo fuera del horario de operación de las tiendas.
- Es normal ver, una sola vez, un aviso de Next.js sobre vulnerabilidades. Si aparece, actualice Next (sección 6) antes de publicar; reintentar el build lo deja pasar, pero **no** significa que esté corregido.

### Paso 4 · Verificación
```bash
docker logs reloj-cr --tail 20
```
Debe decir `▲ Next.js <versión>` y `✓ Ready`, **sin** errores `Falta …` ni reinicios.
```bash
docker exec reloj-cr sh -c 'cd /app && LC_ALL=C find src -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-16'
```
Debe dar la huella calculada en la sección 2. Si difiere, el contenedor no tiene el código que usted cree.

Desde cualquier equipo:
```bash
curl -s https://reloj.leia-softwarelab.tech/api/health
```
Debe responder `{"ok":true,…}`. Pruebe también iniciar sesión en `/login` con un usuario real.

### Paso 5 · Registrar el despliegue
Agregue una fila a la tabla de la sección 8 (fecha, commit, huella, quién).

## 4. Vuelta atrás

Cuando algo falla tras el despliegue:
```bash
cd /opt/reloj-cr
git checkout <commit-o-rama-anterior>      # el anotado en el paso 1
docker compose -f docker-compose.vps.yml up -d --build
```
Las migraciones de base de datos de esta versión **solo agregan** tablas y columnas, así que el código anterior sigue funcionando con la base nueva. **No hace falta restaurar la base** salvo que los datos estén dañados.

### Restaurar la base desde un respaldo (último recurso)
Perderá lo escrito después del respaldo. Haga antes una copia nueva del estado actual (paso 2).
```bash
docker compose -f docker-compose.vps.yml stop
docker compose -f docker-compose.vps.yml run --rm --no-deps reloj-cr node scripts/restore.mjs /data/backups/asistencia-<marca>.db
docker compose -f docker-compose.vps.yml up -d
```
`restore.mjs` exige el servidor detenido (descarta los archivos `-wal` y `-shm`). Pruebe primero el procedimiento sobre una copia, no en el día de una emergencia.

## 5. Después del primer despliegue de «Tiendas»

1. **Usuario de RR. HH.** (la contraseña la escribe usted, mínimo 12 caracteres):
   ```bash
   docker exec -e NEW_USER_PASSWORD='<clave-de-12+>' reloj-cr node scripts/create-user.mjs --email rrhh@empresa.co --name "Recursos Humanos" --role hr
   ```
2. **Usuario del gerente regional** (alcance de la región; el identificador de región se ve en *Estructura*):
   ```bash
   docker exec -e NEW_USER_PASSWORD='<clave>' reloj-cr node scripts/create-user.mjs --email ivan@empresa.co --name "Gerente regional" --role zone_manager --scope-id zone_caribe
   ```
3. **Sedes reales** (Buenavista, Alto Prado…) desde *Estructura › Nueva sede*, dentro de la región Caribe.
4. **Ficha de cada empleado** (RR. HH.): identificación y tipo de jornada. Hasta entonces aparecen con «ficha incompleta» y no se pueden programar.

**No ejecute** `npm run seed:tiendas` ni `seed:dummy` en producción: cargan datos ficticios. (`seed-dummy` se niega a correr con `NODE_ENV=production`.)

## 6. Actualizar dependencias de seguridad

```bash
npm audit --omit=dev                         # vulnerabilidades que llegan a producción
npm view next dist-tags.latest               # versión corregida
npm i next@<versión> eslint-config-next@<versión>
npx tsc --noEmit && npm test && npm run build
```
Después siga el despliegue normal. Registre la versión en la sección 8. Las advertencias que quedan solo en `devDependencies` (por ejemplo la CLI de `shadcn`) no llegan a la imagen de producción.

## 7. Configuración (`.env.vps`)

Valores **obligatorios** en producción, propios y sin valores de fábrica; el contenedor no arranca si faltan o son débiles:

| Variable | Requisito |
| --- | --- |
| `ADMIN_PASSWORD` | 12+ caracteres. Contraseña inicial de los usuarios sembrados en una base nueva. |
| `SUPERVISOR_PIN` | 6+ caracteres |
| `TEMPLATE_KEY` | 32+ caracteres. **No la cambie** una vez enrolados rostros: cifra las plantillas biométricas. |
| `JWT_SECRET` | 32+ caracteres. Cambiarla cierra todas las sesiones. |
| `DEMO_API_KEY` | Opcional. Solo integraciones servidor a servidor. |
| `NVIDIA_API_KEY`, `LLM_*` | Opcionales (IAnálisis). Sin clave funciona con respuestas básicas. |

Después de editar `.env.vps`: `docker compose -f docker-compose.vps.yml up -d` (recrea el contenedor con el entorno nuevo; no hace falta `--build`).

## 8. Registro de despliegues

| Fecha | Commit | Huella | Next.js | Qué incluyó | Quién |
| --- | --- | --- | --- | --- | --- |
| 2026-10-20 | `2f5c516` | `605c9f84f3e21804` | 16.4.0 | Nómina colombiana, alcance por sede, IAnálisis, kiosco sin internet | — |
| 2026-11-12 | `ebb60f4` | `430c938fbcec1421` | 16.4.6 | Ajustes «Aplicación Tiendas» + corrección de vulnerabilidades de Next.js | — |

## 9. Servidor MCP (Claude y ChatGPT)

Es un proyecto aparte (`mcp`, `timermcp.leia-softwarelab.tech`; tras la versión 2 se lanza desde el clon `/opt/reloj-mcp`) y **no se redespliega junto con la app**: usa la API pública de Reloj CR. Procedimiento, variables y efectos del cambio de versión en [`docs/MCP.md`](MCP.md), sección 6.

## 10. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El contenedor se reinicia; el log dice `Falta ADMIN_PASSWORD…` o `tiene un valor de fábrica` | Variable ausente o débil en `.env.vps` | Corríjala y `up -d` |
| `502 Bad Gateway` unos segundos tras desplegar | El contenedor aún arranca | Espere 20 s; si persiste, `docker logs reloj-cr` |
| `git checkout` se queja de cambios locales | Editaron archivos del código en el VPS | No los pise: revíselos con `git diff` |
| `git pull` pide credenciales | El repositorio es privado | Use un token de acceso o una *deploy key* de solo lectura |
| `/planner` da 404 tras desplegar | Sigue la imagen anterior | Repita el paso 3 y compare la huella (paso 4) |
| Aviso de seguridad de Next.js en el build | Versión de Next afectada | Sección 6 |
