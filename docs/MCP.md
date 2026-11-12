# Servidor MCP de Reloj CR (v2)

Permite usar Reloj CR desde **Claude** y **ChatGPT**: consultar asistencia y, ahora, **programar turnos, enviar y aprobar cronogramas, registrar novedades y autorizar accesos y movilidad** conversando.

Código: [`mcp/`](../mcp) · Despliegue: `https://timermcp.leia-softwarelab.tech/mcp` · Casos de prueba: `cd mcp && npm test` y `mcp/test/e2e.mjs`.

## 1. Modelo de seguridad (léalo primero)

| Principio | Qué significa |
| --- | --- |
| **Actúa como usted** | Al conectar, cada persona inicia sesión con **su usuario de Reloj CR** (correo, contraseña y, si la tiene, verificación en dos pasos). Todas las acciones se hacen con **sus permisos** y **su alcance de tienda**, y la auditoría las registra **a su nombre** («ivan@…»), no a nombre de una clave compartida. |
| **Mismos permisos que la web** | Un gerente de tienda puede programar y enviar; **no** puede aprobar. El regional aprueba y autoriza. RR. HH. edita la ficha. Cada herramienta aparece solo si el rol tiene el permiso; además Reloj lo vuelve a validar en cada llamada. |
| **Confirmación explícita** | Enviar, aprobar, devolver, decidir novedades, conceder accesos o movilidad y cambiar la ficha exigen `confirmado: true`. Además, Claude y ChatGPT suelen pedir su aprobación antes de ejecutar herramientas que escriben (depende de su configuración). |
| **La IA no marca ni ve salarios** | No existe herramienta para crear marcaciones, ni para leer o fijar salarios, plantillas biométricas o el PIN de supervisor. Las horas se entregan sin salario. |
| **Sesión de 12 h, sin refresh** | La sesión vale lo mismo que la de la web (12 h). Pasado ese tiempo se autoriza de nuevo. La contraseña no se guarda: solo viaja, **cifrada**, la sesión que Reloj emitió. |
| **Integración de solo lectura** | El token estático (`MCP_AUTH_TOKEN` como Bearer) y la clave `RELOJ_API_KEY` dan una vista **solo de lectura**. Ninguna herramienta de escritura se ofrece con ella. |

> **Privacidad.** Lo que el modelo consulta (nombres, horarios, marcaciones) sale hacia el proveedor de IA que usted conecte (Anthropic u OpenAI). Revise sus políticas y la autorización de tratamiento de datos antes de usarlo con datos reales. Use la cuenta del proveedor con la configuración de **no entrenamiento** que corresponda a su plan.

## 2. Herramientas

**Lectura** (con su usuario, filtradas por su alcance):

| Herramienta | Para qué |
| --- | --- |
| `mi_perfil` | Quién es, su rol y qué puede hacer |
| `ver_cronograma` | Cronograma semanal de una tienda: turnos, totales, franjas sin responsable, advertencias |
| `resumen_regional`, `cronogramas_region` | Estado de las tiendas de su región y pendientes |
| `horas_semanales` | Programadas vs. trabajadas netas (sin almuerzo), exceso e incidencias — **sin salarios** |
| `listar_novedades` | Programadas, urgentes y horas adicionales por autorizar |
| `listar_accesos` | Tiendas donde cada empleado puede marcar y movilidad, con historial |
| `tipos_jornada`, `buscar_empleado`, `listar_empleados`, `obtener_empleado`, `listar_sedes`, `catalogo` | Datos de referencia e ids |
| `listar_marcaciones`, `reporte_asistencia`, `listar_alertas`, `listar_anomalias`, `listar_horarios`, `listar_excepciones`, `listar_correcciones`, `resumen_ia`, `estado_sistema` | Las consultas que ya existían |

**Escritura** (solo con usuario; el permiso que la habilita entre paréntesis):

| Herramienta | Quién | Confirma |
| --- | --- | --- |
| `crear_cronograma` — borrador de la semana o nueva versión con motivo (`plan.edit`) | Gerente de tienda, regional | — |
| `guardar_turnos` — turnos, descansos y novedades por empleado y fechas; devuelve totales, cobertura y advertencias (`plan.edit`) | Gerente de tienda, regional | — |
| `enviar_cronograma` — al regional (`plan.submit`) | Gerente de tienda, regional | Sí |
| `aprobar_cronograma`, `devolver_cronograma` (observaciones obligatorias) (`plan.decide`) | Regional | Sí |
| `registrar_novedad` — vacaciones, incapacidad, urgentes… (`novelty.create`) | Gerente, regional, RR. HH. | — |
| `decidir_novedad` — aprobar/rechazar; incluye horas adicionales, que **no** se liquidan (`novelty.decide`) | Regional | Sí |
| `habilitar_tienda`, `fijar_horario_tienda` (`access.manage`) | Regional | Sí |
| `autorizar_movilidad` (`mobility.manage`) | Regional | Sí |
| `revocar_acceso` | Regional | Sí |
| `actualizar_ficha_laboral` — identificación, tipo de jornada, estado (`employee.hr_edit`) | RR. HH. | Sí |

## 3. Cómo se usa (ejemplos)

> «Arma el cronograma de Buenavista de esta semana: Laura de 7:00 a 15:00 de lunes a sábado con 30 min de almuerzo y descanso el domingo; Jorge de 14:00 a 22:00 de lunes a sábado.»
> El asistente hace `ver_cronograma` → `crear_cronograma` → `guardar_turnos`, y **le muestra** los totales, las franjas sin gerente o coordinador y las advertencias de la jornada de 42 h.

> «Corrige el domingo con Jorge de 7:00 a 22:00 y envíalo al regional.» → pide confirmación y usa `enviar_cronograma`.

> (Regional) «¿Qué cronogramas están pendientes de aprobar esta semana?» → `cronogramas_region`. «Apruébalo» → `aprobar_cronograma` con su confirmación.

> «Laura está de vacaciones el jueves y el viernes» → `registrar_novedad`; luego `ver_cronograma` muestra la cobertura afectada.

> (Regional) «Pasa a Laura a Alto Prado el jueves y el viernes por cobertura» → `autorizar_movilidad`.

> «¿Quién superó las 42 horas esta semana?» → `horas_semanales` con `revision: pendiente`.

Reglas que el asistente conoce: siempre debe haber un gerente o coordinador durante la apertura; el almuerzo no cuenta; un exceso de horas se **escala a revisión y nunca se liquida ni compensa solo**.

## 4. Conectar

### Claude (web, escritorio) y ChatGPT — conector remoto con OAuth
1. Agregue un **conector personalizado / MCP remoto** con la URL `https://timermcp.leia-softwarelab.tech/mcp`. No pida cabeceras ni client id/secret (se registran solos).
   - **Claude**: Ajustes › Conectores › Agregar conector personalizado.
   - **ChatGPT**: Ajustes › Aplicaciones/Conectores › modo desarrollador › nuevo conector MCP (según el plan, puede requerir habilitar el modo desarrollador). Los nombres de los menús cambian con frecuencia.
2. El cliente abre la pantalla **«Reloj CR — pide actuar como usted»**: escriba **su correo y su contraseña de Reloj CR** (y el código TOTP si tiene verificación en dos pasos).
3. Listo. Cada persona de la tienda conecta **su propia cuenta**; no se comparte la contraseña ni ningún token.

### Claude Code / mcp-remote (token estático, solo lectura)
```bash
claude mcp add --transport http reloj-cr https://timermcp.leia-softwarelab.tech/mcp --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```
Da una vista de **solo lectura** con la clave de integración. Para escribir con Claude Code, use el modo local:

### Local (stdio) con su usuario
```json
{
  "mcpServers": {
    "reloj-cr": {
      "command": "node",
      "args": ["/RUTA/A/reloj-cr/mcp/server.mjs"],
      "env": {
        "RELOJ_API_URL": "https://reloj.leia-softwarelab.tech",
        "RELOJ_EMAIL": "usted@empresa.co",
        "RELOJ_PASSWORD": "su-contraseña"
      }
    }
  }
}
```
Si su cuenta tiene TOTP agregue `RELOJ_TOTP`, pero cambia cada 30 s: para esas cuentas use el conector remoto. Requiere `cd mcp && npm install`. Con `RELOJ_API_KEY` en lugar de usuario el servidor es de solo lectura.

## 5. Variables

| Variable | Uso |
| --- | --- |
| `RELOJ_API_URL` | URL de Reloj CR (en el VPS: `https://reloj.leia-softwarelab.tech`) |
| `MCP_AUTH_TOKEN` | **Obligatoria en HTTP, 32+ caracteres** (`openssl rand -hex 32`). Firma y **cifra** las sesiones OAuth y es el Bearer de solo lectura. Rotarla cierra todas las sesiones. Ya **no** es la contraseña de la pantalla de autorización. |
| `MCP_PUBLIC_URL` | URL pública https (en el compose: `https://timermcp.leia-softwarelab.tech`) |
| `RELOJ_API_KEY` | Opcional. Clave de integración (`DEMO_API_KEY` de Reloj) para la vista de solo lectura |
| `MCP_PORT` | Puerto HTTP (def. 3333) |
| `RELOJ_EMAIL`, `RELOJ_PASSWORD`, `RELOJ_TOTP` | Solo modo local (stdio) |

## 6. Despliegue en el VPS

Proyecto Docker `mcp` (contenedor `mcp-reloj-mcp-1`), hoy lanzado desde `/root/reloj-mcp` (archivos copiados, sin git) y, tras el despliegue de la versión 2, desde el clon `/opt/reloj-mcp`, publicado por Traefik en `timermcp.leia-softwarelab.tech`. Es independiente de la app: **no hace falta redesplegar Reloj CR**, porque no se agregó ninguna ruta a su API. Requiere SSH al VPS (`ssh root@2.24.97.152`).

> **Antes de empezar, dos trampas conocidas del `.env` actual** (`/root/reloj-mcp/mcp/.env`, no versionado):
> 1. Trae la línea literal `TRAEFIK_CERTRESOLVER=<nombre-resolver>`. El compose nuevo la **usa** como nombre del resolutor de certificados: si queda así, el sitio pierde el HTTPS. Bórrela (el valor por defecto es `letsencrypt`, que es el que usa hoy).
> 2. Puede traer `RELOJ_API_KEY` con el valor de fábrica publicado. Reloj CR **ignora** esa clave en producción y el MCP v2 no la necesita para escribir ni para el acceso con usuario: bórrela.
>
> Además, **rote `MCP_AUTH_TOKEN`**: cifra las sesiones y ahora exige 32+ caracteres. Aprovechar este despliegue evita arrastrar un valor que ya circuló en texto plano (por ejemplo, en la API de Hostinger o en un chat).

### Paso 1 · Ver cómo está instalado hoy
`/root/reloj-mcp` puede no ser un clon de git (archivos copiados a mano): no se asume. Se despliega desde un **clon nuevo** y la carpeta actual queda **intacta**, que es su vuelta atrás.
```bash
ls -la /root/reloj-mcp /root/reloj-mcp/mcp
docker inspect mcp-reloj-mcp-1 --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```
Debe existir `/root/reloj-mcp/mcp/.env` (y `docker-compose.yml`). La segunda línea confirma de qué carpeta se lanzó el contenedor.

### Paso 2 · Clon nuevo y `.env` corregido (sin tocar el original)
```bash
git clone --branch claude/tiendas-sobre-produccion --single-branch https://github.com/anzaja72/RELOJACCESO.git /opt/reloj-mcp
cp /root/reloj-mcp/mcp/.env /opt/reloj-mcp/mcp/.env
cd /opt/reloj-mcp
sed -i '/^TRAEFIK_CERTRESOLVER=/d;/^RELOJ_API_KEY=/d' mcp/.env
sed -i "s/^MCP_AUTH_TOKEN=.*/MCP_AUTH_TOKEN=$(openssl rand -hex 32)/" mcp/.env
sed -i 's#^RELOJ_API_URL=.*#RELOJ_API_URL=https://reloj.leia-softwarelab.tech#' mcp/.env
sed 's/\(MCP_AUTH_TOKEN=\).*/\1<oculto>/' mcp/.env
```
La última línea muestra el archivo sin revelar el token y debe contener solo `RELOJ_API_URL` y `MCP_AUTH_TOKEN`. (Si necesita el token para Claude Code, léalo con `grep ^MCP_AUTH_TOKEN /opt/reloj-mcp/mcp/.env` en su propia terminal.) El `.env` original en `/root/reloj-mcp/mcp/` **no se modifica**.

### Paso 3 · Reconstruir desde el clon nuevo
```bash
cd /opt/reloj-mcp
docker compose -f mcp/docker-compose.yml --env-file mcp/.env up -d --build
```
El proyecto se llama igual (`mcp`) porque lo define la carpeta del compose, así que **reemplaza** al contenedor actual `mcp-reloj-mcp-1` y reutiliza la red `reloj-mcp-net`. Hay unos segundos sin servicio.

### Paso 4 · Verificación
```bash
docker logs mcp-reloj-mcp-1 --tail 5
```
Debe decir `reloj-cr MCP (http) en :3333/mcp → https://reloj.leia-softwarelab.tech`.
```bash
docker exec mcp-reloj-mcp-1 sh -c 'cd /app && LC_ALL=C sha256sum *.mjs | sha256sum | cut -c1-16'
```
La huella de la versión 2 es **`25587445a148c577`**. Para calcularla en su equipo: `cd mcp && LC_ALL=C sha256sum *.mjs | sha256sum | cut -c1-16`.

Desde cualquier equipo (no necesita credenciales ni escribe nada):
```bash
MCP_URL=https://timermcp.leia-softwarelab.tech node mcp/test/smoke-remote.mjs
```
Debe terminar con «✔ El servidor MCP desplegado es la versión 2 y está protegido». Con el servidor anterior falla en la comprobación 2. Opcional: agregue `MCP_TOKEN=<MCP_AUTH_TOKEN>` para comprobar también que el acceso estático es de solo lectura (requiere `cd mcp && npm install`).

### Paso 5 · Conectar y probar con clientes reales
Vuelva a conectar el conector en Claude y en ChatGPT (sección 4) y ejecute la guía [`PRUEBAS_MCP.md`](PRUEBAS_MCP.md). Los conectores anteriores dejan de funcionar y deben autorizarse de nuevo.

### Vuelta atrás
La carpeta original no se tocó, así que basta con relanzar desde ella (con su `.env` y su compose anteriores):
```bash
cd /root/reloj-mcp
docker compose -f mcp/docker-compose.yml --env-file mcp/.env up -d --build
```
Cuando el despliegue nuevo esté probado y estable, puede archivar la carpeta vieja (`mv /root/reloj-mcp /root/reloj-mcp.viejo`). Las futuras actualizaciones son simplemente `cd /opt/reloj-mcp && git pull` seguido del `docker compose … up -d --build` del paso 3.

## 7. Pruebas

```bash
cd mcp && npm install && npm test        # 21 pruebas contra un Reloj simulado: OAuth, permisos por rol, escritura, privacidad
BASE=http://localhost:47321 PASSWORD='<ADMIN_PASSWORD>' node mcp/test/e2e.mjs   # recorrido completo contra un Reloj real de pruebas (usa seed:tiendas)
MCP_URL=https://timermcp.leia-softwarelab.tech node mcp/test/smoke-remote.mjs      # verifica un servidor ya desplegado, sin credenciales
# Pruebas manuales con Claude y ChatGPT reales: docs/PRUEBAS_MCP.md
```

## 8. Límites conocidos

- La sesión vence a las 12 h y no se renueva sola (política de la web); hay que autorizar de nuevo.
- No crea empleados, marcaciones ni salarios, ni edita tipos de jornada: se hace en la web.
- Los cambios masivos (más de 120 celdas por llamada) deben hacerse en varias llamadas.
- Si el modelo se equivoca de tienda o de persona, la confirmación explícita y los permisos de su usuario son la protección: revise lo que muestra antes de confirmar.
- El servidor es sin estado: reiniciarlo cierra las sesiones OAuth en curso.
