# Guía de pruebas de aceptación — Ajustes «Aplicación Tiendas»

**Versión probada:** commit `ebb60f4` (huella `430c938fbcec1421`) · **Documento de requerimientos:** *Requerimientos_Ajustes_Aplicacion_Tiendas* v1.0 · **Casos base:** CP-01 a CP-15 del documento, más pruebas de apoyo.

## 1. Objetivo y alcance

Comprobar, desde la perspectiva de quien usa el sistema, que los ajustes de tiendas cumplen lo pedido: cronograma semanal con aprobación, cobertura de gerente o coordinador, cuatro marcaciones con almuerzo, tiendas autorizadas, movilidad, novedades, horas y permisos por rol.

**Dentro del alcance:** las pantallas Regional, Planificador, Novedades, Accesos, Horas, Personas, Operación, Auditoría y el kiosco.
**Fuera del alcance:** nómina y liquidación de horas extra (no se calculan en este ajuste), integración con un equipo biométrico físico y bloqueo físico de puertas (no existen en software).

> **Importante: no pruebe en producción.** Estas pruebas crean cronogramas, marcas y novedades ficticias. Use una instancia de pruebas (sección 2). Las pruebas con datos reales las decide el responsable del proyecto.

## 2. Preparar el entorno de pruebas

Necesita Docker (o Docker Desktop) y una copia del repositorio en la rama `claude/tiendas-sobre-produccion`.

```bash
git clone https://github.com/anzaja72/RELOJACCESO.git && cd RELOJACCESO
git checkout claude/tiendas-sobre-produccion
cp .env.example .env
```

Edite `.env` y defina **valores propios** (el sistema no arranca con valores débiles):

| Variable | Requisito | Cómo generarla |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 12 o más caracteres | La que usted elija; es la contraseña de **todos** los usuarios de prueba |
| `SUPERVISOR_PIN` | 6 o más caracteres | La que usted elija |
| `TEMPLATE_KEY` | 32 o más caracteres | `openssl rand -hex 32` |
| `JWT_SECRET` | 32 o más caracteres | `openssl rand -hex 32` |

Arranque y cargue los datos de prueba:

```bash
docker compose up -d --build
curl http://localhost:47321/api/health            # debe responder {"ok":true,…}
docker compose exec reloj-cr node scripts/seed-tiendas.mjs
```

Debe imprimir `Sembrado: { sites: [...], employees: 10, users: 5 }`. Abra **http://localhost:47321** en **Chrome o Edge** (la cámara solo funciona en `localhost` o HTTPS).

> Para empezar de cero, cuando termine: `docker compose down -v` (borra los datos de prueba).

### 2.1 Simulador de marcas (sin cámara)

Para no depender de cámaras ni de rostros enrolados, use el simulador. Envía lo mismo que enviaría el kiosco. Se ejecuta dentro del contenedor y guarda su contraseña en una variable para no escribirla en cada comando:

```bash
export PASSWORD='la-misma-ADMIN_PASSWORD'
alias marcar='docker compose exec -e PASSWORD="$PASSWORD" reloj-cr node scripts/simular-marcas.mjs'
```

Forma general: `marcar --usuario <correo> --empleado <id> --tienda <código> --marcas TIPO@HH:MM,… [--dia AAAA-MM-DD] [--dias N]`

- Tipos: `IN` (entrada), `BREAK_START` (salida a almuerzo), `OUT` (salida de trabajo). El regreso de almuerzo se manda como `IN`, igual que el kiosco, y el sistema lo reclasifica.
- Si no indica `--dia`, usa el **lunes de la semana actual**. `--dias N` repite el ciclo en N días seguidos.
- Cada marca impresa lleva su **id**; lo necesitará para el caso P-15.
- Si responde `429 Demasiadas solicitudes`, espere un minuto: es el límite de intentos de inicio de sesión.

### 2.2 Datos de prueba

**Usuarios** (contraseña: la de `ADMIN_PASSWORD`; el **correo** se escribe tal cual):

| Correo | Rol | Qué ve |
| --- | --- | --- |
| `rrhh@reloj.cr` | RR. HH. | Todo; crea empleados, fichas y salarios |
| `ivan@reloj.cr` | Gerente de zona (regional) | Región Caribe: Barranquilla y Cartagena |
| `buenavista@reloj.cr` | Gerente de tienda | Solo Buenavista |
| `altoprado@reloj.cr` | Gerente de tienda | Solo Alto Prado |
| `coordinador@reloj.cr` | Coordinador (operador) | Solo Buenavista; sin planificación ni consulta de horas |
| `admin@reloj.cr` | Superadmin | Todo |

**Tiendas:** `BAQ-BV` Buenavista · `BAQ-AP` Alto Prado · `CTG-01` Cartagena «por confirmar» · `R02` Mariscos del Caribe (Barranquilla, ya existía).

**Empleados de prueba** (todos «demo»):

| Tienda | Empleado | Id para el simulador | Tipo de jornada | Responsable de turno |
| --- | --- | --- | --- | --- |
| Buenavista | Laura Pérez | `emp_bv_gj` | Gerente Junior (42 h, 6 días) | Sí |
| Buenavista | Jorge Díaz | `emp_bv_ct` | Coordinador de Turno | Sí |
| Buenavista | Camila Rojas | `emp_bv_tc` | General Tiempo Completo | No |
| Buenavista | Andrés Gómez | `emp_bv_mt` | Medio Tiempo (mín. 21 h) | No |
| Buenavista | Valentina Ruiz | `emp_bv_bk` | AMIGO BK (5 días) | No |
| Alto Prado | Diana Castro | `emp_ap_gj` | Gerente Junior | Sí |
| Alto Prado | Mateo Herrera | `emp_ap_ct` | Coordinador de Turno | Sí |
| Alto Prado | Sara Molina | `emp_ap_tc` | General Tiempo Completo | No |
| Alto Prado | Felipe Ortiz | `emp_ap_bk` | AMIGO BK | No |
| Cartagena | Paula Navarro | `emp_ctg_gj` | Gerente Junior | Sí |

**Semana de prueba:** la semana actual (lunes a domingo). El planificador abre en ella por defecto. Horario de apertura de las tiendas: 07:00–22:00.

## 3. Cómo registrar resultados

Para cada caso marque **Pasó**, **Falló** o **Bloqueado** (no se pudo ejecutar) y anote la evidencia (captura de pantalla). Si falla, registre el defecto con la plantilla de la sección 6.

- Cierre sesión entre usuarios con el botón de su nombre arriba a la derecha («… · salir»).
- Los mensajes verdes confirman; los rojos son errores. Los textos entre «comillas» son los que debe ver.
- Una semana de prueba con fechas futuras es válida: el simulador permite marcar en cualquier día.

## 4. Casos de prueba

### P-00 · Sesión obligatoria y roles básicos
**Rol:** sin sesión, luego cualquiera.
1. Sin iniciar sesión, abra `/planner`. → Lo lleva a `/login`.
2. Abra `/api/employees` (el navegador mostrará texto). → Responde «No autorizado», no una lista de personas.
3. Inicie sesión con una contraseña incorrecta. → Mensaje de error, no entra.
4. Inicie sesión con `buenavista@reloj.cr`. → Entra.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-01 · Alta de empleado por RR. HH. y salario protegido (CP-01, RF-01)
1. Entre como `rrhh@reloj.cr` → **Personas**. En el selector de sede (arriba) elija **Buenavista**.
2. Pulse **Nuevo**. Complete: Nombre «Tester Uno», Código «BV-901», Puesto «Auxiliar», Identificación «TEST-901», Tipo de jornada «Empleado General Tiempo Completo», Salario mensual «1750905», Estado «Activo». Pulse **Crear**.
3. → Mensaje «Colaborador creado.». «Tester Uno» aparece en la lista con la etiqueta del tipo de jornada y **sin** «sin identificación» ni «sin tipo de jornada».
4. Seleccione de nuevo a «Tester Uno»: el salario cargado es 1750905.
5. Pruebe una identificación repetida: seleccione a otro empleado, escriba «TEST-901» como Identificación y **Guardar**. → Error «La identificación ya existe en otro empleado».
6. Cierre sesión y entre como `ivan@reloj.cr` → **Horas**. → La tabla **no** tiene columna «Salario».
7. Entre como `rrhh@reloj.cr` → **Horas**. → La tabla **sí** tiene columna «Salario».
8. Entre como `buenavista@reloj.cr` → **Personas**. Pulse **Nuevo**, escriba un nombre y un código y **Crear**. → Error «Solo RR. HH. crea empleados, cambia su tienda base o cargo y edita la ficha laboral». Los campos de ficha laboral aparecen deshabilitados.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-02 · El regional ve sus ciudades (CP-02, RF-03)
**Rol:** `ivan@reloj.cr` → **Regional**.
1. → Se ve «Región Caribe» con **Barranquilla** (Alto Prado, Buenavista, Mariscos del Caribe) y **Cartagena** (Sede por confirmar).
2. → **No** aparece Bogotá ni ninguna sede de otra región.
3. Cada tarjeta muestra empleados, estado del cronograma y franjas sin responsable.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-03 · Crear la semana con descanso (CP-03, RF-04, RN-10)
**Rol:** `buenavista@reloj.cr` → **Planificador**.
1. Tienda «Buenavista» y la semana actual. Pulse **Crear cronograma**. → «Borrador creado.» y la etiqueta «v1 · borrador».
2. Pulse la celda del **lunes** de **Laura Pérez**. En el editor: Tipo «Turno», Entrada 07:00, Salida 15:00, Almuerzo 30, marque **Lunes a sábado** y pulse **Aplicar**.
3. Repita para **Jorge Díaz** (14:00 a 22:00, almuerzo 30) y **Camila Rojas** (08:00 a 16:30, almuerzo 30), también con «Lunes a sábado».
4. Celda del **domingo** de Laura → Tipo «Descanso» → **Aplicar**.
5. Pulse **Guardar (N)**. → «Cambios guardados.» y los totales de la columna final:
   - Jorge Díaz **45:00**, Laura Pérez **45:00** (el domingo en descanso no suma), Camila Rojas **48:00**, los demás **0:00**.
6. → Aparece un aviso amarillo: «… superan la jornada de referencia (42 h)» para Laura, Jorge y Camila.
7. → Las celdas con cambios sin guardar tienen borde punteado; tras guardar desaparece.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-04 · Falta de cobertura de responsable (CP-04, RF-06, RN-01)
**Rol:** `buenavista@reloj.cr` (continúa en P-03).
1. Revise el aviso rojo «Franjas sin gerente ni coordinador (07:00–22:00)». → Lista el **domingo** completo (07:00–22:00), porque el único responsable (Laura) descansa y Jorge no tiene turno.
2. Pulse la celda del **lunes de Jorge Díaz** → Tipo «Vaciar» → **Aplicar** → **Guardar**.
3. → El aviso rojo agrega «Lun …: 15:00–22:00 · Buenavista» (la tarde queda sin responsable; Laura cubre hasta las 15:00).
4. Restaure el turno de Jorge del lunes (14:00 a 22:00) y **Guardar**. → La franja del lunes desaparece.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-05 · Enviar, devolver y aprobar (CP-05, RF-05)
1. Como `buenavista@reloj.cr`: pulse **Enviar al gerente de zona**. → «Enviado al gerente de zona.» y etiqueta «v1 · enviado». Los botones de edición desaparecen y dice «En revisión del gerente de zona.». El gerente **no** tiene botones Aprobar/Devolver.
2. Entre como `ivan@reloj.cr` → **Regional**. → «1 cronogramas por revisar» y «Buenavista · v1». Pulse esa etiqueta.
3. Sin escribir observaciones, pulse **Devolver**. → Error «La devolución exige observaciones.»
4. Escriba «Falta cubrir el domingo» y **Devolver**. → «Devuelto con observaciones.», etiqueta «v1 · devuelto».
5. Entre como `buenavista@reloj.cr` → **Planificador**. → Banner rojo «Devuelto por ivan@reloj.cr: Falta cubrir el domingo». Corrija (por ejemplo, un turno de Jorge el domingo 07:00–22:00), **Guardar** y **Enviar** de nuevo.
6. Como Iván: escriba «Aprobado» y pulse **Aprobar**. → «Cronograma aprobado: es la versión vigente.», etiqueta «v1 · aprobado».
7. Como `buenavista@reloj.cr`: pulse **Nueva versión** **sin** justificación. → Error «Una nueva versión de un cronograma aprobado exige justificar el cambio.»
8. Escriba «Incapacidad de un cajero» y **Nueva versión**. → Se crea «v2 · borrador» y sigue visible «Vigente: v1» (la aprobada no cambia hasta que se apruebe la v2).

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-06 · Cuatro marcas con almuerzo (CP-06, CP-07, RF-07, RF-08, RN-04, RN-05)
**Simulador:**
```bash
marcar --usuario buenavista@reloj.cr --empleado emp_bv_tc --tienda BAQ-BV --marcas IN@08:00,BREAK_START@12:00,IN@12:30,OUT@16:30
```
1. → El simulador imprime «Salida a almuerzo» y, en la tercera línea, «Entrada … registrada como **Regreso de almuerzo**».
2. Entre como `rrhh@reloj.cr` → **Horas** (semana actual) → fila de Camila Rojas → pulse la fila para abrir el detalle.
3. → El lunes muestra: Entrada 08:00 · Sale almuerzo 12:00 · Regresa 12:30 · Salida 16:30 · **Neto 8:00** · **Almuerzo 30′** · sin incidencias. «Programado» es 8:00 (requiere haber **aprobado el cronograma en P-05**; si no, dice «sin aprobado»).
4. → La salida a almuerzo **no** se cuenta como fin de jornada.

**Con cámara (opcional):** entre como `buenavista@reloj.cr` → **Kiosco** (`/kiosk?site=BAQ-BV`) → pulse **Salida**. → Aparece «¿Salida a almuerzo o salida de trabajo?» con tres botones: **Salida a almuerzo**, **Salida de trabajo** y **Cancelar**.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-07 · Marca de almuerzo ausente o incompleta (CP-08, RF-08)
```bash
marcar --usuario buenavista@reloj.cr --empleado emp_bv_tc --tienda BAQ-BV --dia <martes AAAA-MM-DD> --marcas IN@08:00,OUT@16:30
```
1. **Horas** → Camila Rojas → detalle del martes. → **Neto 8:30** (el tiempo real, sin inventar un almuerzo), Almuerzo «—» y la incidencia «Sin marcas de almuerzo».
2. → La fila de Camila queda con la etiqueta «1 incidencias» y **no** «sin pendientes».
3. Filtro «Revisión: Con pendientes» → Camila aparece; «Sin pendientes» → no aparece.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-08 · Tiendas autorizadas para el biométrico (CP-09, RF-09)
1. Como `buenavista@reloj.cr` → **Accesos**. → Las casillas están **deshabilitadas** y se lee «Solo consulta: lo gestiona el gerente regional».
2. Como `ivan@reloj.cr` → **Accesos**. Solo ve las tiendas de su región (no Bogotá).
3. Marque la casilla de **Valentina Ruiz** en la columna **Alto Prado**. → «Valentina Ruiz (demo): habilitado en Alto Prado.»
4. En «Historial de autorizaciones» → aparece una fila «permanente», destino «Alto Prado», con «ivan@reloj.cr» y la fecha, y el estado «vigente».
5. Con el simulador, Valentina marca en Alto Prado **estando habilitada**:
   ```bash
   marcar --usuario altoprado@reloj.cr --empleado emp_bv_bk --tienda BAQ-AP --marcas IN@08:00
   ```
   → Se registra **sin** excepción.
6. Defina una «Vigencia de nuevas autorizaciones» (la fecha de mañana) y habilite a **Felipe Ortiz** en la columna **Buenavista**. → La fila queda «temporal» con esa fecha de fin.
7. Desmarque la casilla de Valentina en Alto Prado. → La fila pasa a «revocada» con quién y cuándo (no desaparece: queda en el historial).
8. Ahora que ya no está habilitada, repita la marca:
   ```bash
   marcar --usuario altoprado@reloj.cr --empleado emp_bv_bk --tienda BAQ-AP --marcas OUT@17:00
   ```
   → Imprime «**EXCEPCIÓN pendiente (marcacion_no_autorizada)**».

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-09 · Movilidad entre tiendas (CP-10, RF-10)
**Rol:** `ivan@reloj.cr` → **Accesos** → «Autorizar movilidad».
1. Empleado «Laura Pérez · base Buenavista», Tienda destino «Barranquilla · Alto Prado», Desde y Hasta = jueves y viernes de esta semana, Motivo «cobertura». **Autorizar**. → «Movilidad autorizada: se refleja en el cronograma y el biométrico del destino.»
2. En el historial → fila «movilidad», «Buenavista → Alto Prado», jueves a viernes, «vigente».
3. Entre como `altoprado@reloj.cr` → **Planificador** (Alto Prado). → Laura aparece como empleada **«Desde Buenavista»**; solo se pueden programar sus celdas del jueves y viernes (las demás dicen «Fuera de movilidad» y están deshabilitadas).
4. Entre como `buenavista@reloj.cr` → **Planificador**. → Las celdas de Laura del jueves y viernes muestran «En Alto Prado» y el aviso de cobertura agrega esas franjas.
5. Como `rrhh@reloj.cr` → **Personas**: Laura **sigue** en Buenavista (la movilidad no cambia la tienda base).
6. Como Iván: **Revocar** la movilidad en el historial. → Pasa a «revocada».

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-10 · Marca en tienda no prevista = excepción (CP-11, RF-12, RN-08)
**Simulador** (Sara Molina es de Alto Prado y marca en Buenavista):
```bash
marcar --usuario buenavista@reloj.cr --empleado emp_ap_tc --tienda BAQ-BV --marcas IN@09:00
```
1. → Imprime «**EXCEPCIÓN pendiente (marcacion_no_autorizada)**».
2. Como `ivan@reloj.cr` → **Novedades** → pestaña **Pendientes**. → Aparece «Sara Molina (demo) · Marcación en tienda no autorizada», tipo «urgente», estado «pendiente». El detalle incluye la causa («Marcó IN en Buenavista sin autorización vigente…») y la evidencia.
3. Sin escribir comentario, pulse **Rechazar**. → Error «El rechazo exige un comentario».
4. Escriba «Cubrió una ausencia» y **Aprobar**. → «Aprobada. El registro original se conserva.» y el detalle muestra «Decisión: ivan@reloj.cr · … · Cubrió una ausencia».
5. Como `buenavista@reloj.cr` → **Novedades**: puede ver la novedad pero **no** hay botones Aprobar/Rechazar.
6. **Operación** (Buenavista): la marca de Sara **sigue** en la lista (aprobar no la borra).
7. Marca de **otra región** (Ana es de Bogotá):
   ```bash
   marcar --usuario buenavista@reloj.cr --empleado emp_ana --tienda BAQ-BV --marcas IN@09:00
   ```
   → «✗ Colaborador inexistente, inactivo o de otra sede». No genera excepción.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-11 · Exceso de horas se escala, no se liquida (CP-12, RF-13, RF-14, RN-09)
**Simulador** (Felipe Ortiz trabaja 8,5 h netas durante 6 días = 51 h; su referencia es 42 h):
```bash
marcar --usuario altoprado@reloj.cr --empleado emp_ap_bk --tienda BAQ-AP --dias 6 --marcas IN@07:00,BREAK_START@12:00,IN@12:30,OUT@16:00
```
1. Como `ivan@reloj.cr` → **Horas** → Felipe Ortiz. → Trabajadas netas **51:00**, Almuerzo excluido **3:00**, Exceso **9:00** (en rojo), estado «exceso pendiente».
2. **Novedades** → pestaña **Horas adicionales**. → «Felipe Ortiz (demo) · Horas adicionales · … · +9:00 h», estado «pendiente», y una sola novedad por semana.
3. Abra el detalle. → Aviso: «La aprobación autoriza el tratamiento operativo; no liquida horas extra ni compensa días automáticamente.»
4. Escriba un comentario y **Aprobar**. → «Aprobada…». En **Horas** la etiqueta pasa a «exceso aprobada».
5. Confirme que **no hay ningún valor de dinero** calculado por este exceso en la pantalla de Horas ni en las exportaciones.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-12 · Novedades programadas en el cronograma (CP-13, RF-11, RN-07)
**Rol:** `buenavista@reloj.cr` → **Novedades** (sin ninguna seleccionada).
1. Tipo «Programada», «Vacaciones», Empleado «Laura Pérez · BV-001», Desde y Hasta = jueves y viernes. Pulse **Registrar**. → «Novedad programada registrada: se verá en el cronograma.»
2. **Planificador** (Buenavista, semana actual). → Las celdas de Laura del jueves y viernes aparecen resaltadas en ámbar con «Vacaciones».
3. → El aviso de cobertura agrega franjas del jueves y viernes (07:00 a 14:00 sin responsable, si Laura era la única de la mañana) y una advertencia «Laura Pérez (demo): turno el … con novedad o movilidad registrada».
4. Registre una novedad **urgente** (tipo «Cobertura urgente») **sin causa**. → Error «La causa es obligatoria en una novedad urgente».
5. Con causa «Ausencia imprevista», **Registrar**. → «Novedad urgente registrada: queda pendiente del regional.» Como `ivan@reloj.cr` aparece en **Pendientes**.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-13 · Un gerente no ve tiendas ajenas (CP-14, RF-03)
**Rol:** `buenavista@reloj.cr`.
1. **Planificador**. → El selector de tienda solo tiene «Barranquilla · Buenavista».
2. Cambie la dirección a `…/planner?site=site_baq_ap` y entre. → No muestra ningún cronograma: aparece el error rojo «**Tienda fuera de su alcance**».
3. **Horas**, **Personas**, **Accesos**, **Operación**: solo hay datos de Buenavista.
4. Como `coordinador@reloj.cr`: abra **Planificador** y **Horas**. → Muestran «Permiso insuficiente para esta acción» (el coordinador no planifica ni consulta horas, por regla del documento).

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-14 · Corrección de marca: se conserva el original (CP-15, RF-07, RF-16)
La regla de producción solo deja corregir marcas de **menos de 48 h** (excepto el superadmin).
```bash
marcar --usuario buenavista@reloj.cr --empleado emp_bv_mt --tienda BAQ-BV --dia $(date +%F) --marcas IN@08:00,OUT@12:00
```
Anote el **id** de la «Entrada» que imprime. Luego:
```bash
marcar --usuario buenavista@reloj.cr --corregir <ID> --nueva-hora 08:10 --dia $(date +%F) --motivo "Llegó tarde y la tablet no lo registró"
```
1. → «✓ Corrección registrada. **Valor original conservado:** …T13:00:00.000Z (IN) → …T13:10:00.000Z» (13:00 UTC = 08:00 Bogotá).
2. Repita con `--usuario coordinador@reloj.cr`. → «Corrección rechazada (403): Se requiere gerente de sede o superior».
3. Intente corregir una marca de **hace más de 48 h** (por ejemplo, una del lunes si hoy es jueves) como `ivan@reloj.cr`. → «Plazo de corrección vencido… Solo superadmin puede forzar».
4. Con `admin@reloj.cr` la misma corrección **sí** se acepta.
5. Como `ivan@reloj.cr` → **Auditoría**. → Aparece «**Marcación corregida**» con quién, sobre quién, en qué sede y cuándo.
6. En la parte superior de **Auditoría** → «✔ Todo en orden: ningún registro ha sido modificado desde que se guardó.» (la corrección queda registrada **y** el control de integridad sigue correcto).

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-15 · Tipos de jornada y horario de apertura (RF-02, RF-06)
1. Como `rrhh@reloj.cr` → **Personas**, al final «Tipos de jornada (RF-02)». → Hay 5 tipos con estos valores: **Gerente Junior** 6 días/42 h · **Coordinador de Turno** 6/42 · **General Tiempo Completo** 6/42 · **Medio Tiempo Jornada Variable** días variables, mínimo 21 h · **AMIGO BK** 5/42. Gerente Junior y Coordinador son «Responsable de turno».
2. Pulse **Editar** en uno, cambie «Horas/semana» y **Guardar tipo**. → «Tipo de jornada guardado.»
3. Como `buenavista@reloj.cr`: la sección muestra los tipos pero **sin** botones de edición.
4. Como `ivan@reloj.cr` → **Planificador** → debajo de los avisos, «Apertura» 08:00, «Cierre» 20:00 → **Guardar horario de la tienda**. → Las franjas de cobertura se recalculan dentro de 08:00–20:00.
5. Como `buenavista@reloj.cr`: no aparece «Guardar horario de la tienda».

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-16 · Exportación para RR. HH. (RF-15)
**Rol:** `rrhh@reloj.cr` → **Horas**.
1. Elija la semana, Tienda «Buenavista». Pulse **CSV**. → Se descarga `horas-<fecha>.csv`.
2. Ábralo. → Columnas: `corte`, `semana`, `documento`, `codigo`, `empleado`, `tienda`, `cargo`, `tipo`, **`salario`**, `referencia_h`, `programadas_h`, `trabajadas_netas_h`, `almuerzo_excluido_h`, `diferencia_h`, `exceso_h`, …, `exceso_estado`, **`pendiente_revision`** (SI/NO).
3. Pulse **XLSX**. → Descarga y abre en Excel con los mismos datos.
4. Como `ivan@reloj.cr`: repita el CSV. → **No** tiene la columna `salario`.
5. → Ninguna exportación incluye cálculo de nómina ni pago de horas extra.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-17 · Uso en celular (usabilidad)
1. Abra el sistema en un celular (o reduzca la ventana a ~375 px de ancho) con `buenavista@reloj.cr`.
2. **Planificador**, **Novedades** y **Horas**. → La página no se corta de lado; la tabla se desplaza horizontalmente dentro de su recuadro y los botones se pueden pulsar.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-18 · Prueba con cámara real (opcional, requiere webcam)
1. Como `buenavista@reloj.cr` → **Enrolar**: elija a «Camila Rojas», marque el consentimiento, capture 3 muestras y **Guardar**. (Lea el texto de consentimiento: debe citar la ley colombiana de datos personales.)
2. **Kiosco** (`/kiosk?site=BAQ-BV`): pulse **Entrada**, **Salida → Salida a almuerzo**, **Entrada** y **Salida → Salida de trabajo**, con pausas de al menos un minuto entre una y otra (hay una protección contra marcas repetidas de 45 s).
3. → Cada resultado muestra el nombre del evento, la fecha, la hora y la tienda. La segunda «Entrada» dice «Regreso de almuerzo registrada».
4. **Horas** muestra las cuatro marcas del día.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

### P-19 · Auditoría de los cambios nuevos (RF-16)
**Rol:** `ivan@reloj.cr` → **Auditoría**, después de ejecutar P-05, P-08, P-09 y P-10.
1. → Aparecen, con su nombre en lenguaje común, **quién** lo hizo, **sobre quién** y **en qué tienda**:
   «Cronograma enviado al regional», «Cronograma aprobado o devuelto», «Tienda habilitada para marcar», «Tienda deshabilitada para marcar», «Movilidad autorizada», «Novedad registrada», «Novedad aprobada o rechazada», «Marcación en tienda no autorizada».
2. → **No** aparece ningún nombre técnico en inglés (por ejemplo `plan.decided`).
3. Como `buenavista@reloj.cr` → **Auditoría**. → Solo ve eventos de Buenavista. Como `coordinador@reloj.cr` → no tiene acceso a Auditoría.
4. Abra un evento. → Muestra el detalle y el identificador.

| Resultado | ☐ Pasó ☐ Falló ☐ Bloqueado | Evidencia / nota: |
| --- | --- | --- |

## 5. Resumen de resultados

| Caso | Requerimiento | Resultado | Defecto |
| --- | --- | --- | --- |
| P-00 | Seguridad básica | | |
| P-01 | CP-01 · RF-01 | | |
| P-02 | CP-02 · RF-03 | | |
| P-03 | CP-03 · RF-04 | | |
| P-04 | CP-04 · RF-06 | | |
| P-05 | CP-05 · RF-05 | | |
| P-06 | CP-06, CP-07 · RF-07, RF-08 | | |
| P-07 | CP-08 · RF-08 | | |
| P-08 | CP-09 · RF-09 | | |
| P-09 | CP-10 · RF-10 | | |
| P-10 | CP-11 · RF-12 | | |
| P-11 | CP-12 · RF-13, RF-14 | | |
| P-12 | CP-13 · RF-11 | | |
| P-13 | CP-14 | | |
| P-14 | CP-15 · RF-16 | | |
| P-15 | RF-02 · RF-06 | | |
| P-16 | RF-15 | | |
| P-17 | Usabilidad | | |
| P-18 | Cámara (opcional) | | |
| P-19 | RF-16 · Auditoría | | |

**Criterio de aceptación:** se aprueba cuando P-00 a P-16 y P-19 pasan sin defectos de severidad **Crítica** o **Alta** abiertos. P-17 y P-18 informan, pero no bloquean.

## 6. Plantilla de defecto

| Campo | Contenido |
| --- | --- |
| Id | D-001 |
| Caso | P-0X, paso N |
| Usuario / rol | |
| Fecha y navegador | |
| Qué hizo | |
| Qué esperaba | |
| Qué pasó | |
| Evidencia | Captura o video |
| Severidad | **Crítica** (pérdida de datos, acceso indebido, salario expuesto) · **Alta** (el caso no se puede completar) · **Media** (se completa con rodeos) · **Baja** (texto, aspecto) |

## 7. Notas para el tester

- Si algo del sistema ya existía y no está en esta guía (Reportes, IAnálisis, Estructura, Auditoría completa), pruébelo solo si el responsable lo pide.
- Lo que **no** debe encontrar, porque está fuera del alcance: cálculo de nómina o pago de horas extra por este ajuste, integración con un lector biométrico físico, bloqueo físico de una puerta.
- Decisiones del cliente aún pendientes (por ejemplo, si el regional solo aprueba o también edita, o si la falta de cobertura bloquea la aprobación) están listadas en `docs/REQUERIMIENTOS_TIENDAS.md`; el sistema hoy **solo avisa**, no bloquea.
