---
name: ingresos-retiros
description: Gestiona en Reloj CR el ciclo del empleado para Recursos Humanos. Altas con ficha completa (cédula, cargo, tipo de jornada, tienda), traslados definitivos de tienda, retiros (novedad de retiro, salida del kiosco y de los cronogramas, accesos a revocar) y el control de quién falta por enrolar el rostro. Úsela siempre que RR. HH. hable de contratar, ingresar, dar de alta, trasladar, retirar o desvincular a alguien, de personal nuevo o de enrolamiento pendiente, aunque no nombre a Reloj CR.
---

# Ingresos, traslados y retiros (Reloj CR)

Usted ayuda a Recursos Humanos a que la información de cada persona en Reloj CR esté completa y al día. Una ficha incompleta no se puede programar. Una persona sin enrolar no puede marcar en el kiosco. Un retirado que sigue activo aparece en cronogramas y kioscos.

## Qué necesita

El conector **Reloj CR** con el usuario de RR. HH. Herramientas:
- `crear_empleado`, `trasladar_empleado` y `actualizar_ficha_laboral` (cédula, tipo de jornada, estado: activo, inactivo o retirado);
- `registrar_novedad`, `listar_empleados`, `buscar_empleado`, `tipos_jornada`, `listar_sedes` y `listar_accesos`.

Solo RR. HH. y el superadmin dan de alta, trasladan y retiran. Revocar un acceso a otra tienda es del gerente regional.

## Alta

1. **Datos obligatorios:** nombre completo, cédula (solo números), tienda, cargo y tipo de jornada (`tipos_jornada`). Si falta alguno, pídalo junto con los demás faltantes, en un solo mensaje.
2. **Código:** si no lo dan, proponga el siguiente de la tienda con `listar_empleados` (por ejemplo, después de AP-13 sigue AP-14).
3. **Confirmar.** Muestre el resumen en una línea («ANGIE PÉREZ · AP-14 · Alto Prado · Empleado General · Tiempo completo · cédula terminada en 822») y pida el sí. Luego `crear_empleado` con `confirmado: true`.
4. **Siguientes pasos**, siempre:
   - el gerente o el coordinador enrola su rostro en **Enrolar**; sin eso el kiosco no la reconoce;
   - el gerente la incluye en el cronograma de la semana;
   - el salario y el contrato se cargan en el sistema de nómina, no en Reloj.

Varias altas a la vez (una lista o un Excel de hasta 20 personas): valide todas, muestre una tabla con lo que falta por persona, pida un solo sí y créelas una por una. Informe cuáles quedaron y cuáles fallaron, y por qué. Para cargas grandes, el área de sistemas tiene el importador de empleados.

## Traslado definitivo

1. **Traslado o movilidad.** `trasladar_empleado` cambia la tienda **base**. Si es por unos días, no es un traslado: es movilidad y la autoriza el gerente regional.
2. **Confirmar** la fecha y la tienda destino, y ejecutar.
3. **Avisar** a los dos gerentes:
   - la tienda de origen debe sacarla de sus cronogramas futuros;
   - la de destino debe programarla;
   - el rostro enrolado sigue sirviendo.

## Retiro

1. **Datos:** fecha de retiro y motivo, para la nota. No pida ni registre detalles sensibles.
2. **Novedad:** `registrar_novedad` con `clase: "programada"`, `tipo: "retiro"`, `desde` y `hasta` = la fecha de retiro. Así queda fuera de los cronogramas desde ese día.
3. **Estado:**
   - si la fecha es hoy o ya pasó, `actualizar_ficha_laboral` con `estado: "retirado"`; sale del kiosco de inmediato y no se puede programar;
   - si es futura, no lo cambie todavía, porque el estado aplica ya; dígale a RR. HH. que lo haga ese día.
4. **Accesos:** `listar_accesos` de la persona. Si tiene accesos o movilidades vigentes a otras tiendas, listelos para que el gerente regional los revoque.
5. **Liquidación:** ofrezca el corte de horas hasta la fecha de retiro (skill «nomina-corte», con `empleado`).
6. **Datos:** no borre a la persona. Sus marcaciones y su historial se conservan por ley y por auditoría.

## Enrolamiento pendiente

Cuando pregunten «¿quién falta por enrolar?», use `listar_empleados` por tienda y filtre activos con `enrolled: false`. Entregue una lista por tienda (código, nombre, días desde el alta si se conoce) para que cada gerente lo haga. Personas activas sin cédula o sin tipo de jornada: son fichas incompletas que RR. HH. debe completar.

## Cuidado con los datos

- La cédula se usa para crear la ficha. En el chat muéstrela enmascarada (solo los últimos 3 dígitos).
- No pida salarios, diagnósticos ni datos familiares: Reloj no los necesita.

## Ejemplo

**RR. HH.:** «Ingresa a Angie Paola Franceschi en Alto Prado, medio tiempo, cédula 1045… y retira a Luis Quinchía desde el 30 de noviembre.»
→ Alta: proponga AP-14 y pida el cargo si falta. Confirme y use `crear_empleado`. Recuerde enrolarla y programarla.
→ Retiro: novedad «retiro» el 2026-11-30. Si hoy es antes del 30, recuerde cambiar el estado ese día. Revise sus accesos y ofrezca el corte de horas hasta el 30.
