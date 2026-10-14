# Integración de los cambios del 9 al 12 de octubre

Qué se recibió, qué se cambió al integrarlo y qué falta. Base: `main` del 25 de septiembre (`3ec2a96`); los cambios se aplicaron en la rama `user-changes` y se fusionaron con `claude/graphify-production-review-a1c2bf`.

## Qué trae la versión recibida

- Tablero mensual en Reportes (gráficas, puntualidad, composición del equipo).
- Módulo de nómina horaria (`src/lib/payroll.ts`, con 8 casos de prueba): horas ordinarias y extra diurnas, nocturnas y festivas, y su valor.
- Parámetros legales en Ajustes, turnos, contratos e informe mensual firmado a un sistema externo.
- IAnálisis con filtros País → Zona → Sede.
- Datos de demostración (`npm run seed:dummy`, 105 colaboradores en 5 sedes).

## Conflictos con la rama de seguridad

La rama ya tenía el alcance por sede en el kiosco y la IA (`fac8be6`), la cadena de integridad, el expediente, la marca y los respaldos. Se resolvieron 8 archivos, siempre conservando las dos cosas: el filtro de región que elige el usuario **y** el alcance real de quien pregunta.

## Problemas encontrados en el código recibido y corregidos

| Problema | Corrección |
| --- | --- |
| `GET /contracts` devolvía todos los sueldos a cualquier usuario con sesión | Solo gerentes y auditor, y solo de su alcance |
| `POST /contracts` y `POST /shifts` los podía usar el operador, sobre cualquier sede | Contratos: gerentes dentro de su alcance. Turnos: superadmin |
| El tablero mostraba sueldos y valores al operador | El operador ve horas, sin dinero |
| El informe mensual lo podía disparar un gerente y enviaba datos de toda la empresa | Solo el superadmin; exige `WEBHOOK_SECRET` en producción |
| La dirección del informe aceptaba `http://` y direcciones internas | Solo `https://`, sin credenciales ni redes privadas (control de SSRF) |
| Los ajustes no validaban valores (recargos, festivos, horas) | Validación con pruebas (`settings-validation.test.mjs`) |
| `seed-dummy.mjs` borra marcaciones sin avisar | Se niega en producción o si hay marcaciones reales (`DEMO_SEED_FORCE=1` para forzar) |
| La zona horaria quedaba fija en `-05:00` dentro de `payroll.ts` | Usa el desfase de `config.ts` |
| Dos reglas semanales distintas (42 h y 48 h) | Una sola: `max_weekly_hours`, por defecto 42 h |
| Los fines de semana y días sin turno contaban como ausencias | Solo cuentan los días con turno (827 → 407 ausencias en el mes de prueba) |
| El reporte diario leía como máximo 500 marcaciones | Hasta 5000 |
| El tablero usaba colores fijos y no seguía la marca del cliente | Usa las variables del tema |

## Defecto previo, encontrado al integrar

En una base de datos nueva, la **primera petición devolvía 500**: el sembrado escribía un evento antes de que existiera la columna del sello. Las siguientes funcionaban. Corregido.

## Lo que pidió quien probó (informe de pruebas por tipo de usuario)

| Pedido | Qué se hizo |
| --- | --- |
| El botón de cerrar sesión "sube y baja" | La sesión pasó a la barra lateral, que ahora queda fija |
| El logo cambia al elegir el archivo | Vista previa dentro del panel; la aplicación cambia solo al guardar |
| Otros perfiles pueden "hacer cambios" en Ajustes | Controles desactivados y aviso de solo lectura; la API ya rechazaba el guardado |
| La integridad no se entiende | Texto en lenguaje simple y una explicación de «integridad» |
| La auditoría no muestra detalles del empleado | Cada evento muestra qué pasó, quién, sobre quién, en qué sede y cuándo |
| Auditoría con los mismos eventos para la sede y el superadmin | El filtro por sede ya estaba en esta rama; se probó con datos |
| No se puede crear una persona sin biometría | Botón "Crear sin biometría" en Enrolar |
| Opciones para cambiar regiones, sedes y kioscos | Estructura: crear regiones y sedes, editar sedes y revocar tablets |
| Apareció una persona de otra sede al marcar | El servidor solo sirve las plantillas de la sede de la tablet y rechaza marcas de personas de otra sede (`fac8be6`); queda pendiente la causa exacta en el equipo de quien probó |
| El auditor "captura" entradas y salidas | Una tablet activada marca para quien esté frente a ella; ahora un rechazo no se guarda en la cola |

## Pendiente

- **Nómina:** es una estimación. No calcula el recargo nocturno de las horas ordinarias ni el descanso dominical; no debe usarse como liquidación.
- **Zona horaria y reglas laborales** siguen siendo las de Colombia; para Costa Rica hay que parametrizarlas.
- **Tablero:** recalcula todo el mes en cada petición (0,4 s con 105 colaboradores); para más sedes conviene guardarlo en caché.
- **Informe mensual:** envía sueldos a un tercero; requiere una base legal y acuerdo de tratamiento de datos con el destinatario.
