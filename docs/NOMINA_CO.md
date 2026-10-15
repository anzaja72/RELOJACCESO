# Cálculo de horas a valor (Colombia)

Reloj CR calcula **cuánto agrega o quita al sueldo lo que registró el trabajador**. No liquida la nómina.

## Qué entrega por trabajador y mes
- Horas por categoría: ordinarias, recargo nocturno, dominical/festivo, extra diurna, extra nocturna y extras dominicales.
- **A pagar adicional** = recargos + horas extra − descuento por ausencias injustificadas.
- Sueldo base y valor hora, solo como referencia.

## Fuera de alcance (lo liquida el sistema de nómina)
Salud, pensión, fondo de solidaridad, aportes, prestaciones y provisiones, incapacidades, licencias, vacaciones, auxilio de transporte, retención y nómina electrónica.

## Reglas
| Concepto | Regla |
|---|---|
| Valor hora | sueldo mensual ÷ (horas semanales × 5) |
| Recargo nocturno | +35 % sobre la hora ordinaria; la noche va de 19:00 a 06:00 desde el 25-dic-2025 (antes 21:00) |
| Dominical o festivo (ordinaria) | recargo +75 % (jul-2025: 80 %, jul-2026: 90 %, jul-2027: 100 %) |
| Extra diurna / nocturna | 125 % / 175 % del valor hora (configurable en Ajustes) |
| Extra dominical o festiva | 1 + recargo dominical + porcentaje de la extra |
| Ausencia injustificada | sueldo ÷ 30 por día; la justificada no descuenta |
| Jornada ordinaria | la del horario del trabajador; lo que pase de eso es extra |
| Festivos | calendario oficial (Ley Emiliani y Semana Santa) + los que se agreguen en Ajustes |

Un turno cuenta en el día y el mes en que empieza. **Pendiente de validar con el abogado laboral:** las fechas escalonadas del recargo dominical y que el recargo nocturno se pague además del dominical cuando coinciden.

## Cómo verificarlo
`npm test` ejecuta casos con cifras revisables a mano (`scripts/payroll-co.test.mjs`).
