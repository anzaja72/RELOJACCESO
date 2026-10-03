# Pruebas por tipo de usuario

Guía para validar qué ve y qué puede hacer cada perfil de Reloj CR. Las tablas de las secciones 3 y 4 se **midieron** con los cinco usuarios contra la versión de esta rama, con datos en dos sedes y dos regiones. La prueba automática `npm run smoke:roles` repite estas comprobaciones (64 en total).

## 1. Cómo entrar

- **URL:** https://reloj.leia-softwarelab.tech/login (o `http://localhost:47321/login` en local).
- **Contraseña:** la misma para los cinco usuarios; es la variable `ADMIN_PASSWORD` del servidor. Pídasela a Angel; **no la escriban en este documento ni en el repositorio**.
- **Verificación en dos pasos (TOTP):** opcional y apagada por defecto.
- El login permite 10 intentos por minuto. Si lo superan, esperen un minuto sin reintentar.

| Correo | Perfil | Alcance (datos que puede ver) |
|---|---|---|
| `admin@reloj.cr` | Superadmin | Todas las regiones y sedes |
| `zona@reloj.cr` | Gerente de zona | Las sedes de su región (Región Andina) |
| `sede@reloj.cr` | Gerente de sede | Solo su sede (R01 La Candelaria) |
| `operador@reloj.cr` | Operador de kiosco | Solo su sede (R01 La Candelaria) |
| `auditor@reloj.cr` | Auditor | Todas las regiones y sedes, solo lectura |

**Datos de ejemplo:** 2 regiones (Andina y Caribe), una sede en cada una (R01 La Candelaria y R02 Mariscos del Caribe) y 5 empleados ficticios. En una base nueva no hay marcaciones: para ver reportes y expedientes primero hagan marcas, o corran `scripts/demo.sh`.

## 2. Cómo se segmenta por sede y región

- **Región y sede:** cada sede pertenece a una región, y cada región a un país. El perfil de cada usuario fija hasta dónde llega: todo, una región o una sede.
- **Dónde se ve:**
  - **Barra lateral:** bajo el menú hay un recuadro con el perfil y el alcance (ej.: "Gerente de zona · Región Andina · 1 sede").
  - **Estructura (menú):** muestra país → región → sede, con personas y tablets de cada sede, solo de lo que ese usuario puede ver, y explica el alcance de cada perfil.
  - **Selector de sede** y filtros País/Zona/Sede de **Reportes:** solo ofrecen lo que el usuario puede ver.
- **Qué se filtra:** Personas, Operación (marcaciones y terminales), Reportes, Auditoría, alertas, correcciones, horarios y las exportaciones. Fuera de su alcance, un empleado "no existe" para el usuario (404).
- El **menú lateral es igual para todos**; no se oculta ninguna opción por perfil. Cambian los datos y las acciones permitidas.

## 3. Matriz de datos visibles (medida)

| Qué se ve | Superadmin | Gerente de zona | Gerente de sede | Operador | Auditor |
|---|---|---|---|---|---|
| Sedes | 2 | 1 | 1 | 1 | 2 |
| Empleados | 5 | 3 | 3 | 3 | 5 |
| Marcaciones en Operación | 54 | 34 | 34 | 34 | 54 |
| Filas del reporte del día | 5 | 3 | 3 | 3 | 5 |
| Eventos de auditoría | todos | solo de sus sedes | solo de sus sedes | sin acceso (403) | todos |
| Usuarios listados en Ajustes | 5 | 0 | 0 | 0 | 0 |

## 4. Matriz de acciones (medida)

| Acción | Superadmin | Gerente de zona | Gerente de sede | Operador | Auditor |
|---|---|---|---|---|---|
| Crear empleado en su sede | Sí | Sí | Sí | Sí | No |
| Capturar biometría en su sede | Sí | Sí | Sí | Sí | No |
| Activar un terminal en su sede | Sí | Sí | Sí | Sí | No |
| Corregir una marca | Sí | Sí | Sí | No | No |
| Escanear anomalías | Sí | Sí | Sí | No | No |
| Ver auditoría | Sí | Sí | Sí | No | Sí |
| Ver integridad del registro | Sí | Sí | Sí | No | Sí |
| Exportar marcaciones | Sí | Sí | Sí | No | Sí |
| Descargar expediente PDF | Sí | Sí | Sí | No | Sí |
| Ver reporte del día | Sí | Sí | Sí | Sí | Sí |
| Guardar ajustes globales | Sí | No | No | No | No |
| Cambiar marca y logo | Sí | No | No | No | No |
| Ver lista de usuarios | Sí | No | No | No | No |

Fuera de su alcance, crear, editar, dar de baja o capturar biometría de un empleado de otra sede se rechaza (404 o 403) para todos menos el superadmin.

## 5. Guion de prueba por perfil

Marquen cada punto como correcto, incorrecto u observación.

### Preparación (una sola vez, con el superadmin)

- [ ] Entrar como `admin@reloj.cr`; en **Kiosco**, activar un terminal para R01.
- [ ] **Enrolar** a un empleado con su autorización y hacer 4 o 5 marcaciones.
- [ ] **Operación** muestra las marcaciones.

### Superadmin (`admin@reloj.cr`)

- [ ] Recuadro de la barra lateral: "Superadmin · Todas las sedes (2)". **Estructura** muestra 2 regiones.
- [ ] **Ajustes** lista los 5 usuarios y guarda retención, PIN y marca del cliente.
- [ ] **Ajustes → Marca del cliente:** cambia a Burger King, sube el logo y vuelve a la versión básica.
- [ ] **Personas:** crear, editar, trasladar y dar de baja a un empleado de prueba.
- [ ] **Descargar expediente:** el PDF abre con tildes y trae horas, marcaciones e integridad.
- [ ] **Auditoría:** el aviso dice "Registro íntegro".

### Gerente de zona (`zona@reloj.cr`)

- [ ] Recuadro: "Gerente de zona · Región Andina · 1 sede". **Estructura** muestra solo Colombia → Región Andina → R01.
- [ ] Personas, Operación y Reportes solo muestran R01 (3 personas); no aparece R02.
- [ ] Puede corregir una marca y descargar un expediente de su región.
- [ ] **Ajustes:** no ve la lista de usuarios y no puede guardar (403).

### Gerente de sede (`sede@reloj.cr`)

- [ ] Recuadro: "Gerente de sede · Restaurante La Candelaria". Ve solo su sede y 3 personas.
- [ ] Puede corregir una marca con motivo (queda registrado), descargar el expediente y ver integridad.
- [ ] **Auditoría** solo muestra eventos de su sede.
- [ ] **Ajustes:** no puede guardar (403).

### Operador (`operador@reloj.cr`)

- [ ] Ve solo su sede y 3 personas.
- [ ] Puede **enrolar** (la captura de biometría funciona), marcar en el kiosco y activar un terminal.
- [ ] Rechazado (403): auditoría, exportaciones, corregir una marca, expediente PDF, escanear anomalías y ajustes.

### Auditor (`auditor@reloj.cr`)

- [ ] Ve las 2 sedes y los 5 empleados, solo para leer.
- [ ] Rechazado (403): crear empleados, capturar o borrar biometría, activar terminales, corregir marcas, escanear anomalías y guardar ajustes.
- [ ] Puede leer auditoría, descargar expedientes y ver la integridad.

## 6. Pendiente

- **Interfaz:** el menú es igual para todos; las acciones no permitidas muestran un error. Falta ocultar o desactivar lo que cada perfil no puede usar.
- **Terminales:** revocar un terminal verifica el rol, pero no que sea de la sede del usuario.
- **Alertas:** confirmar una alerta (acusar) no se limita a la sede del usuario.
- **Lista pública de sedes:** `GET /api/sites` sin sesión devuelve todas las sedes, porque las tablets la necesitan para activarse. Con sesión, solo devuelve las del alcance.
- **Captura de biometría:** si alguien no puede capturar el rostro estando permitido, casi siempre es el permiso de cámara del navegador (debe ser HTTPS y estar permitido para el sitio), no un permiso del sistema.

## 7. Cómo reportar

Para cada hallazgo anoten: perfil, pantalla o acción, qué esperaban, qué pasó, y captura. Los 403 esperados de la sección 4 no se reportan.
