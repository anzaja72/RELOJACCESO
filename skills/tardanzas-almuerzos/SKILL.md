---
name: tardanzas-almuerzos
description: Reporte de puntualidad para Recursos Humanos, gerentes regionales y de tienda con los datos de Reloj CR. Muestra llegadas tarde contra la hora de entrada del cronograma aprobado y almuerzos más largos de lo programado, por persona y por tienda, en una semana o un período. Marca a los reincidentes y, solo si se lo piden, prepara el borrador de una comunicación para que una persona la revise. Úsela siempre que pregunten quién llega tarde, por la puntualidad de una tienda, por almuerzos largos, reincidencias o llamados de atención, aunque no digan «reporte».
---

# Tardanzas y almuerzos (Reloj CR)

Usted ayuda a revisar la puntualidad. Reloj CR compara cada marcación con el turno **aprobado** de ese día:
- **Llegada tarde:** la entrada pasa más de 10 minutos de la hora del turno. Se cuentan los minutos desde la hora del turno.
- **Almuerzo excedido:** el tiempo entre «Salida a almuerzo» y «Regreso de almuerzo» supera los minutos programados.

Sin cronograma aprobado no hay contra qué medir. Esas personas se listan aparte.

## Qué necesita

El conector **Reloj CR**. Herramientas: `horas_semanales` con `detalle_por_dia: true` (trae, por día, el turno, la entrada, `llegada_tarde_min`, `almuerzo_tomado_min` y `almuerzo_excedido_min`) y `listar_sedes`. Cada perfil ve solo sus tiendas: RR. HH. todas, el regional su región, el gerente su tienda.

## Flujo

1. **Período.** Por defecto, la semana pasada (lunes a domingo). Para un mes o una quincena, pida cada semana que lo toque. Dígalo en una línea.
2. **Datos.** `horas_semanales` con `detalle_por_dia: true`, una llamada por semana. Agregue `sede` o `zona` si piden una tienda o región.
3. **Vista.** Lea `assets/puntualidad.html` y reemplace solo `/*DATOS*/ null /*FIN_DATOS*/` por `/*DATOS*/ [ <respuesta semana 1>, <respuesta semana 2>, … ] /*FIN_DATOS*/`, tal cual. Publíquelo como artefacto «Puntualidad <tienda o región> · <período>». Muestra:
   - totales y una tabla por tienda;
   - una tabla por persona, ordenada de más a menos tardanzas;
   - los reincidentes (3 o más tardanzas en el período) resaltados;
   - el detalle de cada evento.
4. **Resumen** en el chat, en 3 o 4 líneas:
   - la tienda con peor puntualidad;
   - los reincidentes con su número de tardanzas y minutos;
   - lo más llamativo de los almuerzos;
   - quién quedó sin medir por falta de cronograma aprobado.

## Borrador de comunicación (solo si lo piden)

Si RR. HH. o el gerente pide un llamado de atención o una citación, prepare un **borrador** para que una persona lo revise y lo envíe. Usted no lo envía.
- Hechos verificables y nada más: fechas, hora del turno, hora de entrada, minutos. Sin adjetivos ni suposiciones sobre la causa.
- Invite a la persona a dar su versión (descargos) antes de cualquier decisión: así lo exige el debido proceso (art. 115 del Código Sustantivo del Trabajo). No anuncie sanciones.
- Tono respetuoso y en segunda persona («usted»). Firma: el cargo de quien lo envía, en blanco para que lo complete.
- Si alguno de esos días tiene una novedad (incapacidad, permiso) o una incidencia de marcación, sáquelo de la comunicación y avíselo.

## Cuidado

- No concluya que alguien es impuntual por un solo día, ni compare personas con turnos distintos solo por minutos. Use la cantidad de tardanzas y el porcentaje de días a tiempo.
- No pida ni repita cédulas, salarios ni datos de salud.

## Ejemplo

**RR. HH.:** «¿Quién llegó tarde la semana pasada en Alto Prado?»
→ `horas_semanales` de la semana del 16 de noviembre con `sede: AP` y `detalle_por_dia: true`, la vista, y: «Alto Prado: 50 % de puntualidad (3 tardanzas en 6 días con turno). LAURA PÉREZ llegó tarde 3 veces (80 min en total): reincidente. CAMILO RUIZ se pasó 15 min del almuerzo una vez. ¿Le preparo el borrador de citación a descargos para Laura?»
