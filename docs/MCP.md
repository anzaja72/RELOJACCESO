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

Proyecto Docker `mcp` en `/root/reloj-mcp` (Traefik, `timermcp.leia-softwarelab.tech`). Es independiente de la app: **no hace falta redesplegar Reloj CR**, porque no se agregó ninguna ruta a su API.

```bash
cd /root/reloj-mcp
git status --short                      # debe mostrar solo mcp/.env sin seguimiento
git fetch --all --prune && git checkout claude/tiendas-sobre-produccion && git pull
docker compose -f mcp/docker-compose.yml --env-file mcp/.env up -d --build
curl https://timermcp.leia-softwarelab.tech/healthz          # → ok
```

`mcp/.env` (no se versiona): `RELOJ_API_URL`, `MCP_AUTH_TOKEN` (32+; si el actual es `openssl rand -hex 32` ya cumple) y, opcional, `RELOJ_API_KEY`.

**Efecto del cambio de versión:** los conectores existentes dejan de funcionar y deben **autorizarse de nuevo** (ahora con el usuario de Reloj CR). Los tokens viejos no son válidos.

## 7. Pruebas

```bash
cd mcp && npm install && npm test        # 20 pruebas contra un Reloj simulado: OAuth, permisos por rol, escritura, privacidad
BASE=http://localhost:47321 PASSWORD='<ADMIN_PASSWORD>' node mcp/test/e2e.mjs   # recorrido completo contra un Reloj real de pruebas (usa seed:tiendas)
```

## 8. Límites conocidos

- La sesión vence a las 12 h y no se renueva sola (política de la web); hay que autorizar de nuevo.
- No crea empleados, marcaciones ni salarios, ni edita tipos de jornada: se hace en la web.
- Los cambios masivos (más de 120 celdas por llamada) deben hacerse en varias llamadas.
- Si el modelo se equivoca de tienda o de persona, la confirmación explícita y los permisos de su usuario son la protección: revise lo que muestra antes de confirmar.
- El servidor es sin estado: reiniciarlo cierra las sesiones OAuth en curso.
