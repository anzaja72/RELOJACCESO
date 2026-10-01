# Pruebas por tipo de usuario

Guía para que el equipo valide qué ve y qué puede hacer cada perfil de Reloj CR. Los resultados de la tabla de la sección 3 se **midieron** con los cinco usuarios contra la versión de esta rama (no son lo que "debería" pasar según un documento).

## 1. Cómo entrar

- **URL:** https://reloj.leia-softwarelab.tech/login (o `http://localhost:47321/login` en local).
- **Contraseña:** la misma para los cinco usuarios; es la variable `ADMIN_PASSWORD` del servidor. Pídasela a Angel; **no la escriban en este documento ni en el repositorio**.
- **Verificación en dos pasos (TOTP):** opcional y apagada por defecto; si algún usuario la tiene activa, el login pide el código.
- El login permite 10 intentos por minuto. Si lo superan, esperen un minuto sin reintentar.

| Correo | Perfil | Alcance (datos que puede ver) |
|---|---|---|
| `admin@reloj.cr` | Superadmin | Todas las sedes |
| `zona@reloj.cr` | Gerente de zona | Las sedes de su zona (Región Andina) |
| `sede@reloj.cr` | Gerente de sede | Solo su sede (R01 La Candelaria) |
| `operador@reloj.cr` | Operador de kiosco | Solo su sede (R01 La Candelaria) |
| `auditor@reloj.cr` | Auditor | Todas las sedes, solo lectura |

**Datos de ejemplo:** 2 sedes (R01 Restaurante La Candelaria y R02 Mariscos del Caribe) y 5 empleados ficticios. En una base nueva no hay marcaciones: para probar reportes y expedientes primero hagan marcas (sección 4).

## 2. Lo primero que deben saber

- **El menú lateral es igual para todos** (Inicio, Kiosco, Enrolar, Operación, Personas, Reportes, Pregunta, Auditoría, Ajustes, API). Ninguna opción se oculta por perfil. Lo que cambia es **cuántos datos devuelve** cada pantalla y **qué acciones se rechazan** (mensaje de error o 403).
- Un 403 en la prueba de un perfil que no debería poder hacer algo es el resultado **correcto**.

## 3. Matriz medida

Los números son registros visibles; `200` es que la acción funcionó; `403` es que se rechazó.

| Prueba | Superadmin | Gerente de zona | Gerente de sede | Operador | Auditor |
|---|---|---|---|---|---|
| Sedes visibles | 2 | 1 | 1 | 1 | 2 |
| Empleados visibles | 5 | 3 | 3 | 3 | 5 |
| Filas del reporte del día | 5 | 3 | 3 | 3 | 5 |
| Usuarios listados en Ajustes | 5 | 0 | 0 | 0 | 0 |
| Crear empleado | 201 | 201 | 201 | 201 | **403** |
| Activar un terminal (kiosco) | 201 | 201 | 201 | 201 | **403** |
| Crear corrección de una marca | permitido | permitido | permitido | **403** | **403** |
| Cambiar la marca del cliente (colores) | 200 | **403** | **403** | **403** | **403** |
| Guardar ajustes (p. ej. retención) | 200 | 200 | 200 | **403** | **403** |
| Ver estado de integridad | 200 | 200 | 200 | **403** | 200 |
| Descargar expediente PDF | 200 | 200 | 200 | **403** | 200 |
| Escanear anomalías | 200 | 200 | 200 | 200 | 200 |
| Exportar paquete de marcaciones (CSV) | 200 | 200 | 200 | 200 | 200 |

## 4. Guion de prueba por perfil

Marquen cada punto como correcto, incorrecto u observación. Háganlo en el orden de la lista.

### Preparación (una sola vez, con el superadmin)

- [ ] Entrar como `admin@reloj.cr`; **Kiosco** → activar el terminal para la sede R01.
- [ ] **Enrolar** a un empleado de ejemplo con su autorización; hacer 4 o 5 marcaciones de entrada y salida.
- [ ] **Operación** muestra las marcaciones.

### Superadmin (`admin@reloj.cr`)

- [ ] Ve las 2 sedes y los 5 empleados.
- [ ] **Ajustes** lista los 5 usuarios y permite guardar retención, PIN y marca del cliente.
- [ ] **Ajustes → Marca del cliente:** cambiar a Burger King y volver a la versión básica; los colores cambian en todas las pantallas.
- [ ] **Personas:** crear, editar, trasladar y dar de baja a un empleado de prueba.
- [ ] **Personas → Descargar expediente:** el PDF abre con tildes y trae horas, marcaciones e integridad.
- [ ] **Auditoría:** el aviso de integridad dice "Registro íntegro".

### Gerente de zona (`zona@reloj.cr`)

- [ ] Ve solo 1 sede y 3 empleados (no los de R02).
- [ ] **Reportes** muestra solo los de su zona.
- [ ] Puede descargar el expediente de un empleado de su zona.
- [ ] **Ajustes:** no ve la lista de usuarios y no puede cambiar la marca (403).

### Gerente de sede (`sede@reloj.cr`)

- [ ] Ve solo su sede y 3 empleados.
- [ ] Puede crear una corrección a una marca con motivo; queda registrada con su nombre como aprobador.
- [ ] Puede descargar el expediente y ver la integridad.
- [ ] **Ajustes:** no puede cambiar la marca (403).

### Operador (`operador@reloj.cr`)

- [ ] Ve solo su sede y 3 empleados.
- [ ] Puede enrolar, marcar en el kiosco y activar un terminal.
- [ ] **Corrección de una marca:** rechazada (403).
- [ ] **Expediente PDF** e **integridad:** rechazados (403).
- [ ] **Ajustes:** no puede guardar nada (403).

### Auditor (`auditor@reloj.cr`)

- [ ] Ve las 2 sedes y los 5 empleados, solo para leer.
- [ ] No puede crear empleados, activar terminales ni crear correcciones (403).
- [ ] Puede descargar expedientes y ver la integridad.
- [ ] **Ajustes:** no puede guardar nada (403).

## 5. Brechas conocidas

Estos puntos **no son el comportamiento deseado**. Si los ven, anótenlos como hallazgo; no cuentan como falla de su prueba. Se corrigen antes de crecer más allá del piloto de una sede.

**Medidas en esta prueba:**
- **Auditoría:** cualquier usuario con sesión, incluido el operador, ve el registro de eventos, sin filtrar por sede.
- **Ajustes:** el gerente de sede y el de zona pueden cambiar ajustes globales (por ejemplo, la retención de datos).
- **Anomalías:** el auditor, que debería ser solo lectura, puede ejecutar el escaneo de anomalías, que escribe registros.
- **Crear empleados:** el gerente de zona, el de sede y el operador pueden crearlos; en el código no hay verificación de que sea en su propia sede.

**Según el código (por confirmar con datos en dos sedes):**
- La exportación del paquete de marcaciones no se limita a la sede del usuario.
- Alertas, correcciones, auditoría de enrolamiento, horarios y excepciones no se filtran por sede.
- `GET /api/v1/employees/{id}` entrega los datos de cualquier empleado a cualquier usuario con sesión.
- Cualquier perfil con permiso de escritura puede modificar o dar de baja a un empleado de otra sede.

**Ya corregido en esta rama:** la ruta antigua `GET /api/employees/{id}/templates` devolvía las plantillas faciales sin pedir sesión. Ahora exige sesión y no devuelve los descriptores.

## 6. Cómo reportar

Para cada hallazgo anoten: perfil, pantalla o acción, qué esperaban, qué pasó, y captura. Los 403 esperados de la sección 3 no se reportan.
