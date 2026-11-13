# Carga de empleados de una tienda desde un archivo

Para dar de alta a todo el personal de una tienda de una vez (por ejemplo, para pruebas o para el arranque de una tienda nueva) sin escribirlos uno por uno en *Personas*.

El importador [`scripts/importar-empleados.mjs`](../scripts/importar-empleados.mjs) usa **la API de la app**, no escribe en la base: respeta permisos, validaciones y la bitácora de auditoría (cada alta queda a nombre de quien la hizo). Es **repetible**: omite a quien ya existe (por cédula o por código dentro de la tienda). Por defecto solo **simula**.

## Qué necesita
- Un usuario de **RR. HH.** o **superadmin** (los únicos que pueden crear empleados). Para crear RR. HH.: `docs/DESPLIEGUE_VPS.md`, sección 5.
- La **tienda**: debe existir (*Estructura › Nueva sede*) o puede crearla el importador con `--crear-tienda` si el usuario es superadmin.
- Un archivo **CSV** (UTF-8, con encabezado): `codigo,cedula,nombre,cargo,tipo_jornada`. El `tipo_jornada` debe coincidir con el nombre de un tipo de jornada de la app (Gerente Junior, Coordinador de Turno, Empleado General Tiempo Completo, Medio Tiempo Jornada Variable, AMIGO BK). Si se omite, se usa el cargo.

## Cómo se usa
```bash
read -s -p "Contraseña: " PASSWORD; export PASSWORD      # no queda en el historial
export BASE=https://reloj.leia-softwarelab.tech
```
1. **Simulación** (no escribe nada; muestra qué haría):
   ```bash
   node scripts/importar-empleados.mjs --usuario rrhh@empresa.co --archivo trabajadores.csv --tienda AP-31760
   ```
   Si la tienda no existe, agregue: `--crear-tienda --nombre-tienda "Alto Prado Norte" --ciudad Barranquilla --region zone_caribe`.
2. **Aplicar:** el mismo comando con `--aplicar`.
3. Repetirlo con `--aplicar` no duplica nada: informa «ya existe».

Después de cargar, cada empleado aparece en *Personas* con su tipo de jornada y sin «ficha incompleta», y los de tipo Gerente Junior o Coordinador de Turno cuentan como **responsables de turno** para la cobertura del *Planificador*.

## Datos personales
- El CSV trae **cédulas y nombres reales**. Guárdelo fuera del repositorio (el `.gitignore` ya excluye `trabajadores*.csv` y `carga-*/`), no lo comparta por canales abiertos y bórrelo al terminar.
- El importador **enmascara** las cédulas en pantalla (muestra solo las últimas 3 cifras).
- Cargar a una persona **no** enrola su rostro ni da su consentimiento: el consentimiento biométrico se registra al enrolar en *Enrolar*.
- No carga **salarios**: se fijan por separado (Personas, con RR. HH.).

## Kiosco de tienda (tablet solo para marcar)

Cada tienda puede tener un **usuario de kiosco**. Ese usuario **no entra a la app, a la API ni al MCP**: su contraseña solo sirve para activar la tablet de su tienda, y la tablet solo puede marcar Entrada y Salida.

Crear el usuario (en el VPS; imprime la contraseña una vez):
```bash
PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-12); docker exec -e NEW_USER_PASSWORD="$PW" reloj-cr node scripts/create-user.mjs --email kiosco.ap@reloj.cr --name "Kiosco Alto Prado" --role kiosk --scope-type site --scope-id site_ap && echo "Contraseña kiosco AP: $PW"
```

En la tablet: abrir `https://<dominio>/kiosco`, escribir la tienda (`AP` o `Alto Prado`) y la contraseña. Queda en modo tienda: solo la captura, sin menú, y funciona sin internet. Cualquier otra pantalla pide iniciar sesión. Para quitar una tablet, revóquela en Operación › Terminales.

La captura reconoce solo a quien esté **enrolado** (rostro registrado en Enrolar por el gerente o coordinador).

## Limpiar los datos de demostración (dejar solo las tiendas reales)

Una instalación trae tiendas y empleados **de ejemplo** (R01 y R02), y el script `seed:dummy` agrega más (R03 a R05, unos 100 empleados y miles de marcaciones falsas). Para dejar solo lo real, la app incluye una limpieza que **borra todas las tiendas que no indique**, con sus empleados, marcaciones, cronogramas y demás datos dependientes.

```bash
# vista previa: muestra qué se borraría y qué se conserva; no borra nada
node scripts/limpiar-demo.mjs --usuario admin@reloj.cr --conservar AP,BV
# borrar: agrega --aplicar; pide escribir BORRAR
node scripts/limpiar-demo.mjs --usuario admin@reloj.cr --conservar AP,BV --aplicar
```

Garantías:
- **Respaldo previo** automático (`/data/backups/pre-limpieza-….db`).
- **Nunca borra a una persona con cédula real**: quien tenga cédula distinta de `DEMO-…` en una tienda a borrar detiene la limpieza (primero hay que moverla con `importar-empleados --mover`).
- La **auditoría no se borra**: queda un evento sellado «Datos de demostración eliminados» y el control de integridad lo reconoce (la pantalla de Auditoría sigue en verde). Los usuarios, las regiones y los ajustes tampoco se tocan; si un usuario queda apuntando a una tienda borrada, la vista previa lo avisa.
- Solo el **superadmin con sesión** (no la clave de integración) puede ejecutarla, y exige confirmación explícita.

Requiere la versión de la app que incluye la ruta `/api/v1/purge` (se despliega con el procedimiento normal).

## Cargar el cronograma semanal

[`scripts/importar-cronograma.mjs`](../scripts/importar-cronograma.mjs) sube los turnos de una semana a una tienda **como borrador**; no lo envía ni lo aprueba (salvo `--enviar`). Primero deben estar cargados los empleados (se identifican por **cédula**).

CSV (UTF-8, con encabezado): `cedula,nombre,lunes,martes,miercoles,jueves,viernes,sabado,domingo,almuerzo_min`. Cada día es `HH:MM-HH:MM` (salida menor que entrada = cruza medianoche), `DESCANSO` o vacío (no toca). `almuerzo_min` (por defecto 30) no cuenta como trabajado.

```bash
node scripts/importar-cronograma.mjs --usuario <usuario> --archivo cronograma.csv --tienda AP-31760 --semana 2026-11-16            # simulación: horas netas por persona
node scripts/importar-cronograma.mjs --usuario <usuario> --archivo cronograma.csv --tienda AP-31760 --semana 2026-11-16 --aplicar  # borrador
```
Repetirlo con `--aplicar` **actualiza el mismo borrador**. Si ya hay uno enviado o aprobado, pide `--nueva-version "motivo"`. Tras cargarlo, la app informa las franjas sin gerente o coordinador y las advertencias de jornada. Lo ve y lo envía el gerente desde el *Planificador*.

### Alto Prado: de la hoja de horarios a una propuesta
El Excel de Alto Prado define **reglas**, no turnos: 6 días y 42 h semanales (5 días y 42 h para AMIGO BK; mínimo 21 h y días variables para medio tiempo), entradas desde las 8 am y salidas hasta las 4 am, tolerancia de llegada de 5 min, un descanso semanal y vacaciones por programar. Con esas reglas se generó una **propuesta de prueba editable** (`cronograma-propuesto-alto-prado.csv`, fuera del repositorio) usando solo horas permitidas por la hoja:

| Turno | Horario | Quién |
| --- | --- | --- |
| Mañana | 08:00–16:00 | Gerente Junior y 2 empleados |
| Intermedio | 12:00–20:00 | 2 empleados |
| Tarde | 14:00–22:00 | Coordinadora 1, 2 empleados y el medio tiempo (vie–dom) |
| Noche | 20:00–04:00 | Coordinadora 2 y 2 empleados |
| AMIGO BK | 12:00–21:00, 5 días | 1 empleado |

Supuestos **a confirmar** (están en columnas editables del CSV): almuerzo de 60 min en turnos de 8 h (así 6 días dan exactamente 42 h netas; con 30 min darían 45 h) y de 36 min en el turno de 9 h de AMIGO BK (5 días = 42 h). El documento de requerimientos dice 30 min: si es 30, hay que acortar turnos o aceptar el aviso de exceso.

Resultado en la app con horario de tienda 08:00–04:00: 0 advertencias de jornada y **3 franjas sin responsable** (lun 16:00–20:00, mar 22:00–04:00, dom 08:00–14:00). No es un error de carga: con **un gerente y dos coordinadores** no se pueden cubrir 20 horas diarias los 7 días (hacen falta 21 turnos de responsable y hay 18).

## Qué no hace
- No registra la tolerancia de llegada (5 min), las vacaciones ni los descansos más allá de lo escrito en el CSV.
- No fija el horario de apertura de la tienda: se hace en el *Planificador* (un cierre menor que la apertura, como 08:00–04:00, se entiende de madrugada del día siguiente).
