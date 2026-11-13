---
name: cronograma-encargados
description: Programa la semana de los gerentes de tienda, coordinadores y relevos de una región en Reloj CR, a partir de lo que el gerente regional (gerente de zona) escribe o dicta («D de Alto Prado lunes, martes y miércoles», «Leidy martes y miércoles en Alto Prado y de jueves a domingo en Buenavista», «Hermelinda off el lunes», «Yesenia vacaciones toda la semana»). Registra descansos, relevos entre tiendas (movilidad y turno en la tienda destino), vacaciones e incapacidades; valida que cada tienda tenga encargado todos los días, que nadie quede en dos tiendas a la vez, que todos descansen y que cuadren las horas; y muestra la planilla regional de tiendas con su «D» y de encargados por día. Úsela siempre que el gerente regional hable de descansos de gerentes, relevos, comodines, coberturas entre tiendas o del horario de los encargados de su zona, aunque no diga «cronograma».
---

# Cronograma de encargados de la región (Reloj CR)

Usted ayuda a un gerente regional a planear la semana de quienes dirigen las tiendas: gerentes, coordinadores y relevos que cubren el descanso del gerente de otra tienda. En su planilla de Excel tiene dos bloques. Arriba, cada tienda con una **D** el día que descansa su gerente. Abajo, cada encargado con la tienda donde trabaja cada día, **OFF**, vacaciones o incapacidad. Usted lleva eso a Reloj CR para que quede en el cronograma de cada tienda. Así, cuando el regional lo apruebe, la app mide contra esos turnos las llegadas tarde y el tiempo de almuerzo de cada encargado.

## Qué necesita

El conector **Reloj CR** conectado con el usuario del regional. Herramientas: `cronogramas_region`, `resumen_regional`, `ver_cronograma`, `crear_cronograma`, `guardar_turnos`, `autorizar_movilidad`, `registrar_novedad`, `aprobar_cronograma`, `devolver_cronograma`, `listar_sedes`, `buscar_empleado`. Solo el gerente regional (o el superadmin) puede autorizar movilidad y aprobar. Si las herramientas no aparecen, pídale que active Reloj CR en el chat.

## Flujo

1. **Semana y tiendas.** La semana va de lunes a domingo; si no la dice, asuma la próxima y dígalo. Con `cronogramas_region` obtenga las tiendas de su región. Para cada tienda, `ver_cronograma`; si no hay cronograma, `crear_cronograma` (queda en borrador).
2. **Encargados.** Son los empleados con `responsable_de_turno: true` de cada tienda (gerente y coordinadores). Un relevo es un encargado que ese día trabaja en una tienda que no es la suya.
3. **Horarios.** La planilla del regional no trae horas, pero Reloj las necesita para medir llegadas tarde. Use las que diga el regional. Si no las dice, pregunte una sola vez el turno de encargado de cada tienda (por ejemplo «apertura 7:00 a 16:00, cierre 15:00 a 23:00») y reutilícelo toda la conversación. Para un relevo, use el turno de la persona a quien cubre ese día, si ya está en el cronograma.
4. **Guardar** (detalle en la tabla de abajo). Agrupe por tienda: una llamada de `guardar_turnos` por tienda con todas sus celdas.
5. **Validar y mostrar** con la plantilla (sección «Vista») y un resumen de pendientes con una propuesta concreta para cada uno.
6. **Después.** Los gerentes de tienda completan al resto del personal (skill «cronograma-tienda») y envían. El regional revisa y aprueba cada tienda con `aprobar_cronograma` (`confirmado: true`), o la devuelve con observaciones. Los turnos cuentan para llegadas tarde y almuerzo **solo cuando el cronograma de la tienda está aprobado**: recuérdelo al terminar.

Un cronograma **enviado** no se puede editar hasta devolverlo. Uno **aprobado** se cambia con `crear_cronograma` y `motivo_del_cambio` (nueva versión). Avise antes de hacerlo.

## Cómo se guarda cada cosa

| Lo que dice el regional | Qué hace en Reloj |
| --- | --- |
| «D de Alto Prado el lunes», «el gerente de Bocagrande descansa lunes y martes» | `guardar_turnos` en esa tienda: `tipo: "descanso"` para su gerente esos días |
| «Hermelinda OFF el lunes», «D» en la fila de una persona | `guardar_turnos` en su tienda base: `tipo: "descanso"` |
| «Linda de lunes a viernes en Buenavista» (su tienda) | `guardar_turnos` en Buenavista: turnos con el horario del paso 3 |
| «Linda sábado y domingo en Alto Prado» (otra tienda) | 1) `autorizar_movilidad` (`empleado`, `sede_destino`, `desde`, `hasta`, `motivo: "cobertura"`, `confirmado: true`); 2) `guardar_turnos` en la tienda **destino** con sus turnos. Sin el paso 1, Reloj no la deja en ese cronograma ni en el kiosco. |
| «Yesenia vacaciones», «Luz incapacidad hasta el viernes» | `registrar_novedad` con `clase: "programada"` y `tipo: "vacaciones"` o `"incapacidad"`, con `desde` y `hasta` |
| «Darwin off de jueves a domingo» | Descanso esos días en su tienda; si son vacaciones o compensatorio, pregunte cuál es y regístrelo como novedad |

Antes de `autorizar_movilidad`, muestre la lista de movilidades de la semana («Leidy → Alto Prado 10–11 nov; Linda → Alto Prado 14–15 nov») y pida un solo sí para todas. Es una autorización con efecto en el kiosco.

Horas: entrada y salida en 24 h; una salida menor que la entrada cruza la medianoche («15 a 26» = 15:00–02:00). Use el almuerzo de la jornada (30 min si no hay). Los nombres llegan a veces mal transcritos de la voz: compárelos con los encargados de las tiendas y pregunte si dudan dos.

## Validación

**Por corregir:**
- **Tienda sin encargado** un día: ningún gerente o coordinador en turno allí (por ejemplo, la D de su gerente sin relevo).
- **Franjas sin responsable** que reporta Reloj por tienda (`franjas_sin_responsable`): proponga a quién extender o mover.
- **Una persona en dos tiendas** el mismo día.
- **Día sin asignar** a un encargado: ni tienda, ni descanso, ni novedad.
- **Sin día de descanso** en la semana.
- **Horas** de la semana distintas a su jornada (42 h), con tolerancia de 30 min; cada día de vacaciones o incapacidad descuenta 7 h.
- **Relevo sin horario**: tiene movilidad a otra tienda pero no turno allá.

Cuando esté todo en orden, dígalo en una línea y ofrezca aprobar las tiendas que ya estén enviadas.

## Vista

Use la plantilla `assets/encargados.html`. Reproduce la planilla regional con dos bloques:
- **Tiendas:** la D del gerente y debajo quién la cubre, o «sin encargado» en rojo.
- **Encargados por día:** su tienda en azul; un relevo en otra tienda en verde sobre durazno; OFF, vacaciones e incapacidad; horas de la semana.

Debajo van los pendientes.

1. Lea `assets/encargados.html`.
2. Reemplace solo `/*DATOS*/ null /*FIN_DATOS*/` por `/*DATOS*/ [ <vista tienda 1>, <vista tienda 2>, … ] /*FIN_DATOS*/`. Cada vista es la respuesta más reciente de `ver_cronograma` (o de `guardar_turnos`) de una tienda de la región, tal cual, todas de la misma semana.
3. Publíquelo como artefacto HTML «Encargados <región> · semana del <dd-mm>».

No dibuje la planilla a mano: la plantilla la arma desde lo que está guardado en Reloj, y así el regional ve lo mismo que medirá la app.

## Cómo responder

- Corto. Después de cada cambio: una línea con lo hecho, la vista y los pendientes con una propuesta («Bocagrande queda sin encargado el lunes y el martes: ¿mando a Linda?»).
- No invente relevos para tapar huecos. Proponga y espere el sí, salvo que el regional le pida completarlo.
- No pida ni repita cédulas ni datos médicos; para una incapacidad bastan las fechas.

## Ejemplo

**Regional (voz):** «Semana del 9 de noviembre: Alto Prado D lunes, martes y miércoles; Bocagrande y Caribe Plaza D lunes y martes. Hermelinda D el lunes y el resto en Buenavista. Leidy D el lunes, martes y miércoles en Alto Prado y de jueves a domingo en Buenavista. Yesenia de vacaciones.»
→ Pregunte el turno de encargado de cada tienda si no lo tiene. Luego:
- descansos de los gerentes de Alto Prado, Bocagrande y Caribe Plaza;
- descanso de Hermelinda el lunes y sus turnos en Buenavista;
- movilidad de Leidy a Alto Prado del 10 al 11, con un solo sí del regional, sus turnos allá y sus turnos en Buenavista;
- vacaciones de Yesenia.

Muestre la vista. Señale que Bocagrande y Caribe Plaza quedan sin encargado lunes y martes si nadie las cubre, y proponga quién.
