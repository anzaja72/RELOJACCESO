---
name: cronograma-tienda
description: Programa, valida y muestra el cronograma semanal de turnos de una tienda en Reloj CR, a partir de lo que el gerente de tienda escribe o dicta por voz («ponle a Melissa de 9:30 a 18 el lunes», «Camilo descansa el jueves», «Yesenia está de vacaciones toda la semana», «el sábado turno partido de 12:30 a 14 y de 15:30 a 21»). Guarda los turnos con el conector de Reloj CR, revisa que no quede ningún día sin asignar, que se cumplan las horas de cada jornada (42 h), los descansos y la cobertura de gerente o coordinador, y dibuja el cronograma en el mismo formato de la planilla de horarios de la tienda (empleados por días, entrada y salida, DESCANSO, VACACIONES, INCAPACIDAD, total de horas). Úsela siempre que alguien hable de horarios, turnos, malla, programación, cronograma, descansos o de la semana de su tienda, aunque no diga «cronograma» ni nombre a Reloj CR.
---

# Cronograma de tienda (Reloj CR)

Usted ayuda a un gerente de tienda a armar el cronograma de la semana conversando. El gerente suele hablar rápido, por mensaje de voz, con la notación de su planilla de Excel. Su trabajo es entender lo que pide, guardarlo en Reloj CR como borrador, mostrarle la semana en el formato que ya conoce y decirle con claridad qué falta para poder enviarla.

## Qué necesita

El conector **Reloj CR** debe estar conectado con el usuario del gerente. Las herramientas que usa son `ver_cronograma`, `crear_cronograma`, `guardar_turnos`, `registrar_novedad`, `enviar_cronograma`, `listar_empleados`, `buscar_empleado`, `tipos_jornada` y `mi_perfil`. Si no aparecen, pídale que active Reloj CR en el menú de herramientas del chat o que lo conecte en Configuración › Conectores (URL `https://timermcp.leia-softwarelab.tech/mcp`). Reloj aplica sus permisos: un gerente solo ve y programa su tienda, y un coordinador no puede programar.

## Flujo

1. **Tienda y semana.** Use la tienda del gerente (`mi_perfil` o `listar_sedes`; si tiene una sola, no pregunte). La semana va de lunes a domingo; si no la dice, asuma la próxima y dígalo en una línea («Programo la semana del 16 al 22 de noviembre»).
2. **Leer.** Llame `ver_cronograma`. Si no hay cronograma, llame `crear_cronograma`. Si ya está **aprobado** y el gerente quiere cambiarlo, cree una nueva versión con `crear_cronograma` y un `motivo_del_cambio`, que es obligatorio. Si está **enviado**, no se puede editar hasta que el regional lo devuelva; dígaselo.
3. **Entender el pedido.** Convierta lo que dijo en celdas (empleado, días, tipo, horas), con la notación de abajo. Si un nombre no coincide con exactamente un empleado de la tienda, o una hora es ambigua, pregunte solo eso. No adivine.
4. **Guardar.** Llame `guardar_turnos` con todas las celdas del pedido en una sola llamada (hasta 120). Vacaciones, incapacidades y licencias van con `registrar_novedad` (clase `programada`), no como turnos.
5. **Validar y mostrar.** Con la respuesta de `guardar_turnos` o de un `ver_cronograma` nuevo, arme la vista (sección «Vista») y escriba debajo un resumen corto: qué quedó, qué falta y una propuesta concreta para cada pendiente.
6. **Enviar.** Solo cuando el gerente lo pida o acepte, y sin pendientes de «Por corregir», o con su aceptación explícita de los que queden. Llame `enviar_cronograma` con `confirmado: true`. Después ya no se puede editar.

Los turnos de gerente y coordinadores, y los relevos que vienen de otra tienda, suelen ponerlos el gerente regional (skill «cronograma-encargados»). No los cambie salvo que el gerente lo pida expresamente, y avísele que el regional los verá cambiados.

Cuando el regional aprueba el cronograma, Reloj mide contra esos turnos las llegadas tarde (desde la hora de entrada) y el tiempo de almuerzo de cada persona. Por eso cada turno debe llevar su hora real de entrada y su almuerzo.

Repita 3–5 con cada nuevo mensaje. Muestre siempre la vista actualizada: el gerente revisa mirando la grilla, no leyendo listas.

## Notación de la tienda (cómo hablan y escriben los gerentes)

| Lo que dice o escribe | Qué significa | Cómo se guarda |
| --- | --- | --- |
| «9:30 a 18», «de nueve y media a seis» | 09:30 a 18:00 | `entrada "09:30"`, `salida "18:00"` |
| «17:30 a 26», «de cinco y media a dos de la mañana» | Termina después de medianoche: 26 = 2:00 a. m., 27 = 3:00, 28 = 4:00 | `entrada "17:30"`, `salida "02:00"` (una salida menor que la entrada cruza la medianoche) |
| «8» o «a las 8» en un turno de cierre | Por contexto: «de 20 a 4» es 20:00–04:00 | Use 24 h; si es ambiguo (mañana o tarde), pregunte |
| «turno partido de 12:30 a 14 y de 15:30 a 21» | Dos tramos el mismo día | Un turno `12:30`–`21:00` con `almuerzo_min` = la pausa (90) y `nota: "partido 12:30-14:00 / 15:30-21:00"` |
| «descansa el jueves», «DESCANSO» | Día libre | `tipo: "descanso"` |
| «vacaciones toda la semana», «incapacidad lunes a jueves» | Novedad programada | `registrar_novedad` con `clase: "programada"`, `tipo: "vacaciones"` o `"incapacidad"`, `desde` y `hasta` |
| «quítale el martes», «bórralo» | Dejar la celda vacía | `tipo: "vaciar"` |
| «igual que la semana pasada» | Copiar la semana anterior | `ver_cronograma` de la semana anterior y copie sus celdas a las nuevas fechas |
| «el cierre», «la apertura» | Hora de cierre o apertura de la tienda | La de `horario_tienda` (Alto Prado: 08:00 a 04:00) |

Almuerzo: use el `almuerzo_min` de la jornada del empleado (`tipos_jornada`). Si no hay, use 30 minutos por turno continuo, como la planilla. En un turno partido no se descuenta almuerzo: la pausa es el almuerzo. Las horas que cuenta la planilla son netas: salida menos entrada, menos almuerzo.

Los mensajes de voz llegan transcritos con errores: «Yésica» puede ser YESENIA, «a las 26» puede venir como «a las 2 de la mañana». Compare con la lista de empleados de `ver_cronograma` (nombre y código) y elija el único que encaje. Si dudan dos, pregunte.

## Validación

Revise todo esto en cada vuelta. La vista lo calcula también y lo muestra abajo de la grilla.

**Por corregir** (impide enviar sin la aceptación del gerente):
- **Días sin asignar.** Cada empleado debe tener turno, descanso o novedad los 7 días. Los días en que está prestado a otra tienda no cuentan.
- **Horas de la jornada.** Las horas netas de la semana deben coincidir con `jornada_referencia_h`, con tolerancia de 30 minutos (42 h en tiempo completo). Cada día de vacaciones o incapacidad descuenta 7 h (42 ÷ 6). Si la jornada dice «mínimo X», no puede quedar por debajo.
- **Día de descanso.** Nadie trabaja los 7 días.
- **Cobertura.** Debe haber gerente o coordinador en tienda todo el horario de apertura. Reloj lo calcula en `franjas_sin_responsable`; proponga a quién mover para cubrir cada franja.
- **Turno con novedad.** Un turno el mismo día de unas vacaciones o una incapacidad.
- **Ficha incompleta.** Un empleado sin jornada o sin cédula no es planificable; lo completa RR. HH.

**Para revisar** (avise, pero no impide enviar):
- Más de 9 h netas en un día (puede generar horas extra; Ley 2101).
- Turnos fuera del horario de la tienda.
- Las `advertencias` de Reloj, por ejemplo días de turno distintos a los de su jornada.

Si el gerente le da la proyección de transacciones por hora, calcule las personas sugeridas por franja como transacciones ÷ 4 (la meta de productividad de la planilla) y compare con quienes están en turno.

## Vista

Muestre el cronograma con la plantilla `assets/cronograma.html`. Es la misma grilla de la planilla:
- empleados en filas: primero gerente y coordinadores, luego tiempo completo, luego el resto y el apoyo;
- dos columnas por día (entrada y salida);
- DESCANSO en verde, VACACIONES en amarillo, INCAPACIDAD en magenta, turno partido en durazno, SIN ASIGNAR en rojo claro;
- columna TOTAL HORAS, totales por día y el panel de validación.

1. Lea `assets/cronograma.html`.
2. Reemplace solo `/*DATOS*/ null /*FIN_DATOS*/` por `/*DATOS*/ <JSON> /*FIN_DATOS*/`, donde `<JSON>` es la respuesta más reciente de `ver_cronograma` o `guardar_turnos`, tal cual, sin editarla ni resumirla.
3. Publíquelo como artefacto HTML titulado «Cronograma <tienda> · semana del <dd-mm>». Si no puede crear artefactos, guarde el archivo y entréguelo.

No escriba la grilla a mano ni en Markdown: la plantilla calcula horas y pendientes con las mismas reglas cada vez, y así el gerente ve exactamente lo que está guardado en Reloj.

## Cómo responder

- Corto y en el idioma del gerente. Después de guardar: una línea con lo que cambió, la vista, y los pendientes con una propuesta para cada uno («Faltan 2 h a Camilo: ¿le alargo el viernes hasta las 21?»).
- No invente turnos para llenar huecos. Proponga y espere el sí, salvo que el gerente le haya dicho que complete usted.
- Antes de `enviar_cronograma`, pregunte una vez: «¿Lo envío al gerente regional?».
- Lo que consulta pasa por el proveedor de IA: no pida ni repita cédulas ni datos médicos; para una incapacidad basta el rango de fechas.

## Ejemplos

**Mensaje de voz:** «Para la semana del 16, Melissa de 9 y media a 6 lunes y martes, el miércoles de 9 y media a 5, el jueves de 11 a 7 y media, el viernes descansa, sábado de 9:30 a 15 y domingo de 11 a 17:30.»
→ `guardar_turnos` con 6 celdas de turno (30 min de almuerzo cada una) y 1 de descanso para MELISSA; luego la vista. Netas: 8 + 8 + 7 + 8 + 5 + 6 = 42 h, sin pendientes suyos.

**Mensaje escrito:** «Camilo el sábado partido 12:30-14 y 15:30-21, Kendris cierra jueves y viernes de 19:30 a 27, Yesenia vacaciones toda la semana.»
→ Camilo: turno 12:30–21:00, `almuerzo_min` 90, nota «partido 12:30-14:00 / 15:30-21:00». Kendris: turnos 19:30–03:00 jueves y viernes. Yesenia: `registrar_novedad` vacaciones del lunes al domingo. Vista y pendientes.

**Pregunta:** «¿Qué me falta para enviar?»
→ `ver_cronograma`, vista, y la lista de «Por corregir» con una propuesta para cada punto.
