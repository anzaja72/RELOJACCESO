---
name: control-jornada
description: Revisa en Reloj CR el cumplimiento de la jornada laboral colombiana para Recursos Humanos y gerentes regionales. Detecta semanas por encima de 42 horas (Ley 2101), horas extra sin autorizar o por encima de 12 a la semana, personas sin día de descanso, días de más de 9 horas y trabajo dominical habitual, por tienda, región o persona, antes de que se vuelvan un problema legal o de nómina. Úsela siempre que pregunten por horas extra, exceso de horas, la jornada de 42 horas, descansos, dominicales, cumplimiento laboral o riesgos de jornada, aunque no digan «control».
---

# Control de jornada (Reloj CR)

Usted revisa si las horas que la gente realmente trabajó, según el kiosco, cumplen la jornada legal. Así se corrige a tiempo, desde el cronograma de la semana siguiente o autorizando lo que corresponde.

## Reglas que aplica

| Regla | Límite | Fuente |
| --- | --- | --- |
| Jornada máxima semanal | 42 h desde el 15 de julio de 2026 (o la de su tipo de jornada, si es menor) | Ley 2101 de 2021 |
| Horas extra | Máximo 12 h a la semana; deben estar autorizadas (en Reloj las aprueba el gerente regional) | CST art. 22 |
| Descanso | Al menos un día a la semana | CST art. 172 |
| Jornada diaria | Hasta 9 h netas en la jornada flexible sin recargo; más es extra | Ley 2101 |
| Trabajo dominical habitual | 3 o más domingos o festivos en el mes dan derecho a descanso compensatorio | CST arts. 176 y 180 |

Son horas **netas** (sin almuerzo) de las marcaciones. Si un dato legal cambió o la empresa tiene un pacto distinto, siga lo que diga RR. HH. y dígalo en el resultado.

## Qué necesita

El conector **Reloj CR**. Herramientas:
- `horas_semanales` con `detalle_por_dia: true`, una llamada por semana. Trae trabajadas, referencia, exceso, estado de la autorización y las horas netas de cada día.
- `horas_nomina` para el detalle de extras por tipo (diurnas, nocturnas, festivas), si se lo piden.
- `listar_sedes`.

## Flujo

1. **Período y alcance.** Por defecto, las semanas del mes en curso en todas las tiendas que el usuario ve. Dígalo en una línea.
2. **Datos.** Una llamada a `horas_semanales` por semana, con `detalle_por_dia: true` (y `sede` o `zona` si se lo piden).
3. **Vista.**
   - Lea `assets/jornada.html` y reemplace solo `/*DATOS*/ null /*FIN_DATOS*/` por `/*DATOS*/ [ <semana 1>, <semana 2>, … ] /*FIN_DATOS*/`, tal cual.
   - Si el período tiene festivos, agregue antes de `const DATOS` la línea `const FESTIVOS = ["AAAA-MM-DD", …];` con los festivos de Colombia del período.
   - Publíquelo como artefacto «Control de jornada <alcance> · <período>».
4. **Resumen** en el chat. Primero lo grave:
   - sin descanso;
   - extras por encima de 12 h;
   - excesos sin autorizar.

   Luego lo que hay que revisar. Diga para cada caso quién actúa:
   - el **regional** aprueba o rechaza las horas adicionales (`decidir_novedad`);
   - el **gerente de tienda** ajusta el cronograma de la próxima semana para no repetir;
   - **RR. HH.** programa el descanso compensatorio de quien trabajó dominicales de forma habitual.

## Cuidado

- Un exceso aprobado no deja de ser exceso: se paga como extra y cuenta para el tope de 12 h.
- Sin marcaciones de salida, las horas pueden estar incompletas. Si `incidencias` > 0, dígalo y no concluya sobre esa semana hasta que se corrijan.
- No pida ni repita cédulas ni salarios. Para valores en pesos está el sistema de nómina.

## Ejemplo

**RR. HH.:** «¿Cómo vamos con la jornada en noviembre?»
→ `horas_semanales` de las semanas del 2, 9, 16, 23 y 30 de noviembre con detalle, la vista, y: «4 hallazgos graves: CAMILO RUIZ (Alto Prado) trabajó los 7 días la semana del 9 con 56 h (14 h extra, pasa el tope de 12 y sin autorizar). LAURA PÉREZ tuvo 5:30 h de exceso sin aprobar esa semana. Para revisar: Laura trabajó 3 domingos en noviembre (descanso compensatorio) y un día de 9:30 h. ¿Le aviso al regional para que decida los excesos?»
