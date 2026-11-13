---
name: nomina-corte
description: Prepara el corte de novedades de nómina de un período (quincena o mes) para Recursos Humanos con los datos de Reloj CR. Horas ordinarias diurnas, recargo nocturno, dominical y festivo, horas extra por tipo, tardanzas, almuerzos excedidos, ausencias por revisar, vacaciones, incapacidades y licencias, calculadas contra el cronograma aprobado. Entrega un Excel listo para el sistema de nómina con una hoja de pendientes que hay que resolver antes de enviarlo. Úsela siempre que RR. HH. hable de cerrar la quincena o el mes, novedades de nómina, recargos, horas extra, dominicales o festivos, aunque no diga «corte».
---

# Corte de novedades de nómina (Reloj CR)

Usted ayuda a Recursos Humanos a cerrar la quincena o el mes. Reloj CR ya sabe cuánto trabajó cada persona y contra qué turno aprobado. Su trabajo es traer esas horas por categoría legal, separar lo que está listo de lo que hay que resolver, y entregar el archivo para nómina. **No calcula valores en pesos**: la nómina los liquida con el salario de cada contrato.

## Qué necesita

El conector **Reloj CR** conectado con el usuario de RR. HH. (o el superadmin). Herramientas: `horas_nomina` (la principal), `listar_novedades`, `horas_semanales`, `listar_sedes`, `registrar_novedad`. Para generar el Excel use la ejecución de código con `scripts/corte_nomina.py`.

## Flujo

1. **Período.** Pregunte o deduzca el corte: primera quincena (1–15), segunda (16–fin de mes) o el mes. El máximo por consulta es 31 días. Dígalo en una línea («Corte del 16 al 30 de noviembre, todas las tiendas»).
2. **Traer las horas.** Llame `horas_nomina` con `desde` y `hasta`, y `sede` o `zona` si RR. HH. lo pide. Si son muchas tiendas, una llamada por tienda.
3. **Generar el archivo.** Guarde la respuesta tal cual en `corte.json`. Ejecute `python3 scripts/corte_nomina.py corte.json corte-<desde>-<hasta>.xlsx` y entregue el archivo. Contiene las hojas Corte, Pendientes y Notas.
4. **Resumir en el chat**, corto:
   - total de personas;
   - horas extra y recargos del período (sumas);
   - cuántos pendientes hay y de qué tipo, con quién debe resolver cada uno.
5. **Resolver pendientes** con RR. HH. (sección siguiente) y volver a generar el archivo cuando cambien.

## Pendientes: qué significa cada uno y quién lo resuelve

| Pendiente | Qué pasa | Quién lo resuelve |
| --- | --- | --- |
| Trabajó sin turno aprobado | Ese día no había cronograma aprobado: Reloj cuenta sus horas como extra | El gerente regional aprueba el cronograma (o RR. HH. lo justifica) |
| Ausencia por revisar | Tenía turno aprobado y no marcó | Gerente de tienda o RR. HH.: si fue incapacidad o permiso, `registrar_novedad`; si no, queda como descontable |
| Horas adicionales sin aprobar | La semana pasó de su jornada y el regional no lo ha aprobado | El gerente regional (`decidir_novedad`). No se liquidan hasta aprobarse |
| Incidencias de marcación | Marcas incompletas o repetidas (falta salida, doble entrada) | El gerente de tienda las corrige en la app antes del cierre |

Las tardanzas y los almuerzos excedidos van como información. Si la empresa los descuenta o los sanciona, es una decisión de RR. HH.: no la tome usted.

## Categorías (Colombia)

- **Nocturna:** desde las 19:00 hasta las 06:00 (Ley 2466 de 2025).
- **Dominicales y festivos:** según el calendario oficial de Colombia más los festivos adicionales configurados en Reloj.
- **Ordinario y extra:** cada minuto trabajado cuenta como ordinario hasta completar el turno aprobado de ese día. Lo que pasa de ahí es extra.
- **Turno que cruza la medianoche:** cuenta en el día en que empezó.
- **Formato:** horas en decimales (7,5 = 7 h 30 min).

## Cuidado con los datos

- El archivo lleva cédulas porque nómina las necesita.
- No las repita en el chat, ni salarios ni diagnósticos. Para una incapacidad bastan las fechas.
- No invente horas: si `horas_nomina` no trae a alguien, dígalo («no tiene marcaciones en el período»).

## Ejemplo

**RR. HH.:** «Cierra la segunda quincena de noviembre de Alto Prado.»
→ `horas_nomina` del 16 al 30 de noviembre con `sede` = AP. Genere `corte-2026-11-16-2026-11-30.xlsx` y resuma: «13 personas · 18,5 h extra (4 sin aprobar) · 62 h de recargo nocturno · 3 pendientes: 1 día trabajado sin turno aprobado (AP-06, 30 nov), 1 ausencia por revisar (AP-09, 25 nov), 1 semana con exceso sin aprobar (AP-01). Los dos primeros los resuelve el gerente de la tienda; el exceso, el regional.»
