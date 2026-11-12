# Ajustes «Aplicación Tiendas» — trazabilidad e implementación

Fuente: *Requerimientos_Ajustes_Aplicacion_Tiendas.docx* v1.0 (12-nov-2026), borrador de análisis.
Base de código: la versión de producción (rama `graphify-production-review`, 20-oct-2026), no la versión inicial del 16-sep.
Este documento dice qué se implementó, qué se reutilizó o ajustó de lo que ya existía y qué no se puede implementar en software, con su sustento.

Leyenda: **Implementado** · **Reutilizado** (ya estaba en producción) · **Ajustado** (existía y se corrigió) · **Parcial** (software listo, falta decisión o dato) · **No implementable**.

Verificación: `npm test` ejecuta los casos CP-01 a CP-15 contra el código real sobre una base SQLite temporal (`scripts/stores.test.mjs`), más las pruebas de horas netas (`workday.test.mjs`), del cronograma (`planning.test.mjs`) y de análisis laboral con almuerzo (`labor.test.mjs`). Además, la prueba de permisos propia de producción (`npm run smoke:roles`) pasa 99/99 con el código nuevo.

## Qué se reutilizó de producción (no se duplicó)

| Ya existía | Cómo se usa |
| --- | --- |
| Región Caribe (`zone_caribe`), alcance por sede y región (`siteIdsForScope`, `scope.ts`) | Es la jerarquía de Iván; todo lo nuevo filtra por ese alcance. |
| **Terminales activadas con token** por sede y revocables | El kiosco ya autentica al dispositivo. Por eso la galería por tienda ya no es pública: la entrega solo a una terminal activada o a un usuario con permiso. |
| Salario y horas semanales por empleado en `contracts`, nómina colombiana, recargos y extras | El salario **no** se duplicó en la ficha: se lee y se escribe en `contracts`. |
| Correcciones con plazo, aprobador y valor anterior (`corrections.patch.previous`) | Cumple CP-15: el original se conserva en el registro de correcciones. |
| Cadena de sellos de auditoría (`events`), límite de intentos por ruta, secretos obligatorios en producción, login obligatorio | No se tocaron. |
| `payroll.ts` ya descuenta `BREAK_START/BREAK_END` | Las marcas de almuerzo son compatibles con la nómina. |

## Datos de partida

| Elemento | Valor |
| --- | --- |
| Migración (automática al arrancar) | Solo estructura y el catálogo de 5 tipos de jornada. **No inserta tiendas, empleados ni usuarios** en una base real. |
| Datos de demostración | `npm run seed:tiendas` (Buenavista, Alto Prado, una sede de Cartagena por confirmar, 10 empleados ficticios, 5 usuarios). Solo demo. |
| Usuario real de RR. HH. | `NEW_USER_PASSWORD='…' node scripts/create-user.mjs --email … --name … --role hr` |
| Empleados que ya existen | Aparecen con «ficha incompleta» hasta que RR. HH. cargue identificación y tipo de jornada. No se inventan datos. |

## Requerimientos funcionales

| RF | Estado | Dónde | Comentario |
| --- | --- | --- | --- |
| RF-01 Alta y administración | Implementado / Ajustado | `/people`, `/api/v1/employees` | Identificación única, tipo de jornada y estado laboral; salario vía contratos. Sin identificación y tipo, el empleado **no es planificable**. Ver «Decisión 1». |
| RF-02 Tipos de jornada | Implementado | `/people` (catálogo), `/api/v1/employee-types` | Los 5 tipos del anexo, editables por RR. HH. (días, horas, mínimo, almuerzo, responsable de turno, vigencia). |
| RF-03 Jerarquía geográfica | Reutilizado + Implementado | `/region` | País › región › ciudad › tienda con pendientes. Un regional no ve ni edita otra región (403/404). |
| RF-04 Cronograma semanal | Implementado | `/planner` | Celda día/empleado: turno (entrada, salida, almuerzo), descanso o novedad. Total semanal al guardar. «Enviar al gerente de zona». Vista «Todas mis tiendas». |
| RF-05 Revisión regional | Implementado (propuesto) | `/planner`, `/api/v1/plans/{id}` | Borrador, enviado, aprobado, devuelto y sustituido. Devolver exige observaciones. Solo la versión aprobada es vigente; cambiarla abre una versión nueva con justificación. |
| RF-06 Cobertura de responsable | Implementado / Parcial | `/planner`, `/region` | Alerta con día, franja y tienda cuando no hay gerente ni coordinador programado; descuenta vacaciones, incapacidades y movilidad. **No bloquea** la aprobación (decisión pendiente). El regional fija el horario de apertura. |
| RF-07 Pantalla de marcación | Ajustado | `/kiosk` | Salida pregunta «¿Salida a almuerzo o salida de trabajo?». La entrada posterior al almuerzo se registra como regreso de almuerzo. Confirmación con fecha, hora y tienda. Conserva activación de terminal y modo sin internet. |
| RF-08 Almuerzo y horas netas | Implementado / Ajustado | `workday.ts`, `labor.ts`, `/hours` | 08:00–12:00 + 12:30–16:30 = 8 h. No se fabrican marcas: sin almuerzo se cuenta lo real y se marca incidencia; un almuerzo distinto de 30′ se marca con su diferencia. `labor.ts` ahora entiende las marcas de almuerzo. |
| RF-09 Tiendas autorizadas | Implementado / Parcial | `/access` | Casillas empleado × tienda, permanentes o con fecha fin, con bitácora. El efecto «físico» depende del dispositivo (ver No implementable). |
| RF-10 Movilidad | Implementado | `/access`, `/planner` | Origen, destino, fechas, motivo y autorizador; se refleja en el cronograma destino y en la galería del kiosco destino. La tienda base **no cambia**. |
| RF-11 Novedades programadas | Implementado | `/novelties`, `/planner` | Vacaciones, incapacidad, capacitación, licencia, retiro, cambio de tienda; resaltadas y afectan la cobertura. |
| RF-12 Novedades urgentes | Implementado / Parcial | Kiosco, `/novelties` | Marcar en una tienda no autorizada **registra** la marcación y crea una excepción urgente pendiente con evidencia; el regional aprueba o rechaza con comentario y la marcación nunca se borra. No se bloquea el ingreso físico. Solo dentro de la misma región. |
| RF-13 Conciliación de horas | Implementado | `/hours` | Previsto (versión aprobada), efectivo, diferencia, almuerzo excluido, descansos e incidencias. Exceso sobre la referencia → revisión. |
| RF-14 Horas adicionales | Implementado / Parcial | `/novelties` | Una novedad pendiente por empleado/semana, actualizada con cada salida; aprobación con comentario. **Sin compensación ni liquidación automática.** |
| RF-15 Vista de RR. HH. | Implementado / Parcial | `/hours`, CSV/XLSX | Filtros de empleado, tienda, región, semana y estado de revisión. Exporta con fecha de corte y marca de pendientes; el salario lo ve solo quien puede. **No calcula nómina**: eso lo hace el módulo de nómina existente. |
| RF-16 Notificaciones y auditoría | Implementado / Parcial | `/audit`, alertas, webhook | Cada acción nueva registra actor, antes/después y fecha en la cadena de sellos. Hay bandeja y alertas; con `WEBHOOK_URL` también webhook. No hay correo, push ni WhatsApp. |

## Matriz de permisos aplicada

| Acción | RR. HH. (`hr`) | Regional | Gerente tienda | Coordinador | Empleado |
| --- | --- | --- | --- | --- | --- |
| Crear empleado, cambiar tienda base o cargo, dar de baja | Sí | No | No | No | — |
| Ficha laboral (identificación, tipo, estado) | Sí | Consulta | Consulta | No | — |
| Salario (contratos) | Sí | Sí, de su alcance (ya existía) | Sí, de su alcance (ya existía) | No | — |
| Tiendas autorizadas y movilidad | Consulta | Sí, sus tiendas | Consulta | No | — |
| Preparar y enviar cronograma | Consulta | Sí | Sí, su tienda | **No (por validar)** | — |
| Aprobar/devolver cronograma y novedades | Consulta | Sí | No | No | — |
| Ver horas y novedades | Sí | Su región | Su tienda | **No (por validar)** | — |
| Marcar asistencia | — | — | — | — | Kiosco |

«Coordinador» se mapeó al rol `operator`, con alcance de una tienda y mínimo privilegio. El empleado no tiene usuario: marca en el kiosco. Todo se cambia en `src/lib/permissions.ts`.

## Casos de prueba

| Caso | Resultado | Cómo se verificó |
| --- | --- | --- |
| CP-01 a CP-15 | Pasan | `scripts/stores.test.mjs` (código real, base temporal) |
| CP-02, 03, 05, 10, 11, 12, 14 | Pasan en la interfaz y por HTTP | Navegador y API sobre el build de producción, con token de terminal y los usuarios de la semilla |
| CP-06 | Diálogo verificado; clasificación por API | El panel de pruebas no tiene cámara |
| Permisos de producción | 99/99 | `scripts/roles-smoke.mjs` con ~100 empleados y ~11 000 marcas |
| Rendimiento | 0,1 s | Horas semanales de 115 empleados |

## Decisiones que cambian el comportamiento de producción

1. **Decisión 1 — crear y editar empleados ahora es solo de RR. HH.** La guía de roles de producción decía que zona, sede y operador podían crear empleados de su sede. El documento dice que el gerente de tienda no. Se aplicó el documento a: crear empleado, cambiar tienda base, cargo, baja lógica y ficha laboral. Siguen como antes (gerente, dentro de su alcance): nombre, código, activar/desactivar, PIN, enrolar biometría y retirar consentimiento. **Consecuencia:** una tienda no puede dar de alta a una persona nueva sin RR. HH. Para volver al comportamiento anterior, agregue `site_manager` y `operator` a `employee.manage` en `permissions.ts`.
2. **RR. HH. ve y fija salarios** (rol nuevo `hr`, alcance total). Gerentes y regional conservan el acceso a salarios que ya tenían en producción; el documento sugiere restringirlo, pero quitarlo rompería la nómina actual.
3. **Marcas de otra tienda de la misma región** ahora se aceptan y quedan como excepción pendiente (antes se rechazaban con «de otra sede»). Otra región sigue rechazada.
4. **La galería del kiosco** incluye a los empleados activos de **toda la región** de la tienda, no solo de la tienda, para poder identificar y registrar la excepción. Es más exposición de plantillas faciales por tablet que antes (siempre con token de terminal). Si prefiere minimizar, limitar a los autorizados es un cambio de una línea en `kioskGallery`.

## No implementable en software (sustento)

| Tema | Por qué |
| --- | --- |
| Integración con un equipo biométrico de marca/modelo concreto | El documento lo deja fuera de alcance: no hay marca, modelo, API ni formato de eventos. La app usa su kiosco facial en el navegador. |
| Bloquear la entrada física en tienda no autorizada | Requiere control de acceso (puerta, torniquete). Además la política «permitir o bloquear» está pendiente. Se implementó el registro como excepción. |
| Liquidar nómina, recargos u horas extra pagables, o compensar entre días | Fuera del alcance base y sujeto a validación jurídica. La referencia de 42 h coincide con la Ley 2101 de 2021 desde julio de 2026, pero el área laboral debe validar recargos, distribución y medio tiempo. El sistema detecta y escala; el cálculo de nómina existente es un módulo aparte. |
| Datos reales de Cartagena, horarios de apertura y nómina nominal | No están en las fuentes: se usa una sede «por confirmar» y un horario por defecto (07:00–22:00) editable por el regional. |

## Pendiente de decisión del cliente (sección 11 del documento)

| Decisión | Qué hace hoy el sistema | Qué cambia según la decisión |
| --- | --- | --- |
| Quinta clase de usuario y facultades del coordinador | Coordinador sin planificación ni consulta | `permissions.ts` (una línea por permiso) |
| ¿El regional solo aprueba o también edita? | Puede editar y aprobar en su región | Quitar `zone_manager` de `plan.edit` |
| ¿Bloquear la aprobación por falta de cobertura? | Solo alerta | Validar en `decidePlan` |
| Almuerzo siempre 30′ y turnos sin almuerzo | 30′ por tipo, editable; un turno puede tener 0′ | Parámetro por tipo ya disponible |
| Movilidad entre ciudades | Permitida dentro de la región y marcada | Restringir en `createMobility` |
| Cierre de semana y cambios retroactivos | Cambio tras aprobar = nueva versión justificada | Falta un «cierre» que congele la semana |
| Cronograma por fecha vs. horario semanal fijo | Conviven: `schedules` (patrón semanal que usa asistencia y nómina) y `shift_plans` (semana concreta aprobada, que usa el control de horas) | Si se quiere un solo origen, la versión aprobada debería alimentar a `schedules` |
| Vista del empleado (propias) y adjuntos | No existen | Requieren portal del empleado y almacenamiento |
