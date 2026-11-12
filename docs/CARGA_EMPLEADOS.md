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

## Qué no hace
- No crea turnos ni cronogramas (los turnos concretos por persona y día se cargan en el *Planificador*).
- No registra la tolerancia de llegada, los descansos ni las vacaciones: dependen de los horarios concretos.
